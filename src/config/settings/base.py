"""
Base settings for Boutique Management System.
"""
import os
from pathlib import Path

import environ
from django.core.exceptions import ImproperlyConfigured

# Build paths
BASE_DIR = Path(__file__).resolve().parent.parent.parent
PROJECT_DIR = BASE_DIR.parent

# Environment
env = environ.Env(
    DEBUG=(bool, False),
    ALLOWED_HOSTS=(list, ["localhost", "127.0.0.1"]),
)
environ.Env.read_env(os.path.join(PROJECT_DIR, ".env"))

SECRET_KEY = env("SECRET_KEY")
DEBUG = env("DEBUG")
ALLOWED_HOSTS = env("ALLOWED_HOSTS")
ENABLE_DJANGO_ADMIN = env.bool("ENABLE_DJANGO_ADMIN", default=DEBUG)


def _is_weak_secret_key(secret_key: str) -> bool:
    if not secret_key:
        return True
    return (
        len(secret_key) < 50
        or len(set(secret_key)) < 5
        or secret_key.startswith("django-insecure-")
        or secret_key == "change-me-to-a-long-random-string"
    )


if not DEBUG and _is_weak_secret_key(SECRET_KEY):
    raise ImproperlyConfigured(
        "SECRET_KEY est trop faible pour un environnement non-debug.",
    )

# Application definition
DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.sites",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.humanize",
]

THIRD_PARTY_APPS = [
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "django_filters",
    "corsheaders",
    "allauth",
    "allauth.account",
    "allauth.socialaccount",
    "allauth.socialaccount.providers.google",
    "django_celery_beat",
    "django_celery_results",
]

LOCAL_APPS = [
    "core",
    "accounts",
    "stores",
    "catalog",
    "stock",
    "sales",
    "cashier",
    "customers",
    "credits",
    "purchases",
    "reports",
    "alerts",
    "analytics",
    "expenses",
    "objectives",
    "api",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "allauth.account.middleware.AccountMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "stores.middleware.CurrentStoreMiddleware",
    "stores.middleware.StoreFeatureFlagsMiddleware",
    "core.middleware.AuditLogMiddleware",
]

# Security
CSRF_COOKIE_HTTPONLY = True
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_AGE = 28800  # 8 hours
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
X_FRAME_OPTIONS = "DENY"

# Public SPA URL used in emails (password reset, invites, etc.).
FRONTEND_URL = env("FRONTEND_URL", default="http://localhost:3000")

# Timeout (seconds) for SMTP connections so email-sending never blocks forever.
EMAIL_TIMEOUT = env.int("EMAIL_TIMEOUT", default=10)

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
                "stores.context_processors.current_store",
                "alerts.context_processors.unread_alerts_count",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# Database
DATABASES = {
    "default": env.db("DATABASE_URL", default="postgres://postgres:postgres@localhost:5432/boutique_db"),
}
DATABASES["default"]["ATOMIC_REQUESTS"] = True

# Auth
AUTH_USER_MODEL = "accounts.User"
SITE_ID = env.int("SITE_ID", default=1)
LOGIN_URL = "/accounts/login/"
LOGIN_REDIRECT_URL = "/dashboard/"
LOGOUT_REDIRECT_URL = "/accounts/login/"

AUTHENTICATION_BACKENDS = [
    "django.contrib.auth.backends.ModelBackend",
    "allauth.account.auth_backends.AuthenticationBackend",
]

# django-allauth
ACCOUNT_USER_MODEL_USERNAME_FIELD = None
ACCOUNT_UNIQUE_EMAIL = True
ACCOUNT_LOGIN_METHODS = {"email"}
ACCOUNT_SIGNUP_FIELDS = ["email*", "password1*", "password2*"]
ACCOUNT_EMAIL_VERIFICATION = env(
    "ACCOUNT_EMAIL_VERIFICATION",
    default="mandatory",
)
ACCOUNT_CONFIRM_EMAIL_ON_GET = env.bool(
    "ACCOUNT_CONFIRM_EMAIL_ON_GET",
    default=True,
)

SOCIALACCOUNT_ADAPTER = "accounts.adapters.BoutiqueSocialAccountAdapter"
SOCIALACCOUNT_AUTO_SIGNUP = True
SOCIALACCOUNT_EMAIL_AUTHENTICATION = True
SOCIALACCOUNT_LOGIN_ON_GET = env.bool("SOCIALACCOUNT_LOGIN_ON_GET", default=False)

GOOGLE_OAUTH_CLIENT_ID = env("GOOGLE_OAUTH_CLIENT_ID", default="")
GOOGLE_OAUTH_CLIENT_SECRET = env("GOOGLE_OAUTH_CLIENT_SECRET", default="")
GOOGLE_OAUTH_ENABLED = bool(GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET)

if GOOGLE_OAUTH_ENABLED:
    SOCIALACCOUNT_PROVIDERS = {
        "google": {
            "SCOPE": ["profile", "email"],
            "AUTH_PARAMS": {"access_type": "online"},
            "APPS": [
                {
                    "client_id": GOOGLE_OAUTH_CLIENT_ID,
                    "secret": GOOGLE_OAUTH_CLIENT_SECRET,
                    "key": "",
                }
            ],
        }
    }

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2SHA1PasswordHasher",
    "django.contrib.auth.hashers.ScryptPasswordHasher",
]

# Internationalization
LANGUAGE_CODE = "fr-fr"
TIME_ZONE = "Africa/Douala"
USE_I18N = True
USE_TZ = True

# Static files
STATIC_URL = "/static/"
STATICFILES_DIRS = [PROJECT_DIR / "static"]
STATIC_ROOT = PROJECT_DIR / "staticfiles"

# Media files
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Cache (Redis)
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": env("REDIS_URL", default="redis://localhost:6379/0"),
    }
}

# Celery
CELERY_BROKER_URL = env("CELERY_BROKER_URL", default="redis://localhost:6379/1")
CELERY_RESULT_BACKEND = "django-db"
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = TIME_ZONE
CELERY_BEAT_SCHEDULER = "django_celery_beat.schedulers:DatabaseScheduler"
CELERY_BEAT_SCHEDULE = {
    "deactivate-expired-enterprises": {
        "task": "stores.tasks.deactivate_expired_enterprises",
        "schedule": 86400,  # every 24 h
    },
    "warn-expiring-enterprises": {
        "task": "stores.tasks.warn_expiring_enterprises",
        "schedule": 86400,  # every 24 h
    },
    "daily-database-backup": {
        "task": "core.backup_database",
        "schedule": 86400,  # every 24 h
    },
    "generate-due-recurring-expenses": {
        "task": "expenses.tasks.generate_due_recurring_expenses",
        "schedule": 3600,  # every hour
    },
    "objectives-refresh-leaderboards": {
        "task": "objectives.tasks.refresh_all_leaderboards",
        "schedule": 3600,  # every hour
    },
    "objectives-close-month": {
        "task": "objectives.tasks.close_month_objectives",
        "schedule": 86400,  # every 24 h â€” task guards on day_of_month == 1
    },
    "analytics-refresh-customer-intelligence": {
        "task": "analytics.tasks.refresh_customer_intelligence_store",
        "schedule": 86400,
    },
}

# DRF
DEFAULT_RENDERER_CLASSES = [
    "rest_framework.renderers.JSONRenderer",
]
if DEBUG:
    DEFAULT_RENDERER_CLASSES.append("rest_framework.renderers.BrowsableAPIRenderer")

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "api.authentication.CookieJWTAuthentication",
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 25,
    "DEFAULT_RENDERER_CLASSES": DEFAULT_RENDERER_CLASSES,
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
        "rest_framework.throttling.ScopedRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": env("DRF_THROTTLE_ANON", default="60/min"),
        "user": env("DRF_THROTTLE_USER", default="600/min"),
        "auth_burst": env("DRF_THROTTLE_AUTH_BURST", default="20/min"),
        "auth_sustained": env("DRF_THROTTLE_AUTH_SUSTAINED", default="200/day"),
    },
}

# JWT
from datetime import timedelta

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=1),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
}
JWT_AUTH_COOKIE = env("JWT_AUTH_COOKIE", default="access_token")
JWT_AUTH_REFRESH_COOKIE = env("JWT_AUTH_REFRESH_COOKIE", default="refresh_token")
JWT_AUTH_COOKIE_SECURE = env.bool("JWT_AUTH_COOKIE_SECURE", default=not DEBUG)
JWT_AUTH_COOKIE_SAMESITE = env("JWT_AUTH_COOKIE_SAMESITE", default="Lax")
JWT_AUTH_COOKIE_PATH = env("JWT_AUTH_COOKIE_PATH", default="/")
JWT_AUTH_COOKIE_DOMAIN = env("JWT_AUTH_COOKIE_DOMAIN", default=None)
JWT_RETURN_TOKENS_IN_BODY = env.bool("JWT_RETURN_TOKENS_IN_BODY", default=False)

# Business config
CURRENCY = env("CURRENCY", default="FCFA")
CURRENCY_SYMBOL = env("CURRENCY_SYMBOL", default="FCFA")
MAX_DISCOUNT_PERCENT_SALES = env.int("MAX_DISCOUNT_PERCENT_SALES", default=10)
MAX_DISCOUNT_PERCENT_MANAGER = env.int("MAX_DISCOUNT_PERCENT_MANAGER", default=50)
PENDING_PAYMENT_ALERT_HOURS = env.int("PENDING_PAYMENT_ALERT_HOURS", default=2)
STOCK_LOW_THRESHOLD_DAYS = env.int("STOCK_LOW_THRESHOLD_DAYS", default=7)
CREDIT_OVERDUE_GRACE_DAYS = env.int("CREDIT_OVERDUE_GRACE_DAYS", default=3)

# Logging
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "json": {
            "()": "core.logging.JSONFormatter",
        },
        "verbose": {
            "format": "{levelname} {asctime} {module} {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "verbose",
        },
        "file": {
            "class": "logging.handlers.RotatingFileHandler",
            "filename": PROJECT_DIR / "logs" / "app.log",
            "formatter": "json",
            "maxBytes": env.int("LOG_FILE_MAX_BYTES", default=10485760),  # 10 MB
            "backupCount": env.int("LOG_FILE_BACKUP_COUNT", default=10),
            "encoding": "utf-8",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": "INFO",
    },
    "loggers": {
        "django": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
        "boutique": {
            "handlers": ["console", "file"],
            "level": "DEBUG",
            "propagate": False,
        },
    },
}

# Sentry
SENTRY_DSN = env("SENTRY_DSN", default="")
if SENTRY_DSN:
    import sentry_sdk
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        traces_sample_rate=0.2,
        profiles_sample_rate=0.1,
        environment=env("SENTRY_ENVIRONMENT", default="production"),
        send_default_pii=False,
    )

