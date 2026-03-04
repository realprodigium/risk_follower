from app.services.websockets import manager
import asyncio
import logging

logger = logging.getLogger(__name__)


async def broadcast_sensor_data(record):
    try:
        sensor_data = {
            "type": "realtime",
            "id": record.id,
            "timestamp": record.timestamp.isoformat(),
            "hardware": record.hardware,
            "temperature": record.temperature,
            "humidity": record.humidity,
            "co2": record.co2,
            "risk": record.risk
        }
        
        await manager.broadcast(sensor_data)
        logger.debug(f"Datos de sensor broadcast: {record.hardware} - CO2: {record.co2}")
        
    except Exception as e:
        logger.error(f"Error broadcasting sensor data: {e}")


def broadcast_sensor_data_sync(record):
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.create_task(broadcast_sensor_data(record))
        else:
            loop.run_until_complete(broadcast_sensor_data(record))
    except Exception as e:
        logger.warning(f"Could not broadcast sync: {e}. Event loop may not be available.")
