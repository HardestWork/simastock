FROM python:3.11-slim

# WeasyPrint system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf-2.0-0 \
    libffi-dev \
    shared-mime-info \
    libcairo2 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --system app && useradd --system --gid app --create-home --home-dir /home/app app

WORKDIR /app

# Install dependencies
COPY requirements/ /app/requirements/
ARG REQUIREMENTS_FILE=requirements/prod.txt
RUN pip install --no-cache-dir -r ${REQUIREMENTS_FILE}

# Copy project
COPY . /app/

# Create directories
RUN mkdir -p /app/logs /app/staticfiles /app/src/media/products /app/src/media/documents

# Collect static
RUN cd /app/src && python manage.py collectstatic --noinput --settings=config.settings.prod 2>/dev/null || true

RUN chown -R app:app /app/logs /app/staticfiles /app/src/media /home/app

EXPOSE 8000

WORKDIR /app/src

USER app

CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "4", "--timeout", "120"]
