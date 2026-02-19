"""Development settings."""
from .base import *  # noqa: F401,F403

DEBUG = True

# Debug toolbar
try:
    import debug_toolbar  # noqa: F401
    INSTALLED_APPS += ["debug_toolbar"]  # noqa: F405
    MIDDLEWARE.insert(0, "debug_toolbar.middleware.DebugToolbarMiddleware")  # noqa: F405
    INTERNAL_IPS = ["127.0.0.1"]
except ImportError:
    pass

# Email
EMAIL_BACKEND = env(
    "EMAIL_BACKEND",
    default="django.core.mail.backends.console.EmailBackend",
)  # noqa: F405
EMAIL_HOST = env("EMAIL_HOST", default="localhost")  # noqa: F405
EMAIL_PORT = env.int("EMAIL_PORT", default=25)  # noqa: F405
EMAIL_USE_TLS = env.bool("EMAIL_USE_TLS", default=False)  # noqa: F405
EMAIL_USE_SSL = env.bool("EMAIL_USE_SSL", default=False)  # noqa: F405
EMAIL_HOST_USER = env("EMAIL_HOST_USER", default="")  # noqa: F405
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", default="")  # noqa: F405
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default=EMAIL_HOST_USER or "webmaster@localhost")  # noqa: F405
SERVER_EMAIL = DEFAULT_FROM_EMAIL

# CORS
CORS_ALLOW_ALL_ORIGINS = True

# Logging
LOGGING["root"]["level"] = "DEBUG"  # noqa: F405
