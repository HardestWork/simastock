"""Custom authentication backends for API."""

from django.conf import settings
from django.middleware.csrf import CsrfViewMiddleware
from rest_framework import exceptions
from rest_framework.request import Request
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError


class CookieJWTAuthentication(JWTAuthentication):
    """JWT auth that supports ``Authorization`` header and HttpOnly cookies.

    - Header token keeps compatibility with existing API clients.
    - Cookie token enables safer browser auth without exposing JWT in JS.
    - CSRF is enforced when request is authenticated via cookie token.

    When a cookie token is present but expired/invalid, the backend returns
    ``None`` (unauthenticated) instead of raising ``AuthenticationFailed``.
    This allows ``AllowAny`` endpoints (like token refresh) to function
    even when the access cookie is stale.
    """

    def _enforce_csrf(self, request: Request) -> None:
        django_request = request._request
        csrf_check = CsrfViewMiddleware(lambda req: None)
        csrf_check.process_request(django_request)
        reason = csrf_check.process_view(django_request, None, (), {})
        if reason:
            raise exceptions.PermissionDenied(f"CSRF Failed: {reason}")

    def authenticate(self, request: Request):
        # 1) Standard Authorization header flow — raise on invalid token
        #    so API clients get a clear 401.
        header = self.get_header(request)
        if header is not None:
            raw_token = self.get_raw_token(header)
            if raw_token is not None:
                validated_token = self.get_validated_token(raw_token)
                return self.get_user(validated_token), validated_token

        # 2) Cookie fallback flow — return None on invalid/expired token
        #    so the request can proceed as unauthenticated (needed for
        #    the refresh endpoint to work when access cookie is expired).
        cookie_name = getattr(settings, "JWT_AUTH_COOKIE", "access_token")
        raw_cookie_token = request.COOKIES.get(cookie_name)
        if not raw_cookie_token:
            return None

        try:
            validated_token = self.get_validated_token(raw_cookie_token)
        except (InvalidToken, TokenError):
            return None

        self._enforce_csrf(request)
        return self.get_user(validated_token), validated_token
