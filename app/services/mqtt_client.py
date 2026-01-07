import asyncio
import json
from datetime import datetime
from aiomqtt import Client, MqttError
from app.database.models import Records
from ..db import SessionLocal
import os
from dotenv import load_dotenv

load_dotenv()

MQTT_BROKER = os.getenv('MQTT_BROKER')
MQTT_PORT = int(os.getenv('MQTT_PORT'))
MQTT_TOPIC = os.getenv('MQTT_TOPIC')
#print(MQTT_TOPIC)

class MQTTSubscriber:
    def __init__(self):
        self.is_running = False
    async def process_message(self, payload: dict):
        db = SessionLocal()
        try:
            record = Records(
                hardware=payload.get('hardware'),
                timestamp=datetime.fromisoformato(payload['timestamp']),
                temperature=payload.get('temperature'),
                humidity=payload.get('humidity'),
                co2=payload.get('co2'),
                risk=payload.get('risk')
            )
            db.add(record)
            db.commit()
            db.refresh(record)
            print('Record saved:', record.id)
            #websockets
            return record
        except Exception as e:
            db.rollback()
            print('Error saving record:', e)
        finally:
            db.close()        