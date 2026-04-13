import json
import asyncio
import logging
from fastapi import WebSocket, WebSocketDisconnect, APIRouter
from app.db import SessionLocal
from app.database import models
from datetime import timezone

router = APIRouter()
logger = logging.getLogger(__name__)

POLL_INTERVAL = 0.5

def _serialize(record, msg_type: str) -> str:
    ts = record.timestamp
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    
    return json.dumps({
        "type": msg_type,
        "id": record.id,
        "timestamp": ts.isoformat(),
        "hardware": record.hardware,
        "temperature": record.temperature,
        "humidity": record.humidity,
        "co2": record.co2,
        "risk": record.risk,
    })


@router.websocket("/ws/sensor-data")
async def websocket_sensor_data(websocket: WebSocket):
    await websocket.accept()
    logger.info("WebSocket client connected")

    last_id = 0
    
    try:
        db = SessionLocal()
        try:
            seed = (
                db.query(models.Records)
                .order_by(models.Records.id.desc())
                .limit(10)
                .all()
            )
            seed.reverse()
            for rec in seed:
                await websocket.send_text(_serialize(rec, "historical"))
                if last_id == 0:
                    last_id = rec.id
        except Exception as exc:
            logger.error(f"Error sending historical data: {exc}")
            await websocket.send_text(json.dumps({
                "type": "error",
                "message": f"Error loading historical data: {str(exc)}"
            }))
        finally:
            db.close()

        while True:
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=POLL_INTERVAL)
            except asyncio.TimeoutError:
                pass
            except WebSocketDisconnect:
                logger.info("WebSocket client disconnected")
                break

            db = SessionLocal()
            try:
                new_records = (
                    db.query(models.Records)
                    .filter(models.Records.id > last_id)
                    .order_by(models.Records.id.asc())
                    .all()
                )
                for rec in new_records:
                    await websocket.send_text(_serialize(rec, "realtime"))
                    last_id = rec.id
                    
            except Exception as exc:
                logger.error(f"Database poll error: {exc}")
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "message": f"Database poll error: {str(exc)}"
                }))
            finally:
                db.close()

    except Exception as exc:
        logger.error(f"WebSocket error: {exc}")
    finally:
        logger.info("WebSocket connection closed")