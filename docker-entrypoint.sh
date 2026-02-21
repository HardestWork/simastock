#!/usr/bin/env bash
set -e

# If a command is provided (e.g., docker-compose dev), run it as-is.
if [ "$#" -gt 0 ]; then
  exec "$@"
fi

cd /app/src

echo "Running database migrations..."
python manage.py migrate --noinput

echo "Starting gunicorn..."
exec gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 4 --timeout 120
