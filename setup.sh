#!/bin/bash
# Quick setup script for local development

echo "🚀 Setting up CO2 Monitoring System for local development..."

# Create virtual environment
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python -m venv .venv
fi

# Activate virtual environment (for bash)
source .venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install -r requirements.txt

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    echo "Creating .env file from template..."
    cp .env.example .env
    echo "⚠️  Update .env with your Supabase credentials and MQTT settings"
fi

# Run database migrations/init (if using Alembic)
# echo "Running database migrations..."
# alembic upgrade head

echo "✅ Setup complete!"
echo ""
echo "To start development server:"
echo "  1. Make sure .env is configured"
echo "  2. Run: uvicorn app.main:app --reload"
echo ""
echo "To run tests:"
echo "  pytest"
