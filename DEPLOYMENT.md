# Deployment Guide

## 1. Environment Variables

For standalone Docker / FastAPI deployments, configure variables using `backend/.env.docker.example` as a reference (never commit real secrets):

- `PORT` — HTTP port (default `3000` for the Express + Vite full-stack server)
- `DATABASE_URL` — FastAPI SQLAlchemy URL (e.g., `sqlite:////data/projectile_lab.db`)
- `CORS_ORIGINS` — Comma-separated allowed origins for FastAPI CORS middleware
- `APP_URL` — Deployed HTTPS origin

Firebase client configuration is stored in `/firebase-applet-config.json` (project `glossy-feat-pq6d2`).

---

## 2. Docker & Docker Compose Deployment

Run the containerized FastAPI + SQLite backend and Vite frontend:

```bash
docker compose up --build -d
```

- **Backend API**: `http://localhost:8000` (`/api/health` healthcheck included)
- **Frontend**: `http://localhost:3000`
- **Persistent SQLite Storage**: Named Docker volume `sqlite_data` mounted at `/data` ensures saved users, simulations, and RK4 step tables persist across container restarts.

---

## 3. HTTPS & Firebase Google OAuth Configuration

1. Terminate TLS at your reverse proxy (Nginx, Caddy, Cloud Run, or load balancer) so the application is served exclusively over `https://`.
2. In the **Firebase Console → Authentication → Settings → Authorized domains**, add your production domain alongside `localhost`.
3. Ensure OAuth popup origins match your deployed domain so `signInWithPopup` succeeds without `auth/unauthorized-domain`.
4. Deploy updated Firestore rules with:
   ```bash
   firebase deploy --only firestore:rules
   ```
