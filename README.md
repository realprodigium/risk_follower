# Craft Brewery CO2 Monitor by Fermentation process

Web Application in real-time for monitoring (temp, hum, co2) at any point with fermentation activity by craft brewery. 

## Features

- **Real-time Monitoring** (latency < 1s) MQTT from arduino IDE
- **API REST** Historical data queries, export data to CSV
- **WebSockets** Backend to Frontend connection
- **Security** JWT, Roles Access Control, Hashed Passwords, HTTPS
- **PostgreSQL DB** Main DB
- **Architecture** Layer Architecture

## Stack

**Backend:**
- FastAPI (framework)
- SQLAlchemy + PostgreSQL (data layer)
- aiomqtt client sub (hardware to backend)
- fastapi.security (Auth | Tokenizer | Access)

**Middleware: backend-hardware**

- Broker: EMQX

**Middleware: backend-frontend**

- Websockets (starlette)

**Frontend:**

- HTML
- CSS
- JavaScript
  
**University**: Universidad Cooperativa de Colombia

**Year**: 2025-I | 2025-II | 2026-I
