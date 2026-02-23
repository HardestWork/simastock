"""Django admin configuration for the stores app."""
from django.contrib import admin

from stores.models import (
    AuditLog,
    Enterprise,
    EnterpriseSubscription,
    Sequence,
    Store,
    StoreUser,
)


@admin.register(Enterprise)
class EnterpriseAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "currency", "is_active", "created_at")
    list_filter = ("is_active", "currency", "vat_enabled")
    search_fields = ("name", "code", "legal_name", "registration_number", "tax_id", "email", "phone")
    readonly_fields = ("id", "created_at", "updated_at")
    list_per_page = 50


@admin.register(Store)
class StoreAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "enterprise", "phone", "email", "currency", "is_active", "created_at")
    list_filter = ("is_active", "enterprise", "currency", "vat_enabled")
    search_fields = ("name", "code", "enterprise__name", "email", "phone", "address")
    readonly_fields = ("id", "created_at", "updated_at")
    list_select_related = ("enterprise",)
    list_per_page = 50


@admin.register(EnterpriseSubscription)
class EnterpriseSubscriptionAdmin(admin.ModelAdmin):
    list_display = (
        "enterprise",
        "plan_name",
        "billing_cycle",
        "amount",
        "currency",
        "status",
        "starts_on",
        "ends_on",
        "auto_renew",
    )
    list_filter = ("status", "billing_cycle", "auto_renew", "currency")
    search_fields = ("enterprise__name", "enterprise__code", "plan_name", "plan_code")
    list_select_related = ("enterprise",)
    readonly_fields = ("id", "created_at", "updated_at")
    list_per_page = 50


@admin.register(StoreUser)
class StoreUserAdmin(admin.ModelAdmin):
    list_display = ("user", "store", "is_default")
    list_filter = ("is_default", "store", "store__enterprise")
    search_fields = (
        "user__email",
        "user__first_name",
        "user__last_name",
        "store__name",
        "store__code",
    )
    raw_id_fields = ("user", "store")
    list_select_related = ("user", "store", "store__enterprise")


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ("created_at", "actor", "store", "action", "entity_type", "entity_id")
    list_filter = ("action", "entity_type", "store")
    search_fields = (
        "entity_id",
        "actor__email",
        "actor__first_name",
        "actor__last_name",
        "action",
        "entity_type",
    )
    readonly_fields = (
        "actor",
        "store",
        "action",
        "entity_type",
        "entity_id",
        "before_json",
        "after_json",
        "ip_address",
        "created_at",
    )
    date_hierarchy = "created_at"

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Sequence)
class SequenceAdmin(admin.ModelAdmin):
    list_display = ("store", "prefix", "next_number")
    list_filter = ("store", "prefix")
    search_fields = ("store__name", "store__code", "prefix")
    list_select_related = ("store",)
