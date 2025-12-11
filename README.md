# Craft Brewery CO2 Monitor by Fermentation process

IoT+ML+Web. LAN Web Application in real-time for monitoring (temp, hum, co2) at any point in the craft brewery. Additionally, predictive capabilities through classification-based machine learning. 

## Features

- **Real-time Monitoring** (latency < 1s) MQTT
- **Predictions** XGBoost classifier
- **API REST** Historical data queries
- **WebSockets** Backend to Frontend
- **Autenticación JWT** roles access control (LAN)
- **Base de datos PostgreSQL** Main DB

## Stack

**Backend:**
- FastAPI (framework)
- SQLAlchemy + PostgreSQL (data layer)
- aiomqtt client sub (hardware to backend)
- XGBoost Library (ML)
- python-jose (JWT auth)
- 

**Hardware:**
- ESP32 Dev Kit wifi

**Frontend:**
soon
  
**University**: Universidad Cooperativa de Colombia
**Year**: 2025-26
