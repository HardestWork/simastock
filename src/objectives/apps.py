"""App config for the objectives module."""
from django.apps import AppConfig


class ObjectivesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "objectives"
    verbose_name = "Objectifs Vendeurs"

    def ready(self):
        import objectives.signals  # noqa: F401
