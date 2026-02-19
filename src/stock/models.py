"""Models for the stock management app."""
import uuid

from django.conf import settings
from django.db import models

from core.models import TimeStampedModel


class ProductStock(TimeStampedModel):
    """Current stock level of a product in a specific store."""

    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.PROTECT,
        related_name="product_stocks",
        verbose_name="boutique",
    )
    product = models.ForeignKey(
        "catalog.Product",
        on_delete=models.PROTECT,
        related_name="stock_records",
        verbose_name="produit",
    )
    quantity = models.IntegerField("quantite en stock", default=0)
    reserved_qty = models.IntegerField(
        "quantite reservee",
        default=0,
        help_text="Quantite reservee pour les ventes partiellement payees.",
    )
    min_qty = models.IntegerField(
        "seuil minimum",
        default=5,
        help_text="Seuil minimum de stock avant alerte.",
    )

    class Meta:
        ordering = ["product__name"]
        unique_together = [["store", "product"]]
        verbose_name = "Stock produit"
        verbose_name_plural = "Stocks produits"

    @property
    def available_qty(self):
        """Quantity available for sale (total minus reserved)."""
        return self.quantity - self.reserved_qty

    @property
    def is_low(self):
        """True if available quantity is at or below the minimum threshold."""
        return self.available_qty <= self.min_qty

    def __str__(self):
        return f"{self.product} @ {self.store} — {self.quantity} en stock"


class InventoryMovement(TimeStampedModel):
    """Records every stock movement for full traceability."""

    class MovementType(models.TextChoices):
        IN = "IN", "Entree"
        OUT = "OUT", "Sortie"
        ADJUST = "ADJUST", "Ajustement"
        DAMAGE = "DAMAGE", "Dommage"
        TRANSFER_IN = "TRANSFER_IN", "Transfert entrant"
        TRANSFER_OUT = "TRANSFER_OUT", "Transfert sortant"
        RETURN = "RETURN", "Retour"
        SALE = "SALE", "Vente"
        PURCHASE = "PURCHASE", "Achat"

    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.PROTECT,
        related_name="inventory_movements",
        verbose_name="boutique",
    )
    product = models.ForeignKey(
        "catalog.Product",
        on_delete=models.PROTECT,
        related_name="inventory_movements",
        verbose_name="produit",
    )
    movement_type = models.CharField(
        "type de mouvement",
        max_length=20,
        choices=MovementType.choices,
    )
    quantity = models.IntegerField(
        "quantite",
        help_text="Positif pour les entrees, negatif pour les sorties.",
    )
    reference = models.CharField(
        "reference",
        max_length=255,
        blank=True,
        default="",
        help_text="Numero de vente, bon de commande, etc.",
    )
    reason = models.TextField("motif", blank=True, default="")
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="inventory_movements",
        verbose_name="utilisateur",
    )
    batch_id = models.UUIDField(
        "identifiant de lot",
        null=True,
        blank=True,
        help_text="Regroupe les mouvements lies (ex. transfert).",
    )

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Mouvement de stock"
        verbose_name_plural = "Mouvements de stock"

    def __str__(self):
        return (
            f"{self.get_movement_type_display()} — {self.product} "
            f"({self.quantity:+d}) @ {self.store}"
        )


class StockTransfer(TimeStampedModel):
    """Transfer of products between two stores."""

    class Status(models.TextChoices):
        PENDING = "PENDING", "En attente"
        APPROVED = "APPROVED", "Approuve"
        IN_TRANSIT = "IN_TRANSIT", "En transit"
        RECEIVED = "RECEIVED", "Recu"
        CANCELLED = "CANCELLED", "Annule"

    from_store = models.ForeignKey(
        "stores.Store",
        on_delete=models.PROTECT,
        related_name="transfers_out",
        verbose_name="boutique source",
    )
    to_store = models.ForeignKey(
        "stores.Store",
        on_delete=models.PROTECT,
        related_name="transfers_in",
        verbose_name="boutique destination",
    )
    status = models.CharField(
        "statut",
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="transfers_created",
        verbose_name="cree par",
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="transfers_approved",
        verbose_name="approuve par",
    )
    notes = models.TextField("notes", blank=True, default="")

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Transfert de stock"
        verbose_name_plural = "Transferts de stock"

    def __str__(self):
        return f"Transfert {self.from_store} -> {self.to_store} ({self.get_status_display()})"


class StockTransferLine(TimeStampedModel):
    """Individual line item within a stock transfer."""

    transfer = models.ForeignKey(
        StockTransfer,
        on_delete=models.PROTECT,
        related_name="lines",
        verbose_name="transfert",
    )
    product = models.ForeignKey(
        "catalog.Product",
        on_delete=models.PROTECT,
        related_name="transfer_lines",
        verbose_name="produit",
    )
    quantity = models.PositiveIntegerField("quantite demandee")
    received_qty = models.PositiveIntegerField("quantite recue", default=0)

    class Meta:
        ordering = ["product__name"]
        verbose_name = "Ligne de transfert"
        verbose_name_plural = "Lignes de transfert"

    def __str__(self):
        return f"{self.product} x {self.quantity}"


class StockCount(TimeStampedModel):
    """Inventory count session for a store."""

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Brouillon"
        IN_PROGRESS = "IN_PROGRESS", "En cours"
        COMPLETED = "COMPLETED", "Termine"
        CANCELLED = "CANCELLED", "Annule"

    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.PROTECT,
        related_name="stock_counts",
        verbose_name="boutique",
    )
    status = models.CharField(
        "statut",
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
        db_index=True,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="stock_counts",
        verbose_name="cree par",
    )
    completed_at = models.DateTimeField("termine le", null=True, blank=True)
    notes = models.TextField("notes", blank=True, default="")

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Inventaire"
        verbose_name_plural = "Inventaires"

    def __str__(self):
        return f"Inventaire {self.store} — {self.get_status_display()}"


class StockCountLine(TimeStampedModel):
    """Individual line item within an inventory count."""

    stock_count = models.ForeignKey(
        StockCount,
        on_delete=models.PROTECT,
        related_name="lines",
        verbose_name="inventaire",
    )
    product = models.ForeignKey(
        "catalog.Product",
        on_delete=models.PROTECT,
        related_name="count_lines",
        verbose_name="produit",
    )
    system_qty = models.IntegerField(
        "quantite systeme",
        help_text="Quantite en stock au debut du comptage.",
    )
    counted_qty = models.IntegerField(
        "quantite comptee",
        null=True,
        blank=True,
    )

    class Meta:
        ordering = ["product__name"]
        verbose_name = "Ligne d'inventaire"
        verbose_name_plural = "Lignes d'inventaire"

    @property
    def variance(self):
        """Difference between counted and system quantity."""
        if self.counted_qty is not None:
            return self.counted_qty - self.system_qty
        return None

    def __str__(self):
        counted = self.counted_qty if self.counted_qty is not None else "—"
        return f"{self.product}: systeme={self.system_qty}, compte={counted}"
