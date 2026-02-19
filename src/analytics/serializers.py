"""Serializers for analytics API responses."""
from rest_framework import serializers

from analytics.models import (
    ABCAnalysis,
    CustomerCreditScore,
    FraudEvent,
    ReorderRecommendation,
    SalesForecast,
)


class ABCAnalysisSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_sku = serializers.CharField(source="product.sku", read_only=True)

    class Meta:
        model = ABCAnalysis
        fields = [
            "id",
            "store",
            "product",
            "product_name",
            "product_sku",
            "period_start",
            "period_end",
            "quantity_sold",
            "revenue",
            "revenue_share",
            "cumulative_share",
            "abc_class",
        ]
        read_only_fields = fields


class ReorderRecommendationSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_sku = serializers.CharField(source="product.sku", read_only=True)

    class Meta:
        model = ReorderRecommendation
        fields = [
            "id",
            "store",
            "product",
            "product_name",
            "product_sku",
            "computed_for",
            "avg_daily_sales",
            "lead_time_days",
            "safety_days",
            "reorder_point",
            "current_available",
            "suggested_order_qty",
            "days_of_cover",
            "urgency",
        ]
        read_only_fields = fields


class CustomerCreditScoreSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.full_name", read_only=True)
    customer_phone = serializers.CharField(source="customer.phone", read_only=True)

    class Meta:
        model = CustomerCreditScore
        fields = [
            "id",
            "store",
            "account",
            "customer",
            "customer_name",
            "customer_phone",
            "computed_for",
            "score",
            "grade",
            "utilization_rate",
            "payment_ratio",
            "overdue_ratio",
            "overdue_amount",
            "balance",
            "recommended_limit",
        ]
        read_only_fields = fields


class SalesForecastSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_sku = serializers.CharField(source="product.sku", read_only=True)
    predicted_revenue = serializers.SerializerMethodField()
    predicted_profit = serializers.SerializerMethodField()

    class Meta:
        model = SalesForecast
        fields = [
            "id",
            "store",
            "product",
            "product_name",
            "product_sku",
            "forecast_date",
            "method",
            "predicted_qty",
            "predicted_revenue",
            "predicted_profit",
            "ma_7d",
            "ma_30d",
            "confidence",
        ]
        read_only_fields = fields

    def get_predicted_revenue(self, obj):
        return str(obj.predicted_qty * obj.product.selling_price)

    def get_predicted_profit(self, obj):
        return str(obj.predicted_qty * (obj.product.selling_price - obj.product.cost_price))


class FraudEventSerializer(serializers.ModelSerializer):
    sale_invoice = serializers.CharField(source="sale.invoice_number", read_only=True)

    class Meta:
        model = FraudEvent
        fields = [
            "id",
            "store",
            "sale",
            "sale_invoice",
            "payment",
            "detected_on",
            "rule_code",
            "severity",
            "risk_score",
            "title",
            "description",
            "payload",
            "is_resolved",
            "created_at",
        ]
        read_only_fields = fields

