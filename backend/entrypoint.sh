#!/bin/sh
set -e

echo "Running database migrations..."
alembic upgrade head 2>&1 || echo "WARNING: migrations failed, continuing startup"

exec gunicorn src.main:app \
  --worker-class uvicorn.workers.UvicornWorker \
  --workers 2 \
  --bind 0.0.0.0:8000 \
  --timeout 120 \
  --access-logfile -
