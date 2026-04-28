# Stage 1: Build frontend
FROM node:22-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Backend
FROM python:3.12-slim AS backend

# Install uv globally
RUN pip install --no-cache-dir --upgrade pip && pip install --no-cache-dir uv

# Set working directory for backend
WORKDIR /app/backend

# Install backend dependencies with uv
COPY backend/pyproject.toml ./
COPY backend/.python-version ./
COPY backend/uv.lock ./
RUN uv sync

# Copy backend source
COPY backend/src ./src
COPY backend/data ./data

# Copy frontend build output (relative to /app/backend → ../frontend/dist)
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

# Railway injects PORT at runtime; default to 8000 for local Docker
ENV PORT=8000

EXPOSE 8000

# Health check — generous start-period for 22 MB guideline JSON + cold start
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=5 \
  CMD python -c "import urllib.request,os; urllib.request.urlopen(f'http://localhost:{os.environ.get(\"PORT\",\"8000\")}/api/health')" || exit 1

# Start server — shell form so ${PORT} is expanded at runtime
CMD uv run uvicorn src.main:app --host 0.0.0.0 --port ${PORT}
