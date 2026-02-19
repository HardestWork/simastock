"""Admin configuration for the catalog app."""
from django.contrib import admin

from .models import Brand, Category, Product, ProductImage, ProductSpec


# ---------------------------------------------------------------------------
# Inlines
# ---------------------------------------------------------------------------

class ProductImageInline(admin.TabularInline):
    model = ProductImage
    extra = 1
    fields = ("image", "is_primary", "sort_order")
    ordering = ("sort_order",)


class ProductSpecInline(admin.TabularInline):
    model = ProductSpec
    extra = 1
    fields = ("key", "value")


# ---------------------------------------------------------------------------
# Category
# ---------------------------------------------------------------------------

@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "enterprise", "parent", "is_active", "created_at")
    list_filter = ("is_active", "enterprise", "parent")
    search_fields = ("name", "slug")
    prepopulated_fields = {"slug": ("name",)}
    list_editable = ("is_active",)
    readonly_fields = ("id", "created_at", "updated_at")
    list_select_related = ("enterprise", "parent")


# ---------------------------------------------------------------------------
# Brand
# ---------------------------------------------------------------------------

@admin.register(Brand)
class BrandAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "enterprise", "is_active", "created_at")
    list_filter = ("is_active", "enterprise")
    search_fields = ("name", "slug")
    prepopulated_fields = {"slug": ("name",)}
    list_editable = ("is_active",)
    readonly_fields = ("id", "created_at", "updated_at")
    list_select_related = ("enterprise",)


# ---------------------------------------------------------------------------
# Product
# ---------------------------------------------------------------------------

@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "sku",
        "enterprise",
        "category",
        "brand",
        "cost_price",
        "selling_price",
        "is_active",
    )
    list_filter = ("is_active", "enterprise", "category", "brand")
    search_fields = ("name", "sku", "barcode", "slug")
    prepopulated_fields = {"slug": ("name",)}
    list_editable = ("is_active",)
    readonly_fields = ("id", "created_at", "updated_at")
    inlines = [ProductImageInline, ProductSpecInline]
    list_select_related = ("enterprise", "category", "brand")
    list_per_page = 50
    fieldsets = (
        (None, {
            "fields": ("name", "slug", "sku", "barcode", "description"),
        }),
        ("Classification", {
            "fields": ("category", "brand"),
        }),
        ("Tarification", {
            "fields": ("cost_price", "selling_price"),
        }),
        ("Statut", {
            "fields": ("is_active",),
        }),
        ("Metadonnees", {
            "classes": ("collapse",),
            "fields": ("id", "created_at", "updated_at"),
        }),
    )


# ---------------------------------------------------------------------------
# ProductImage & ProductSpec (standalone registration)
# ---------------------------------------------------------------------------

@admin.register(ProductImage)
class ProductImageAdmin(admin.ModelAdmin):
    list_display = ("product", "is_primary", "sort_order", "created_at")
    list_filter = ("is_primary",)
    search_fields = ("product__name",)
    readonly_fields = ("id", "created_at", "updated_at")
    list_select_related = ("product",)


@admin.register(ProductSpec)
class ProductSpecAdmin(admin.ModelAdmin):
    list_display = ("product", "key", "value")
    search_fields = ("product__name", "key", "value")
    list_filter = ("key",)
    readonly_fields = ("id", "created_at", "updated_at")
    list_select_related = ("product",)
