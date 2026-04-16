# CO2 Monitor - Cervecería Artesanal

Sistema de monitoreo en tiempo real de temperatura, humedad y CO2 para tanques de fermentación.

## Características

- **Ingesta MQTT en tiempo real** desde sensores ESP32/Arduino vía HiveMQ Cloud
- **Base de datos PostgreSQL** con histórico persistente
- **API REST autenticada** con filtros (hardware, riesgo, fecha)  
- **Dashboard web en vivo** con WebSockets
- **Autenticación JWT** con roles (admin, operator, viewer)
- **Validación de datos** con límites de rango configurables
- **Auditoría de acciones** sensibles

## Stack Técnico

- **Backend**: FastAPI + SQLAlchemy
- **Broker**: HiveMQ Cloud (producción) / EMQX en Docker (dev)
- **BD**: PostgreSQL
- **Frontend**: HTML5 + Vanilla JS + ECharts
- **Deploy**: Docker/Docker-Compose + Render

## Instalación Local

```bash
# Clonar y entrar en el proyecto
git clone <repo>
cd co2project

# Crear venv
python -m venv .venv
.venv\Scripts\activate  # Windows

# Instalar dependencias
pip install -r requirements.txt

# Copiar .env y configurar credenciales MQTT/DB
cp .env.example .env

# Ejecutar con Docker (PostgreSQL + EMQX incluidos)
docker-compose up -d

# Acceder
# - API: http://localhost:8000/docs
# - Dashboard: http://localhost:8000
# - Login: admin/admin (crear primero)