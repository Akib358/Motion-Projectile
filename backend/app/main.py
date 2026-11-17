"""FastAPI backend for PROJECTILE LAB with Firebase ID token verification and RK4 engine."""

import csv
import io
import os
from typing import Any, Dict, List, Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.engine.rk4 import (
    PhysicsModel,
    SimulationInput,
    run_convergence_analysis,
    run_rk4_simulation,
)
from .database import Base, engine, get_db
from .models import Simulation, SimulationMetadata, SimulationStep, User

# Optional Firebase Admin SDK verification for production FastAPI deployment
try:
    import firebase_admin
    from firebase_admin import auth as firebase_auth, credentials

    if not firebase_admin._apps:
        cred_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
        if cred_path and os.path.exists(cred_path):
            firebase_admin.initialize_app(credentials.Certificate(cred_path))
        else:
            firebase_admin.initialize_app()
    HAS_FIREBASE_ADMIN = True
except Exception:  # noqa: BLE001
    HAS_FIREBASE_ADMIN = False

Base.metadata.create_all(bind=engine)

app = FastAPI(title="PROJECTILE LAB API", version="1.0.0")

allowed_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


class SimulationRequest(BaseModel):
    simulation_name: str = Field(default="Untitled Trajectory", max_length=200)
    projectile_type: str = Field(default="ball", max_length=50)
    physics_model: PhysicsModel = "ideal"
    source_environment: str = Field(default="open_field", max_length=64)
    destination_environment: str = Field(default="open_field", max_length=64)
    initial_velocity: float = Field(gt=0, le=5000)
    launch_angle_deg: float = Field(gt=0, lt=90)
    gravity: float = Field(default=9.81, gt=0, le=100)
    time_step: float = Field(default=0.05, gt=0, le=2.0)
    initial_height: float = Field(default=0.0, ge=0, le=10000)
    mass: float = Field(default=1.0, gt=0, le=100000)
    air_density: float = Field(default=1.225, ge=0, le=20)
    drag_coefficient: float = Field(default=0.47, ge=0, le=5)
    cross_sectional_area: float = Field(default=0.01, ge=0, le=100)
    thrust: float = Field(default=0.0, ge=0, le=1000000)
    burn_time: float = Field(default=2.0, ge=0, le=600)
    dry_mass: float = Field(default=0.6, gt=0, le=100000)
    lift_coefficient: float = Field(default=0.35, ge=0, le=5)
    wing_area: float = Field(default=0.15, ge=0, le=200)
    destination_distance: Optional[float] = Field(default=None, gt=0, le=500000)
    destination_height: float = Field(default=0.0, ge=0, le=10000)
    destination_tolerance: float = Field(default=5.0, ge=0.5, le=1000)


def get_current_user(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Bearer Firebase ID token.",
        )
    token = authorization.split(" ", 1)[1].strip()
    if not HAS_FIREBASE_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Firebase Admin verification is not initialized.",
        )
    try:
        decoded = firebase_auth.verify_id_token(token)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid Firebase ID token: {exc}",
        ) from exc

    uid = decoded["uid"]
    user = db.query(User).filter(User.firebase_uid == uid).first()
    if not user:
        user = User(
            firebase_uid=uid,
            email=decoded.get("email", ""),
            display_name=decoded.get("name", "Researcher"),
            profile_image=decoded.get("picture"),
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


def _to_sim_input(req: SimulationRequest) -> SimulationInput:
    return SimulationInput(
        initial_velocity=req.initial_velocity,
        launch_angle_deg=req.launch_angle_deg,
        gravity=req.gravity,
        time_step=req.time_step,
        initial_height=req.initial_height,
        physics_model=req.physics_model,
        mass=req.mass,
        air_density=req.air_density,
        drag_coefficient=req.drag_coefficient,
        cross_sectional_area=req.cross_sectional_area,
        thrust=req.thrust,
        burn_time=req.burn_time,
        dry_mass=min(req.dry_mass, req.mass),
        lift_coefficient=req.lift_coefficient,
        wing_area=req.wing_area,
        destination_distance=req.destination_distance,
        destination_height=req.destination_height,
        destination_tolerance=req.destination_tolerance,
    )


@app.get("/api/health")
def health_check() -> Dict[str, str]:
    return {"status": "ok", "service": "projectile-lab-fastapi"}


@app.post("/api/simulations/compute")
def compute_simulation(
    req: SimulationRequest,
    _user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    try:
        return run_rk4_simulation(_to_sim_input(req))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/api/simulations/convergence")
def compute_convergence(
    req: SimulationRequest,
    _user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    try:
        return run_convergence_analysis(_to_sim_input(req))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/api/simulations", status_code=201)
def create_and_save_simulation(
    req: SimulationRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    computed = run_rk4_simulation(_to_sim_input(req))
    summary = computed["summary"]

    sim = Simulation(
        user_id=user.id,
        simulation_name=req.simulation_name,
        projectile_type=req.projectile_type,
        physics_model=req.physics_model,
        source_environment=req.source_environment,
        destination_environment=req.destination_environment,
        initial_velocity=req.initial_velocity,
        launch_angle=req.launch_angle_deg,
        gravity=req.gravity,
        time_step=req.time_step,
        mass=req.mass,
        drag_coefficient=req.drag_coefficient,
        air_density=req.air_density,
        cross_sectional_area=req.cross_sectional_area,
        maximum_height=summary["maximum_height"],
        flight_time=summary["flight_time"],
        horizontal_range=summary["horizontal_range"],
        final_velocity=summary["final_velocity"],
        destination_reached=summary["destination_reached"],
    )
    db.add(sim)
    db.flush()

    db.add(
        SimulationMetadata(
            simulation_id=sim.id,
            initial_height=req.initial_height,
            destination_distance=req.destination_distance,
            destination_height=req.destination_height,
            analytical_summary=computed["analytical"],
            errors_summary=computed["errors"],
            extra_params={
                "thrust": req.thrust,
                "burn_time": req.burn_time,
                "dry_mass": req.dry_mass,
                "lift_coefficient": req.lift_coefficient,
                "wing_area": req.wing_area,
            },
        )
    )

    step_rows = [
        SimulationStep(
            simulation_id=sim.id,
            iteration_number=s["iteration"],
            time=s["t"],
            x=s["x"],
            y=s["y"],
            vx=s["vx"],
            vy=s["vy"],
            k1=s["k1"],
            k2=s["k2"],
            k3=s["k3"],
            k4=s["k4"],
        )
        for s in computed["steps"]
    ]
    db.bulk_save_objects(step_rows)
    db.commit()
    db.refresh(sim)

    return {"id": sim.id, **computed}


@app.get("/api/simulations")
def list_simulations(
    search: Optional[str] = Query(default=None),
    projectile_type: Optional[str] = Query(default=None),
    physics_model: Optional[str] = Query(default=None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    query = db.query(Simulation).filter(Simulation.user_id == user.id)
    if search:
        query = query.filter(Simulation.simulation_name.ilike(f"%{search}%"))
    if projectile_type:
        query = query.filter(Simulation.projectile_type == projectile_type)
    if physics_model:
        query = query.filter(Simulation.physics_model == physics_model)

    rows = query.order_by(Simulation.created_at.desc()).all()
    return [
        {
            "id": r.id,
            "simulation_name": r.simulation_name,
            "projectile_type": r.projectile_type,
            "physics_model": r.physics_model,
            "source_environment": r.source_environment,
            "destination_environment": r.destination_environment,
            "maximum_height": r.maximum_height,
            "flight_time": r.flight_time,
            "horizontal_range": r.horizontal_range,
            "final_velocity": r.final_velocity,
            "destination_reached": r.destination_reached,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]


@app.get("/api/simulations/{sim_id}")
def get_simulation(
    sim_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    sim = db.query(Simulation).filter(Simulation.id == sim_id, Simulation.user_id == user.id).first()
    if not sim:
        raise HTTPException(status_code=404, detail="Simulation not found.")

    return {
        "id": sim.id,
        "simulation_name": sim.simulation_name,
        "projectile_type": sim.projectile_type,
        "physics_model": sim.physics_model,
        "initial_velocity": sim.initial_velocity,
        "launch_angle": sim.launch_angle,
        "gravity": sim.gravity,
        "time_step": sim.time_step,
        "maximum_height": sim.maximum_height,
        "flight_time": sim.flight_time,
        "horizontal_range": sim.horizontal_range,
        "final_velocity": sim.final_velocity,
        "destination_reached": sim.destination_reached,
        "created_at": sim.created_at.isoformat(),
        "steps": [
            {
                "iteration": s.iteration_number,
                "t": s.time,
                "x": s.x,
                "y": s.y,
                "vx": s.vx,
                "vy": s.vy,
                "k1": s.k1,
                "k2": s.k2,
                "k3": s.k3,
                "k4": s.k4,
            }
            for s in sim.steps
        ],
    }


@app.delete("/api/simulations/{sim_id}", status_code=204)
def delete_simulation(
    sim_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    sim = db.query(Simulation).filter(Simulation.id == sim_id, Simulation.user_id == user.id).first()
    if not sim:
        raise HTTPException(status_code=404, detail="Simulation not found.")
    db.delete(sim)
    db.commit()


@app.get("/api/simulations/{sim_id}/export.csv")
def export_simulation_csv(
    sim_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    sim = db.query(Simulation).filter(Simulation.id == sim_id, Simulation.user_id == user.id).first()
    if not sim:
        raise HTTPException(status_code=404, detail="Simulation not found.")

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["iteration", "t", "x", "y", "vx", "vy", "k1", "k2", "k3", "k4"])
    for s in sim.steps:
        writer.writerow([s.iteration_number, s.time, s.x, s.y, s.vx, s.vy, s.k1, s.k2, s.k3, s.k4])
    output.seek(0)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="simulation_{sim.id}.csv"'},
    )
