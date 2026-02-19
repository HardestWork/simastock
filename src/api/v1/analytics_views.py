"""REST API endpoints for advanced analytics module."""
from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Sum, F, DecimalField, ExpressionWrapper
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from analytics.models import (
    ABCAnalysis,
    CustomerCreditScore,
    FraudEvent,
    ReorderRecommendation,
    SalesForecast,
)
from analytics.serializers import (
    ABCAnalysisSerializer,
    CustomerCreditScoreSerializer,
    FraudEventSerializer,
    ReorderRecommendationSerializer,
    SalesForecastSerializer,
)
from analytics.services import (
    build_strategic_dashboard,
    compute_abc_analysis,
    compute_credit_scores,
    compute_dynamic_reorder,
    compute_sales_forecast,
    detect_fraud_signals,
)
from api.v1.permissions import IsManagerOrAdmin, FeatureAnalyticsEnabled
from stores.models import Store, StoreUser


def _parse_date(value, default):
    try:
        return date.fromisoformat(value) if value else default
    except (TypeError, ValueError):
        return default


def _resolve_store(request):
    """Resolve store from query param with RBAC checks."""
    store_id = request.query_params.get("store")
    if not store_id:
        store = getattr(request, "current_store", None)
        if store:
            return store
        first_link = StoreUser.objects.filter(user=request.user).select_related("store").first()
        return first_link.store if first_link else None

    store = get_object_or_404(Store, pk=store_id, is_active=True)
    if not getattr(request.user, "is_superuser", False):
        has_access = StoreUser.objects.filter(user=request.user, store=store).exists()
        if not has_access:
            return None
    return store


class StrategicKPIAPIView(APIView):
    permission_classes = [IsAuthenticated, IsManagerOrAdmin, FeatureAnalyticsEnabled]

    def get(self, request):
        store = _resolve_store(request)
        if not store:
            return Response({"detail": "Acces boutique refuse."}, status=status.HTTP_403_FORBIDDEN)

        today = date.today()
        date_from = _parse_date(request.query_params.get("date_from"), today - timedelta(days=29))
        date_to = _parse_date(request.query_params.get("date_to"), today)
        if date_from > date_to:
            date_from, date_to = date_to, date_from

        if request.query_params.get("refresh") == "1":
            compute_abc_analysis(store, date_from, date_to)
            compute_dynamic_reorder(store, as_of=today)
            compute_credit_scores(store, as_of=today)
            compute_sales_forecast(store, as_of=today)
            detect_fraud_signals(store, date_from=date_from, date_to=date_to)

        payload = build_strategic_dashboard(store, date_from, date_to)
        data = {
            **payload,
            "date_from": str(payload["date_from"]),
            "date_to": str(payload["date_to"]),
            "revenue": str(payload["revenue"]),
            "net_sales": str(payload["net_sales"]),
            "avg_basket": str(payload["avg_basket"]),
            "forecast_next_7d_qty": str(payload["forecast_next_7d_qty"]),
            "revenue_growth_pct": str(payload["revenue_growth_pct"]),
            "abc_distribution": {
                key: {
                    "revenue": str(val["revenue"]),
                    "products": val["products"],
                }
                for key, val in payload.get("abc_distribution", {}).items()
            },
        }
        return Response(data)


class ABCAnalysisAPIView(APIView):
    permission_classes = [IsAuthenticated, IsManagerOrAdmin, FeatureAnalyticsEnabled]

    def get(self, request):
        store = _resolve_store(request)
        if not store:
            return Response({"detail": "Acces boutique refuse."}, status=status.HTTP_403_FORBIDDEN)
        if not store.is_analytics_feature_enabled("abc_analysis"):
            return Response([])

        today = date.today()
        date_from = _parse_date(request.query_params.get("date_from"), today - timedelta(days=29))
        date_to = _parse_date(request.query_params.get("date_to"), today)
        if request.query_params.get("refresh") == "1":
            compute_abc_analysis(store, date_from, date_to)

        queryset = (
            ABCAnalysis.objects.filter(store=store, period_start=date_from, period_end=date_to)
            .select_related("product")
            .order_by("abc_class", "-revenue")
        )
        return Response(ABCAnalysisSerializer(queryset, many=True).data)


class ReorderRecommendationAPIView(APIView):
    permission_classes = [IsAuthenticated, IsManagerOrAdmin, FeatureAnalyticsEnabled]

    def get(self, request):
        store = _resolve_store(request)
        if not store:
            return Response({"detail": "Acces boutique refuse."}, status=status.HTTP_403_FORBIDDEN)
        if not store.is_analytics_feature_enabled("dynamic_reorder"):
            return Response([])

        as_of = _parse_date(request.query_params.get("as_of"), date.today())
        if request.query_params.get("refresh") == "1":
            compute_dynamic_reorder(store, as_of=as_of)

        queryset = (
            ReorderRecommendation.objects.filter(store=store, computed_for=as_of)
            .select_related("product")
            .order_by("-suggested_order_qty")
        )
        return Response(ReorderRecommendationSerializer(queryset, many=True).data)


class CreditScoreAPIView(APIView):
    permission_classes = [IsAuthenticated, IsManagerOrAdmin, FeatureAnalyticsEnabled]

    def get(self, request):
        store = _resolve_store(request)
        if not store:
            return Response({"detail": "Acces boutique refuse."}, status=status.HTTP_403_FORBIDDEN)
        if not store.is_analytics_feature_enabled("credit_scoring"):
            return Response([])

        as_of = _parse_date(request.query_params.get("as_of"), date.today())
        if request.query_params.get("refresh") == "1":
            compute_credit_scores(store, as_of=as_of)

        queryset = (
            CustomerCreditScore.objects.filter(store=store, computed_for=as_of)
            .select_related("customer")
            .order_by("score")
        )
        return Response(CustomerCreditScoreSerializer(queryset, many=True).data)


class SalesForecastAPIView(APIView):
    permission_classes = [IsAuthenticated, IsManagerOrAdmin, FeatureAnalyticsEnabled]

    def get(self, request):
        store = _resolve_store(request)
        if not store:
            return Response({"detail": "Acces boutique refuse."}, status=status.HTTP_403_FORBIDDEN)
        if not store.is_analytics_feature_enabled("sales_forecast"):
            return Response([])

        today = date.today()
        horizon_days = int(request.query_params.get("horizon_days", 14))
        horizon_days = max(1, min(365, horizon_days))
        if request.query_params.get("refresh") == "1":
            compute_sales_forecast(store, as_of=today, horizon_days=horizon_days)

        queryset = (
            SalesForecast.objects.filter(
                store=store,
                forecast_date__gt=today,
                forecast_date__lte=today + timedelta(days=horizon_days),
            )
            .select_related("product")
            .order_by("forecast_date", "-predicted_qty")
        )
        return Response(SalesForecastSerializer(queryset, many=True).data)


class FraudEventsAPIView(APIView):
    permission_classes = [IsAuthenticated, IsManagerOrAdmin, FeatureAnalyticsEnabled]

    def get(self, request):
        store = _resolve_store(request)
        if not store:
            return Response({"detail": "Acces boutique refuse."}, status=status.HTTP_403_FORBIDDEN)
        if not store.is_analytics_feature_enabled("fraud_detection"):
            return Response([])

        today = date.today()
        date_from = _parse_date(request.query_params.get("date_from"), today - timedelta(days=29))
        date_to = _parse_date(request.query_params.get("date_to"), today)
        if request.query_params.get("refresh") == "1":
            detect_fraud_signals(store, date_from=date_from, date_to=date_to)

        queryset = (
            FraudEvent.objects.filter(store=store, detected_on__gte=date_from, detected_on__lte=date_to)
            .select_related("sale")
            .order_by("-risk_score", "-created_at")
        )
        status_filter = request.query_params.get("status")
        if status_filter == "open":
            queryset = queryset.filter(is_resolved=False)
        elif status_filter == "resolved":
            queryset = queryset.filter(is_resolved=True)

        return Response(FraudEventSerializer(queryset, many=True).data)


class ForecastSummaryView(APIView):
    """Aggregated forecast summary: daily predicted revenue & profit.

    GET /api/v1/analytics/forecast-summary/?store=UUID&horizon_days=30
    """

    permission_classes = [IsAuthenticated, IsManagerOrAdmin, FeatureAnalyticsEnabled]

    def get(self, request):
        store = _resolve_store(request)
        if not store:
            return Response({"detail": "Acces boutique refuse."}, status=status.HTTP_403_FORBIDDEN)
        if not store.is_analytics_feature_enabled("sales_forecast"):
            return Response({"daily": [], "totals": {"predicted_qty": 0, "predicted_revenue": "0", "predicted_profit": "0"}})

        today = date.today()
        horizon_days = int(request.query_params.get("horizon_days", 30))
        horizon_days = max(1, min(365, horizon_days))

        if request.query_params.get("refresh") == "1":
            compute_sales_forecast(store, as_of=today, horizon_days=horizon_days)

        revenue_line_expr = ExpressionWrapper(
            F("predicted_qty") * F("product__selling_price"),
            output_field=DecimalField(max_digits=18, decimal_places=2),
        )
        profit_line_expr = ExpressionWrapper(
            F("predicted_qty") * (F("product__selling_price") - F("product__cost_price")),
            output_field=DecimalField(max_digits=18, decimal_places=2),
        )
        base_qs = SalesForecast.objects.filter(
            store=store,
            forecast_date__gt=today,
            forecast_date__lte=today + timedelta(days=horizon_days),
        ).annotate(
            predicted_revenue_line=revenue_line_expr,
            predicted_profit_line=profit_line_expr,
        )

        # Aggregate forecasts by date, joining product prices
        daily_qs = (
            base_qs
            .values("forecast_date")
            .annotate(
                predicted_qty=Coalesce(Sum("predicted_qty"), Decimal("0"), output_field=DecimalField()),
                predicted_revenue=Coalesce(
                    Sum("predicted_revenue_line"),
                    Decimal("0"),
                    output_field=DecimalField(),
                ),
                predicted_profit=Coalesce(
                    Sum("predicted_profit_line"),
                    Decimal("0"),
                    output_field=DecimalField(),
                ),
            )
            .order_by("forecast_date")
        )

        daily = [
            {
                "date": str(entry["forecast_date"]),
                "predicted_qty": float(entry["predicted_qty"]),
                "predicted_revenue": str(entry["predicted_revenue"]),
                "predicted_profit": str(entry["predicted_profit"]),
            }
            for entry in daily_qs
        ]

        # Totals
        totals_qs = base_qs.aggregate(
            predicted_qty=Coalesce(Sum("predicted_qty"), Decimal("0"), output_field=DecimalField()),
            predicted_revenue=Coalesce(
                Sum("predicted_revenue_line"),
                Decimal("0"),
                output_field=DecimalField(),
            ),
            predicted_profit=Coalesce(
                Sum("predicted_profit_line"),
                Decimal("0"),
                output_field=DecimalField(),
            ),
        )

        return Response({
            "daily": daily,
            "totals": {
                "predicted_qty": float(totals_qs["predicted_qty"]),
                "predicted_revenue": str(totals_qs["predicted_revenue"]),
                "predicted_profit": str(totals_qs["predicted_profit"]),
            },
        })
