"""Admin registration for expense models."""
from django.contrib import admin

from expenses.models import Budget, Expense, ExpenseCategory, ExpenseSequence, RecurringExpense, Wallet


@admin.register(ExpenseCategory)
class ExpenseCategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "enterprise", "store", "type", "is_active")
    list_filter = ("type", "is_active", "enterprise")
    search_fields = ("name",)


@admin.register(Wallet)
class WalletAdmin(admin.ModelAdmin):
    list_display = ("name", "store", "type", "balance", "is_active")
    list_filter = ("type", "is_active", "store")
    search_fields = ("name", "store__name")


@admin.register(Expense)
class ExpenseAdmin(admin.ModelAdmin):
    list_display = ("expense_number", "store", "amount", "status", "expense_date", "created_by")
    list_filter = ("status", "store", "wallet", "category")
    search_fields = ("expense_number", "description", "supplier_name")
    readonly_fields = ("expense_number", "created_at", "updated_at")


@admin.register(Budget)
class BudgetAdmin(admin.ModelAdmin):
    list_display = ("store", "category", "period", "limit_amount", "alert_threshold_percent")
    list_filter = ("period", "store")
    search_fields = ("period", "store__name", "category__name")


@admin.register(RecurringExpense)
class RecurringExpenseAdmin(admin.ModelAdmin):
    list_display = ("store", "description", "amount", "frequency", "next_run_date", "is_active")
    list_filter = ("frequency", "is_active", "store")
    search_fields = ("description", "supplier_name")


@admin.register(ExpenseSequence)
class ExpenseSequenceAdmin(admin.ModelAdmin):
    list_display = ("store", "period", "next_number")
    search_fields = ("store__name", "period")

