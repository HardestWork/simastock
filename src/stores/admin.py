"""Django admin configuration for the stores app."""
from django.contrib import admin

from stores.models import (
    AuditLog,
    BillingModule,
    BillingModuleDependency,
    BillingPlan,
    BillingPlanModule,
    Enterprise,
    EnterprisePlanAssignment,
    EnterpriseSubscription,
    Sequence,
    Store,
    StoreModuleEntitlement,
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


@admin.register(BillingModule)
class BillingModuleAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "display_order", "is_active")
    list_filter = ("is_active",)
    search_fields = ("code", "name")
    ordering = ("display_order", "name")


@admin.register(BillingModuleDependency)
class BillingModuleDependencyAdmin(admin.ModelAdmin):
    list_display = ("module", "depends_on_module")
    search_fields = ("module__code", "depends_on_module__code")
    list_select_related = ("module", "depends_on_module")


@admin.register(BillingPlan)
class BillingPlanAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "billing_cycle", "base_price_fcfa", "currency", "is_active")
    list_filter = ("is_active", "billing_cycle")
    search_fields = ("code", "name")


@admin.register(BillingPlanModule)
class BillingPlanModuleAdmin(admin.ModelAdmin):
    list_display = ("plan", "module", "included")
    list_filter = ("included", "plan")
    search_fields = ("plan__code", "module__code")
    list_select_related = ("plan", "module")


@admin.register(EnterprisePlanAssignment)
class EnterprisePlanAssignmentAdmin(admin.ModelAdmin):
    list_display = ("enterprise", "plan", "status", "starts_on", "ends_on", "auto_renew")
    list_filter = ("status", "plan", "auto_renew")
    search_fields = ("enterprise__name", "enterprise__code", "plan__code")
    list_select_related = ("enterprise", "plan", "source_subscription")


@admin.register(StoreModuleEntitlement)
class StoreModuleEntitlementAdmin(admin.ModelAdmin):
    list_display = ("store", "module", "state", "reason", "created_by")
    list_filter = ("state", "module")
    search_fields = ("store__code", "store__name", "module__code", "reason")
    list_select_related = ("store", "module", "created_by")
