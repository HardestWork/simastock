from django.contrib import admin

from .models import (
    AIConversation, AIMessage, AIUsageLog, AIResponseCache,
    AICreditBalance, AICreditTransaction, UserActivitySession,
)


class AIMessageInline(admin.TabularInline):
    model = AIMessage
    extra = 0
    readonly_fields = ("role", "content", "tokens_input", "tokens_output", "model", "created_at")


@admin.register(AIConversation)
class AIConversationAdmin(admin.ModelAdmin):
    list_display = ("title", "user", "store", "feature", "status", "created_at")
    list_filter = ("feature", "status", "store")
    search_fields = ("title", "user__email")
    inlines = [AIMessageInline]


@admin.register(AIUsageLog)
class AIUsageLogAdmin(admin.ModelAdmin):
    list_display = ("feature", "user", "enterprise", "model", "tokens_input", "tokens_output", "estimated_cost_usd", "created_at")
    list_filter = ("feature", "model", "enterprise")
    date_hierarchy = "created_at"


@admin.register(AIResponseCache)
class AIResponseCacheAdmin(admin.ModelAdmin):
    list_display = ("feature", "store", "cache_key", "expires_at")
    list_filter = ("feature", "store")


@admin.register(AICreditBalance)
class AICreditBalanceAdmin(admin.ModelAdmin):
    list_display = ("enterprise", "balance", "updated_at")
    readonly_fields = ("enterprise",)


@admin.register(AICreditTransaction)
class AICreditTransactionAdmin(admin.ModelAdmin):
    list_display = ("enterprise", "transaction_type", "amount", "balance_after", "user", "created_at")
    list_filter = ("transaction_type", "enterprise")
    date_hierarchy = "created_at"


@admin.register(UserActivitySession)
class UserActivitySessionAdmin(admin.ModelAdmin):
    list_display = ("user", "store", "date", "total_seconds", "page_views", "is_active")
    list_filter = ("store", "date", "is_active")
    date_hierarchy = "date"
