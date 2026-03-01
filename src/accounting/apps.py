from django.apps import AppConfig


class AccountingConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "accounting"
    verbose_name = "Comptabilite SYSCOHADA"

    def ready(self):
        from accounting import signals  # noqa: F401
