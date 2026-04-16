import asyncio
import json
import logging
from datetime import datetime, timezone
from aiomqtt import Client
from app.db import SessionLocal
from app.database.models import Records
import os
import ssl
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

MQTT_BROKER = os.getenv('MQTT_BROKER')
MQTT_PORT = int(os.getenv('MQTT_PORT'))
MQTT_TOPIC = os.getenv('MQTT_TOPIC')
MQTT_USER = os.getenv('MQTT_USER')
MQTT_PASSWORD = os.getenv('MQTT_PASSWORD')
MQTT_TLS_ENABLED = os.getenv('MQTT_TLS_ENABLED', 'False').lower() == 'true'

VALID_RISK = {'alto', 'normal', 'bajo'}
REQUIRED_FIELDS = ['timestamp', 'humidity', 'co2']

class PayloadValidator:    
    @staticmethod
    def validate(payload: dict) -> tuple[bool, dict | None, str]:

        missing = [f for f in REQUIRED_FIELDS if f not in payload]
        if missing:
            return False, None, f"Missing required fields: {missing}"

        raw_temp = payload.get('temperature', payload.get('temp'))
        if raw_temp is None:
            return False, None, "No temperature field found"

        risk = payload.get('risk', 'normal').lower()
        if risk not in VALID_RISK:
            logger.warning(f"Invalid risk '{risk}' — defaulting to 'normal'")
            risk = 'normal'

        try:
            timestamp = datetime.fromisoformat(payload['timestamp'])
            if timestamp.tzinfo is None:
                timestamp = timestamp.replace(tzinfo=timezone.utc)
            
            temperature = float(raw_temp)
            humidity = float(payload['humidity'])
            co2 = float(payload['co2'])
            hardware = str(payload.get('hardware', 'Unknown_ESP32')).strip()

            if not (0 <= humidity <= 100):
                return False, None, f"Invalid humidity value: {humidity}"
            if co2 < 0:
                return False, None, f"Invalid CO2 value: {co2}"
            if temperature < -50 or temperature > 60:
                return False, None, f"Invalid temperature value: {temperature}"

        except (ValueError, TypeError) as exc:
            return False, None, f"Type coercion failed: {exc}"

        return True, {
            "hardware": hardware,
            "timestamp": timestamp,
            "temperature": temperature,
            "humidity": humidity,
            "co2": co2,
            "risk": risk,
        }, None


class MQTTSubscriber:
    def __init__(self):
        self.is_running = False
        self.task = None

    async def _save_record(self, validated_payload: dict) -> Records | None:
        db = SessionLocal()
        try:
            record = Records(**validated_payload)
            db.add(record)
            db.commit()
            db.refresh(record)
            
            logger.info(
                f"MQTT saved → ID {record.id} | {record.hardware} | "
                f"CO2: {record.co2:.1f} ppm | Temp: {record.temperature:.1f}°C | "
                f"Hum: {record.humidity:.1f}% | Risk: {record.risk} | "
                f"Timestamp: {record.timestamp.isoformat()}"
            )
            return record

        except Exception as exc:
            db.rollback()
            logger.error(f"Database error saving MQTT record: {exc}")
            return None
        finally:
            db.close()

    async def process_message(self, payload: dict) -> Records | None:
        is_valid, formatted_payload, error_msg = PayloadValidator.validate(payload)
        
        if not is_valid:
            logger.error(f"Validation failed: {error_msg} | Payload: {payload}")
            return None
        
        return await self._save_record(formatted_payload)

    async def start(self):
        self.is_running = True
        self.task = asyncio.create_task(self.subscribe())
        logger.info("MQTT Subscriber started.")

    async def subscribe(self):
        retry_delay = 5
        while self.is_running:
            try:
                auth_kwargs = {"username": MQTT_USER, "password": MQTT_PASSWORD} if MQTT_USER else {}
                
                tls_context = None
                if MQTT_TLS_ENABLED:
                    tls_context = ssl.create_default_context()
                
                async with Client(MQTT_BROKER, MQTT_PORT, **auth_kwargs, tls_context=tls_context) as client:
                    topic = f"{MQTT_TOPIC}/#"
                    await client.subscribe(topic)
                    logger.info(
                        f"MQTT connected → {MQTT_BROKER}:{MQTT_PORT} | Topic: {topic}"
                    )
                    
                    async for message in client.messages:
                        if not self.is_running:
                            break
                        
                        try:
                            payload = json.loads(message.payload.decode())
                            await self.process_message(payload)
                        except json.JSONDecodeError as exc:
                            logger.warning(f"MQTT invalid JSON: {message.payload} | Error: {exc}")
                        except Exception as exc:
                            logger.error(f"MQTT message handler error: {exc}")

            except Exception as exc:
                logger.error(f"MQTT connection error: {exc}")
                logger.info(f"Reconnecting in {retry_delay}s...")
                await asyncio.sleep(retry_delay)

    def stop(self):
        logger.info("MQTT Subscriber stopping...")
        self.is_running = False
        if self.task:
            self.task.cancel()

mqtt_subscriber = MQTTSubscriber()