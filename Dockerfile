FROM python:3.11-slim AS backend-base
WORKDIR /app
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend ./backend
RUN mkdir -p /data
ENV DATABASE_URL=sqlite:////data/projectile_lab.db
EXPOSE 8000
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
