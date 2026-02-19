"""Admin configuration for the customers app."""
from django.contrib import admin

from .models import Customer


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = (
        "full_name",
        "phone",
        "email",
        "company",
        "enterprise",
        "is_active",
        "created_at",
    )
    list_filter = ("is_active", "enterprise")
    search_fields = ("first_name", "last_name", "phone", "email", "company", "tax_id")
    list_editable = ("is_active",)
    readonly_fields = ("id", "created_at", "updated_at")
    list_select_related = ("enterprise",)
    date_hierarchy = "created_at"
    fieldsets = (
        (None, {
            "fields": ("enterprise", "first_name", "last_name", "phone", "email"),
        }),
        ("Informations complementaires", {
            "fields": ("address", "company", "tax_id"),
        }),
        ("Statut", {
            "fields": ("is_active", "notes"),
        }),
        ("Metadonnees", {
            "classes": ("collapse",),
            "fields": ("id", "created_at", "updated_at"),
        }),
    )
