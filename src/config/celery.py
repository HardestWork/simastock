"""Celery configuration."""
import os
from celery import Celery
from celery.schedules import crontab

os.environ.setdefault(
    "DJANGO_SETTINGS_MODULE",
    os.getenv("DJANGO_SETTINGS_MODULE", "config.settings.docker"),
)

app = Celery("boutique")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

# Beat schedule
app.conf.beat_schedule = {
    "check-low-stock": {
        "task": "alerts.tasks.check_low_stock",
        "schedule": crontab(minute=0, hour="*/2"),  # Every 2 hours
    },
    "check-pending-payments": {
        "task": "alerts.tasks.check_pending_payments",
        "schedule": crontab(minute="*/30"),  # Every 30 minutes
    },
    "check-abnormal-discounts": {
        "task": "alerts.tasks.check_abnormal_discounts",
        "schedule": crontab(minute=0, hour=22),  # Daily at 10pm
    },
    "check-cash-variance": {
        "task": "alerts.tasks.check_cash_variance",
        "schedule": crontab(minute=0, hour=23),  # Daily at 11pm
    },
    "check-overdue-credits": {
        "task": "alerts.tasks.check_overdue_credits",
        "schedule": crontab(minute=0, hour=8),  # Daily at 8am
    },
    "daily-kpi-snapshot": {
        "task": "reports.tasks.daily_kpi_snapshot",
        "schedule": crontab(minute=0, hour=1),  # Daily at 1am
    },
    "analytics-refresh-abc": {
        "task": "analytics.tasks.refresh_abc_analysis",
        "schedule": crontab(minute=15, hour=1),  # Daily
    },
    "analytics-refresh-reorder": {
        "task": "analytics.tasks.refresh_dynamic_reorder",
        "schedule": crontab(minute=0, hour="*/2"),  # Every 2 hours
    },
    "analytics-refresh-credit-scores": {
        "task": "analytics.tasks.refresh_credit_scores",
        "schedule": crontab(minute=25, hour=1),  # Daily
    },
    "analytics-refresh-forecast": {
        "task": "analytics.tasks.refresh_sales_forecast",
        "schedule": crontab(minute=35, hour=1),  # Daily
    },
    "analytics-detect-fraud": {
        "task": "analytics.tasks.detect_fraud",
        "schedule": crontab(minute="*/30"),  # Every 30 minutes
    },
    "expenses-generate-recurring": {
        "task": "expenses.tasks.generate_due_recurring_expenses",
        "schedule": crontab(minute=0, hour="*"),  # Every hour
    },
}
