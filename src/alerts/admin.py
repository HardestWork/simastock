"""Admin configuration for the alerts app."""
from django.contrib import admin
from django.utils import timezone

from alerts.models import Alert


@admin.register(Alert)
class AlertAdmin(admin.ModelAdmin):
    """Admin for the Alert model."""

    list_display = (
        "title",
        "store",
        "alert_type",
        "severity",
        "is_read",
        "created_at",
    )
    list_filter = ("alert_type", "severity", "is_read", "store", "created_at")
    search_fields = ("title", "message")
    readonly_fields = ("id", "created_at", "updated_at", "read_by", "read_at")
    date_hierarchy = "created_at"
    ordering = ["-created_at"]
    actions = ("mark_selected_as_read", "mark_selected_as_unread")
    list_select_related = ("store", "read_by")

    fieldsets = (
        (None, {
            "fields": (
                "id",
                "store",
                "alert_type",
                "severity",
                "title",
                "message",
                "payload",
            ),
        }),
        ("Lecture", {
            "fields": (
                "is_read",
                "read_by",
                "read_at",
            ),
        }),
        ("Dates", {
            "fields": (
                "created_at",
                "updated_at",
            ),
        }),
    )

    @admin.action(description="Marquer selection comme lue")
    def mark_selected_as_read(self, request, queryset):
        queryset.update(
            is_read=True,
            read_by=request.user,
            read_at=timezone.now(),
        )

    @admin.action(description="Marquer selection comme non lue")
    def mark_selected_as_unread(self, request, queryset):
        queryset.update(
            is_read=False,
            read_by=None,
            read_at=None,
        )
