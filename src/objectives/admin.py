"""Django admin for the objectives module."""
from django.contrib import admin
from django.utils.html import format_html

from objectives.models import (
    LeaderboardSettings,
    LeaderboardSnapshot,
    ObjectiveRule,
    ObjectiveTier,
    SellerBadge,
    SellerBonusHistory,
    SellerMonthlyStats,
    SellerObjective,
    SellerPenalty,
    SellerPenaltyType,
    SellerSprint,
    SellerSprintResult,
)


class ObjectiveTierInline(admin.TabularInline):
    model = ObjectiveTier
    extra = 0
    ordering = ("rank",)
    fields = ("rank", "name", "threshold", "bonus_amount", "bonus_rate", "color")


@admin.register(ObjectiveRule)
class ObjectiveRuleAdmin(admin.ModelAdmin):
    list_display = ("name", "store", "version", "is_active", "valid_from", "valid_until")
    list_filter = ("is_active", "store")
    search_fields = ("name", "store__name")
    inlines = [ObjectiveTierInline]
    readonly_fields = ("version", "created_at", "updated_at")


@admin.register(SellerMonthlyStats)
class SellerMonthlyStatsAdmin(admin.ModelAdmin):
    list_display = (
        "seller", "store", "period",
        "net_amount_display", "current_tier_name",
        "bonus_earned", "is_final",
    )
    list_filter = ("is_final", "store", "period")
    search_fields = ("seller__email", "seller__first_name", "seller__last_name")
    readonly_fields = ("computed_at", "tier_snapshot", "created_at", "updated_at")
    ordering = ("-period",)

    def net_amount_display(self, obj):
        return f"{obj.net_amount:,.0f} FCFA"
    net_amount_display.short_description = "Net"


@admin.register(SellerObjective)
class SellerObjectiveAdmin(admin.ModelAdmin):
    list_display = ("seller", "store", "period", "rule")
    list_filter = ("store", "period")
    search_fields = ("seller__email",)


@admin.register(SellerBonusHistory)
class SellerBonusHistoryAdmin(admin.ModelAdmin):
    list_display = ("stats", "amount", "status", "paid_at", "paid_by")
    list_filter = ("status",)
    readonly_fields = ("created_at",)


@admin.register(SellerPenaltyType)
class SellerPenaltyTypeAdmin(admin.ModelAdmin):
    list_display = ("name", "store", "mode", "default_amount", "is_active")
    list_filter = ("mode", "is_active", "store")


@admin.register(SellerPenalty)
class SellerPenaltyAdmin(admin.ModelAdmin):
    list_display = ("stats", "penalty_type", "amount", "is_void", "applied_by")
    list_filter = ("is_void", "penalty_type__store")
    readonly_fields = ("voided_at", "created_at")


@admin.register(LeaderboardSettings)
class LeaderboardSettingsAdmin(admin.ModelAdmin):
    list_display = ("store", "visibility", "show_amounts", "show_tier", "refresh_interval_minutes")


@admin.register(LeaderboardSnapshot)
class LeaderboardSnapshotAdmin(admin.ModelAdmin):
    list_display = ("store", "period", "entry_count", "computed_at")
    readonly_fields = ("data", "computed_at")
    ordering = ("-period",)

    def entry_count(self, obj):
        return len(obj.data) if obj.data else 0
    entry_count.short_description = "# Vendeurs"


@admin.register(SellerBadge)
class SellerBadgeAdmin(admin.ModelAdmin):
    list_display = ("seller", "store", "badge_type", "period", "label")
    list_filter = ("badge_type", "store")
    search_fields = ("seller__email",)


@admin.register(SellerSprint)
class SellerSprintAdmin(admin.ModelAdmin):
    list_display = ("name", "store", "status", "starts_at", "ends_at")
    list_filter = ("status", "store")


@admin.register(SellerSprintResult)
class SellerSprintResultAdmin(admin.ModelAdmin):
    list_display = ("sprint", "seller", "rank", "amount", "is_winner")
    list_filter = ("is_winner",)
