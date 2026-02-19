"""Admin configuration for the sales app."""
from django.contrib import admin

from sales.models import Quote, QuoteItem, Refund, Sale, SaleItem


# ---------------------------------------------------------------------------
# Inlines
# ---------------------------------------------------------------------------

class SaleItemInline(admin.TabularInline):
    """Inline for editing sale items within the Sale admin."""

    model = SaleItem
    extra = 0
    readonly_fields = ("line_total",)
    fields = (
        "product",
        "product_name",
        "unit_price",
        "cost_price",
        "quantity",
        "discount_amount",
        "line_total",
    )


# ---------------------------------------------------------------------------
# Sale
# ---------------------------------------------------------------------------

@admin.register(Sale)
class SaleAdmin(admin.ModelAdmin):
    """Admin for the Sale model."""

    list_display = (
        "invoice_number",
        "store",
        "seller",
        "customer",
        "status",
        "total",
        "amount_paid",
        "amount_due",
        "created_at",
    )
    list_filter = ("status", "store", "is_credit_sale", "created_at")
    search_fields = (
        "invoice_number",
        "seller__first_name",
        "seller__last_name",
        "seller__email",
        "customer__first_name",
        "customer__last_name",
    )
    readonly_fields = (
        "id",
        "invoice_number",
        "subtotal",
        "total",
        "amount_paid",
        "amount_due",
        "submitted_at",
        "paid_at",
        "cancelled_at",
        "created_at",
        "updated_at",
    )
    raw_id_fields = ("seller", "customer", "cancelled_by")
    inlines = [SaleItemInline]
    date_hierarchy = "created_at"
    list_select_related = ("store", "seller", "customer", "cancelled_by")
    list_per_page = 50

    fieldsets = (
        (None, {
            "fields": (
                "id",
                "store",
                "seller",
                "customer",
                "invoice_number",
                "status",
            ),
        }),
        ("Montants", {
            "fields": (
                "subtotal",
                "discount_amount",
                "discount_percent",
                "tax_amount",
                "total",
                "amount_paid",
                "amount_due",
            ),
        }),
        ("Options", {
            "fields": (
                "is_credit_sale",
                "reserve_stock",
                "notes",
            ),
        }),
        ("Dates", {
            "fields": (
                "submitted_at",
                "paid_at",
                "cancelled_at",
                "cancelled_by",
                "cancellation_reason",
                "created_at",
                "updated_at",
            ),
        }),
    )


# ---------------------------------------------------------------------------
# Refund
# ---------------------------------------------------------------------------

@admin.register(Refund)
class RefundAdmin(admin.ModelAdmin):
    """Admin for the Refund model."""

    list_display = (
        "id",
        "sale",
        "store",
        "amount",
        "refund_method",
        "approved_by",
        "processed_by",
        "created_at",
    )
    list_filter = ("refund_method", "store", "created_at")
    search_fields = (
        "sale__invoice_number",
        "reason",
        "reference",
    )
    readonly_fields = ("id", "created_at", "updated_at")
    raw_id_fields = ("sale", "approved_by", "processed_by")
    list_select_related = ("sale", "store", "approved_by", "processed_by")
    date_hierarchy = "created_at"


@admin.register(SaleItem)
class SaleItemAdmin(admin.ModelAdmin):
    list_display = (
        "sale",
        "product_name",
        "product",
        "quantity",
        "unit_price",
        "line_total",
        "created_at",
    )
    list_filter = ("sale__store", "created_at")
    search_fields = (
        "sale__invoice_number",
        "product_name",
        "product__sku",
        "product__name",
    )
    raw_id_fields = ("sale", "product")
    date_hierarchy = "created_at"
    list_select_related = ("sale", "product")


# ---------------------------------------------------------------------------
# Quote (Devis)
# ---------------------------------------------------------------------------

class QuoteItemInline(admin.TabularInline):
    model = QuoteItem
    extra = 0
    readonly_fields = ("line_total",)
    fields = (
        "product",
        "product_name",
        "unit_price",
        "cost_price",
        "quantity",
        "discount_amount",
        "line_total",
    )


@admin.register(Quote)
class QuoteAdmin(admin.ModelAdmin):
    list_display = (
        "quote_number",
        "store",
        "created_by",
        "customer",
        "status",
        "total",
        "valid_until",
        "created_at",
    )
    list_filter = ("status", "store", "created_at")
    search_fields = (
        "quote_number",
        "customer__first_name",
        "customer__last_name",
        "customer__phone",
    )
    readonly_fields = (
        "id",
        "quote_number",
        "subtotal",
        "tax_amount",
        "total",
        "sent_at",
        "accepted_at",
        "refused_at",
        "converted_at",
        "created_at",
        "updated_at",
    )
    raw_id_fields = ("created_by", "customer", "converted_sale")
    inlines = [QuoteItemInline]
    date_hierarchy = "created_at"
    list_select_related = ("store", "created_by", "customer")
    list_per_page = 50
