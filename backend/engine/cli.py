"""JSON stdin/stdout bridge for invoking the Python RK4 engine from Node/Express."""

import json
import sys
from dataclasses import fields

from .rk4 import SimulationInput, run_rk4_simulation, run_convergence_analysis


def main() -> int:
    try:
        payload = json.load(sys.stdin)
        mode = payload.get("mode", "simulate")
        raw_params = payload.get("params", {})

        valid_fields = {f.name for f in fields(SimulationInput)}
        filtered = {k: v for k, v in raw_params.items() if k in valid_fields and v is not None}
        sim_input = SimulationInput(**filtered)

        if mode == "convergence":
            result = run_convergence_analysis(sim_input)
        else:
            result = run_rk4_simulation(sim_input)

        sys.stdout.write(json.dumps(result))
        return 0
    except Exception as exc:  # noqa: BLE001
        sys.stderr.write(json.dumps({"error": str(exc)}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
