"""Models for the sales app."""
from decimal import Decimal

from django.conf import settings
from django.db import models
from django.db.models import Q

from core.models import TimeStampedModel


# ---------------------------------------------------------------------------
# Sale
# ---------------------------------------------------------------------------

class Sale(TimeStampedModel):
    """A sales transaction created by a seller and submitted for payment."""

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Brouillon"
        PENDING_PAYMENT = "PENDING_PAYMENT", "En attente de paiement"
        PARTIALLY_PAID = "PARTIALLY_PAID", "Partiellement payee"
        PAID = "PAID", "Payee"
        CANCELLED = "CANCELLED", "Annulee"
        REFUNDED = "REFUNDED", "Remboursee"

    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.PROTECT,
        related_name="sales",
        verbose_name="boutique",
    )
    seller = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="sales_as_seller",
        verbose_name="vendeur",
    )
    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sales",
        verbose_name="client",
    )
    invoice_number = models.CharField(
        "numero de facture",
        max_length=50,
        null=True,
        blank=True,
        db_index=True,
    )
    status = models.CharField(
        "statut",
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
        db_index=True,
    )

    # ------------------------------------------------------------------
    # Amounts
    # ------------------------------------------------------------------
    subtotal = models.DecimalField(
        "sous-total",
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    discount_amount = models.DecimalField(
        "montant remise",
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    discount_percent = models.DecimalField(
        "pourcentage remise",
        max_digits=5,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    tax_amount = models.DecimalField(
        "montant TVA",
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    total = models.DecimalField(
        "total",
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    amount_paid = models.DecimalField(
        "montant paye",
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    amount_due = models.DecimalField(
        "montant du",
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
    )

    # ------------------------------------------------------------------
    # Flags
    # ------------------------------------------------------------------
    is_credit_sale = models.BooleanField(
        "vente a credit",
        default=False,
    )
    reserve_stock = models.BooleanField(
        "reserver le stock",
        default=False,
        help_text="Reserver le stock lors d'un paiement partiel.",
    )

    # ------------------------------------------------------------------
    # Notes & timestamps
    # ------------------------------------------------------------------
    notes = models.TextField("notes", blank=True, default="")
    source_quote = models.ForeignKey(
        "sales.Quote",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="converted_sales",
        verbose_name="devis source",
    )
    submitted_at = models.DateTimeField(
        "soumise le",
        null=True,
        blank=True,
        help_text="Date/heure de soumission au caissier.",
    )
    paid_at = models.DateTimeField("payee le", null=True, blank=True)
    cancelled_at = models.DateTimeField("annulee le", null=True, blank=True)
    cancelled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="cancelled_sales",
        verbose_name="annulee par",
    )
    cancellation_reason = models.TextField(
        "raison d'annulation",
        blank=True,
        default="",
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
        verbose_name = "vente"
        verbose_name_plural = "ventes"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["store", "invoice_number"],
                condition=Q(invoice_number__isnull=False),
                name="uniq_sale_invoice_per_store",
            ),
        ]

    def __str__(self):
        label = self.invoice_number or f"DRAFT-{str(self.pk)[:8]}"
        return f"Vente {label}"

    def save(self, *args, **kwargs):
        if not self.verification_token:
            from core.verification import generate_verification_token, generate_verification_hash
            self.verification_token = generate_verification_token()
            created_iso = self.created_at.isoformat() if self.created_at else ""
            self.verification_hash = generate_verification_hash(str(self.pk), created_iso)
        super().save(*args, **kwargs)

    # ------------------------------------------------------------------
    # Calculation helpers
    # ------------------------------------------------------------------

    def recalculate_totals(self):
        """Recalculate subtotal, total, and amount_due from related items.

        Call this after adding/removing/updating items.  Does **not** call
        ``save()`` -- the caller is responsible for persisting changes.
        """
        items = self.items.all()
        self.subtotal = sum(
            (item.line_total for item in items), Decimal("0.00")
        )

        # Apply sale-level discount
        if self.discount_percent > 0:
            self.discount_amount = (
                self.subtotal * self.discount_percent / Decimal("100")
            ).quantize(Decimal("0.01"))
        else:
            # Fixed discount mode: keep amount but enforce valid bounds.
            if self.discount_amount < 0:
                self.discount_amount = Decimal("0.00")
            if self.discount_amount > self.subtotal:
                self.discount_amount = self.subtotal
            self.discount_amount = self.discount_amount.quantize(Decimal("0.01"))

        taxable_base = self.subtotal - self.discount_amount
        if taxable_base < Decimal("0.00"):
            taxable_base = Decimal("0.00")

        vat_enabled = False
        vat_rate = Decimal("0.00")
        if self.store_id:
            # VAT is gated behind a feature flag to avoid being systematic.
            store = self.store
            vat_feature = False
            try:
                vat_feature = bool(getattr(store, "is_feature_enabled")("vat"))
            except Exception:
                vat_feature = False

            vat_enabled = vat_feature and bool(getattr(store, "effective_vat_enabled", False))
            vat_rate = Decimal(str(getattr(store, "effective_vat_rate", Decimal("0.00")) or Decimal("0.00")))

        if vat_enabled and vat_rate > Decimal("0.00"):
            self.tax_amount = (taxable_base * vat_rate / Decimal("100")).quantize(Decimal("0.01"))
        else:
            self.tax_amount = Decimal("0.00")

        self.total = taxable_base + self.tax_amount
        if self.total < 0:
            self.total = Decimal("0.00")

        self.amount_due = self.total - self.amount_paid
        if self.amount_due < 0:
            self.amount_due = Decimal("0.00")

    # ------------------------------------------------------------------
    # Status helpers
    # ------------------------------------------------------------------

    def can_submit(self) -> bool:
        """Return True if the sale can be submitted for payment."""
        return (
            self.status == self.Status.DRAFT
            and self.customer_id is not None
            and self.items.exists()
            and self.total > 0
        )

    def can_cancel(self) -> bool:
        """Return True if the sale can be cancelled."""
        return self.status in (
            self.Status.DRAFT,
            self.Status.PENDING_PAYMENT,
            self.Status.PARTIALLY_PAID,
        )


# ---------------------------------------------------------------------------
# SaleItem
# ---------------------------------------------------------------------------

class SaleItem(TimeStampedModel):
    """A single line item on a sale."""

    sale = models.ForeignKey(
        Sale,
        on_delete=models.CASCADE,
        related_name="items",
        verbose_name="vente",
    )
    product = models.ForeignKey(
        "catalog.Product",
        on_delete=models.PROTECT,
        related_name="sale_items",
        verbose_name="produit",
    )
    product_name = models.CharField(
        "nom produit (snapshot)",
        max_length=255,
        help_text="Nom du produit au moment de la vente.",
    )
    unit_price = models.DecimalField(
        "prix unitaire",
        max_digits=12,
        decimal_places=2,
    )
    cost_price = models.DecimalField(
        "prix de revient",
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text="Snapshot du cout pour calcul de marge.",
    )
    quantity = models.PositiveIntegerField("quantite", default=1)
    discount_amount = models.DecimalField(
        "remise ligne",
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    line_total = models.DecimalField(
        "total ligne",
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
    )

    class Meta:
        verbose_name = "ligne de vente"
        verbose_name_plural = "lignes de vente"
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.product_name} x{self.quantity}"

    def save(self, *args, **kwargs):
        """Calculate line_total before saving."""
        self.line_total = (
            self.unit_price * self.quantity
        ) - self.discount_amount
        if self.line_total < 0:
            self.line_total = Decimal("0.00")
        super().save(*args, **kwargs)


# ---------------------------------------------------------------------------
# Refund
# ---------------------------------------------------------------------------

class Refund(TimeStampedModel):
    """A refund issued against a sale."""

    class Method(models.TextChoices):
        CASH = "CASH", "Especes"
        MOBILE_MONEY = "MOBILE_MONEY", "Mobile Money"
        BANK_TRANSFER = "BANK_TRANSFER", "Virement bancaire"
        CREDIT = "CREDIT", "Avoir / Credit"

    sale = models.ForeignKey(
        Sale,
        on_delete=models.PROTECT,
        related_name="refunds",
        verbose_name="vente",
    )
    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.PROTECT,
        related_name="refunds",
        verbose_name="boutique",
    )
    amount = models.DecimalField(
        "montant",
        max_digits=14,
        decimal_places=2,
    )
    reason = models.TextField("raison")
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="approved_refunds",
        verbose_name="approuve par",
    )
    processed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="processed_refunds",
        verbose_name="traite par",
    )
    refund_method = models.CharField(
        "methode de remboursement",
        max_length=20,
        choices=Method.choices,
    )
    reference = models.CharField(
        "reference",
        max_length=100,
        blank=True,
        default="",
    )

    class Meta:
        verbose_name = "remboursement"
        verbose_name_plural = "remboursements"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Remboursement {self.amount} sur {self.sale}"


# ---------------------------------------------------------------------------
# Quote (Devis)
# ---------------------------------------------------------------------------

class Quote(TimeStampedModel):
    """A formal quotation (devis) that can be converted to a sale/invoice."""

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Brouillon"
        SENT = "SENT", "Envoye"
        ACCEPTED = "ACCEPTED", "Accepte"
        REFUSED = "REFUSED", "Refuse"
        EXPIRED = "EXPIRED", "Expire"
        CONVERTED = "CONVERTED", "Converti"

    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.PROTECT,
        related_name="quotes",
        verbose_name="boutique",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="quotes_created",
        verbose_name="cree par",
    )
    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="quotes",
        verbose_name="client",
    )
    quote_number = models.CharField(
        "numero de devis",
        max_length=50,
        null=True,
        blank=True,
        db_index=True,
    )
    status = models.CharField(
        "statut",
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
        db_index=True,
    )

    # ------------------------------------------------------------------
    # Amounts
    # ------------------------------------------------------------------
    subtotal = models.DecimalField(
        "sous-total", max_digits=14, decimal_places=2, default=Decimal("0.00"),
    )
    discount_amount = models.DecimalField(
        "montant remise", max_digits=14, decimal_places=2, default=Decimal("0.00"),
    )
    discount_percent = models.DecimalField(
        "pourcentage remise", max_digits=5, decimal_places=2, default=Decimal("0.00"),
    )
    tax_amount = models.DecimalField(
        "montant TVA", max_digits=14, decimal_places=2, default=Decimal("0.00"),
    )
    total = models.DecimalField(
        "total", max_digits=14, decimal_places=2, default=Decimal("0.00"),
    )

    # ------------------------------------------------------------------
    # Validity & timestamps
    # ------------------------------------------------------------------
    valid_until = models.DateField("valide jusqu'au", null=True, blank=True)
    sent_at = models.DateTimeField("envoye le", null=True, blank=True)
    accepted_at = models.DateTimeField("accepte le", null=True, blank=True)
    refused_at = models.DateTimeField("refuse le", null=True, blank=True)
    converted_at = models.DateTimeField("converti le", null=True, blank=True)

    # ------------------------------------------------------------------
    # Link to converted sale
    # ------------------------------------------------------------------
    converted_sale = models.OneToOneField(
        Sale,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="source_quote_obj",
        verbose_name="facture generee",
    )

    # ------------------------------------------------------------------
    # Notes & conditions
    # ------------------------------------------------------------------
    notes = models.TextField("notes", blank=True, default="")
    conditions = models.TextField("conditions particulieres", blank=True, default="")
    refusal_reason = models.TextField("raison du refus", blank=True, default="")

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
        verbose_name = "devis"
        verbose_name_plural = "devis"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["store", "quote_number"],
                condition=Q(quote_number__isnull=False),
                name="uniq_quote_number_per_store",
            ),
        ]

    def __str__(self):
        label = self.quote_number or f"DRAFT-{str(self.pk)[:8]}"
        return f"Devis {label}"

    def save(self, *args, **kwargs):
        if not self.verification_token:
            from core.verification import generate_verification_token, generate_verification_hash
            self.verification_token = generate_verification_token()
            created_iso = self.created_at.isoformat() if self.created_at else ""
            self.verification_hash = generate_verification_hash(str(self.pk), created_iso)
        super().save(*args, **kwargs)

    # ------------------------------------------------------------------
    # Calculation helpers
    # ------------------------------------------------------------------

    def recalculate_totals(self):
        """Recalculate subtotal, tax, and total from items.

        Same logic as Sale.recalculate_totals() but without amount_paid/due.
        Does **not** call ``save()`` -- the caller persists changes.
        """
        items = self.items.all()
        self.subtotal = sum(
            (item.line_total for item in items), Decimal("0.00")
        )

        if self.discount_percent > 0:
            self.discount_amount = (
                self.subtotal * self.discount_percent / Decimal("100")
            ).quantize(Decimal("0.01"))
        else:
            if self.discount_amount < 0:
                self.discount_amount = Decimal("0.00")
            if self.discount_amount > self.subtotal:
                self.discount_amount = self.subtotal
            self.discount_amount = self.discount_amount.quantize(Decimal("0.01"))

        taxable_base = self.subtotal - self.discount_amount
        if taxable_base < Decimal("0.00"):
            taxable_base = Decimal("0.00")

        vat_enabled = False
        vat_rate = Decimal("0.00")
        if self.store_id:
            store = self.store
            vat_feature = False
            try:
                vat_feature = bool(getattr(store, "is_feature_enabled")("vat"))
            except Exception:
                vat_feature = False

            vat_enabled = vat_feature and bool(
                getattr(store, "effective_vat_enabled", False)
            )
            vat_rate = Decimal(
                str(getattr(store, "effective_vat_rate", Decimal("0.00")) or Decimal("0.00"))
            )

        if vat_enabled and vat_rate > Decimal("0.00"):
            self.tax_amount = (
                taxable_base * vat_rate / Decimal("100")
            ).quantize(Decimal("0.01"))
        else:
            self.tax_amount = Decimal("0.00")

        self.total = taxable_base + self.tax_amount
        if self.total < 0:
            self.total = Decimal("0.00")

    def is_expired(self):
        """Return True if the quote is sent and past its validity date."""
        from django.utils import timezone

        if self.valid_until and self.status == self.Status.SENT:
            return timezone.now().date() > self.valid_until
        return False


# ---------------------------------------------------------------------------
# QuoteItem
# ---------------------------------------------------------------------------

class QuoteItem(TimeStampedModel):
    """A single line item on a quote."""

    quote = models.ForeignKey(
        Quote,
        on_delete=models.CASCADE,
        related_name="items",
        verbose_name="devis",
    )
    product = models.ForeignKey(
        "catalog.Product",
        on_delete=models.PROTECT,
        related_name="quote_items",
        verbose_name="produit",
    )
    product_name = models.CharField(
        "nom produit (snapshot)", max_length=255,
        help_text="Nom du produit au moment du devis.",
    )
    unit_price = models.DecimalField("prix unitaire", max_digits=12, decimal_places=2)
    cost_price = models.DecimalField(
        "prix de revient", max_digits=12, decimal_places=2, default=Decimal("0.00"),
        help_text="Snapshot du cout pour calcul de marge.",
    )
    quantity = models.PositiveIntegerField("quantite", default=1)
    discount_amount = models.DecimalField(
        "remise ligne", max_digits=12, decimal_places=2, default=Decimal("0.00"),
    )
    line_total = models.DecimalField(
        "total ligne", max_digits=14, decimal_places=2, default=Decimal("0.00"),
    )

    class Meta:
        verbose_name = "ligne de devis"
        verbose_name_plural = "lignes de devis"
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.product_name} x{self.quantity}"

    def save(self, *args, **kwargs):
        """Calculate line_total before saving."""
        self.line_total = (self.unit_price * self.quantity) - self.discount_amount
        if self.line_total < 0:
            self.line_total = Decimal("0.00")
        super().save(*args, **kwargs)
