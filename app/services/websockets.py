import json
import asyncio
import logging
from fastapi import WebSocket, WebSocketDisconnect, APIRouter
from sqlalchemy.orm import Session
from app.db import get_db
from app.database import models
from datetime import datetime, timezone, timezone

router = APIRouter()
logger = logging.getLogger(__name__)


class ConnectionManager:
    
    def __init__(self):
        self.active_connections: list[WebSocket] = []
    
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"Cliente conectado. Conexiones activas: {len(self.active_connections)}")
    
    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)
        logger.info(f"Cliente desconectado. Conexiones activas: {len(self.active_connections)}")
    
    async def broadcast(self, data: dict):
        if not self.active_connections:
            return
        
        message = json.dumps(data)
        disconnected = []
        
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception as e:
                logger.error(f"Error al enviar mensaje: {e}")
                disconnected.append(connection)
        
        for conn in disconnected:
            if conn in self.active_connections:
                self.active_connections.remove(conn)


manager = ConnectionManager()


@router.websocket("/ws/sensor-data")
async def websocket_sensor_data(websocket: WebSocket):
    await manager.connect(websocket)
    
    try:
        db = next(get_db())
        recent_records = db.query(models.Records).order_by(
            models.Records.timestamp.desc()
        ).limit(50).all()
        
        if recent_records:
            # Invertir para mantener cronologia
            recent_records.reverse()
            for record in recent_records:
                data = {
                    "type": "historical",
                    "id": record.id,
                    "timestamp": record.timestamp.isoformat(),
                    "hardware": record.hardware,
                    "temperature": record.temperature,
                    "humidity": record.humidity,
                    "co2": record.co2,
                    "risk": record.risk
                }
                await websocket.send_text(json.dumps(data))
        
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=5.0)
                logger.debug(f"Mensaje recibido del cliente: {data}")
            
            except asyncio.TimeoutError:
                pass
            except WebSocketDisconnect:
                manager.disconnect(websocket)
                logger.info("Cliente desconectado")
                break
    
    except Exception as e:
        logger.error(f"Error en WebSocket: {e}")
        manager.disconnect(websocket)


async def send_sensor_data(record_data: dict):
    data = {
        "type": "realtime",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        **record_data
    }
    await manager.broadcast(data)
