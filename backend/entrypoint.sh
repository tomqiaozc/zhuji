#!/bin/sh
# Zhuji backend entrypoint.
#
# Fail-fast: if alembic can't bring the schema to head, exit non-zero
# instead of starting gunicorn. App Service treats a non-zero exit as a
# failed container start and won't route traffic — much safer than
# coming up with a broken DB and serving 500s.
set -e

echo "Running database migrations..."
if ! alembic upgrade head 2>&1; then
  echo "FATAL: alembic upgrade head failed. Refusing to start the app." >&2
  exit 1
fi

exec gunicorn src.main:app \
  --worker-class uvicorn.workers.UvicornWorker \
  --workers 2 \
  --bind 0.0.0.0:8000 \
  --timeout 120 \
  --access-logfile -
