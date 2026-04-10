#!/bin/bash
# ──────────────────────────────────────────────────────────────────────────────
# Setup Script for Render Deployment
# 
# Este script ayuda a configurar las variables de entorno para Render.
# Uso: bash setup-render.sh
# ──────────────────────────────────────────────────────────────────────────────

echo "🚀 CO2 Monitor - Render Deployment Setup"
echo "=========================================="
echo ""

# ── Verificar que estamos en el directorio correcto ──────────────────────────
if [ ! -f "requirements.txt" ]; then
    echo "❌ Error: requirements.txt no encontrado"
    echo "Ejecutar desde el directorio raíz del proyecto"
    exit 1
fi

# ── HiveMQ Cloud Credentials ──────────────────────────────────────────────────
echo "📋 Configure HiveMQ Cloud Credentials"
echo "Obtener en: https://console.hivemq.cloud"
echo ""

read -p "HiveMQ Cluster ID (e.g., abc123def456): " MQTT_BROKER_ID
MQTT_BROKER="${MQTT_BROKER_ID}.s1.eu.hivemq.cloud"

read -p "MQTT Username: " MQTT_USER
read -sp "MQTT Password: " MQTT_PASSWORD
echo ""

MQTT_PORT=8883
MQTT_TOPIC="sensors/co2"

# ── PostgreSQL Configuration ──────────────────────────────────────────────────
echo ""
echo "🗄️  Configure PostgreSQL (Render Managed)"
echo "Obtener URL interna desde Render > PostgreSQL Service"
echo ""

read -p "Database URL (postgresql://...): " DATABASE_URL

# ── Application Settings ──────────────────────────────────────────────────────
echo ""
echo "⚙️  Application Settings"
echo ""

read -p "Allowed CORS Origins [*]: " CORS_ORIGINS
CORS_ORIGINS=${CORS_ORIGINS:-"*"}

read -p "JWT Token Expire Minutes [1440]: " TOKEN_EXPIRE
TOKEN_EXPIRE=${TOKEN_EXPIRE:-1440}

# ── Display Configuration ──────────────────────────────────────────────────────
echo ""
echo "✅ Configuration Summary:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "MQTT_BROKER: $MQTT_BROKER"
echo "MQTT_PORT: $MQTT_PORT"
echo "MQTT_USER: $MQTT_USER"
echo "MQTT_TOPIC: $MQTT_TOPIC"
echo ""
echo "DATABASE_URL: ${DATABASE_URL:0:50}..."
echo ""
echo "BACKEND_CORS_ORIGINS: $CORS_ORIGINS"
echo "ACCESS_TOKEN_EXPIRE_MINUTES: $TOKEN_EXPIRE"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── Save to .env for local testing ────────────────────────────────────────────
read -p "Save to local .env file? (y/n): " SAVE_LOCAL

if [ "$SAVE_LOCAL" == "y" ]; then
    cat > .env << EOF
DATABASE_URL=$DATABASE_URL

MQTT_BROKER=$MQTT_BROKER
MQTT_PORT=$MQTT_PORT
MQTT_USER=$MQTT_USER
MQTT_PASSWORD=$MQTT_PASSWORD
MQTT_TOPIC=$MQTT_TOPIC

ACCESS_TOKEN_EXPIRE_MINUTES=$TOKEN_EXPIRE
BACKEND_CORS_ORIGINS=$CORS_ORIGINS

ENVIRONMENT=production
LOG_LEVEL=INFO
EOF
    echo "✅ .env file created locally"
fi

echo ""
echo "📝 Next Steps:"
echo "1. Go to Render Dashboard > Web Service Settings"
echo "2. Add the following Environment Variables:"
echo ""
echo "   DATABASE_URL=$DATABASE_URL"
echo "   MQTT_BROKER=$MQTT_BROKER"
echo "   MQTT_PORT=$MQTT_PORT"
echo "   MQTT_USER=$MQTT_USER"
echo "   MQTT_PASSWORD=$MQTT_PASSWORD"
echo "   MQTT_TOPIC=$MQTT_TOPIC"
echo "   BACKEND_CORS_ORIGINS=$CORS_ORIGINS"
echo "   ACCESS_TOKEN_EXPIRE_MINUTES=$TOKEN_EXPIRE"
echo "   ENVIRONMENT=production"
echo "   LOG_LEVEL=INFO"
echo ""
echo "3. Click 'Save Changes'"
echo "4. Trigger manual deploy or push to GitHub"
echo ""
echo "✨ Done! Your app should deploy shortly."
