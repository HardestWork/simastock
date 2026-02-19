"""Core middleware."""
import json
import logging
import threading

logger = logging.getLogger("boutique")

_thread_locals = threading.local()


def get_current_user():
    return getattr(_thread_locals, "user", None)


class AuditLogMiddleware:
    """Store current user in thread-local for audit logging."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        _thread_locals.user = request.user if hasattr(request, "user") and request.user.is_authenticated else None
        response = self.get_response(request)
        return response
