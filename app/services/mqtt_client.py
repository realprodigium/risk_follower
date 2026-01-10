import asyncio
import json
from datetime import datetime
from aiomqtt import Client
from app.db import SessionLocal
from app.database.models import Records
import os
from dotenv import load_dotenv

load_dotenv()

MQTT_BROKER = os.getenv('MQTT_BROKER')
MQTT_PORT = int(os.getenv('MQTT_PORT'))
MQTT_TOPIC = os.getenv('MQTT_TOPIC')


class MQTTSubscriber:
    def __init__(self):
        self.is_running = False
        
    async def process_message(self, payload: dict):
        db = SessionLocal()
        try:
            record = Records(
                hardware=payload.get('hardware', 'ESP32_001'),
                timestamp=datetime.fromisoformat(payload['timestamp']),
                temp=float(payload['temp']),
                humidity=float(payload['humidity']),
                co2=float(payload['co2']),
                risk=payload.get('risk', 'normal')  #ESP32 puede calcular risk basico
            )
            
            db.add(record)
            db.commit()
            db.refresh(record)
            
            print(f"Record saved: {record.id} | CO2: {record.co2} ppm")
            
            return record
            
        except Exception as e:
            db.rollback()
            print(f"Error processing message: {e}")
        finally:
            db.close()
    
    async def subscribe(self):
        self.is_running = True
        
        while self.is_running:
            try:
                async with Client(MQTT_BROKER, MQTT_PORT) as client:
                    await client.subscribe(MQTT_TOPIC)
                    print(f"Connected to MQTT broker: {MQTT_BROKER}:{MQTT_PORT}")
                    print(f"Subscribed to topic: {MQTT_TOPIC}")
                    
                    async for message in client.messages:
                        try:
                            payload = json.loads(message.payload.decode())
                            print(f"Message received on {message.topic}: {payload}")
                            await self.process_message(payload)
                            
                        except json.JSONDecodeError:
                            print(f"Invalid JSON: {message.payload}")
                        except Exception as e:
                            print(f"Error handling message: {e}")
                            
            except Exception as e:
                print(f"MQTT Connection error: {e}")
                print("Reconnecting in 5 seconds...")
                await asyncio.sleep(5)
    
    def stop(self):
        self.is_running = False

mqtt_subscriber = MQTTSubscriber()