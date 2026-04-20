#!/usr/bin/env python
"""
MQTT Worker for Render Background Service

This script runs as a standalone background worker to handle MQTT message ingestion.
It's intended to run separately from the web service to avoid multiple connections.

Usage:
    python app/services/mqtt_client.py

Environment Variables:
    MQTT_BROKER: MQTT broker hostname
    MQTT_PORT: MQTT broker port (default: 1883)
    MQTT_TOPIC: Topic to subscribe to (e.g., sensors/+/data)
    MQTT_USERNAME: MQTT username (optional)
    MQTT_PASSWORD: MQTT password (optional)
    MQTT_TLS_ENABLED: Enable TLS (default: false)
    DATABASE_URL: PostgreSQL connection string
"""

import asyncio
import logging
import os
import signal
import sys
from app.services.mqtt_client import mqtt_subscriber

# Configure logging
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
        """Start the MQTT worker"""
        try:
            logger.info("Starting MQTT Worker...")
            
            # Validate required environment variables
            required_vars = ["MQTT_BROKER", "MQTT_PORT", "MQTT_TOPIC", "DATABASE_URL"]
            missing_vars = [var for var in required_vars if not os.getenv(var)]
            
            if missing_vars:
                logger.error(f"Missing required environment variables: {missing_vars}")
                sys.exit(1)
            
            logger.info(f"Connecting to MQTT broker: {os.getenv('MQTT_BROKER')}:{os.getenv('MQTT_PORT')}")
            logger.info(f"Subscribing to topic: {os.getenv('MQTT_TOPIC')}")
            
            await mqtt_subscriber.start()
            
            # Keep the worker running
            while self.is_running:
                await asyncio.sleep(1)
                
        except Exception as e:
            logger.error(f"MQTT Worker error: {e}", exc_info=True)
            sys.exit(1)


def main():
    """Entry point for MQTT worker"""
    worker = MQTTWorker()
    try:
        asyncio.run(worker.run())
    except KeyboardInterrupt:
        logger.info("MQTT Worker interrupted")
        mqtt_subscriber.stop()
        sys.exit(0)


if __name__ == "__main__":
    main()
