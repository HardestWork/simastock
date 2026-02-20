"""Authentication API views with HttpOnly JWT cookies."""

import logging
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from core.email import send_branded_email
from django.core.exceptions import ImproperlyConfigured
from django.middleware import csrf
from django.views.decorators.csrf import ensure_csrf_cookie
from django.utils.decorators import method_decorator
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework import permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from api.v1.serializers import CustomTokenObtainPairSerializer

logger = logging.getLogger("boutique")


class SafeScopedRateThrottle(ScopedRateThrottle):
    """Scoped throttle that falls back to a strict default if scope config is missing."""

    def get_rate(self):
        try:
            return super().get_rate()
        except ImproperlyConfigured:
            logger.warning("Throttle scope '%s' not configured, applying strict default 5/min.", self.scope)
            return "5/min"


def _cookie_max_age(delta: timedelta) -> int:
    return int(delta.total_seconds())


def _set_auth_cookies(response: Response, *, access: str, refresh: str | None) -> None:
    secure = getattr(settings, "JWT_AUTH_COOKIE_SECURE", not settings.DEBUG)
    samesite = getattr(settings, "JWT_AUTH_COOKIE_SAMESITE", "Lax")
    path = getattr(settings, "JWT_AUTH_COOKIE_PATH", "/")
    domain = getattr(settings, "JWT_AUTH_COOKIE_DOMAIN", None)
    access_cookie = getattr(settings, "JWT_AUTH_COOKIE", "access_token")
    refresh_cookie = getattr(settings, "JWT_AUTH_REFRESH_COOKIE", "refresh_token")

    response.set_cookie(
        key=access_cookie,
        value=access,
        max_age=_cookie_max_age(settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"]),
        httponly=True,
        secure=secure,
        samesite=samesite,
        path=path,
        domain=domain,
    )
    if refresh:
        response.set_cookie(
            key=refresh_cookie,
            value=refresh,
            max_age=_cookie_max_age(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"]),
            httponly=True,
            secure=secure,
            samesite=samesite,
            path=path,
            domain=domain,
        )


def _clear_auth_cookies(response: Response) -> None:
    path = getattr(settings, "JWT_AUTH_COOKIE_PATH", "/")
    domain = getattr(settings, "JWT_AUTH_COOKIE_DOMAIN", None)
    access_cookie = getattr(settings, "JWT_AUTH_COOKIE", "access_token")
    refresh_cookie = getattr(settings, "JWT_AUTH_REFRESH_COOKIE", "refresh_token")
    response.delete_cookie(access_cookie, path=path, domain=domain)
    response.delete_cookie(refresh_cookie, path=path, domain=domain)


class CookieTokenObtainPairView(TokenObtainPairView):
    """Issue JWT and set HttpOnly auth cookies."""

    serializer_class = CustomTokenObtainPairSerializer
    throttle_classes = [SafeScopedRateThrottle]
    throttle_scope = "auth_burst"
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data

        access = validated["access"]
        refresh = validated["refresh"]
        user = validated["user"]

        response_data = {"user": user}
        if getattr(settings, "JWT_RETURN_TOKENS_IN_BODY", False):
            response_data.update({"access": access, "refresh": refresh})

        response = Response(response_data, status=status.HTTP_200_OK)
        _set_auth_cookies(response, access=access, refresh=refresh)
        return response


class CookieTokenRefreshView(TokenRefreshView):
    """Refresh access token using body token or HttpOnly refresh cookie."""

    throttle_classes = [SafeScopedRateThrottle]
    throttle_scope = "auth_sustained"
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        refresh_cookie = getattr(settings, "JWT_AUTH_REFRESH_COOKIE", "refresh_token")
        payload = request.data.copy()
        if not payload.get("refresh"):
            cookie_token = request.COOKIES.get(refresh_cookie)
            if cookie_token:
                payload["refresh"] = cookie_token

        serializer = self.get_serializer(data=payload)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data

        access = validated["access"]
        refresh = validated.get("refresh", payload.get("refresh"))
        response_data = {"detail": "Token refreshed."}
        if getattr(settings, "JWT_RETURN_TOKENS_IN_BODY", False):
            response_data.update({"access": access, "refresh": refresh})

        response = Response(response_data, status=status.HTTP_200_OK)
        _set_auth_cookies(response, access=access, refresh=refresh)
        return response


class LogoutAPIView(APIView):
    """Clear auth cookies and terminate API auth session in browser."""

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        response = Response(status=status.HTTP_204_NO_CONTENT)
        _clear_auth_cookies(response)
        return response


@method_decorator(ensure_csrf_cookie, name="dispatch")
class CSRFTokenAPIView(APIView):
    """Return a CSRF token and ensure CSRF cookie is set."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        token = csrf.get_token(request)
        return Response({"csrfToken": token}, status=status.HTTP_200_OK)


class PasswordResetRequestAPIView(APIView):
    """Request a password reset email for an account (idempotent)."""

    permission_classes = [permissions.AllowAny]
    throttle_classes = [SafeScopedRateThrottle]
    throttle_scope = "auth_burst"

    def post(self, request):
        email = (request.data.get("email") or "").strip()
        if not email:
            raise ValidationError({"email": "Ce champ est requis."})

        User = get_user_model()
        user = User.objects.filter(email__iexact=email, is_active=True).first()
        reset_url = None

        if user:
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)

            # Never trust request Origin headers for security-sensitive URLs.
            base = (getattr(settings, "FRONTEND_URL", "") or "http://localhost:3000").rstrip("/")
            reset_url = f"{base}/reset-password?uid={uid}&token={token}"

            greeting = user.get_full_name() or user.email
            try:
                send_branded_email(
                    subject="Reinitialisation de votre mot de passe",
                    template_name="emails/password_reset",
                    context={"greeting": greeting, "reset_url": reset_url},
                    recipient_list=[user.email],
                    fail_silently=False,
                )
            except Exception as exc:
                # Don't leak whether the email exists; log for admins.
                logger.error("Password reset email failed for %s: %s", email, exc)

        payload = {"detail": "Si un compte correspond a cet email, un lien de reinitialisation a ete envoye."}
        if reset_url:
            logger.debug("Password reset URL generated for %s", email)
        return Response(payload, status=status.HTTP_200_OK)


class PasswordResetConfirmAPIView(APIView):
    """Confirm password reset using uid/token and set a new password."""

    permission_classes = [permissions.AllowAny]
    throttle_classes = [SafeScopedRateThrottle]
    throttle_scope = "auth_burst"

    def post(self, request):
        uid = (request.data.get("uid") or "").strip()
        token = (request.data.get("token") or "").strip()
        pw1 = request.data.get("new_password1") or ""
        pw2 = request.data.get("new_password2") or ""

        if not uid:
            raise ValidationError({"uid": "Ce champ est requis."})
        if not token:
            raise ValidationError({"token": "Ce champ est requis."})
        if not pw1 or not pw2:
            raise ValidationError({"new_password1": "Mot de passe requis.", "new_password2": "Mot de passe requis."})
        if pw1 != pw2:
            raise ValidationError({"new_password2": "Les mots de passe ne correspondent pas."})

        User = get_user_model()
        try:
            user_id = force_str(urlsafe_base64_decode(uid))
            user = User.objects.filter(pk=user_id, is_active=True).first()
        except Exception:
            user = None

        if not user or not default_token_generator.check_token(user, token):
            raise ValidationError({"detail": "Lien invalide ou expire."})

        from django.contrib.auth.password_validation import validate_password
        try:
            validate_password(pw1, user=user)
        except Exception as exc:
            # Django raises ValidationError with list of messages.
            messages = getattr(exc, "messages", None)
            if messages:
                raise ValidationError({"new_password1": messages})
            raise ValidationError({"new_password1": "Mot de passe invalide."})

        user.set_password(pw1)
        user.save(update_fields=["password"])
        return Response({"detail": "Mot de passe mis a jour. Vous pouvez vous connecter."}, status=status.HTTP_200_OK)
