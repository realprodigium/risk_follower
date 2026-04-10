# Craft Brewery CO2 Monitor by Fermentation Process

Web Application in real-time for monitoring (temp, humidity, CO2) at any point with fermentation activity by craft brewery.

## 🚀 Features

- **Real-time Monitoring** (latency < 1s) via MQTT from Arduino devices
- **API REST** with historical data queries, filtering, and statistics
- **WebSockets** for live dashboard updates polling from database
- **Security** JWT authentication, Role-Based Access Control, hashed passwords, HTTPS
- **PostgreSQL Database** for persistent data storage
- **Clean Architecture** with service layer, proper data flow (MQTT → DB → API)
- **Cloud Deployment** Ready for Render + HiveMQ Cloud

## 📊 Tech Stack

**Backend:**
- **Framework**: FastAPI 0.109.0
- **Database**: PostgreSQL + SQLAlchemy ORM
- **MQTT**: aiomqtt client with HiveMQ Cloud support
- **Auth**: JWT tokens, bcrypt password hashing
- **API Security**: Role-Based Access Control (RBAC)

**Message Broker (Cloud):**
- **Production**: HiveMQ Cloud (managed)
- **Development**: EMQX (Docker)

**Frontend:**
- HTML5
- CSS3
- Vanilla JavaScript
- WebSocket consumer

**Deployment:**
- **Container**: Docker + docker-compose
- **Web Service**: Render.com
- **MQTT Broker**: HiveMQ Cloud
- **Database**: PostgreSQL (Render managed)

---

## ⚙️ Setup & Run

### Local Development

#### Prerequisites
- Python 3.11+
- PostgreSQL 15+
- Docker & Docker Compose

#### Quick Start
```bash
# Clone repository
git clone <repo-url>
cd co2project

# Create virtual environment
python -m venv .venv
.\.venv\Scripts\Activate.ps1  # Windows
source .venv/bin/activate      # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your MQTT credentials

# Run with Docker Compose (includes PostgreSQL + EMQX)
docker-compose up -d

# Run migrations (if needed)
# The app auto-creates tables on startup

# Access application
# API: http://localhost:8000/docs
# Dashboard: http://localhost:8000
# EMQX Dashboard: http://localhost:18083
```

---

## 🌐 Cloud Deployment (Render + HiveMQ)

### Quick Deploy (5 minutes)

**See below for detailed instructions:**

1. **Get HiveMQ Cloud Credentials** (https://console.hivemq.cloud)
2. **Create PostgreSQL in Render**
3. **Connect GitHub repo to Render**
4. **Set Environment Variables**
5. **Deploy!**

### Detailed Guide

👉 **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Complete step-by-step guide

👉 **[DEPLOY_QUICK.md](./DEPLOY_QUICK.md)** - Quick reference

---

## 📖 API Endpoints

### Authentication
- `POST /auth/register` - Register new user
- `POST /auth/login` - Login and get JWT token
- `POST /auth/refresh` - Refresh access token

### Records (Sensor Data)
- `GET /records` - Get records with filters
  - Query params: `hardware`, `risk`, `date_from`, `date_to`, `limit`, `offset`
- `GET /records/latest` - Get last N records (for dashboards)
- `GET /records/{id}` - Get specific record
- `GET /hardware-devices` - List all hardware devices
- `GET /records/stats/summary` - Get statistics
- `POST /records` - Create record manually (admin/operator)
- `DELETE /records/{id}` - Delete record (admin only)

### System
- `GET /health` - Health check
- `GET /docs` - Swagger documentation
- `WS /ws/sensor-data` - WebSocket for live updates

---

## 🔐 Security Features

✅ JWT authentication with configurable expiration
✅ Bcrypt password hashing
✅ Role-Based Access Control (admin, operator, viewer)
✅ HTTPS enforcement (Render)
✅ MQTT with TLS (HiveMQ Cloud)
✅ CORS protection
✅ SQL injection prevention (SQLAlchemy parameterized queries)
✅ Audit logging for sensitive operations
✅ Input validation at API and service layers

---

## 📊 Data Flow (Refactored)

```
Arduino/ESP32 Device
        ↓
MQTT (HiveMQ Cloud - Port 8883)
        ↓
MQTT Client (Validated + Formatted)
        ↓
PostgreSQL Database (Persistent)
        ↓
HTTP Endpoints (REST API)
        ↓
Frontend (Dashboard)
```

**Why this flow?**
- ✅ Data never bypasses validation
- ✅ Single source of truth (database)
- ✅ Scalable (multiple frontends can consume same API)
- ✅ Secure (all endpoints authenticated)

---

## 🧪 Testing

### Local API Test
```bash
# Get all records
curl -H "Authorization: Bearer <token>" http://localhost:8000/records

# Get latest records
curl -H "Authorization: Bearer <token>" http://localhost:8000/records/latest

# Health check (no auth needed)
curl http://localhost:8000/health
```

### MQTT Test
Use MQTTx or another MQTT client:
- Broker: `your-cluster.s1.eu.hivemq.cloud:8883`
- Topic: `sensors/co2`
- Payload: `{"timestamp":"2026-04-10T12:00:00Z","temperature":22.5,"humidity":60,"co2":450}`

---

## 📦 Project Structure

```
co2project/
├── app/
│   ├── api/
│   │   ├── auth.py           # Authentication endpoints
│   │   ├── routes.py         # Sensor data endpoints
│   │   └── admin.py          # Admin endpoints
│   ├── database/
│   │   ├── models.py         # SQLAlchemy models
│   │   └── schemas.py        # Pydantic schemas
│   ├── services/
│   │   ├── mqtt_client.py    # MQTT subscriber (HiveMQ)
│   │   ├── record_service.py # Data access layer
│   │   ├── auth_services.py  # Auth logic
│   │   └── websockets.py     # WebSocket handler
│   ├── static/               # Frontend assets
│   ├── templates/            # HTML templates
│   ├── db.py                 # Database connection
│   └── main.py               # FastAPI app & lifespan
├── .env.example              # Environment template
├── Dockerfile                # Docker image
├── docker-compose.yml        # Local dev stack
├── render.yaml               # Render deployment config
├── DEPLOYMENT.md             # Detailed deploy guide
├── DEPLOY_QUICK.md           # Quick reference
├── requirements.txt          # Python dependencies
└── README.md                 # This file
```

---

## 🐛 Troubleshooting

### MQTT Connection Failed
- Verify HiveMQ Cloud cluster is running
- Check MQTT_BROKER, MQTT_PORT, MQTT_USER, MQTT_PASSWORD in .env
- Ensure port 8883 is accessible (TLS)

### PostgreSQL Connection Error
- Verify DATABASE_URL in .env
- For Render: use internal URL, not external
- Check PostgreSQL service is running

### WebSocket Errors
- Verify BACKEND_CORS_ORIGINS includes your frontend URL
- Check browser console for detailed errors
- See application logs in Render dashboard

---

## 📞 Support

For detailed deployment documentation, see:
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Complete setup guide
- **[DEPLOY_QUICK.md](./DEPLOY_QUICK.md)** - Quick start
- Render Docs: https://render.com/docs
- HiveMQ Docs: https://docs.hivemq.com

---

## 📜 License & Attribution

**University**: Universidad Cooperativa de Colombia

**Course**: Capstone Project

**Year**: 2025-I | 2025-II | 2026-I

**Technology**: Deployed on Render & HiveMQ Cloud (April 2026)

---

**Last Updated**: April 2026 | Ready for Cloud Deployment ✨
