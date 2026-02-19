"""Admin configuration for analytics models."""
from django.contrib import admin
from django.utils import timezone

from analytics.models import (
    ABCAnalysis,
    CustomerCreditScore,
    FraudEvent,
    ReorderRecommendation,
    SalesForecast,
)


@admin.register(ABCAnalysis)
class ABCAnalysisAdmin(admin.ModelAdmin):
    list_display = ("store", "product", "abc_class", "revenue", "quantity_sold", "period_end")
    list_filter = ("abc_class", "store", "period_end")
    search_fields = ("product__name", "product__sku")
    date_hierarchy = "period_end"
    list_select_related = ("store", "product")
    readonly_fields = (
        "store",
        "product",
        "period_start",
        "period_end",
        "quantity_sold",
        "revenue",
        "revenue_share",
        "cumulative_share",
        "abc_class",
    )


@admin.register(ReorderRecommendation)
class ReorderRecommendationAdmin(admin.ModelAdmin):
    list_display = ("store", "product", "urgency", "suggested_order_qty", "current_available", "computed_for")
    list_filter = ("urgency", "store", "computed_for")
    search_fields = ("product__name", "product__sku")
    date_hierarchy = "computed_for"
    list_select_related = ("store", "product")
    readonly_fields = (
        "store",
        "product",
        "computed_for",
        "avg_daily_sales",
        "lead_time_days",
        "safety_days",
        "reorder_point",
        "current_available",
        "suggested_order_qty",
        "days_of_cover",
        "urgency",
    )


@admin.register(CustomerCreditScore)
class CustomerCreditScoreAdmin(admin.ModelAdmin):
    list_display = ("store", "customer", "grade", "score", "balance", "overdue_amount", "computed_for")
    list_filter = ("grade", "store", "computed_for")
    search_fields = ("customer__first_name", "customer__last_name", "customer__phone")
    date_hierarchy = "computed_for"
    list_select_related = ("store", "customer", "account")
    readonly_fields = (
        "store",
        "account",
        "customer",
        "computed_for",
        "score",
        "grade",
        "utilization_rate",
        "payment_ratio",
        "overdue_ratio",
        "overdue_amount",
        "balance",
        "recommended_limit",
    )


@admin.register(SalesForecast)
class SalesForecastAdmin(admin.ModelAdmin):
    list_display = ("store", "product", "forecast_date", "predicted_qty", "confidence")
    list_filter = ("store", "method", "forecast_date")
    search_fields = ("product__name", "product__sku")
    date_hierarchy = "forecast_date"
    list_select_related = ("store", "product")
    readonly_fields = (
        "store",
        "product",
        "forecast_date",
        "method",
        "predicted_qty",
        "ma_7d",
        "ma_30d",
        "confidence",
    )


@admin.register(FraudEvent)
class FraudEventAdmin(admin.ModelAdmin):
    list_display = ("store", "rule_code", "severity", "risk_score", "is_resolved", "detected_on")
    list_filter = ("severity", "is_resolved", "store", "detected_on")
    search_fields = ("title", "rule_code", "sale__invoice_number")
    date_hierarchy = "detected_on"
    list_select_related = ("store", "sale", "payment", "resolved_by")
    actions = ("mark_as_resolved", "mark_as_unresolved")

    @admin.action(description="Marquer selection comme resolue")
    def mark_as_resolved(self, request, queryset):
        queryset.update(
            is_resolved=True,
            resolved_by=request.user,
            resolved_at=timezone.now(),
        )

    @admin.action(description="Marquer selection comme non resolue")
    def mark_as_unresolved(self, request, queryset):
        queryset.update(
            is_resolved=False,
            resolved_by=None,
            resolved_at=None,
        )
