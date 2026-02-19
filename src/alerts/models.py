"""Models for the alerts app."""
from django.conf import settings
from django.db import models
from django.utils import timezone

from core.models import TimeStampedModel


class Alert(TimeStampedModel):
    """An alert raised by the system for a specific store.

    Alerts are created by Celery tasks or by service functions when
    certain thresholds or anomalies are detected.  They are displayed
    in the navbar badge and on a dedicated alerts page.
    """

    class Type(models.TextChoices):
        LOW_STOCK = "LOW_STOCK", "Stock faible"
        OUT_OF_STOCK = "OUT_OF_STOCK", "Rupture de stock"
        PENDING_PAYMENT_TIMEOUT = "PENDING_PAYMENT_TIMEOUT", "Paiement en attente (delai depasse)"
        ABNORMAL_DISCOUNT = "ABNORMAL_DISCOUNT", "Remise anormale"
        CASH_VARIANCE = "CASH_VARIANCE", "Ecart de caisse"
        CREDIT_OVERDUE = "CREDIT_OVERDUE", "Credit en retard"
        STOCK_RUPTURE_FORECAST = "STOCK_RUPTURE_FORECAST", "Prevision de rupture de stock"
        SELF_CHECKOUT = "SELF_CHECKOUT", "Auto-encaissement"
        SUBSCRIPTION_EXPIRING = "SUBSCRIPTION_EXPIRING", "Abonnement bientot expire"

    class Severity(models.TextChoices):
        INFO = "INFO", "Information"
        WARNING = "WARNING", "Avertissement"
        CRITICAL = "CRITICAL", "Critique"

    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        related_name="alerts",
        verbose_name="boutique",
    )
    alert_type = models.CharField(
        "type d'alerte",
        max_length=30,
        choices=Type.choices,
    )
    severity = models.CharField(
        "severite",
        max_length=10,
        choices=Severity.choices,
        default=Severity.INFO,
    )
    title = models.CharField("titre", max_length=200)
    message = models.TextField("message")
    payload = models.JSONField(
        "donnees supplementaires",
        default=dict,
        blank=True,
        help_text="Donnees JSON supplementaires (ex: product_id, sale_id, shift_id).",
    )

    # Read tracking
    is_read = models.BooleanField("lu", default=False)
    read_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="read_alerts",
        verbose_name="lu par",
    )
    read_at = models.DateTimeField("lu le", null=True, blank=True)

    class Meta:
        verbose_name = "Alerte"
        verbose_name_plural = "Alertes"
        ordering = ["-created_at"]

    def __str__(self):
        return f"[{self.get_severity_display()}] {self.title}"

    def mark_as_read(self, user):
        """Mark this alert as read by *user*."""
        if not self.is_read:
            self.is_read = True
            self.read_by = user
            self.read_at = timezone.now()
            self.save(update_fields=["is_read", "read_by", "read_at", "updated_at"])
