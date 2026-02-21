"""Models for expense management (categories, wallets, expenses, budgets)."""
from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone

from core.models import TimeStampedModel


class ExpenseCategory(TimeStampedModel):
    """Expense classification scoped to enterprise and optionally to a store."""

    class CategoryType(models.TextChoices):
        STOCK = "STOCK", "Stock"
        FIXED = "FIXED", "Fixe"
        VARIABLE = "VARIABLE", "Variable"

    enterprise = models.ForeignKey(
        "stores.Enterprise",
        on_delete=models.CASCADE,
        related_name="expense_categories",
        verbose_name="entreprise",
    )
    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        related_name="expense_categories",
        verbose_name="boutique",
        null=True,
        blank=True,
        help_text="Laissez vide pour une categorie globale de l'entreprise.",
    )
    name = models.CharField("nom", max_length=120)
    type = models.CharField(
        "type",
        max_length=20,
        choices=CategoryType.choices,
        default=CategoryType.VARIABLE,
    )
    is_active = models.BooleanField("actif", default=True)

    class Meta:
        verbose_name = "categorie de depense"
        verbose_name_plural = "categories de depenses"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["enterprise", "store", "name"],
                name="uniq_expense_category_per_scope",
            ),
        ]

    def __str__(self) -> str:
        scope = self.store.name if self.store_id else "global"
        return f"{self.name} ({scope})"

    def clean(self):
        if self.store_id and self.enterprise_id and self.store.enterprise_id != self.enterprise_id:
            raise ValidationError("La boutique doit appartenir a la meme entreprise.")


class Wallet(TimeStampedModel):
    """Wallet where expenses are posted (cash/bank/mobile money)."""

    class WalletType(models.TextChoices):
        CASH = "CASH", "Especes"
        BANK = "BANK", "Banque"
        MOBILE_MONEY = "MOBILE_MONEY", "Mobile Money"

    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        related_name="wallets",
        verbose_name="boutique",
    )
    name = models.CharField("nom", max_length=120)
    type = models.CharField(
        "type",
        max_length=20,
        choices=WalletType.choices,
    )
    balance = models.DecimalField(
        "solde",
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    is_active = models.BooleanField("actif", default=True)

    class Meta:
        verbose_name = "wallet"
        verbose_name_plural = "wallets"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["store", "name"],
                name="uniq_wallet_name_per_store",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.name} ({self.store.code})"


class ExpenseSequence(TimeStampedModel):
    """Internal sequence to generate unique monthly expense numbers."""

    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        related_name="expense_sequences",
        verbose_name="boutique",
    )
    period = models.CharField(
        "periode",
        max_length=7,
        help_text="Format YYYY-MM",
    )
    next_number = models.PositiveIntegerField("prochain numero", default=1)

    class Meta:
        verbose_name = "sequence depense"
        verbose_name_plural = "sequences depenses"
        constraints = [
            models.UniqueConstraint(
                fields=["store", "period"],
                name="uniq_expense_sequence_store_period",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.store.code} - {self.period} ({self.next_number})"


class Expense(TimeStampedModel):
    """Single expense posted against a wallet."""

    class Status(models.TextChoices):
        POSTED = "POSTED", "Validee"
        VOIDED = "VOIDED", "Annulee"

    expense_number = models.CharField(
        "numero de depense",
        max_length=32,
        unique=True,
        db_index=True,
    )
    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.PROTECT,
        related_name="expenses",
        verbose_name="boutique",
    )
    category = models.ForeignKey(
        ExpenseCategory,
        on_delete=models.PROTECT,
        related_name="expenses",
        verbose_name="categorie",
    )
    wallet = models.ForeignKey(
        Wallet,
        on_delete=models.PROTECT,
        related_name="expenses",
        verbose_name="wallet",
    )
    amount = models.DecimalField(
        "montant",
        max_digits=14,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
    )
    description = models.TextField("description")
    supplier_name = models.CharField(
        "fournisseur",
        max_length=255,
        blank=True,
        default="",
    )
    expense_date = models.DateField("date de depense", db_index=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="expenses_created",
        verbose_name="cree par",
    )
    status = models.CharField(
        "statut",
        max_length=10,
        choices=Status.choices,
        default=Status.POSTED,
        db_index=True,
    )
    posted_at = models.DateTimeField("validee le", null=True, blank=True)
    voided_at = models.DateTimeField("annulee le", null=True, blank=True)
    voided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="expenses_voided",
        null=True,
        blank=True,
        verbose_name="annulee par",
    )
    void_reason = models.TextField("motif d'annulation", blank=True, default="")

    class Meta:
        verbose_name = "depense"
        verbose_name_plural = "depenses"
        ordering = ["-expense_date", "-created_at"]
        indexes = [
            models.Index(fields=["store", "status", "expense_date"]),
            models.Index(fields=["store", "created_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.expense_number} - {self.amount}"

    @property
    def is_edit_locked(self) -> bool:
        """True when older than 24h."""
        reference_dt = self.created_at or timezone.now()
        return reference_dt <= timezone.now() - timedelta(hours=24)

    @property
    def suggested_filename(self) -> str:
        """Suggested file name when exporting this expense document."""
        enterprise_name = (self.store.enterprise.name if self.store_id else "Entreprise").strip()
        enterprise_slug = "".join(ch for ch in enterprise_name if ch.isalnum() or ch in ("-", "_")).strip()
        enterprise_slug = enterprise_slug or "Entreprise"
        date_part = self.expense_date.strftime("%Y%m%d")
        return f"Depense-{self.expense_number}-{enterprise_slug}-{date_part}.pdf"

    def clean(self):
        if self.wallet_id and self.store_id and self.wallet.store_id != self.store_id:
            raise ValidationError("Le wallet doit appartenir a la meme boutique.")
        if self.category_id and self.store_id:
            if self.category.store_id and self.category.store_id != self.store_id:
                raise ValidationError("La categorie ne correspond pas a la boutique.")
            if self.category.enterprise_id != self.store.enterprise_id:
                raise ValidationError("La categorie ne correspond pas a l'entreprise.")


class Budget(TimeStampedModel):
    """Monthly budget per store and optional category."""

    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        related_name="expense_budgets",
        verbose_name="boutique",
    )
    category = models.ForeignKey(
        ExpenseCategory,
        on_delete=models.CASCADE,
        related_name="expense_budgets",
        verbose_name="categorie",
        null=True,
        blank=True,
        help_text="Laissez vide pour un budget global de la boutique.",
    )
    period = models.CharField(
        "periode",
        max_length=7,
        help_text="Format YYYY-MM",
    )
    limit_amount = models.DecimalField(
        "plafond",
        max_digits=14,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
    )
    alert_threshold_percent = models.PositiveSmallIntegerField(
        "seuil d'alerte (%)",
        default=80,
        validators=[MinValueValidator(1), MaxValueValidator(100)],
    )

    class Meta:
        verbose_name = "budget depense"
        verbose_name_plural = "budgets depenses"
        ordering = ["-period", "category__name"]
        constraints = [
            models.UniqueConstraint(
                fields=["store", "category", "period"],
                name="uniq_budget_store_category_period",
            ),
        ]

    def __str__(self) -> str:
        if self.category_id:
            return f"{self.period} - {self.category.name} ({self.limit_amount})"
        return f"{self.period} - Global ({self.limit_amount})"

    def clean(self):
        if self.category_id:
            if self.category.enterprise_id != self.store.enterprise_id:
                raise ValidationError("Categorie et boutique de budgets doivent etre de la meme entreprise.")
            if self.category.store_id and self.category.store_id != self.store_id:
                raise ValidationError("Budget categorie: la categorie doit etre globale ou de la meme boutique.")


class RecurringExpense(TimeStampedModel):
    """Template that automatically creates future expenses."""

    class Frequency(models.TextChoices):
        WEEKLY = "WEEKLY", "Hebdomadaire"
        MONTHLY = "MONTHLY", "Mensuelle"

    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        related_name="recurring_expenses",
        verbose_name="boutique",
    )
    category = models.ForeignKey(
        ExpenseCategory,
        on_delete=models.PROTECT,
        related_name="recurring_expenses",
        verbose_name="categorie",
    )
    wallet = models.ForeignKey(
        Wallet,
        on_delete=models.PROTECT,
        related_name="recurring_expenses",
        verbose_name="wallet",
    )
    amount = models.DecimalField(
        "montant",
        max_digits=14,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
    )
    description = models.TextField("description")
    supplier_name = models.CharField("fournisseur", max_length=255, blank=True, default="")
    frequency = models.CharField(
        "frequence",
        max_length=10,
        choices=Frequency.choices,
        default=Frequency.MONTHLY,
    )
    next_run_date = models.DateField("prochaine execution", db_index=True)
    is_active = models.BooleanField("actif", default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="recurring_expenses_created",
        verbose_name="cree par",
    )
    last_run_at = models.DateTimeField("derniere execution", null=True, blank=True)

    class Meta:
        verbose_name = "depense recurrente"
        verbose_name_plural = "depenses recurrentes"
        ordering = ["next_run_date", "created_at"]
        indexes = [
            models.Index(fields=["store", "is_active", "next_run_date"]),
        ]

    def __str__(self) -> str:
        return f"{self.description[:40]} ({self.frequency})"

    def clean(self):
        if self.wallet_id and self.store_id and self.wallet.store_id != self.store_id:
            raise ValidationError("Le wallet doit appartenir a la meme boutique.")
        if self.category_id:
            if self.category.enterprise_id != self.store.enterprise_id:
                raise ValidationError("Categorie et boutique doivent appartenir a la meme entreprise.")
            if self.category.store_id and self.category.store_id != self.store_id:
                raise ValidationError("La categorie doit etre globale ou de la meme boutique.")
