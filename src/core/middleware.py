"""Core middleware."""
import logging
import threading

from django.utils.cache import patch_cache_control

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


class NoStoreAPIMiddleware:
    """Force no-store headers on API responses to prevent stale browser/proxy cache."""

    API_PREFIX = "/api/"

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)

        if request.path.startswith(self.API_PREFIX):
            patch_cache_control(
                response,
                private=True,
                no_cache=True,
                no_store=True,
                must_revalidate=True,
                max_age=0,
            )
            response["Pragma"] = "no-cache"
            response["Expires"] = "0"

        return response
