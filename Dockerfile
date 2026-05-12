# Usamos una imagen base ligera de Python
FROM python:3.11-slim

# Evita que Python genere archivos .pyc y habilita el log en tiempo real
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PATH="/root/.local/bin:$PATH"

WORKDIR /app

# Instalamos solo las dependencias de sistema necesarias para el runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Instalamos las dependencias de Python
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt gunicorn

# Copiamos el código de la aplicación
COPY app/ app/

# Expone el puerto (Render lo asigna dinámicamente)
EXPOSE 10000

# Comando para ejecutar con gunicorn y workers optimizados para el plan gratuito
CMD exec gunicorn -w 1 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:$PORT --timeout 120 app.main:app
