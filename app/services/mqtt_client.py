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
            "co2": co2
        }, None

class MQTTSubscriber:
    def __init__(self):
        self.is_running = False
        self.task = None

    def _calculate_risk(self, db, temp, hum, co2):
        from app.database import models
        t = db.query(models.AlertThresholds).first()
        if not t:
            return 'normal'
        if co2 > t.co2_high * 1.5: return 'peligro'
        if temp > t.temp_high + 5 or temp < t.temp_low - 5: return 'peligro'
        if hum > t.humidity_high + 15 or hum < t.humidity_low - 15: return 'peligro'
        if co2 > t.co2_high: return 'advertencia'
        if temp > t.temp_high or temp < t.temp_low: return 'advertencia'
        if hum > t.humidity_high or hum < t.humidity_low: return 'advertencia'
        return 'normal'

    async def _save_record(self, validated_payload: dict) -> Records | None:
        db = SessionLocal()
        try:
            risk = self._calculate_risk(
                db, 
                validated_payload['temperature'], 
                validated_payload['humidity'], 
                validated_payload['co2']
            )
            record = Records(**validated_payload, risk=risk)
            db.add(record)
            db.commit()
            db.refresh(record)
            logger.info(f"MQTT saved → ID {record.id}")
            return record
        except Exception as exc:
            db.rollback()
            logger.error(f"Database error: {exc}")
            return None
        finally:
            db.close()

    async def process_message(self, payload: dict) -> Records | None:
        is_valid, formatted_payload, error_msg = PayloadValidator.validate(payload)
        if not is_valid: return None
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
                if MQTT_TLS_ENABLED: tls_context = ssl.create_default_context()
                async with Client(MQTT_BROKER, MQTT_PORT, **auth_kwargs, tls_context=tls_context) as client:
                    await client.subscribe(f"{MQTT_TOPIC}/#")
                    async for message in client.messages:
                        if not self.is_running: break
                        try:
                            payload = json.loads(message.payload.decode())
                            await self.process_message(payload)
                        except Exception: pass
            except Exception:
                await asyncio.sleep(retry_delay)

    def stop(self):
        self.is_running = False
        if self.task: self.task.cancel()

mqtt_subscriber = MQTTSubscriber()