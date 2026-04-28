# Stage 1: Build frontend
FROM node:22-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Backend
FROM python:3.12-slim AS backend
WORKDIR /app/backend

# Install uv
RUN pip install --no-cache-dir --upgrade pip && pip install --no-cache-dir uv

# Install backend dependencies with uv
COPY backend/pyproject.toml ./
COPY backend/.python-version ./
COPY backend/uv.lock ./
RUN uv sync --no-dev

# Copy backend source
COPY backend/src ./src
COPY backend/data ./data

# Copy frontend build output
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

# Railway uses PORT env var (defaults to 8000 for local dev)
ENV PORT=8000

# Expose port
EXPOSE ${PORT}

# Health check for Railway (using python since curl may not be in slim image)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD python -c "import urllib.request,os; urllib.request.urlopen(f'http://localhost:{os.environ.get(\"PORT\",\"8000\")}/api/health')" || exit 1

# Run backend server - Railway injects PORT env var
CMD ["sh", "-c", "uv run uvicorn src.main:app --host 0.0.0.0 --port ${PORT}"]
