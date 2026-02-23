"""Test settings - uses SQLite for fast local testing."""
from .base import *  # noqa: F401,F403

DEBUG = True

# Use SQLite for tests (no PostgreSQL dependency)
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}
DATABASES["default"]["ATOMIC_REQUESTS"] = False

# Faster password hashing in tests
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.MD5PasswordHasher",
]

# Disable Redis cache in tests
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
    }
}

# Disable Celery in tests
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True

# Disable API throttling in tests for deterministic runs
REST_FRAMEWORK["DEFAULT_THROTTLE_CLASSES"] = []  # noqa: F405
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"] = {}  # noqa: F405

# Email
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"

# Disable logging noise during tests
LOGGING["root"]["level"] = "WARNING"  # noqa: F405
LOGGING["loggers"]["boutique"]["handlers"] = ["console"]  # noqa: F405
LOGGING["loggers"]["boutique"]["level"] = "WARNING"  # noqa: F405
