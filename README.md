# Craft Brewery CO2 Monitor by Fermentation process

IoT+ML+Web. LAN Web Application in real-time for monitoring (temp, hum, co2) at any point with fermentation activity by craft brewery. Additionally, predictive capabilities through classification-based machine learning. 

## Features

- **Real-time Monitoring** (latency < 1s) MQTT
- **Predictions** XGBoost classifier (y/n)
- **API REST** Historical data queries
- **WebSockets** Backend to Frontend
- **Auth JWT** roles access control (LAN)
- **PostgreSQL DB** Main DB

## Stack

**Backend:**
- FastAPI (framework)
- SQLAlchemy + PostgreSQL (data layer)
- aiomqtt client sub (hardware to backend)
- XGBoost Library (ML)
- fastapi.security (Auth|Tokenizer|Access)

**Middleware: backend-hardware**
- Broker: EMQX

**Hardware:**
- ESP32 Dev Kit wifi
- Arduino IDE
- mqtt library

**Middleware: backend-frontend**

- Websockets (starlette)

**Frontend:**
- HTML | CSS | JS
  
**University**: Universidad Cooperativa de Colombia

**Year**: 2025-26
