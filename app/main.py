import logging
import contextlib
import os
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from app.db import Base, engine, SessionLocal
from app.api import auth, routes
from app.api import admin as admin_api
from app.database.models import Records
from app.services.mqtt_client import mqtt_subscriber
from app.services.websockets import router as ws_router
from sqlalchemy import text

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger(__name__)

Base.metadata.create_all(bind=engine)

@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Application starting up...")
    
#   with engine.begin() as conn:
#       conn.execute(
#           text("TRUNCATE TABLE records RESTART IDENTITY CASCADE;")
#        ) solo en desarrollo, luego eliminar el bloque

    logger.info("Records table truncated.")
    await mqtt_subscriber.start()
    yield

    logger.info("Application shutting down...")
    mqtt_subscriber.stop()

app = FastAPI(
    title="CO2 Monitoring System",
    description="Sistema de monitoreo de CO2 para cervecerías artesanales",
    lifespan=lifespan
)

cors_origins_env = os.getenv("BACKEND_CORS_ORIGINS", "*")
origins = [origin.strip() for origin in cors_origins_env.split(",")] if cors_origins_env != "*" else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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

@app.get('/health', tags=['system'])
def health_check():
    return {"status": "ok", "service": "CO2 Monitor"}