# Etapa 1: Construcción
FROM python:3.11-slim as builder

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Instalamos dependencias de compilación para psycopg2 y otros
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install --no-cache-dir --user -r requirements.txt

# Etapa 2: Runtime (Imagen final)
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PATH="/root/.local/bin:$PATH"

WORKDIR /app

# Instalamos solo la librería de runtime para Postgres
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Copiamos solo las librerías instaladas de la etapa builder
COPY --from=builder /root/.local /root/.local
COPY app/ app/

EXPOSE 10000

# Gunicorn optimizado para el plan gratuito de Render (1 worker para minimizar RAM)
CMD exec gunicorn -w 1 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:$PORT --timeout 120 app.main:app
