"""Admin configuration for the stock app."""
from django.contrib import admin

from .models import (
    InventoryMovement,
    ProductStock,
    StockCount,
    StockCountLine,
    StockTransfer,
    StockTransferLine,
)


class StockCountLineInline(admin.TabularInline):
    model = StockCountLine
    extra = 0
    readonly_fields = ("variance",)


class StockTransferLineInline(admin.TabularInline):
    model = StockTransferLine
    extra = 0


@admin.register(ProductStock)
class ProductStockAdmin(admin.ModelAdmin):
    list_display = ("product", "store", "quantity", "reserved_qty", "available_qty", "min_qty", "is_low")
    list_filter = ("store",)
    search_fields = ("product__name", "product__sku")
    readonly_fields = ("available_qty", "is_low")
    list_select_related = ("product", "store")

    def available_qty(self, obj):
        return obj.available_qty
    available_qty.short_description = "Quantite disponible"

    def is_low(self, obj):
        return obj.is_low
    is_low.short_description = "Stock bas"
    is_low.boolean = True


@admin.register(InventoryMovement)
class InventoryMovementAdmin(admin.ModelAdmin):
    list_display = ("product", "store", "movement_type", "quantity", "reference", "actor", "created_at")
    list_filter = ("store", "movement_type", "created_at")
    search_fields = ("product__name", "product__sku", "reference")
    readonly_fields = ("created_at",)
    date_hierarchy = "created_at"
    list_select_related = ("product", "store", "actor")


@admin.register(StockTransfer)
class StockTransferAdmin(admin.ModelAdmin):
    list_display = ("__str__", "status", "created_by", "approved_by", "created_at")
    list_filter = ("status", "from_store", "to_store")
    search_fields = ("from_store__name", "to_store__name", "notes")
    readonly_fields = ("created_at",)
    inlines = [StockTransferLineInline]
    list_select_related = ("from_store", "to_store", "created_by", "approved_by")
    date_hierarchy = "created_at"


@admin.register(StockTransferLine)
class StockTransferLineAdmin(admin.ModelAdmin):
    list_display = ("transfer", "product", "quantity", "received_qty")
    list_filter = ("transfer__status",)
    search_fields = ("product__name", "product__sku")
    list_select_related = ("transfer", "product")


@admin.register(StockCount)
class StockCountAdmin(admin.ModelAdmin):
    list_display = ("__str__", "status", "created_by", "completed_at", "created_at")
    list_filter = ("status", "store")
    search_fields = ("store__name", "notes")
    readonly_fields = ("created_at", "completed_at")
    inlines = [StockCountLineInline]
    list_select_related = ("store", "created_by")
    date_hierarchy = "created_at"


@admin.register(StockCountLine)
class StockCountLineAdmin(admin.ModelAdmin):
    list_display = ("stock_count", "product", "system_qty", "counted_qty", "variance")
    list_filter = ("stock_count__status",)
    search_fields = ("product__name", "product__sku")
    readonly_fields = ("variance",)
    list_select_related = ("stock_count", "product")

    def variance(self, obj):
        return obj.variance
    variance.short_description = "Ecart"
