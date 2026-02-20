import logging
import contextlib
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from app.db import Base, engine
from app.api import auth, routes
from app.services.mqtt_client import mqtt_subscriber

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
    await mqtt_subscriber.start()
    yield
    logger.info("Application shutting down...")
    mqtt_subscriber.stop()

app = FastAPI(
    title="CO2 Monitoring System", 
    description="Sistema de monitoreo de CO2",
    lifespan=lifespan
)

templates = Jinja2Templates(directory="app/templates")
app.mount("/static", StaticFiles(directory="app/static"), name="static")

app.include_router(auth.router, prefix="/auth")
app.include_router(routes.router)

@app.get("/login", response_class=HTMLResponse, tags=['view'])
def login_page(request: Request):
    return templates.TemplateResponse(request=request, name='login.html')

@app.get("/", response_class=HTMLResponse, tags=['view'])
async def dashboard(request: Request):
    return templates.TemplateResponse(
        request=request, 
        name='dashboard.html',
        context={}
    )

@app.get('/health', tags=['system'])
def health_check():
    return {"status": "ok", "service": "CO2 Monitor", "mode": "integrated-views"}
