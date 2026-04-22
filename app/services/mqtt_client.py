import asyncio
import json
import logging
from datetime import datetime, timezone
from aiomqtt import Client, client, topic
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
        self.isconnected = False

    def _calculate_risk(self, db, temp, hum, co2):
        from app.database import models
        t = db.query(models.AlertThresholds).first()
        if not t:
            return 'normal'
        
        # CO2 > 1500 ppm, Temp >35°C o <15°C, Humedad >70% o <30%
        if co2 > t.co2_warning or temp > t.temp_warning or temp < t.temp_low or hum > t.humidity_warning or hum < t.humidity_low:
            return 'peligro'
        
        # CO2 1000-1500, Temp 30-35°C, Humedad 60-70%
        if co2 > t.co2_high or (temp > t.temp_high and temp <= t.temp_warning) or hum > t.humidity_high:
            return 'advertencia'
        
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
                    self.connected = True
                    logger.info(f"Connected to MQTT broker")
                    topic = MQTT_TOPIC.rstrip('/')
                    if '+' not in topic and '#' not in topic:
                        topic = f"{topic}/#"
                    await client.subscribe(topic)
                    logger.info(f'Subscribed to topic: {topic}')
                    async for message in client.messages:
                        if not self.is_running: break
                        try:
                            payload = json.loads(message.payload.decode())
                            await self.process_message(payload)
                        except Exception as e: logger.error(f'Message processing error: {e}')
            except Exception as e:
                self.connected = False
                logger.warning(f'MQTT connection error: {e}. Retrying in {retry_delay} seconds...')
                await asyncio.sleep(retry_delay)

    def stop(self):
        self.is_running = False
        if self.task: self.task.cancel()

mqtt_subscriber = MQTTSubscriber()