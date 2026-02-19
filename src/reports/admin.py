"""Admin configuration for the reports app."""
from django.contrib import admin

from reports.models import KPISnapshot


@admin.register(KPISnapshot)
class KPISnapshotAdmin(admin.ModelAdmin):
    """Admin for the KPISnapshot model."""

    list_display = (
        "store",
        "date",
        "total_sales",
        "total_orders",
        "average_basket",
        "gross_margin",
        "net_sales",
        "stock_value",
    )
    list_filter = ("store", "date")
    search_fields = ("store__name", "store__code")
    list_select_related = ("store",)
    date_hierarchy = "date"
    readonly_fields = ("id", "created_at", "updated_at")
    ordering = ["-date"]
