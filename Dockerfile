# Stage 1: Build stage
FROM python:3.11-slim AS builder

WORKDIR /app

# Install system dependencies for building Python packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt gunicorn

# Stage 2: Final runtime stage
FROM python:3.11-slim

WORKDIR /app

# Install only the runtime library for PostgreSQL
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Copy installed packages from the builder stage
COPY --from=builder /root/.local /root/.local
# Update PATH to include local user binaries
ENV PATH=/root/.local/bin:$PATH

# Copy application code
COPY app/ app/

# Run with gunicorn using dynamic PORT
CMD exec gunicorn -w 1 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:$PORT --timeout 120 app.main:app
