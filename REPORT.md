# Verification & Status Report

## Implemented Capabilities

1. **Classical RK4 Python Engine (`backend/engine/rk4.py`)**:
   - Explicit 4-stage classical Runge-Kutta integrator with derivative slopes `k1`, `k2`, `k3`, `k4`.
   - Four clearly separated ODE models (`ideal`, `quadratic_drag`, `powered_rocket`, `aircraft_flight`).
   - Exact analytical validation and step-wise + summary errors for `ideal` motion (zero-denominator safe percentage error).
   - Step-halving convergence analysis (`h`, `h/2`, `h/4`) with observed convergence order calculation.
   - Linear landing interpolation and 3-point parabolic maximum height refinement.
   - Honest target destination reach/miss evaluation.
2. **Authentication & Security**:
   - Firebase Authentication with Google OAuth popup sign-in (`src/context/AuthContext.tsx`).
   - Backend ID token verification via `jose` against Google public JWKS (`server.ts`).
   - Deployed hardened Firestore security rules (`firestore.rules`) enforcing per-UID isolation.
3. **Interactive 3D & Scientific Visualization**:
   - Three.js 3D viewport (`src/components/SimulationCanvas3D.tsx`) with 4 procedural projectile geometries, 6 environments, day/evening lighting, weather, trajectory curve, target ring, and 4 camera views.
   - 9 interactive Recharts graphs (`src/components/ScientificCharts.tsx`) with series toggles, zoom slider, step highlighting, and PNG export.
   - Interactive RK4 Iteration Explorer (`src/components/Rk4IterationExplorer.tsx`) showing `k1`–`k4` stages and `Y_{n+1}`.
   - Procedural Web Audio API sound effects (`src/lib/soundEngine.ts`) with mute and master volume controls.
   - 7 navigation views (`Home`, `New Simulation`, `Simulation History`, `Analytics`, `Learn RK4`, `My Profile`, `Settings`) + Dark/Light themes.

## Environment Scope & Known Limitations

- **Sandbox Runtime**: The live preview sandbox runs Node.js v22 + Python 3.10.12 (stdlib, without `pip` / Docker daemon). Consequently, live simulation execution in the preview routes through `server.ts` spawning `python3 -m backend.engine.cli` directly, while `/backend/app/` (FastAPI, SQLAlchemy, Alembic), `Dockerfile`, and `docker-compose.yml` provide the full containerized FastAPI/SQLite deployment artifact for Docker hosts.
- **Interactive Google OAuth E2E**: Browser-automated sign-in via Google popup requires interactive user credentials in a real browser session; automated verification covers Python RK4 math tests, Vitest component tests, TypeScript checks, Vite production bundling, and Express auth/health endpoint checks.
