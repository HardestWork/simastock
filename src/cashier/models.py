"""Models for the cashier app (cash shifts and payments)."""
from django.conf import settings
from django.db import models
from django.core.validators import MinValueValidator
from django.utils import timezone

from core.models import TimeStampedModel


# ---------------------------------------------------------------------------
# CashShift
# ---------------------------------------------------------------------------

class CashShift(TimeStampedModel):
    """Represents a cashier's work session at a register.

    A shift is opened when a cashier starts their session and closed
    when they reconcile the register at the end of the session.
    """

    class Status(models.TextChoices):
        OPEN = "OPEN", "Ouvert"
        CLOSED = "CLOSED", "Ferme"

    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.PROTECT,
        related_name="cash_shifts",
        verbose_name="boutique",
    )
    cashier = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="cash_shifts",
        verbose_name="caissier",
    )
    status = models.CharField(
        "statut",
        max_length=10,
        choices=Status.choices,
        default=Status.OPEN,
        db_index=True,
    )
    opened_at = models.DateTimeField("ouvert le", auto_now_add=True)
    closed_at = models.DateTimeField("ferme le", null=True, blank=True)

    # Money tracking
    opening_float = models.DecimalField(
        "fond de caisse initial",
        max_digits=14,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        help_text="Montant en caisse au debut de la session.",
    )
    expected_cash = models.DecimalField(
        "especes attendues",
        max_digits=14,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        help_text="Montant calcule attendu en caisse.",
    )
    closing_cash = models.DecimalField(
        "especes comptees",
        max_digits=14,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
        help_text="Montant reel compte en caisse a la fermeture.",
    )
    variance = models.DecimalField(
        "ecart",
        max_digits=14,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Difference entre especes comptees et especes attendues.",
    )

    # Totals by payment method
    total_sales = models.DecimalField(
        "total ventes",
        max_digits=14,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
    )
    total_cash_payments = models.DecimalField(
        "total paiements especes",
        max_digits=14,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
    )
    total_mobile_payments = models.DecimalField(
        "total paiements mobile",
        max_digits=14,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
    )
    total_bank_payments = models.DecimalField(
        "total paiements bancaires",
        max_digits=14,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
    )
    total_credit_payments = models.DecimalField(
        "total paiements a credit",
        max_digits=14,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
    )

    notes = models.TextField("notes", blank=True, default="")

    class Meta:
        ordering = ["-opened_at"]
        verbose_name = "Session de caisse"
        verbose_name_plural = "Sessions de caisse"

    def __str__(self):
        return (
            f"Session {self.cashier} @ {self.store} "
            f"({self.get_status_display()}) — {self.opened_at:%d/%m/%Y %H:%M}"
        )

    def calculate_expected_cash(self):
        """Calculate the expected cash in the register.

        Expected cash = opening float + total cash payments received
        during this shift.
        """
        self.expected_cash = self.opening_float + self.total_cash_payments
        return self.expected_cash

    @property
    def duration(self):
        """Return the duration of this shift as a timedelta.

        If the shift is still open, the duration is calculated from
        the opening time to now.
        """
        end = self.closed_at or timezone.now()
        return end - self.opened_at


# ---------------------------------------------------------------------------
# Payment
# ---------------------------------------------------------------------------

class Payment(TimeStampedModel):
    """A single payment record against a sale.

    A sale can have multiple payments (split payments), each using a
    different method.
    """

    class Method(models.TextChoices):
        CASH = "CASH", "Especes"
        MOBILE_MONEY = "MOBILE_MONEY", "Mobile Money"
        BANK_TRANSFER = "BANK_TRANSFER", "Virement bancaire"
        CREDIT = "CREDIT", "Credit"
        CHEQUE = "CHEQUE", "Cheque"

    sale = models.ForeignKey(
        "sales.Sale",
        on_delete=models.PROTECT,
        related_name="payments",
        verbose_name="vente",
    )
    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.PROTECT,
        related_name="payments",
        verbose_name="boutique",
    )
    cashier = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="payments_processed",
        verbose_name="caissier",
    )
    shift = models.ForeignKey(
        CashShift,
        on_delete=models.PROTECT,
        related_name="payments",
        verbose_name="session de caisse",
    )
    method = models.CharField(
        "methode de paiement",
        max_length=20,
        choices=Method.choices,
    )
    amount = models.DecimalField(
        "montant",
        max_digits=14,
        decimal_places=2,
        validators=[MinValueValidator(0.01)],
    )
    reference = models.CharField(
        "reference",
        max_length=100,
        blank=True,
        default="",
        help_text="Reference Mobile Money, numero de virement, etc.",
    )
    notes = models.TextField("notes", blank=True, default="")

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Paiement"
        verbose_name_plural = "Paiements"

    def __str__(self):
        return (
            f"Paiement {self.get_method_display()} — "
            f"{self.amount} {getattr(settings, 'CURRENCY', 'FCFA')} "
            f"(Vente {self.sale_id})"
        )
