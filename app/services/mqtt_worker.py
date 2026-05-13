import asyncio
import logging
import os
import signal
import sys
from app.services.mqtt_client import mqtt_subscriber

log_level = os.getenv("LOG_LEVEL", "info").upper()
logging.basicConfig(
    level=getattr(logging, log_level),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger(__name__)


class MQTTWorker:
    def __init__(self):
        self.is_running = True
        signal.signal(signal.SIGTERM, self._signal_handler)
        signal.signal(signal.SIGINT, self._signal_handler)

    def _signal_handler(self, signum, frame):
        logger.info(f"Received signal {signum}, shutting down gracefully...")
        self.is_running = False
        mqtt_subscriber.stop()
        sys.exit(0)

    async def run(self):
        try:
            logger.info("Starting MQTT Worker...")            
            required_vars = ["MQTT_BROKER", "MQTT_PORT", "MQTT_TOPIC", "DATABASE_URL"]
            missing_vars = [var for var in required_vars if not os.getenv(var)]
            
            if missing_vars:
                logger.error(f"Missing required environment variables: {missing_vars}")
                sys.exit(1)
            
            logger.info(f"Connecting to MQTT broker: {os.getenv('MQTT_BROKER')}:{os.getenv('MQTT_PORT')}")
            logger.info(f"Subscribing to topic: {os.getenv('MQTT_TOPIC')}")
            
            await mqtt_subscriber.start()
            
            while self.is_running:
                await asyncio.sleep(1)
                
        except Exception as e:
            logger.error(f"MQTT Worker error: {e}", exc_info=True)
            sys.exit(1)


def main():
    worker = MQTTWorker()
    try:
        asyncio.run(worker.run())
    except KeyboardInterrupt:
        logger.info("MQTT Worker interrupted")
        mqtt_subscriber.stop()
        sys.exit(0)

if __name__ == "__main__":
    main()
