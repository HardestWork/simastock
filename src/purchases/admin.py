from django.contrib import admin

from .models import (
    GoodsReceipt,
    GoodsReceiptLine,
    PurchaseOrder,
    PurchaseOrderLine,
    Supplier,
)


@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):
    list_display = ("name", "enterprise", "phone", "email", "is_active")
    list_filter = ("enterprise", "is_active")
    search_fields = ("name", "phone", "email")
    list_select_related = ("enterprise",)


class PurchaseOrderLineInline(admin.TabularInline):
    model = PurchaseOrderLine
    extra = 0


@admin.register(PurchaseOrder)
class PurchaseOrderAdmin(admin.ModelAdmin):
    list_display = ("po_number", "store", "supplier", "status", "subtotal", "created_at")
    list_filter = ("store", "status", "created_at")
    search_fields = ("po_number", "supplier__name")
    inlines = [PurchaseOrderLineInline]
    list_select_related = ("store", "supplier", "created_by")
    date_hierarchy = "created_at"


class GoodsReceiptLineInline(admin.TabularInline):
    model = GoodsReceiptLine
    extra = 0


@admin.register(GoodsReceipt)
class GoodsReceiptAdmin(admin.ModelAdmin):
    list_display = ("receipt_number", "store", "purchase_order", "created_at")
    list_filter = ("store",)
    search_fields = ("receipt_number", "purchase_order__po_number")
    inlines = [GoodsReceiptLineInline]
    list_select_related = ("store", "purchase_order", "received_by")
    date_hierarchy = "created_at"


@admin.register(PurchaseOrderLine)
class PurchaseOrderLineAdmin(admin.ModelAdmin):
    list_display = (
        "purchase_order",
        "product",
        "quantity_ordered",
        "quantity_received",
        "unit_cost",
        "line_total",
        "created_at",
    )
    list_filter = ("purchase_order__store", "purchase_order__status")
    search_fields = (
        "purchase_order__po_number",
        "product__name",
        "product__sku",
    )
    list_select_related = ("purchase_order", "product", "purchase_order__store")
    date_hierarchy = "created_at"


@admin.register(GoodsReceiptLine)
class GoodsReceiptLineAdmin(admin.ModelAdmin):
    list_display = (
        "receipt",
        "purchase_order_line",
        "product_name",
        "quantity_received",
        "created_at",
    )
    list_filter = ("receipt__store", "created_at")
    search_fields = (
        "receipt__receipt_number",
        "receipt__purchase_order__po_number",
        "purchase_order_line__product__name",
        "purchase_order_line__product__sku",
    )
    list_select_related = (
        "receipt",
        "receipt__store",
        "purchase_order_line",
        "purchase_order_line__product",
    )
    date_hierarchy = "created_at"

    @admin.display(description="Produit")
    def product_name(self, obj):
        return obj.purchase_order_line.product.name
