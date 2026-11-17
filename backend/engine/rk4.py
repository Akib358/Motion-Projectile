"""Classical Fourth-Order Runge-Kutta (RK4) Projectile Motion Engine.

Independent of any frontend, database, or web framework logic.
Uses NumPy when available and falls back cleanly to standard library math
for pure-Python environments, preserving identical IEEE-754 floating-point
RK4 stage calculations.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, asdict
from typing import Literal, Optional, List, Dict, Any

try:
    import numpy as np  # type: ignore
    HAS_NUMPY = True
except ImportError:
    np = None  # type: ignore
    HAS_NUMPY = False

PhysicsModel = Literal["ideal", "quadratic_drag", "powered_rocket", "aircraft_flight"]


@dataclass
class SimulationInput:
    initial_velocity: float  # v0 in m/s (> 0)
    launch_angle_deg: float  # theta in degrees (0 < theta < 90, or 0..90 for special tests)
    gravity: float = 9.81  # g in m/s^2 (> 0)
    time_step: float = 0.05  # h in seconds (> 0)
    initial_height: float = 0.0  # y0 in meters (>= 0)
    physics_model: PhysicsModel = "ideal"

    # Physical & aerodynamic parameters (SI)
    mass: float = 1.0  # kg (> 0)
    air_density: float = 1.225  # rho in kg/m^3 (>= 0)
    drag_coefficient: float = 0.47  # Cd (>= 0)
    cross_sectional_area: float = 0.01  # A in m^2 (>= 0)

    # Optional Model C (Powered Rocket) & Model D (Aircraft Flight) parameters
    thrust: float = 0.0  # N (>= 0)
    burn_time: float = 2.0  # s (>= 0)
    dry_mass: float = 0.6  # kg (> 0, <= mass)
    lift_coefficient: float = 0.35  # Cl (>= 0)
    wing_area: float = 0.15  # S in m^2 (>= 0)

    # Target destination validation
    destination_distance: Optional[float] = None  # m
    destination_height: float = 0.0  # m
    destination_tolerance: float = 5.0  # m

    # Safeguard limit
    max_steps: int = 20000


def _vec_add_scaled(y: List[float], k: List[float], scale: float) -> List[float]:
    if HAS_NUMPY and np is not None:
        arr = np.asarray(y, dtype=np.float64) + scale * np.asarray(k, dtype=np.float64)
        return [float(arr[0]), float(arr[1]), float(arr[2]), float(arr[3])]
    return [
        y[0] + scale * k[0],
        y[1] + scale * k[1],
        y[2] + scale * k[2],
        y[3] + scale * k[3],
    ]


def _rk4_combine(
    y: List[float],
    k1: List[float],
    k2: List[float],
    k3: List[float],
    k4: List[float],
    h: float,
) -> List[float]:
    if HAS_NUMPY and np is not None:
        yn = np.asarray(y, dtype=np.float64)
        d1 = np.asarray(k1, dtype=np.float64)
        d2 = np.asarray(k2, dtype=np.float64)
        d3 = np.asarray(k3, dtype=np.float64)
        d4 = np.asarray(k4, dtype=np.float64)
        nxt = yn + (h / 6.0) * (d1 + 2.0 * d2 + 2.0 * d3 + d4)
        return [float(nxt[0]), float(nxt[1]), float(nxt[2]), float(nxt[3])]
    factor = h / 6.0
    return [
        y[i] + factor * (k1[i] + 2.0 * k2[i] + 2.0 * k3[i] + k4[i])
        for i in range(4)
    ]


def validate_inputs(params: SimulationInput) -> None:
    if not math.isfinite(params.initial_velocity) or params.initial_velocity <= 0:
        raise ValueError("Initial velocity v0 must be a positive finite number.")
    if not math.isfinite(params.launch_angle_deg) or not (0.0 < params.launch_angle_deg < 90.0):
        raise ValueError("Launch angle theta must satisfy 0 < theta < 90 degrees.")
    if not math.isfinite(params.gravity) or params.gravity <= 0:
        raise ValueError("Gravitational acceleration g must be positive.")
    if not math.isfinite(params.time_step) or params.time_step <= 0 or params.time_step > 2.0:
        raise ValueError("Time step h must be positive and <= 2.0 seconds.")
    if not math.isfinite(params.initial_height) or params.initial_height < 0:
        raise ValueError("Initial height y0 must be >= 0 meters.")
    if not math.isfinite(params.mass) or params.mass <= 0:
        raise ValueError("Mass must be > 0 kg.")
    if not math.isfinite(params.air_density) or params.air_density < 0:
        raise ValueError("Air density rho must be >= 0 kg/m^3.")
    if not math.isfinite(params.drag_coefficient) or params.drag_coefficient < 0:
        raise ValueError("Drag coefficient Cd must be >= 0.")
    if not math.isfinite(params.cross_sectional_area) or params.cross_sectional_area < 0:
        raise ValueError("Cross-sectional area A must be >= 0 m^2.")
    if params.physics_model == "powered_rocket":
        if params.dry_mass <= 0 or params.dry_mass > params.mass:
            raise ValueError("Dry mass must satisfy 0 < dry_mass <= initial mass.")
        if params.burn_time < 0 or params.thrust < 0:
            raise ValueError("Rocket thrust and burn time must be >= 0.")
    if params.physics_model == "aircraft_flight":
        if params.wing_area < 0 or params.lift_coefficient < 0 or params.thrust < 0:
            raise ValueError("Aircraft wing area, lift coefficient, and thrust must be >= 0.")


def _derivative_function(t: float, state: List[float], params: SimulationInput) -> List[float]:
    """Compute derivative vector f(t, Y) = [dx/dt, dy/dt, dvx/dt, dvy/dt]."""
    _, _, vx, vy = state
    g = params.gravity
    model = params.physics_model

    if model == "ideal":
        return [vx, vy, 0.0, -g]

    speed = math.hypot(vx, vy)

    if model == "quadratic_drag":
        drag_const = (params.air_density * params.drag_coefficient * params.cross_sectional_area) / (
            2.0 * params.mass
        )
        ax = -drag_const * speed * vx
        ay = -g - drag_const * speed * vy
        return [vx, vy, ax, ay]

    if model == "powered_rocket":
        if params.burn_time > 0.0 and t <= params.burn_time:
            mdot = (params.mass - params.dry_mass) / params.burn_time
            current_mass = max(params.dry_mass, params.mass - mdot * t)
            active_thrust = params.thrust
        else:
            current_mass = params.dry_mass
            active_thrust = 0.0

        drag_const = (params.air_density * params.drag_coefficient * params.cross_sectional_area) / (
            2.0 * current_mass
        )
        if speed > 1e-12:
            ux = vx / speed
            uy = vy / speed
        else:
            rad = math.radians(params.launch_angle_deg)
            ux = math.cos(rad)
            uy = math.sin(rad)

        ax_thrust = (active_thrust / current_mass) * ux
        ay_thrust = (active_thrust / current_mass) * uy
        ax_drag = -drag_const * speed * vx
        ay_drag = -drag_const * speed * vy
        return [vx, vy, ax_thrust + ax_drag, -g + ay_thrust + ay_drag]

    if model == "aircraft_flight":
        m = params.mass
        rho = params.air_density
        drag_force = 0.5 * rho * (speed ** 2) * params.cross_sectional_area * params.drag_coefficient
        lift_force = 0.5 * rho * (speed ** 2) * params.wing_area * params.lift_coefficient

        if speed > 1e-12:
            ux = vx / speed
            uy = vy / speed
            # Perpendicular upward normal to velocity: (-uy, ux)
            nx = -uy
            ny = ux
        else:
            rad = math.radians(params.launch_angle_deg)
            ux = math.cos(rad)
            uy = math.sin(rad)
            nx = -uy
            ny = ux

        ax = ((params.thrust - drag_force) * ux + lift_force * nx) / m
        ay = -g + ((params.thrust - drag_force) * uy + lift_force * ny) / m
        return [vx, vy, ax, ay]

    raise ValueError(f"Unsupported physics model: {model}")


def analytical_ideal_state(
    t: float,
    v0: float,
    theta_rad: float,
    g: float,
    y0: float = 0.0,
) -> Dict[str, float]:
    vx = v0 * math.cos(theta_rad)
    vy = v0 * math.sin(theta_rad) - g * t
    x = v0 * math.cos(theta_rad) * t
    y = y0 + v0 * math.sin(theta_rad) * t - 0.5 * g * (t ** 2)
    return {"x": x, "y": y, "vx": vx, "vy": vy}


def analytical_ideal_summary(
    v0: float,
    theta_rad: float,
    g: float,
    y0: float = 0.0,
) -> Dict[str, float]:
    vy0 = v0 * math.sin(theta_rad)
    vx0 = v0 * math.cos(theta_rad)
    flight_time = (vy0 + math.sqrt(vy0 ** 2 + 2.0 * g * y0)) / g
    max_height = y0 + (vy0 ** 2) / (2.0 * g)
    horizontal_range = vx0 * flight_time
    final_vy = vy0 - g * flight_time
    final_velocity = math.hypot(vx0, final_vy)
    return {
        "flight_time": flight_time,
        "maximum_height": max_height,
        "horizontal_range": horizontal_range,
        "final_velocity": final_velocity,
    }


def _safe_abs_and_pct_error(numerical: float, analytical: float) -> Dict[str, Optional[float]]:
    abs_err = abs(numerical - analytical)
    if abs(analytical) < 1e-12:
        pct_err = 0.0 if abs_err < 1e-12 else None
    else:
        pct_err = (abs_err / abs(analytical)) * 100.0
    return {"abs": abs_err, "pct": pct_err}


def _refine_parabolic_peak(steps: List[Dict[str, Any]]) -> float:
    """Estimate maximum height via quadratic interpolation around largest stored y."""
    if not steps:
        return 0.0
    peak_idx = max(range(len(steps)), key=lambda i: steps[i]["y"])
    y_peak = steps[peak_idx]["y"]
    if peak_idx == 0 or peak_idx == len(steps) - 1:
        return float(y_peak)

    t1, y1 = steps[peak_idx - 1]["t"], steps[peak_idx - 1]["y"]
    t2, y2 = steps[peak_idx]["t"], steps[peak_idx]["y"]
    t3, y3 = steps[peak_idx + 1]["t"], steps[peak_idx + 1]["y"]

    denom = (t1 - t2) * (t1 - t3) * (t2 - t3)
    if abs(denom) < 1e-15:
        return float(y_peak)

    # Lagrange quadratic coefficients a*t^2 + b*t + c
    a = (t3 * (y2 - y1) + t2 * (y1 - y3) + t1 * (y3 - y2)) / denom
    b = (t3 ** 2 * (y1 - y2) + t2 ** 2 * (y3 - y1) + t1 ** 2 * (y2 - y3)) / denom
    c = (t2 * t3 * (t2 - t3) * y1 + t3 * t1 * (t3 - t1) * y2 + t1 * t2 * (t1 - t2) * y3) / denom

    if a >= -1e-15:
        return float(y_peak)
    t_vertex = -b / (2.0 * a)
    if t1 <= t_vertex <= t3:
        return float(max(y_peak, a * (t_vertex ** 2) + b * t_vertex + c))
    return float(y_peak)


def run_rk4_simulation(params: SimulationInput) -> Dict[str, Any]:
    validate_inputs(params)

    theta_rad = math.radians(params.launch_angle_deg)
    h = params.time_step
    v0 = params.initial_velocity
    g = params.gravity
    y0 = params.initial_height

    state = [
        0.0,
        y0,
        v0 * math.cos(theta_rad),
        v0 * math.sin(theta_rad),
    ]
    t = 0.0

    steps: List[Dict[str, Any]] = []
    max_speed = math.hypot(state[2], state[3])
    is_ideal = params.physics_model == "ideal"

    t_land = 0.0
    x_range = 0.0
    final_vx = state[2]
    final_vy = state[3]
    crossed_ground = False

    for iteration in range(params.max_steps):
        k1 = _derivative_function(t, state, params)
        k2 = _derivative_function(t + 0.5 * h, _vec_add_scaled(state, k1, 0.5 * h), params)
        k3 = _derivative_function(t + 0.5 * h, _vec_add_scaled(state, k2, 0.5 * h), params)
        k4 = _derivative_function(t + h, _vec_add_scaled(state, k3, h), params)
        next_state = _rk4_combine(state, k1, k2, k3, k4, h)

        speed = math.hypot(state[2], state[3])
        if speed > max_speed:
            max_speed = speed

        step_record: Dict[str, Any] = {
            "iteration": iteration,
            "t": round(t, 10),
            "x": state[0],
            "y": state[1],
            "vx": state[2],
            "vy": state[3],
            "speed": speed,
            "k1": k1,
            "k2": k2,
            "k3": k3,
            "k4": k4,
            "next_state": next_state,
        }

        if is_ideal:
            ana = analytical_ideal_state(t, v0, theta_rad, g, y0)
            pos_err = math.hypot(state[0] - ana["x"], state[1] - ana["y"])
            vel_err = math.hypot(state[2] - ana["vx"], state[3] - ana["vy"])
            step_record["analytical"] = ana
            step_record["position_error"] = pos_err
            step_record["velocity_error"] = vel_err

        steps.append(step_record)

        # Check ground crossing (y_{n+1} < 0 while descending or crossing y=0)
        if next_state[1] < 0.0 and (iteration > 0 or state[1] >= 0.0):
            denom = state[1] - next_state[1]
            alpha = state[1] / denom if abs(denom) > 1e-15 else 0.0
            alpha = max(0.0, min(1.0, alpha))
            t_land = t + h * alpha
            x_range = state[0] + alpha * (next_state[0] - state[0])
            final_vx = state[2] + alpha * (next_state[2] - state[2])
            final_vy = state[3] + alpha * (next_state[3] - state[3])
            crossed_ground = True
            break

        next_speed = math.hypot(next_state[2], next_state[3])
        if next_speed > max_speed:
            max_speed = next_speed

        state = next_state
        t = (iteration + 1) * h

    if not crossed_ground:
        t_land = t
        x_range = state[0]
        final_vx = state[2]
        final_vy = state[3]

    # Append final interpolated landing point for smooth trajectory rendering & verification
    final_speed = math.hypot(final_vx, final_vy)
    if final_speed > max_speed:
        max_speed = final_speed

    max_height = _refine_parabolic_peak(steps)

    landing_point_dict = {
        "t": t_land,
        "x": x_range,
        "y": 0.0 if crossed_ground else state[1],
        "vx": final_vx,
        "vy": final_vy,
        "speed": final_speed,
    }

    # Destination status evaluation (never silently force destination to match range)
    dest_reached: Optional[bool] = None
    dest_shortfall: Optional[float] = None
    y_at_dest: Optional[float] = None

    if params.destination_distance is not None and params.destination_distance > 0:
        d_target = params.destination_distance
        h_target = params.destination_height
        tol = max(0.5, params.destination_tolerance)

        if h_target <= 0.01:
            # Ground-level destination: check horizontal landing range within tolerance
            dest_shortfall = x_range - d_target
            dest_reached = abs(x_range - d_target) <= tol
            y_at_dest = 0.0 if x_range >= d_target - tol else None
        else:
            # Elevated destination check: interpolate trajectory crossing at x = d_target
            check_pts = steps + [landing_point_dict]
            for idx in range(len(check_pts) - 1):
                s0 = check_pts[idx]
                s1 = check_pts[idx + 1]
                if s0["x"] <= d_target <= s1["x"] and abs(s1["x"] - s0["x"]) > 1e-12:
                    frac = (d_target - s0["x"]) / (s1["x"] - s0["x"])
                    y_at_dest = s0["y"] + frac * (s1["y"] - s0["y"])
                    break
            if y_at_dest is not None:
                dest_shortfall = y_at_dest - h_target
                dest_reached = abs(y_at_dest - h_target) <= tol
            else:
                dest_shortfall = x_range - d_target
                dest_reached = False

    analytical_summary: Optional[Dict[str, Any]] = None
    errors_summary: Optional[Dict[str, Any]] = None

    if is_ideal:
        analytical_summary = analytical_ideal_summary(v0, theta_rad, g, y0)
        errors_summary = {
            "flight_time": _safe_abs_and_pct_error(t_land, analytical_summary["flight_time"]),
            "maximum_height": _safe_abs_and_pct_error(max_height, analytical_summary["maximum_height"]),
            "horizontal_range": _safe_abs_and_pct_error(x_range, analytical_summary["horizontal_range"]),
            "final_velocity": _safe_abs_and_pct_error(final_speed, analytical_summary["final_velocity"]),
            "max_step_position_error": max(s.get("position_error", 0.0) for s in steps),
            "max_step_velocity_error": max(s.get("velocity_error", 0.0) for s in steps),
        }

    return {
        "engine": "python-rk4-numpy" if HAS_NUMPY else "python-rk4-stdlib",
        "physics_model": params.physics_model,
        "summary": {
            "flight_time": t_land,
            "maximum_height": max_height,
            "horizontal_range": x_range,
            "initial_velocity": v0,
            "final_velocity": final_speed,
            "max_speed": max_speed,
            "step_count": len(steps),
            "crossed_ground": crossed_ground,
            "destination_distance": params.destination_distance,
            "destination_height": params.destination_height,
            "destination_reached": dest_reached,
            "destination_delta": dest_shortfall,
            "y_at_destination": y_at_dest,
        },
        "landing_point": landing_point_dict,
        "analytical": analytical_summary,
        "errors": errors_summary,
        "steps": steps,
    }


def _state_norm_diff(s1: Dict[str, Any], s2: Dict[str, Any]) -> float:
    return math.sqrt(
        (s1["x"] - s2["x"]) ** 2
        + (s1["y"] - s2["y"]) ** 2
        + (s1["vx"] - s2["vx"]) ** 2
        + (s1["vy"] - s2["vy"]) ** 2
    )


def run_convergence_analysis(params: SimulationInput) -> Dict[str, Any]:
    """Perform step-halving convergence study across h, h/2, and h/4."""
    validate_inputs(params)
    h_base = params.time_step
    h_values = [h_base, h_base / 2.0, h_base / 4.0]

    runs = []
    for h_val in h_values:
        run_params = SimulationInput(**{**asdict(params), "time_step": h_val})
        runs.append(run_rk4_simulation(run_params))

    is_ideal = params.physics_model == "ideal"
    entries: List[Dict[str, Any]] = []

    if is_ideal:
        ana = runs[0]["analytical"]
        for h_val, res in zip(h_values, runs):
            range_err = abs(res["summary"]["horizontal_range"] - ana["horizontal_range"])
            height_err = abs(res["summary"]["maximum_height"] - ana["maximum_height"])
            time_err = abs(res["summary"]["flight_time"] - ana["flight_time"])
            entries.append({
                "h": h_val,
                "steps": res["summary"]["step_count"],
                "horizontal_range": res["summary"]["horizontal_range"],
                "maximum_height": res["summary"]["maximum_height"],
                "flight_time": res["summary"]["flight_time"],
                "range_error": range_err,
                "height_error": height_err,
                "time_error": time_err,
                "observed_order": None,
            })

        for idx in range(1, len(entries)):
            prev_err = entries[idx - 1]["range_error"]
            curr_err = entries[idx]["range_error"]
            if prev_err > 1e-14 and curr_err > 1e-14:
                entries[idx]["observed_order"] = math.log2(prev_err / curr_err)
    else:
        # Compare RK4 state vector at a common step node across h, h/2, h/4 to avoid
        # linear ground-crossing interpolation masking O(h^4) RK4 order.
        s0, s1, s2 = runs[0]["steps"], runs[1]["steps"], runs[2]["steps"]
        common_idx_0 = max(
            1,
            min(len(s0) - 1, (len(s1) - 1) // 2, (len(s2) - 1) // 4),
        )
        diff_h_h2 = _state_norm_diff(s0[common_idx_0], s1[common_idx_0 * 2])
        diff_h2_h4 = _state_norm_diff(s1[common_idx_0 * 2], s2[common_idx_0 * 4])

        observed_order = None
        if diff_h_h2 > 1e-14 and diff_h2_h4 > 1e-14:
            observed_order = math.log2(diff_h_h2 / diff_h2_h4)

        r_h = runs[0]["summary"]["horizontal_range"]
        r_h2 = runs[1]["summary"]["horizontal_range"]
        r_h4 = runs[2]["summary"]["horizontal_range"]
        range_diff_0 = abs(r_h - r_h4)
        range_diff_1 = abs(r_h2 - r_h4)
        range_diff_2 = abs(r_h2 - r_h4) / 16.0

        for idx, (h_val, res) in enumerate(zip(h_values, runs)):
            est_err = range_diff_0 if idx == 0 else (range_diff_1 if idx == 1 else range_diff_2)
            entries.append({
                "h": h_val,
                "steps": res["summary"]["step_count"],
                "horizontal_range": res["summary"]["horizontal_range"],
                "maximum_height": res["summary"]["maximum_height"],
                "flight_time": res["summary"]["flight_time"],
                "range_error": est_err,
                "height_error": abs(res["summary"]["maximum_height"] - runs[2]["summary"]["maximum_height"]),
                "time_error": abs(res["summary"]["flight_time"] - runs[2]["summary"]["flight_time"]),
                "observed_order": observed_order if idx == 1 else None,
            })

    return {
        "physics_model": params.physics_model,
        "method": "analytical_comparison" if is_ideal else "step_halving",
        "entries": entries,
    }


SimulationResult = Dict[str, Any]
ConvergenceResult = Dict[str, Any]
