"""Admin configuration for the cashier app."""
from django.contrib import admin

from .models import CashShift, Payment


# ---------------------------------------------------------------------------
# Payment inline (shown inside CashShift detail)
# ---------------------------------------------------------------------------

class PaymentInline(admin.TabularInline):
    model = Payment
    extra = 0
    fields = ("sale", "method", "amount", "reference", "cashier", "created_at")
    readonly_fields = ("created_at",)
    show_change_link = True


# ---------------------------------------------------------------------------
# CashShift
# ---------------------------------------------------------------------------

@admin.register(CashShift)
class CashShiftAdmin(admin.ModelAdmin):
    list_display = (
        "cashier",
        "store",
        "status",
        "opened_at",
        "closed_at",
        "opening_float",
        "total_sales",
        "total_cash_payments",
        "variance",
    )
    list_filter = ("status", "store", "opened_at")
    search_fields = (
        "cashier__first_name",
        "cashier__last_name",
        "cashier__email",
        "store__name",
    )
    readonly_fields = (
        "id",
        "created_at",
        "updated_at",
        "opened_at",
        "expected_cash",
        "variance",
        "total_sales",
        "total_cash_payments",
        "total_mobile_payments",
        "total_bank_payments",
        "total_credit_payments",
    )
    inlines = [PaymentInline]
    date_hierarchy = "opened_at"
    list_select_related = ("cashier", "store")
    fieldsets = (
        (None, {
            "fields": ("store", "cashier", "status"),
        }),
        ("Horaires", {
            "fields": ("opened_at", "closed_at"),
        }),
        ("Caisse", {
            "fields": (
                "opening_float",
                "expected_cash",
                "closing_cash",
                "variance",
            ),
        }),
        ("Totaux", {
            "fields": (
                "total_sales",
                "total_cash_payments",
                "total_mobile_payments",
                "total_bank_payments",
                "total_credit_payments",
            ),
        }),
        ("Notes", {
            "fields": ("notes",),
            "classes": ("collapse",),
        }),
        ("Metadonnees", {
            "fields": ("id", "created_at", "updated_at"),
            "classes": ("collapse",),
        }),
    )


# ---------------------------------------------------------------------------
# Payment
# ---------------------------------------------------------------------------

@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = (
        "sale",
        "method",
        "amount",
        "cashier",
        "store",
        "shift",
        "reference",
        "created_at",
    )
    list_filter = ("method", "store", "created_at")
    search_fields = (
        "sale__id",
        "reference",
        "cashier__first_name",
        "cashier__last_name",
        "cashier__email",
    )
    readonly_fields = ("id", "created_at", "updated_at")
    raw_id_fields = ("sale", "shift", "cashier")
    date_hierarchy = "created_at"
    list_select_related = ("sale", "store", "cashier", "shift")
    fieldsets = (
        (None, {
            "fields": ("sale", "store", "cashier", "shift"),
        }),
        ("Paiement", {
            "fields": ("method", "amount", "reference"),
        }),
        ("Notes", {
            "fields": ("notes",),
            "classes": ("collapse",),
        }),
        ("Metadonnees", {
            "fields": ("id", "created_at", "updated_at"),
            "classes": ("collapse",),
        }),
    )
