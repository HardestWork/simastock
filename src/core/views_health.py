"""Lightweight health-check endpoint for load balancers and monitoring."""
import time

from django.db import connection
from django.http import JsonResponse


def health(request):
    """Return 200 if the app can reach the database, 503 otherwise.

    Response body:
        {"status": "ok"|"error", "db": "ok"|"<error>", "latency_ms": <float>}
    """
    start = time.monotonic()
    db_status = "ok"
    http_status = 200

    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
    except Exception as exc:
        db_status = str(exc)[:200]
        http_status = 503

    latency_ms = round((time.monotonic() - start) * 1000, 2)

    return JsonResponse(
        {"status": "ok" if http_status == 200 else "error", "db": db_status, "latency_ms": latency_ms},
        status=http_status,
    )
