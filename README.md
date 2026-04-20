# CO2 Monitor - Cervecería Artesanal

Sistema de monitoreo en tiempo real de temperatura, humedad y CO2 para tanques de fermentación.

**🚀 [LISTO PARA PRODUCCIÓN EN RENDER + SUPABASE]** → Ver [00_EMPEZAR_AQUI.md](00_EMPEZAR_AQUI.md)

## Características

- **Ingesta MQTT en tiempo real** desde sensores ESP32/Arduino vía HiveMQ Cloud
- **Base de datos PostgreSQL** en Supabase (cloud)
- **API REST autenticada** con filtros (hardware, riesgo, fecha)  
- **Dashboard web en vivo** con WebSockets
- **Autenticación JWT** con roles (admin, operator, viewer)
- **Validación de datos** con límites de rango configurables
- **Auditoría de acciones** sensibles
- **Health checks** para monitoreo en producción

## Stack Técnico

- **Backend**: FastAPI + SQLAlchemy + Gunicorn
- **Broker**: HiveMQ Cloud (producción) / EMQX en Docker (dev)
- **BD**: PostgreSQL Supabase (producción) / PostgreSQL Docker (dev)
- **Frontend**: HTML5 + Vanilla JS + ECharts
- **Deploy**: Render.com (Web Service + Background Worker) + Supabase

## ⚡ Despliegue Rápido

### 🟢 Producción (Render + Supabase)

Ver: **[00_EMPEZAR_AQUI.md](00_EMPEZAR_AQUI.md)** (30 minutos)

Resumen:
1. Crea proyecto en Supabase
2. Restaura schema desde `restore_schema.sql`
3. Genera `SECRET_KEY` con openssl
4. Push a GitHub
5. Deploy en Render (detecta automáticamente `render.yaml`)

### 🔵 Desarrollo Local

```bash
# Clonar y entrar en el proyecto
git clone <repo>
cd co2project

# Crear venv
python -m venv .venv
.venv\Scripts\activate  # Windows

# Instalar dependencias
pip install -r requirements.txt

# Copiar .env y configurar
cp .env.example .env
# Actualiza: MQTT_BROKER, DATABASE_URL (opcional - usa Supabase o local)

# Con Docker Compose (PostgreSQL + MQTT local)
docker-compose up -d

# O directamente con uvicorn
uvicorn app.main:app --reload

# Acceder
# - API Docs: http://localhost:8000/docs
# - Health: http://localhost:8000/health
# - Dashboard: http://localhost:8000
```

## 📖 Documentación

| Documento | Para | Leer |
|-----------|------|------|
| **00_EMPEZAR_AQUI.md** | Producción paso a paso | 🔴 PRIMERO |
| **QUICK_START_RENDER.md** | Deploy rápido (5 min) | 2️⃣ |
| **DEPLOYMENT_RENDER.md** | Guía detallada | Referencia |
| **SECURITY_CONFIG.md** | Seguridad producción | Importante |
| **SUPABASE_DEVELOPMENT.md** | Dev con Supabase cloud | Opcional |