"""Models for suppliers, purchase orders, and goods receipts."""
from decimal import Decimal

from django.conf import settings
from django.db import models

from core.models import TimeStampedModel


class Supplier(TimeStampedModel):
    enterprise = models.ForeignKey(
        "stores.Enterprise",
        on_delete=models.PROTECT,
        related_name="suppliers",
    )
    name = models.CharField(max_length=255)
    contact_name = models.CharField(max_length=255, blank=True, default="")
    phone = models.CharField(max_length=30, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    address = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]
        unique_together = [["enterprise", "name"]]

    def __str__(self):
        return self.name


class PurchaseOrder(TimeStampedModel):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Brouillon"
        SUBMITTED = "SUBMITTED", "Soumis"
        PARTIALLY_RECEIVED = "PARTIALLY_RECEIVED", "Partiellement recu"
        RECEIVED = "RECEIVED", "Recu"
        CANCELLED = "CANCELLED", "Annule"

    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.PROTECT,
        related_name="purchase_orders",
    )
    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.PROTECT,
        related_name="purchase_orders",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="purchase_orders_created",
    )
    po_number = models.CharField(max_length=50, unique=True)
    status = models.CharField(max_length=30, choices=Status.choices, default=Status.DRAFT, db_index=True)
    subtotal = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    notes = models.TextField(blank=True, default="")

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.po_number


class PurchaseOrderLine(TimeStampedModel):
    purchase_order = models.ForeignKey(
        PurchaseOrder,
        on_delete=models.PROTECT,
        related_name="lines",
    )
    product = models.ForeignKey(
        "catalog.Product",
        on_delete=models.PROTECT,
        related_name="purchase_order_lines",
    )
    quantity_ordered = models.PositiveIntegerField()
    quantity_received = models.PositiveIntegerField(default=0)
    unit_cost = models.DecimalField(max_digits=12, decimal_places=2)
    line_total = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))

    class Meta:
        ordering = ["product__name"]
        unique_together = [["purchase_order", "product"]]

    def save(self, *args, **kwargs):
        self.line_total = Decimal(str(self.quantity_ordered)) * self.unit_cost
        super().save(*args, **kwargs)


class GoodsReceipt(TimeStampedModel):
    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.PROTECT,
        related_name="goods_receipts",
    )
    purchase_order = models.ForeignKey(
        PurchaseOrder,
        on_delete=models.PROTECT,
        related_name="receipts",
    )
    received_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="goods_receipts",
    )
    receipt_number = models.CharField(max_length=50, unique=True)
    notes = models.TextField(blank=True, default="")

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.receipt_number


class GoodsReceiptLine(TimeStampedModel):
    receipt = models.ForeignKey(
        GoodsReceipt,
        on_delete=models.PROTECT,
        related_name="lines",
    )
    purchase_order_line = models.ForeignKey(
        PurchaseOrderLine,
        on_delete=models.PROTECT,
        related_name="receipt_lines",
    )
    quantity_received = models.PositiveIntegerField()

    class Meta:
        ordering = ["purchase_order_line__product__name"]

    def __str__(self):
        return (
            f"{self.purchase_order_line.product.name} x {self.quantity_received}"
        )
