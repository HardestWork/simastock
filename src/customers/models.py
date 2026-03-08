"""Models for the customers app."""
from django.conf import settings
from django.db import models
from django.db.models import Q

from core.models import TimeStampedModel


# ---------------------------------------------------------------------------
# Utility appended after Customer class definition — avoid circular import
# ---------------------------------------------------------------------------


class Customer(TimeStampedModel):
    """A customer belonging to an enterprise (shared across all stores)."""

    enterprise = models.ForeignKey(
        "stores.Enterprise",
        on_delete=models.CASCADE,
        related_name="customers",
        verbose_name="entreprise",
    )
    first_name = models.CharField("prenom", max_length=100)
    last_name = models.CharField("nom", max_length=100)
    phone = models.CharField(
        "telephone",
        max_length=20,
        db_index=True,
    )
    email = models.EmailField("e-mail", blank=True, default="", db_index=True)
    address = models.TextField("adresse", blank=True, default="")
    company = models.CharField(
        "entreprise",
        max_length=200,
        blank=True,
        default="",
    )
    tax_id = models.CharField(
        "numero fiscal",
        max_length=50,
        blank=True,
        default="",
    )
    is_default = models.BooleanField(
        "client par defaut",
        default=False,
        help_text="Client generique utilise quand aucun client n'est selectionne (ex: Client comptant).",
        db_index=True,
    )
    is_active = models.BooleanField("actif", default=True)
    notes = models.TextField("notes", blank=True, default="")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="customers_created",
        verbose_name="ajouté par",
    )

    class Meta:
        verbose_name = "client"
        verbose_name_plural = "clients"
        ordering = ["last_name", "first_name"]
        constraints = [
            models.UniqueConstraint(
                fields=["enterprise"],
                condition=Q(is_default=True),
                name="uniq_default_customer_per_enterprise",
            )
        ]

    # --- Loyalty / scoring fields ---
    loyalty_score = models.DecimalField(
        "score fidelite", max_digits=7, decimal_places=2, default=0,
    )
    loyalty_tier = models.CharField(
        "niveau fidelite",
        max_length=10,
        choices=[("BRONZE", "Bronze"), ("SILVER", "Argent"), ("GOLD", "Or"), ("PLATINUM", "Platine")],
        default="BRONZE",
    )
    total_purchase_amount = models.DecimalField(
        "total achats", max_digits=14, decimal_places=2, default=0,
    )
    purchase_count = models.PositiveIntegerField("nombre d'achats", default=0)
    last_purchase_at = models.DateTimeField("dernier achat", null=True, blank=True)

    @property
    def full_name(self):
        """Return the customer's full name."""
        return f"{self.first_name} {self.last_name}".strip()

    def __str__(self):
        return self.full_name or self.phone


# ---------------------------------------------------------------------------
# Loyalty
# ---------------------------------------------------------------------------

class LoyaltyAccount(TimeStampedModel):
    """Points balance for a customer at a specific store."""

    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.PROTECT,
        related_name="loyalty_accounts",
        verbose_name="boutique",
    )
    customer = models.ForeignKey(
        Customer,
        on_delete=models.PROTECT,
        related_name="loyalty_accounts",
        verbose_name="client",
    )
    points_balance = models.DecimalField(
        "solde points", max_digits=12, decimal_places=2, default=0,
    )
    points_earned = models.DecimalField(
        "points gagnes (total)", max_digits=12, decimal_places=2, default=0,
    )
    points_redeemed = models.DecimalField(
        "points utilises (total)", max_digits=12, decimal_places=2, default=0,
    )

    class Meta:
        unique_together = [["store", "customer"]]
        verbose_name = "Compte fidelite"
        verbose_name_plural = "Comptes fidelite"

    def __str__(self):
        return f"Fidelite {self.customer} @ {self.store} — {self.points_balance} pts"


class LoyaltyTransaction(TimeStampedModel):
    """Individual points earn/redeem event on a loyalty account."""

    class TransactionType(models.TextChoices):
        EARN = "EARN", "Gain"
        REDEEM = "REDEEM", "Utilisation"
        ADJUST = "ADJUST", "Ajustement"
        EXPIRE = "EXPIRE", "Expiration"

    account = models.ForeignKey(
        LoyaltyAccount,
        on_delete=models.CASCADE,
        related_name="transactions",
        verbose_name="compte fidelite",
    )
    transaction_type = models.CharField(
        "type", max_length=10, choices=TransactionType.choices,
    )
    points = models.DecimalField(
        "points", max_digits=12, decimal_places=2,
        help_text="Positif=gagnes, negatif=utilises/expires.",
    )
    balance_after = models.DecimalField(
        "solde apres", max_digits=12, decimal_places=2,
    )
    sale = models.ForeignKey(
        "sales.Sale",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="loyalty_transactions",
        verbose_name="vente",
    )
    reference = models.CharField("reference", max_length=100, blank=True, default="")
    notes = models.TextField("notes", blank=True, default="")

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Transaction fidelite"
        verbose_name_plural = "Transactions fidelite"

    def __str__(self):
        return f"{self.get_transaction_type_display()} {self.points:+.0f} pts — {self.account}"
