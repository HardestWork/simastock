"""Production settings."""
from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F401,F403

DEBUG = False
ENABLE_DJANGO_ADMIN = env.bool("ENABLE_DJANGO_ADMIN", default=False)  # noqa: F405

# Security
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_SSL_REDIRECT = env.bool("SECURE_SSL_REDIRECT", default=True)  # noqa: F405
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
CSRF_TRUSTED_ORIGINS = env.list("CSRF_TRUSTED_ORIGINS", default=[])  # noqa: F405
USE_X_FORWARDED_HOST = env.bool("USE_X_FORWARDED_HOST", default=True)  # noqa: F405
if env.bool("USE_X_FORWARDED_PROTO", default=True):  # noqa: F405
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# Force stricter defaults in production.
ACCOUNT_EMAIL_VERIFICATION = env("ACCOUNT_EMAIL_VERIFICATION", default="mandatory")  # noqa: F405
SOCIALACCOUNT_LOGIN_ON_GET = env.bool("SOCIALACCOUNT_LOGIN_ON_GET", default=False)  # noqa: F405


def _is_weak_secret_key(secret_key: str) -> bool:
    if not secret_key:
        return True
    return (
        len(secret_key) < 50
        or len(set(secret_key)) < 5
        or secret_key.startswith("django-insecure-")
    )


if _is_weak_secret_key(SECRET_KEY):  # noqa: F405
    raise ImproperlyConfigured(
        "SECRET_KEY est trop faible pour la production. Utilisez une cle longue et aleatoire.",
    )

if not SECURE_SSL_REDIRECT:
    raise ImproperlyConfigured(
        "SECURE_SSL_REDIRECT doit etre active en production.",
    )
if not JWT_AUTH_COOKIE_SECURE:  # noqa: F405
    raise ImproperlyConfigured(
        "JWT_AUTH_COOKIE_SECURE doit etre active en production.",
    )

# CORS
CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=[])  # noqa: F405
if not CORS_ALLOWED_ORIGINS:
    raise ImproperlyConfigured(
        "CORS_ALLOWED_ORIGINS doit etre configure en production.",
    )
if any("localhost" in origin or "127.0.0.1" in origin for origin in CORS_ALLOWED_ORIGINS):
    raise ImproperlyConfigured(
        "CORS_ALLOWED_ORIGINS ne doit pas contenir localhost/127.0.0.1 en production.",
    )

# Email
EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
EMAIL_HOST = env("EMAIL_HOST", default="smtp.gmail.com")  # noqa: F405
EMAIL_PORT = env.int("EMAIL_PORT", default=587)  # noqa: F405
EMAIL_USE_TLS = True
EMAIL_HOST_USER = env("EMAIL_HOST_USER", default="")  # noqa: F405
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", default="")  # noqa: F405
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default=EMAIL_HOST_USER or "webmaster@localhost")  # noqa: F405
SERVER_EMAIL = DEFAULT_FROM_EMAIL

# Static files
STATICFILES_STORAGE = "django.contrib.staticfiles.storage.ManifestStaticFilesStorage"
