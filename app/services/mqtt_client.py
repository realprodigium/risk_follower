import asyncio
import json
import logging
from datetime import datetime
from aiomqtt import Client
from app.db import SessionLocal
from app.database.models import Records
from app.services.sensor_broadcast import broadcast_sensor_data
import os
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

MQTT_BROKER = os.getenv('MQTT_BROKER')
MQTT_PORT = int(os.getenv('MQTT_PORT'))
MQTT_TOPIC = os.getenv('MQTT_TOPIC')
MQTT_USER = os.getenv('MQTT_USER')
MQTT_PASSWORD = os.getenv('MQTT_PASSWORD')

VALID_RISK = {'alto', 'normal', 'bajo'}
REQUIRED_FIELDS = ['timestamp', 'humidity', 'co2']

class MQTTSubscriber:
    def __init__(self):
        self.is_running = False
        self.task = None

    async def process_message(self, payload: dict):
        missing = [f for f in REQUIRED_FIELDS if f not in payload]
        if missing:
            logger.error(f"MQTT payload missing required fields {missing}: {payload}")
            return None

        raw_temp = payload.get('temperature', payload.get('temp'))
        if raw_temp is None:
            logger.error(f"MQTT payload has no temperature field: {payload}")
            return None

        risk = payload.get('risk', 'normal')
        if risk not in VALID_RISK:
            logger.warning(f"Invalid risk value '{risk}' — defaulting to 'normal'")
            risk = 'normal'
        try:
            timestamp = datetime.fromisoformat(payload['timestamp'])
            temperature = float(raw_temp)
            humidity = float(payload['humidity'])
            co2 = float(payload['co2'])
            hardware = str(payload.get('hardware', 'Unknown_ESP32'))
        except (ValueError, TypeError) as exc:
            logger.error(f"MQTT type coercion failed: {exc} | payload: {payload}")
            return None
        db = SessionLocal()
        try:
            record = Records(
                hardware=hardware,
                timestamp=timestamp,
                temperature=temperature,
                humidity=humidity,
                co2=co2,
                risk=risk,
            )
            db.add(record)
            db.commit()
            db.refresh(record)
            logger.info(
                f"MQTT saved -> ID {record.id} | {hardware} | "
                f"CO2: {co2:.0f} ppm | Temp: {temperature:.1f}°C | "
                f"Hum: {humidity:.1f}% | Risk: {risk}"
            )
            await broadcast_sensor_data(record)
            return record

        except Exception as exc:
            db.rollback()
            logger.error(f"DB error saving MQTT record: {exc}")
            return None
        finally:
            db.close()

    async def start(self):
        self.is_running = True
        self.task = asyncio.create_task(self.subscribe())
        logger.info("MQTT Subscriber task started.")

    async def subscribe(self):
        retry_delay = 5
        while self.is_running:
            try:
                auth_kwargs = {"username": MQTT_USER, "password": MQTT_PASSWORD} if MQTT_USER else {}
                async with Client(MQTT_BROKER, MQTT_PORT, **auth_kwargs) as client:
                    await client.subscribe(MQTT_TOPIC)
                    logger.info(
                        f"MQTT connected → {MQTT_BROKER}:{MQTT_PORT} | topic: {MQTT_TOPIC}"
                    )
                    async for message in client.messages:
                        if not self.is_running:
                            break
                        try:
                            payload = json.loads(message.payload.decode())
                            await self.process_message(payload)
                        except json.JSONDecodeError:
                            logger.warning(f"MQTT invalid JSON: {message.payload}")
                        except Exception as exc:
                            logger.error(f"MQTT message handler error: {exc}")

            except Exception as exc:
                logger.error(f"MQTT connection error: {exc}")
                logger.info(f"Reconnecting in {retry_delay}s...")
                await asyncio.sleep(retry_delay)

    def stop(self):
        logger.info("Stopping MQTT Subscriber...")
        self.is_running = False
        if self.task:
            self.task.cancel()

mqtt_subscriber = MQTTSubscriber()