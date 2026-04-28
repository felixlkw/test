# Stage 1: Build frontend
FROM node:22-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Backend
FROM python:3.12-slim

# Set working directory to backend root
WORKDIR /app

# Install Python dependencies with pip
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Create src as a proper Python package
COPY backend/src/__init__.py ./src/__init__.py
COPY backend/src/main.py ./src/main.py
COPY backend/src/llm.py ./src/llm.py
COPY backend/src/prompt.py ./src/prompt.py

# Copy data files
COPY backend/data ./data

# Copy frontend build output
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Railway injects PORT at runtime; default 8000 for local Docker
ENV PORT=8000
EXPOSE 8000

# Shell form required for $PORT expansion at runtime
CMD uvicorn src.main:app --host 0.0.0.0 --port ${PORT:-8000}
