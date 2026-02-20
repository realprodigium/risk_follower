import asyncio
import json
import logging
from datetime import datetime
from aiomqtt import Client
from app.db import SessionLocal
from app.database.models import Records
import os
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

MQTT_BROKER = os.getenv('MQTT_BROKER', 'broker.emqx.io') # Fallback for dev
MQTT_PORT = int(os.getenv('MQTT_PORT', 1883))
MQTT_TOPIC = os.getenv('MQTT_TOPIC', 'co2/monitor')


class MQTTSubscriber:
    def __init__(self):
        self.is_running = False
        self.task = None 
        
    async def process_message(self, payload: dict):
        db = SessionLocal()
        try:
            record = Records(
                hardware=payload.get('hardware', 'Unknown_ESP32'),
                timestamp=datetime.fromisoformat(payload['timestamp']),
                temperature=float(payload.get('temp', payload.get('temperature', 0.0))), # Handle both keys
                humidity=float(payload['humidity']),
                co2=float(payload['co2']),
                risk=payload.get('risk', 'normal') 
            )
            
            db.add(record)
            db.commit()
            db.refresh(record)
            
            logger.info(f"MQTT Record saved: ID {record.id} | CO2: {record.co2} ppm | Temp: {record.temperature}")
            return record
            
        except KeyError as e:
            logger.error(f"Missing key in MQTT payload: {e}")
        except ValueError as e:
            logger.error(f"Data type error in MQTT payload: {e}")
        except Exception as e:
            db.rollback()
            logger.error(f"Error processing MQTT message: {e}")
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
                async with Client(MQTT_BROKER, MQTT_PORT) as client:
                    await client.subscribe(MQTT_TOPIC)
                    logger.info(f"Connected to MQTT broker: {MQTT_BROKER}:{MQTT_PORT} on topic {MQTT_TOPIC}")
                    
                    async for message in client.messages:
                        if not self.is_running:
                            break
                        try:
                            payload = json.loads(message.payload.decode())
                            # logger.debug(f"Message received: {payload}") # Verbose
                            await self.process_message(payload)
                            
                        except json.JSONDecodeError:
                            logger.warning(f"Invalid JSON received: {message.payload}")
                        except Exception as e:
                            logger.error(f"Error handling message loop: {e}")
                            
            except Exception as e:
                logger.error(f"MQTT Connection error: {e}")
                logger.info(f"Reconnecting in {retry_delay} seconds...")
                await asyncio.sleep(retry_delay)
    
    def stop(self):
        logger.info("Stopping MQTT Subscriber...")
        self.is_running = False
        if self.task:
            self.task.cancel()

mqtt_subscriber = MQTTSubscriber()