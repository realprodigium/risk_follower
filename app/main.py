import logging
import contextlib
import os
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from app.db import Base, engine, SessionLocal, check_db_connection
from app.api import auth, routes
from app.api import admin as admin_api
from app.database.models import Records
from app.services.mqtt_client import mqtt_subscriber
from app.services.websockets import router as ws_router
from sqlalchemy import text

# Configure logging
log_level = os.getenv("LOG_LEVEL", "info").upper()
logging.basicConfig(
    level=getattr(logging, log_level),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger(__name__)

Base.metadata.create_all(bind=engine)

def _ensure_alert_thresholds_columns():
    try:
        with engine.begin() as conn:
            columns_to_add = [
                ("co2_warning", "FLOAT DEFAULT 1500.0"),
                ("temp_warning", "FLOAT DEFAULT 35.0"),
                ("humidity_warning", "FLOAT DEFAULT 70.0"),
            ]
            
            for col_name, col_def in columns_to_add:
                try:
                    conn.execute(text(f"ALTER TABLE alert_thresholds ADD COLUMN {col_name} {col_def}"))
                    logger.info(f"Columna {col_name} agregada a alert_thresholds")
                except Exception as e:
                    if "already exists" not in str(e).lower() and "duplicate" not in str(e).lower():
                        logger.debug(f"Columna {col_name} ya existe o error: {e}")
            
            try:
                conn.execute(text("""
                    UPDATE alert_thresholds 
                    SET temp_low=10.0, temp_high=35.0, temp_warning=40.0,
                        humidity_low=40.0, humidity_high=90.0, humidity_warning=95.0,
                        co2_low=300.0, co2_high=1000.0, co2_warning=1500.0
                    WHERE id = 1
                """))
            except Exception as e:
                logger.debug(f"No se pudieron actualizar valores por defecto: {e}")
    except Exception as e:
        logger.error(f"Error asegurando columnas de alert_thresholds: {e}")

@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Application starting up...")
    _ensure_alert_thresholds_columns()
    
#   with engine.begin() as conn:
#       conn.execute(
#           text("TRUNCATE TABLE records RESTART IDENTITY CASCADE;")
#        ) solo en desarrollo, luego eliminar el bloque

    
    should_start_mqtt = os.getenv("ENABLE_MQTT", "true").lower() == "true"
    if should_start_mqtt:
        try:
            await mqtt_subscriber.start()
            logger.info("MQTT Subscriber started successfully")
        except Exception as e:
            logger.warning(f"Could not start MQTT subscriber: {e}")
    else:
        logger.info("MQTT subscriber disabled for this service")
    
    yield

    logger.info("Application shutting down...")
    if should_start_mqtt:
        mqtt_subscriber.stop()

app = FastAPI(
    title="CO2 Monitoring System",
    description="Sistema de monitoreo de CO2 para cervecerías artesanales",
    lifespan=lifespan,
    docs_url="/docs" if os.getenv("ENVIRONMENT") != "production" else None,
    redoc_url="/redoc" if os.getenv("ENVIRONMENT") != "production" else None,
    openapi_url="/openapi.json" if os.getenv("ENVIRONMENT") != "production" else None,
)

app.add_middleware(TrustedHostMiddleware, allowed_hosts=["*"])

cors_origins_env = os.getenv("BACKEND_CORS_ORIGINS", "*")
origins = [origin.strip() for origin in cors_origins_env.split(",")] if cors_origins_env != "*" else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health", tags=["health"])
async def health():
    return {
        "status": "ok",
        "environment": os.getenv("ENVIRONMENT", "unknown"),
        "service": "co2-monitoring-api"
    }

@app.head("/health", tags=["health"])
async def health_head():
    return Response(status_code=200)

@app.get("/health/ready", tags=["health"])
async def health_ready():
    try:
        db_connected = check_db_connection()
        if not db_connected:
            return JSONResponse(
                status_code=503,
                content={"status": "unavailable", "reason": "Database connection failed"}
            )
        
        return {
            "status": "ready",
            "database": "connected",
            "mqtt": "connected" if mqtt_subscriber.connected else "disconnected"
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return JSONResponse(
            status_code=503,
            content={"status": "unavailable", "reason": str(e)}
        )

templates = Jinja2Templates(directory="app/templates")
app.mount("/static", StaticFiles(directory="app/static"), name="static")

app.include_router(auth.router, prefix="/auth")
app.include_router(routes.router)
app.include_router(ws_router)
app.include_router(admin_api.router)

@app.get("/login", response_class=HTMLResponse, tags=['view'])
def login_page(request: Request):
    return templates.TemplateResponse(request=request, name='login.html')

@app.get("/", response_class=HTMLResponse, tags=['view'])
async def dashboard(request: Request):
    return templates.TemplateResponse(request=request, name='dashboard.html', context={})

@app.get("/history", response_class=HTMLResponse, tags=['view'])
async def history_page(request: Request):
    return templates.TemplateResponse(request=request, name='history.html', context={})

@app.get("/admin", response_class=HTMLResponse, tags=['view'])
async def admin_page(request: Request):
    return templates.TemplateResponse(request=request, name='admin.html', context={})
