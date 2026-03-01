from django.contrib import admin

from accounting.models import (
    Account,
    AccountingPeriod,
    AccountingSettings,
    FiscalYear,
    Journal,
    JournalEntry,
    JournalEntryLine,
    TaxRate,
)


class JournalEntryLineInline(admin.TabularInline):
    model = JournalEntryLine
    extra = 0
    readonly_fields = ("id", "created_at")
    fields = ("account", "debit", "credit", "label", "partner_type", "partner_id")


@admin.register(Account)
class AccountAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "account_type", "enterprise", "is_system", "allow_entries", "is_active")
    list_filter = ("account_type", "is_system", "is_active", "enterprise")
    search_fields = ("code", "name")
    readonly_fields = ("id", "created_at", "updated_at")
    raw_id_fields = ("enterprise", "parent")
    list_per_page = 50


@admin.register(Journal)
class JournalAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "journal_type", "enterprise", "is_active")
    list_filter = ("journal_type", "is_active", "enterprise")
    search_fields = ("code", "name")
    readonly_fields = ("id", "created_at", "updated_at")
    raw_id_fields = ("enterprise",)


@admin.register(FiscalYear)
class FiscalYearAdmin(admin.ModelAdmin):
    list_display = ("name", "enterprise", "start_date", "end_date", "status")
    list_filter = ("status", "enterprise")
    readonly_fields = ("id", "created_at", "updated_at")
    raw_id_fields = ("enterprise", "closed_by")


@admin.register(AccountingPeriod)
class AccountingPeriodAdmin(admin.ModelAdmin):
    list_display = ("__str__", "period_number", "start_date", "end_date", "status")
    list_filter = ("status", "fiscal_year")
    readonly_fields = ("id", "created_at", "updated_at")
    raw_id_fields = ("fiscal_year",)


@admin.register(JournalEntry)
class JournalEntryAdmin(admin.ModelAdmin):
    list_display = (
        "sequence_number", "journal", "entry_date", "label",
        "status", "source_type", "store", "created_at",
    )
    list_filter = ("status", "journal", "source_type", "enterprise")
    search_fields = ("label", "reference", "sequence_number")
    readonly_fields = ("id", "created_at", "updated_at")
    raw_id_fields = (
        "enterprise", "journal", "fiscal_year", "period",
        "store", "created_by", "validated_by", "reversed_entry",
    )
    inlines = [JournalEntryLineInline]
    date_hierarchy = "entry_date"
    list_per_page = 50
    list_select_related = ("journal", "store", "enterprise")


@admin.register(JournalEntryLine)
class JournalEntryLineAdmin(admin.ModelAdmin):
    list_display = ("entry", "account", "debit", "credit", "label")
    list_filter = ("entry__journal",)
    search_fields = ("account__code", "account__name", "label")
    readonly_fields = ("id", "created_at", "updated_at")
    raw_id_fields = ("entry", "account")
    list_select_related = ("entry", "account")


@admin.register(TaxRate)
class TaxRateAdmin(admin.ModelAdmin):
    list_display = ("name", "rate", "is_exempt", "enterprise", "is_active")
    list_filter = ("is_exempt", "is_active", "enterprise")
    readonly_fields = ("id", "created_at", "updated_at")
    raw_id_fields = ("enterprise", "collected_account", "deductible_account")


@admin.register(AccountingSettings)
class AccountingSettingsAdmin(admin.ModelAdmin):
    list_display = ("enterprise", "auto_post_entries", "default_tax_rate")
    readonly_fields = ("id", "created_at", "updated_at")
    raw_id_fields = (
        "enterprise", "default_sales_account", "default_purchase_account",
        "default_cash_account", "default_bank_account", "default_mobile_money_account",
        "default_customer_account", "default_supplier_account",
        "default_vat_collected_account", "default_vat_deductible_account",
        "default_discount_account", "default_refund_account",
        "default_stock_account", "default_stock_variation_account",
        "default_other_income_account", "default_tax_rate",
    )
