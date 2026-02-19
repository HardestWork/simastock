"""Admin configuration for the credits app."""
from django.contrib import admin

from .models import CreditLedgerEntry, CustomerAccount, PaymentSchedule


# ---------------------------------------------------------------------------
# Inlines
# ---------------------------------------------------------------------------

class CreditLedgerEntryInline(admin.TabularInline):
    model = CreditLedgerEntry
    extra = 0
    readonly_fields = (
        "entry_type",
        "amount",
        "balance_after",
        "reference",
        "sale",
        "created_by",
        "created_at",
    )
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


class PaymentScheduleInline(admin.TabularInline):
    model = PaymentSchedule
    extra = 0
    fields = ("due_date", "amount_due", "amount_paid", "status", "sale", "notes")
    readonly_fields = ("created_at",)


# ---------------------------------------------------------------------------
# CustomerAccount
# ---------------------------------------------------------------------------

@admin.register(CustomerAccount)
class CustomerAccountAdmin(admin.ModelAdmin):
    list_display = (
        "customer",
        "store",
        "credit_limit",
        "balance",
        "available_credit",
        "is_over_limit",
        "is_active",
        "created_at",
    )
    list_filter = ("is_active", "store")
    search_fields = (
        "customer__first_name",
        "customer__last_name",
        "customer__phone",
    )
    list_editable = ("is_active",)
    readonly_fields = ("id", "balance", "created_at", "updated_at")
    inlines = [CreditLedgerEntryInline, PaymentScheduleInline]
    list_select_related = ("customer", "store")
    date_hierarchy = "created_at"
    fieldsets = (
        (None, {
            "fields": ("store", "customer", "credit_limit", "balance"),
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
# CreditLedgerEntry
# ---------------------------------------------------------------------------

@admin.register(CreditLedgerEntry)
class CreditLedgerEntryAdmin(admin.ModelAdmin):
    list_display = (
        "account",
        "entry_type",
        "amount",
        "balance_after",
        "reference",
        "created_by",
        "created_at",
    )
    list_select_related = ("account", "account__customer", "created_by", "sale")
    date_hierarchy = "created_at"
    list_filter = ("entry_type",)
    search_fields = (
        "account__customer__first_name",
        "account__customer__last_name",
        "reference",
    )
    readonly_fields = (
        "id",
        "account",
        "entry_type",
        "amount",
        "balance_after",
        "reference",
        "sale",
        "notes",
        "created_by",
        "created_at",
        "updated_at",
    )

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


# ---------------------------------------------------------------------------
# PaymentSchedule
# ---------------------------------------------------------------------------

@admin.register(PaymentSchedule)
class PaymentScheduleAdmin(admin.ModelAdmin):
    list_display = (
        "account",
        "due_date",
        "amount_due",
        "amount_paid",
        "remaining",
        "status",
        "is_overdue",
    )
    list_filter = ("status",)
    search_fields = (
        "account__customer__first_name",
        "account__customer__last_name",
    )
    readonly_fields = ("id", "created_at", "updated_at")
    list_select_related = ("account", "account__customer", "sale")
    date_hierarchy = "due_date"
