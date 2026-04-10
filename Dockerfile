FROM python:3.11-slim

WORKDIR /app

# ── Install system dependencies ────────────────────────────────────────────────
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# ── Copy and install Python dependencies ───────────────────────────────────────
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── Copy application code ──────────────────────────────────────────────────────
COPY . .

# ── Expose port ────────────────────────────────────────────────────────────────
EXPOSE 8000

# ── Start application ──────────────────────────────────────────────────────────
# Render sets the PORT environment variable; default to 8000 if not set
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
