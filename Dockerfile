# Stage 1: Build frontend
FROM node:22-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Backend (pip-based, no uv dependency)
FROM python:3.12-slim

WORKDIR /app

# Install Python dependencies with pip (most reliable for Railway)
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend/src ./src
COPY backend/data ./data

# Copy frontend build output
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Railway injects PORT at runtime
ENV PORT=8000

EXPOSE 8000

# Use shell form so ${PORT} expands at runtime
CMD uvicorn src.main:app --host 0.0.0.0 --port ${PORT:-8000}
