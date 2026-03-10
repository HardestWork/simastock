"""Core middleware."""
import logging
import threading

from django.conf import settings
from django.utils.cache import patch_cache_control

logger = logging.getLogger("boutique")

_thread_locals = threading.local()


def get_current_user():
    return getattr(_thread_locals, "user", None)


class JWTAuthMiddleware:
    """Authenticate the user from JWT cookie/header at the middleware level.

    DRF's authentication only runs inside views, so Django middleware like
    CurrentStoreMiddleware sees an anonymous user.  This middleware bridges
    the gap by reading the JWT token early and setting ``request.user``.
    """

    def __init__(self, get_response):
        self.get_response = get_response
        self._cookie_name = getattr(settings, "JWT_AUTH_COOKIE", "access_token")

    def __call__(self, request):
        if request.user.is_authenticated:
            return self.get_response(request)

        user = self._authenticate_jwt(request)
        if user is not None:
            request.user = user

        return self.get_response(request)

    def _authenticate_jwt(self, request):
        try:
            from rest_framework_simplejwt.authentication import JWTAuthentication
            from rest_framework_simplejwt.exceptions import InvalidToken, TokenError

            jwt_auth = JWTAuthentication()

            # 1) Try Authorization header
            header = request.META.get("HTTP_AUTHORIZATION", "")
            if header.startswith("Bearer "):
                raw_token = header[7:]
                try:
                    validated = jwt_auth.get_validated_token(raw_token)
                    return jwt_auth.get_user(validated)
                except (InvalidToken, TokenError):
                    pass

            # 2) Try cookie
            raw_cookie = request.COOKIES.get(self._cookie_name)
            if raw_cookie:
                try:
                    validated = jwt_auth.get_validated_token(raw_cookie)
                    return jwt_auth.get_user(validated)
                except (InvalidToken, TokenError):
                    pass

        except Exception:
            pass

        return None


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
