# Database & Persistence Architecture

PROJECTILE LAB supports two synchronized persistence layers:

1. **Cloud Firestore (Active in Live AI Studio Preview)**: User-isolated document store governed by `firestore.rules` and `firebase-blueprint.json`.
2. **SQLite + SQLAlchemy + Alembic (`backend/app/`)**: Relational database schema for standalone FastAPI + Docker deployments.

---

## 1. SQLite Relational Schema (`backend/app/models.py`)

| Table | Primary Purpose | Key Columns & Relationships |
| --- | --- | --- |
| `users` | Authenticated Google accounts | `id` (PK), `firebase_uid` (unique, indexed), `email`, `display_name`, `profile_image`, `created_at` |
| `simulations` | Saved simulation inputs & numerical summaries | `id` (PK), `user_id` (FK → `users.id` `ON DELETE CASCADE`), `simulation_name`, `projectile_type`, `physics_model`, `source_environment`, `destination_environment`, `initial_velocity`, `launch_angle`, `gravity`, `time_step`, `mass`, `drag_coefficient`, `air_density`, `cross_sectional_area`, `maximum_height`, `flight_time`, `horizontal_range`, `final_velocity`, `destination_reached`, `created_at` |
| `simulation_steps` | Full RK4 iteration rows & `k1`–`k4` slope vectors | `id` (PK), `simulation_id` (FK → `simulations.id` `ON DELETE CASCADE`), `iteration_number`, `time`, `x`, `y`, `vx`, `vy`, `k1`, `k2`, `k3`, `k4` (`JSON`), composite index `ix_sim_step_sim_iter` |
| `simulation_metadata` | Extended initial/target parameters & error summaries | `id` (PK), `simulation_id` (FK → `simulations.id` `ON DELETE CASCADE`, unique), `initial_height`, `destination_distance`, `destination_height`, `analytical_summary` (`JSON`), `errors_summary` (`JSON`), `extra_params` (`JSON`) |

---

## 2. Alembic Migrations

Migrations live under `backend/alembic/` (`0001_initial.py`).

```bash
cd backend
alembic upgrade head
```

---

## 3. SQLite Persistence, Limitations & Scaling Considerations

- **Persistent Volume**: In Docker (`docker-compose.yml`), `DATABASE_URL` points to `sqlite:////data/projectile_lab.db` backed by the named volume `sqlite_data` so data survives container rebuilds.
- **Concurrency Limits**: SQLite supports high-throughput concurrent reads (especially with WAL mode), while write transactions serialize through a single file lock. For single-node academic/lab workloads this is fast and zero-admin; for multi-replica horizontal scaling, swap `DATABASE_URL` to PostgreSQL (e.g., Cloud SQL) and re-run `alembic upgrade head`.
- **Backup & Restore**:
  ```bash
  # Consistent online backup
  sqlite3 /data/projectile_lab.db ".backup '/backups/projectile_lab_$(date +%F).db'"

  # Restore (while API is stopped)
  cp /backups/projectile_lab_2026-01-01.db /data/projectile_lab.db
  ```

---

## 4. Firestore User Isolation (`firestore.rules`)

All Firestore collections live strictly beneath `/users/{userId}`:
- `/users/{userId}` — user profile & theme/audio preferences
- `/users/{userId}/simulations/{simId}` — simulation configuration, results, analytical comparison, and error summary
- `/users/{userId}/simulations/{simId}/stepBatches/{batchId}` — chunked RK4 iteration arrays (up to 400 steps per batch)

Every read, list, write, and delete rule validates `request.auth != null && request.auth.uid == userId`, preventing cross-user data access.
