"""Independent mathematical RK4 numerical engine package for PROJECTILE LAB."""

from .rk4 import (
    SimulationInput,
    SimulationResult,
    ConvergenceResult,
    run_rk4_simulation,
    run_convergence_analysis,
)

__all__ = [
    "SimulationInput",
    "SimulationResult",
    "ConvergenceResult",
    "run_rk4_simulation",
    "run_convergence_analysis",
]
