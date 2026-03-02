"""Models for the SYSCOHADA-compliant accounting module."""

from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from core.models import TimeStampedModel


# ---------------------------------------------------------------------------
# Account (Plan comptable PCGO)
# ---------------------------------------------------------------------------

class Account(TimeStampedModel):
    """A single account in the OHADA chart of accounts (PCGO)."""

    class AccountType(models.TextChoices):
        ASSET = "ASSET", "Actif"
        LIABILITY = "LIABILITY", "Passif"
        EQUITY = "EQUITY", "Capitaux propres"
        INCOME = "INCOME", "Produit"
        EXPENSE = "EXPENSE", "Charge"

    enterprise = models.ForeignKey(
        "stores.Enterprise",
        on_delete=models.PROTECT,
        related_name="accounts",
        verbose_name="entreprise",
    )
    code = models.CharField("code comptable", max_length=20, db_index=True)
    name = models.CharField("libelle", max_length=255)
    account_type = models.CharField(
        "type de compte",
        max_length=20,
        choices=AccountType.choices,
        db_index=True,
    )
    parent = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="children",
        verbose_name="compte parent",
    )
    is_system = models.BooleanField(
        "compte systeme",
        default=False,
        help_text="Les comptes systeme ne peuvent pas etre supprimes.",
    )
    allow_entries = models.BooleanField(
        "accepte les ecritures",
        default=True,
        help_text="Seuls les comptes feuilles acceptent les ecritures.",
    )
    is_active = models.BooleanField("actif", default=True)

    class Meta:
        ordering = ["code"]
        verbose_name = "compte comptable"
        verbose_name_plural = "comptes comptables"
        constraints = [
            models.UniqueConstraint(
                fields=["enterprise", "code"],
                name="unique_account_code_per_enterprise",
            ),
        ]

    def __str__(self):
        return f"{self.code} — {self.name}"


# ---------------------------------------------------------------------------
# Journal
# ---------------------------------------------------------------------------

class Journal(TimeStampedModel):
    """An accounting journal (e.g. sales, purchases, cash)."""

    class JournalType(models.TextChoices):
        VE = "VE", "Ventes"
        AC = "AC", "Achats"
        CA = "CA", "Caisse"
        BQ = "BQ", "Banque"
        MM = "MM", "Mobile Money"
        OD = "OD", "Operations Diverses"
        AN = "AN", "A-Nouveaux"

    enterprise = models.ForeignKey(
        "stores.Enterprise",
        on_delete=models.PROTECT,
        related_name="journals",
        verbose_name="entreprise",
    )
    code = models.CharField("code", max_length=10, db_index=True)
    name = models.CharField("libelle", max_length=100)
    journal_type = models.CharField(
        "type de journal",
        max_length=5,
        choices=JournalType.choices,
        db_index=True,
    )
    default_debit_account = models.ForeignKey(
        Account,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
        verbose_name="compte debit par defaut",
    )
    default_credit_account = models.ForeignKey(
        Account,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
        verbose_name="compte credit par defaut",
    )
    is_active = models.BooleanField("actif", default=True)

    class Meta:
        ordering = ["code"]
        verbose_name = "journal comptable"
        verbose_name_plural = "journaux comptables"
        constraints = [
            models.UniqueConstraint(
                fields=["enterprise", "code"],
                name="unique_journal_code_per_enterprise",
            ),
        ]

    def __str__(self):
        return f"{self.code} — {self.name}"


# ---------------------------------------------------------------------------
# FiscalYear
# ---------------------------------------------------------------------------

class FiscalYear(TimeStampedModel):
    """An accounting fiscal year (exercice comptable)."""

    class Status(models.TextChoices):
        OPEN = "OPEN", "Ouvert"
        CLOSED = "CLOSED", "Cloture"

    enterprise = models.ForeignKey(
        "stores.Enterprise",
        on_delete=models.PROTECT,
        related_name="fiscal_years",
        verbose_name="entreprise",
    )
    name = models.CharField("libelle", max_length=100)
    start_date = models.DateField("date de debut")
    end_date = models.DateField("date de fin")
    status = models.CharField(
        "statut",
        max_length=10,
        choices=Status.choices,
        default=Status.OPEN,
        db_index=True,
    )
    closed_at = models.DateTimeField("cloture le", null=True, blank=True)
    closed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
        verbose_name="cloture par",
    )

    class Meta:
        ordering = ["-start_date"]
        verbose_name = "exercice fiscal"
        verbose_name_plural = "exercices fiscaux"

    def clean(self):
        if self.start_date and self.end_date and self.start_date >= self.end_date:
            raise ValidationError("La date de debut doit etre anterieure a la date de fin.")

    def __str__(self):
        return self.name


# ---------------------------------------------------------------------------
# AccountingPeriod
# ---------------------------------------------------------------------------

class AccountingPeriod(TimeStampedModel):
    """A monthly period within a fiscal year."""

    class Status(models.TextChoices):
        OPEN = "OPEN", "Ouvert"
        CLOSED = "CLOSED", "Cloture"

    fiscal_year = models.ForeignKey(
        FiscalYear,
        on_delete=models.CASCADE,
        related_name="periods",
        verbose_name="exercice fiscal",
    )
    period_number = models.PositiveIntegerField(
        "numero de periode",
        help_text="0=ouverture, 1-12=mois, 13=cloture",
    )
    start_date = models.DateField("date de debut")
    end_date = models.DateField("date de fin")
    status = models.CharField(
        "statut",
        max_length=10,
        choices=Status.choices,
        default=Status.OPEN,
        db_index=True,
    )

    class Meta:
        ordering = ["fiscal_year", "period_number"]
        verbose_name = "periode comptable"
        verbose_name_plural = "periodes comptables"
        constraints = [
            models.UniqueConstraint(
                fields=["fiscal_year", "period_number"],
                name="unique_period_per_fiscal_year",
            ),
        ]

    def __str__(self):
        return f"{self.fiscal_year.name} — P{self.period_number:02d}"


# ---------------------------------------------------------------------------
# JournalEntry
# ---------------------------------------------------------------------------

class JournalEntry(TimeStampedModel):
    """A balanced accounting entry (ecriture comptable)."""

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Brouillon"
        VALIDATED = "VALIDATED", "Validee"
        POSTED = "POSTED", "Comptabilisee"

    enterprise = models.ForeignKey(
        "stores.Enterprise",
        on_delete=models.PROTECT,
        related_name="journal_entries",
        verbose_name="entreprise",
    )
    journal = models.ForeignKey(
        Journal,
        on_delete=models.PROTECT,
        related_name="entries",
        verbose_name="journal",
    )
    fiscal_year = models.ForeignKey(
        FiscalYear,
        on_delete=models.PROTECT,
        related_name="entries",
        verbose_name="exercice fiscal",
    )
    period = models.ForeignKey(
        AccountingPeriod,
        on_delete=models.PROTECT,
        related_name="entries",
        verbose_name="periode",
    )
    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="journal_entries",
        verbose_name="boutique",
    )
    sequence_number = models.PositiveIntegerField(
        "numero de sequence",
        help_text="Numerotation continue par journal et exercice.",
    )
    entry_date = models.DateField("date de l'ecriture", db_index=True)
    label = models.CharField("libelle", max_length=255)
    reference = models.CharField(
        "reference",
        max_length=100,
        blank=True,
        default="",
        help_text="Numero de facture, avoir, etc.",
    )
    status = models.CharField(
        "statut",
        max_length=15,
        choices=Status.choices,
        default=Status.DRAFT,
        db_index=True,
    )
    source_type = models.CharField(
        "type source",
        max_length=50,
        blank=True,
        default="",
        help_text="sale, payment, refund, purchase, expense, credit_payment",
    )
    source_id = models.UUIDField(
        "ID source",
        null=True,
        blank=True,
        help_text="ID de l'objet metier source.",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_journal_entries",
        verbose_name="cree par",
    )
    validated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="validated_journal_entries",
        verbose_name="valide par",
    )
    validated_at = models.DateTimeField("date de validation", null=True, blank=True)
    is_reversal = models.BooleanField("contre-passation", default=False)
    reversed_entry = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reversals",
        verbose_name="ecriture contre-passee",
    )

    class Meta:
        ordering = ["-entry_date", "-sequence_number"]
        verbose_name = "ecriture comptable"
        verbose_name_plural = "ecritures comptables"
        constraints = [
            models.UniqueConstraint(
                fields=["journal", "fiscal_year", "sequence_number"],
                name="unique_sequence_per_journal_year",
            ),
        ]

    def __str__(self):
        return f"{self.journal.code}-{self.sequence_number:06d} {self.label}"

    @property
    def total_debit(self):
        return self.lines.aggregate(t=models.Sum("debit"))["t"] or Decimal("0.00")

    @property
    def total_credit(self):
        return self.lines.aggregate(t=models.Sum("credit"))["t"] or Decimal("0.00")

    @property
    def is_balanced(self):
        return self.total_debit == self.total_credit


# ---------------------------------------------------------------------------
# JournalEntryLine
# ---------------------------------------------------------------------------

class JournalEntryLine(TimeStampedModel):
    """A single debit or credit line within a journal entry."""

    entry = models.ForeignKey(
        JournalEntry,
        on_delete=models.CASCADE,
        related_name="lines",
        verbose_name="ecriture",
    )
    account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        related_name="entry_lines",
        verbose_name="compte",
    )
    debit = models.DecimalField(
        "debit",
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    credit = models.DecimalField(
        "credit",
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    label = models.CharField("libelle", max_length=255, blank=True, default="")
    partner_type = models.CharField(
        "type partenaire",
        max_length=20,
        blank=True,
        default="",
        help_text="customer ou supplier",
    )
    partner_id = models.UUIDField(
        "ID partenaire",
        null=True,
        blank=True,
    )

    class Meta:
        ordering = ["id"]
        verbose_name = "ligne d'ecriture"
        verbose_name_plural = "lignes d'ecriture"

    def clean(self):
        if self.debit < 0 or self.credit < 0:
            raise ValidationError("Les montants doivent etre positifs.")
        if self.debit > 0 and self.credit > 0:
            raise ValidationError(
                "Une ligne ne peut avoir a la fois un debit et un credit."
            )
        if self.debit == 0 and self.credit == 0:
            raise ValidationError(
                "Une ligne doit avoir un montant en debit ou en credit."
            )

    def __str__(self):
        direction = f"D:{self.debit}" if self.debit else f"C:{self.credit}"
        return f"{self.account.code} {direction}"


# ---------------------------------------------------------------------------
# TaxRate
# ---------------------------------------------------------------------------

class TaxRate(TimeStampedModel):
    """A tax rate configuration (e.g. TVA 19.25%)."""

    enterprise = models.ForeignKey(
        "stores.Enterprise",
        on_delete=models.PROTECT,
        related_name="tax_rates",
        verbose_name="entreprise",
    )
    name = models.CharField("libelle", max_length=100)
    rate = models.DecimalField(
        "taux (%)",
        max_digits=5,
        decimal_places=2,
        help_text="Taux en pourcentage (ex: 19.25).",
    )
    is_exempt = models.BooleanField(
        "exonere",
        default=False,
        help_text="Si coche, aucune TVA n'est appliquee.",
    )
    collected_account = models.ForeignKey(
        Account,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
        verbose_name="compte TVA collectee",
        help_text="Compte 4431 par defaut.",
    )
    deductible_account = models.ForeignKey(
        Account,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
        verbose_name="compte TVA deductible",
        help_text="Compte 4451 par defaut.",
    )
    is_active = models.BooleanField("actif", default=True)

    class Meta:
        ordering = ["rate"]
        verbose_name = "taux de taxe"
        verbose_name_plural = "taux de taxes"

    def __str__(self):
        if self.is_exempt:
            return f"{self.name} (exonere)"
        return f"{self.name} ({self.rate}%)"


# ---------------------------------------------------------------------------
# AccountingSettings
# ---------------------------------------------------------------------------

class AccountingSettings(TimeStampedModel):
    """Per-enterprise default accounting configuration."""

    enterprise = models.OneToOneField(
        "stores.Enterprise",
        on_delete=models.CASCADE,
        related_name="accounting_settings",
        verbose_name="entreprise",
    )

    # --- Comptes par defaut ---
    default_sales_account = models.ForeignKey(
        Account, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="+", verbose_name="compte ventes (701)",
    )
    default_purchase_account = models.ForeignKey(
        Account, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="+", verbose_name="compte achats (601)",
    )
    default_cash_account = models.ForeignKey(
        Account, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="+", verbose_name="compte caisse (571)",
    )
    default_bank_account = models.ForeignKey(
        Account, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="+", verbose_name="compte banque (521)",
    )
    default_mobile_money_account = models.ForeignKey(
        Account, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="+", verbose_name="compte mobile money (585)",
    )
    default_customer_account = models.ForeignKey(
        Account, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="+", verbose_name="compte clients (411)",
    )
    default_supplier_account = models.ForeignKey(
        Account, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="+", verbose_name="compte fournisseurs (401)",
    )
    default_vat_collected_account = models.ForeignKey(
        Account, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="+", verbose_name="compte TVA collectee (4431)",
    )
    default_vat_deductible_account = models.ForeignKey(
        Account, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="+", verbose_name="compte TVA deductible (4451)",
    )
    default_discount_account = models.ForeignKey(
        Account, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="+", verbose_name="compte remises (673)",
    )
    default_refund_account = models.ForeignKey(
        Account, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="+", verbose_name="compte RRR accordes (709)",
    )
    default_stock_account = models.ForeignKey(
        Account, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="+", verbose_name="compte stocks (31)",
    )
    default_stock_variation_account = models.ForeignKey(
        Account, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="+", verbose_name="compte variation stocks (6031)",
    )
    default_other_income_account = models.ForeignKey(
        Account, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="+", verbose_name="compte autres produits (706)",
    )

    # --- Configuration ---
    auto_post_entries = models.BooleanField(
        "comptabiliser automatiquement",
        default=True,
        help_text="Si active, les ecritures automatiques passent directement en statut POSTED.",
    )
    default_tax_rate = models.ForeignKey(
        TaxRate,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
        verbose_name="taux de taxe par defaut",
    )

    class Meta:
        verbose_name = "parametres comptables"
        verbose_name_plural = "parametres comptables"

    def __str__(self):
        return f"Parametres comptables — {self.enterprise.name}"
