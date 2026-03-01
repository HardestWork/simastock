"""Models for the credits app."""
from decimal import Decimal

from django.conf import settings
from django.db import models
from django.utils import timezone

from core.models import TimeStampedModel


# ---------------------------------------------------------------------------
# CustomerAccount
# ---------------------------------------------------------------------------

class CustomerAccount(TimeStampedModel):
    """A credit account linking a customer to a store with a credit limit."""

    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        related_name="credit_accounts",
        verbose_name="boutique",
    )
    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.CASCADE,
        related_name="credit_accounts",
        verbose_name="client",
    )
    credit_limit = models.DecimalField(
        "plafond de credit",
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    balance = models.DecimalField(
        "solde",
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text="Solde courant. Positif = le client doit de l'argent.",
    )
    is_active = models.BooleanField("actif", default=True)

    class Meta:
        verbose_name = "compte credit"
        verbose_name_plural = "comptes credit"
        unique_together = [["store", "customer"]]
        ordering = ["-created_at"]

    def __str__(self):
        return f"Compte credit - {self.customer} ({self.store})"

    @property
    def available_credit(self):
        """Return remaining available credit."""
        return self.credit_limit - self.balance

    @property
    def is_over_limit(self):
        """Return True if the current balance exceeds the credit limit."""
        return self.balance > self.credit_limit


# ---------------------------------------------------------------------------
# CreditLedgerEntry
# ---------------------------------------------------------------------------

class CreditLedgerEntry(TimeStampedModel):
    """An immutable ledger entry recording a credit transaction."""

    class EntryType(models.TextChoices):
        SALE_ON_CREDIT = "SALE_ON_CREDIT", "Vente a credit"
        CREDIT_PAYMENT = "CREDIT_PAYMENT", "Paiement de credit"
        ADJUSTMENT = "ADJUSTMENT", "Ajustement"
        REFUND_TO_CREDIT = "REFUND_TO_CREDIT", "Remboursement en credit"

    account = models.ForeignKey(
        CustomerAccount,
        on_delete=models.CASCADE,
        related_name="ledger_entries",
        verbose_name="compte",
    )
    entry_type = models.CharField(
        "type d'ecriture",
        max_length=20,
        choices=EntryType.choices,
    )
    amount = models.DecimalField(
        "montant",
        max_digits=14,
        decimal_places=2,
        help_text="Positif = augmente la dette, negatif = diminue la dette.",
    )
    balance_after = models.DecimalField(
        "solde apres",
        max_digits=14,
        decimal_places=2,
        help_text="Solde du compte apres cette ecriture.",
    )
    reference = models.CharField(
        "reference",
        max_length=200,
        blank=True,
        default="",
        help_text='Ex: "Vente INV-0042" ou "Paiement REF-123".',
    )
    sale = models.ForeignKey(
        "sales.Sale",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="credit_ledger_entries",
        verbose_name="vente",
    )
    notes = models.TextField("notes", blank=True, default="")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="credit_ledger_entries",
        verbose_name="cree par",
    )

    # ------------------------------------------------------------------
    # Document verification
    # ------------------------------------------------------------------
    verification_token = models.CharField(
        "jeton de verification",
        max_length=32,
        unique=True,
        editable=False,
        null=True,
        db_index=True,
    )
    verification_hash = models.CharField(
        "hash de verification",
        max_length=16,
        editable=False,
        blank=True,
        default="",
    )

    class Meta:
        verbose_name = "ecriture credit"
        verbose_name_plural = "ecritures credit"
        ordering = ["-created_at"]

    def __str__(self):
        return (
            f"{self.get_entry_type_display()} - {self.amount} "
            f"(solde: {self.balance_after})"
        )

    def save(self, *args, **kwargs):
        if not self.verification_token:
            from core.verification import generate_verification_token, generate_verification_hash
            self.verification_token = generate_verification_token()
            created_iso = self.created_at.isoformat() if self.created_at else ""
            self.verification_hash = generate_verification_hash(str(self.pk), created_iso)
        super().save(*args, **kwargs)


# ---------------------------------------------------------------------------
# PaymentSchedule
# ---------------------------------------------------------------------------

class PaymentSchedule(TimeStampedModel):
    """A scheduled payment (installment) for a credit account."""

    class Status(models.TextChoices):
        PENDING = "PENDING", "En attente"
        PARTIAL = "PARTIAL", "Partiellement paye"
        PAID = "PAID", "Paye"
        OVERDUE = "OVERDUE", "En retard"

    account = models.ForeignKey(
        CustomerAccount,
        on_delete=models.CASCADE,
        related_name="schedules",
        verbose_name="compte",
    )
    sale = models.ForeignKey(
        "sales.Sale",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="payment_schedules",
        verbose_name="vente",
    )
    due_date = models.DateField("date d'echeance")
    amount_due = models.DecimalField(
        "montant du",
        max_digits=14,
        decimal_places=2,
    )
    amount_paid = models.DecimalField(
        "montant paye",
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    status = models.CharField(
        "statut",
        max_length=10,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True,
    )
    notes = models.TextField("notes", blank=True, default="")

    class Meta:
        verbose_name = "echeancier"
        verbose_name_plural = "echeanciers"
        ordering = ["due_date"]

    def __str__(self):
        return (
            f"Echeance {self.due_date} - {self.amount_due} "
            f"({self.get_status_display()})"
        )

    @property
    def remaining(self):
        """Return the remaining amount to be paid."""
        return self.amount_due - self.amount_paid

    @property
    def is_overdue(self):
        """Return True if the due date has passed and the schedule is not fully paid."""
        return (
            self.due_date < timezone.now().date()
            and self.status != self.Status.PAID
        )
