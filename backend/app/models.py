"""SQLAlchemy relational models for PROJECTILE LAB (Users, Simulations, SimulationSteps, SimulationMetadata)."""

from datetime import datetime, timezone
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from .database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    firebase_uid = Column(String(128), unique=True, nullable=False, index=True)
    email = Column(String(255), nullable=False, index=True)
    display_name = Column(String(150), nullable=False)
    profile_image = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    simulations = relationship("Simulation", back_populates="user", cascade="all, delete-orphan")


class Simulation(Base):
    __tablename__ = "simulations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    simulation_name = Column(String(200), nullable=False)
    projectile_type = Column(String(50), nullable=False, index=True)
    physics_model = Column(String(50), nullable=False, index=True)
    source_environment = Column(String(64), nullable=False)
    destination_environment = Column(String(64), nullable=False)
    initial_velocity = Column(Float, nullable=False)
    launch_angle = Column(Float, nullable=False)
    gravity = Column(Float, nullable=False)
    time_step = Column(Float, nullable=False)
    mass = Column(Float, nullable=False)
    drag_coefficient = Column(Float, nullable=False)
    air_density = Column(Float, nullable=False)
    cross_sectional_area = Column(Float, nullable=False)
    maximum_height = Column(Float, nullable=False)
    flight_time = Column(Float, nullable=False)
    horizontal_range = Column(Float, nullable=False)
    final_velocity = Column(Float, nullable=False)
    destination_reached = Column(Boolean, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, index=True)

    user = relationship("User", back_populates="simulations")
    steps = relationship(
        "SimulationStep",
        back_populates="simulation",
        cascade="all, delete-orphan",
        order_by="SimulationStep.iteration_number",
    )
    meta = relationship("SimulationMetadata", back_populates="simulation", uselist=False, cascade="all, delete-orphan")


class SimulationStep(Base):
    __tablename__ = "simulation_steps"

    id = Column(Integer, primary_key=True, index=True)
    simulation_id = Column(Integer, ForeignKey("simulations.id", ondelete="CASCADE"), nullable=False, index=True)
    iteration_number = Column(Integer, nullable=False)
    time = Column(Float, nullable=False)
    x = Column(Float, nullable=False)
    y = Column(Float, nullable=False)
    vx = Column(Float, nullable=False)
    vy = Column(Float, nullable=False)
    k1 = Column(JSON, nullable=False)
    k2 = Column(JSON, nullable=False)
    k3 = Column(JSON, nullable=False)
    k4 = Column(JSON, nullable=False)

    simulation = relationship("Simulation", back_populates="steps")

    __table_args__ = (
        Index("ix_sim_step_sim_iter", "simulation_id", "iteration_number"),
    )


class SimulationMetadata(Base):
    __tablename__ = "simulation_metadata"

    id = Column(Integer, primary_key=True, index=True)
    simulation_id = Column(Integer, ForeignKey("simulations.id", ondelete="CASCADE"), nullable=False, unique=True)
    initial_height = Column(Float, nullable=False, default=0.0)
    destination_distance = Column(Float, nullable=True)
    destination_height = Column(Float, nullable=False, default=0.0)
    analytical_summary = Column(JSON, nullable=True)
    errors_summary = Column(JSON, nullable=True)
    extra_params = Column(JSON, nullable=True)

    simulation = relationship("Simulation", back_populates="meta")
