"""REST API endpoints for advanced analytics module."""
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation

from django.db.models import Avg, Sum, F, DecimalField, ExpressionWrapper, IntegerField
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from analytics.models import (
    ABCAnalysis,
    CustomerAnalyticsRuleSet,
    CustomerCreditScore,
    CustomerIntelligenceAlert,
    CustomerScoreSnapshot,
    CustomerTopMonthly,
    FraudEvent,
    ReorderRecommendation,
    SalesForecast,
)
from analytics.customer_intelligence import (
    compute_customer_score,
    compute_credit_risk_for_customer,
    get_customer_product_recommendations,
    get_or_create_active_ruleset,
    list_churn_risk_customers,
    list_credit_risk_customers,
    list_dormant_customers,
    month_bounds,
    predict_next_order_for_customer,
    refresh_top_clients_month,
    upsert_ruleset,
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
from api.v1.permissions import FeatureAnalyticsEnabled, IsManagerOrAdmin, IsStoreMember
from customers.models import Customer
from stores.models import Store, StoreUser


def _parse_date(value, default):
    try:
        return date.fromisoformat(value) if value else default
    except (TypeError, ValueError):
        return default


def _parse_period_month(value, default):
    if not value:
        return default.replace(day=1)
    try:
        if len(value) == 7:
            parsed = date.fromisoformat(f"{value}-01")
        else:
            parsed = date.fromisoformat(value).replace(day=1)
        return parsed.replace(day=1)
    except (TypeError, ValueError):
        return None


def _parse_int(value, default, *, minimum=None, maximum=None):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = int(default)
    if minimum is not None:
        parsed = max(minimum, parsed)
    if maximum is not None:
        parsed = min(maximum, parsed)
    return parsed


def _parse_decimal(value, default="0.00"):
    try:
        return Decimal(str(value))
    except (TypeError, ValueError, InvalidOperation):
        return Decimal(default)


def _parse_bool(value, default=False):
    if value is None:
        return bool(default)
    raw = str(value).strip().lower()
    if raw in {"1", "true", "yes", "oui", "on"}:
        return True
    if raw in {"0", "false", "no", "non", "off"}:
        return False
    return bool(default)


def _safe_decimal(value, default="0.00"):
    if value is None:
        return Decimal(default)
    if isinstance(value, Decimal):
        return value
    return _parse_decimal(value, default=default)


def _serialize_ruleset(ruleset: CustomerAnalyticsRuleSet):
    return {
        "id": str(ruleset.id),
        "store_id": str(ruleset.store_id),
        "version": ruleset.version,
        "status": ruleset.status,
        "effective_from": str(ruleset.effective_from),
        "effective_to": str(ruleset.effective_to) if ruleset.effective_to else None,
        "weights": ruleset.weights or {},
        "thresholds": ruleset.thresholds or {},
        "margin_proxy": ruleset.margin_proxy or {},
        "dormant_days": ruleset.dormant_days,
        "notes": ruleset.notes or "",
        "created_at": ruleset.created_at.isoformat(),
        "updated_at": ruleset.updated_at.isoformat(),
    }


def _serialize_top_from_cache(store, period_month, *, limit):
    period_start, _ = month_bounds(period_month)
    rows = (
        CustomerTopMonthly.objects
        .filter(store=store, period_month=period_start)
        .select_related("customer")
        .order_by("rank")[:limit]
    )
    payload = []
    for row in rows:
        customer = row.customer
        payload.append(
            {
                "rank": row.rank,
                "customer_id": str(customer.id),
                "customer_name": customer.full_name,
                "customer_phone": customer.phone,
                "top_score": str((row.top_score * Decimal("100")).quantize(Decimal("0.01"))),
                "badge": row.badge,
                "paid_amount": None,
                "paid_orders": None,
                "active_weeks": None,
                "recovery_ratio": None,
                "why": row.explain or [],
            }
        )
    return payload


def _resolve_user_enterprise_id(user):
    first_link = (
        StoreUser.objects.filter(user=user, store__is_active=True)
        .select_related("store")
        .order_by("-is_default", "store_id")
        .first()
    )
    if first_link and first_link.store and first_link.store.enterprise_id:
        return str(first_link.store.enterprise_id)

    custom_role = getattr(user, "custom_role", None)
    enterprise_id = getattr(custom_role, "enterprise_id", None)
    if enterprise_id:
        return str(enterprise_id)
    return None


def _resolve_store(request):
    """Resolve store from query param with RBAC checks."""
    store_id = request.query_params.get("store")
    if not store_id:
        store = getattr(request, "current_store", None)
        if store:
            return store
        first_link = (
            StoreUser.objects.filter(user=request.user, store__is_active=True)
            .select_related("store")
            .order_by("-is_default", "store_id")
            .first()
        )
        if first_link:
            return first_link.store

        if getattr(request.user, "role", None) == "ADMIN":
            enterprise_id = _resolve_user_enterprise_id(request.user)
            if enterprise_id:
                return (
                    Store.objects.filter(enterprise_id=enterprise_id, is_active=True)
                    .order_by("name")
                    .first()
                )
        return None

    store = get_object_or_404(Store, pk=store_id, is_active=True)
    user = request.user
    if getattr(user, "is_superuser", False):
        return store

    has_access = StoreUser.objects.filter(user=user, store=store).exists()
    if has_access:
        return store

    if getattr(user, "role", None) == "ADMIN":
        enterprise_id = _resolve_user_enterprise_id(user)
        if enterprise_id and str(store.enterprise_id) == enterprise_id:
            return store
    return None


class StrategicKPIAPIView(APIView):
    required_module_code = "ANALYTICS_MANAGER"
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
    required_module_code = "ANALYTICS_MANAGER"
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
    required_module_code = "ANALYTICS_MANAGER"
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
    required_module_code = "ANALYTICS_MANAGER"
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
    required_module_code = "ANALYTICS_MANAGER"
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
    required_module_code = "ANALYTICS_MANAGER"
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


def _movement_bucket(quantity_sold: Decimal, max_quantity: Decimal) -> str:
    if max_quantity <= 0:
        return "SLOW"
    ratio = quantity_sold / max_quantity
    if ratio >= Decimal("0.70"):
        return "FAST"
    if ratio >= Decimal("0.30"):
        return "MEDIUM"
    return "SLOW"


def _build_margin_movers_payload(store, date_from, date_to, *, limit=25, min_qty=Decimal("0")):
    from sales.models import Sale, SaleItem
    from stock.models import ProductStock

    paid_statuses = [Sale.Status.PAID, Sale.Status.PARTIALLY_PAID]
    period_days = max(1, (date_to - date_from).days + 1)

    line_cost_expr = ExpressionWrapper(
        F("cost_price") * F("quantity"),
        output_field=DecimalField(max_digits=18, decimal_places=2),
    )
    base_qs = (
        SaleItem.objects.filter(
            sale__store=store,
            sale__status__in=paid_statuses,
            sale__created_at__date__gte=date_from,
            sale__created_at__date__lte=date_to,
        )
        .values("product_id", "product__name", "product__sku")
        .annotate(
            quantity_sold=Coalesce(Sum("quantity"), 0, output_field=IntegerField()),
            revenue=Coalesce(
                Sum("line_total"),
                Decimal("0.00"),
                output_field=DecimalField(max_digits=18, decimal_places=2),
            ),
            cost=Coalesce(
                Sum(line_cost_expr),
                Decimal("0.00"),
                output_field=DecimalField(max_digits=18, decimal_places=2),
            ),
        )
        .order_by("-revenue", "-quantity_sold")
    )
    if min_qty > 0:
        base_qs = base_qs.filter(quantity_sold__gte=min_qty)

    rows = list(base_qs)
    if not rows:
        empty_summary = {
            "period_days": period_days,
            "sold_products": 0,
            "units_sold": 0.0,
            "revenue": "0.00",
            "margin_total": "0.00",
            "margin_rate_pct": "0.00",
            "high_margin_fast_count": 0,
            "low_margin_fast_count": 0,
            "slow_with_stock_count": 0,
            "at_risk_high_margin_count": 0,
        }
        return [], empty_summary, []

    product_ids = [row["product_id"] for row in rows if row.get("product_id")]
    stock_map = {
        row["product_id"]: row
        for row in ProductStock.objects.filter(store=store, product_id__in=product_ids).values(
            "product_id",
            "quantity",
            "reserved_qty",
            "min_qty",
        )
    }

    max_quantity = max((_safe_decimal(row.get("quantity_sold"), "0") for row in rows), default=Decimal("0"))
    total_units = Decimal("0")
    total_revenue = Decimal("0.00")
    total_margin = Decimal("0.00")
    high_margin_fast_count = 0
    low_margin_fast_count = 0
    slow_with_stock_count = 0
    at_risk_high_margin_count = 0

    all_items = []
    for row in rows:
        quantity_sold = _safe_decimal(row.get("quantity_sold"), "0")
        revenue = _safe_decimal(row.get("revenue"))
        cost = _safe_decimal(row.get("cost"))
        margin_total = revenue - cost
        margin_rate_pct = (margin_total / revenue * Decimal("100")) if revenue > 0 else Decimal("0")
        avg_daily_qty = quantity_sold / Decimal(str(period_days))

        stock = stock_map.get(row["product_id"], {})
        current_stock = int(stock.get("quantity") or 0)
        reserved_stock = int(stock.get("reserved_qty") or 0)
        min_stock = int(stock.get("min_qty") or 0)
        available_stock = current_stock - reserved_stock

        days_of_cover = None
        if avg_daily_qty > 0:
            days_of_cover = Decimal(str(available_stock)) / avg_daily_qty

        movement_bucket = _movement_bucket(quantity_sold, max_quantity)

        if margin_rate_pct >= Decimal("25") and movement_bucket == "FAST":
            high_margin_fast_count += 1
        if margin_rate_pct <= Decimal("10") and movement_bucket == "FAST":
            low_margin_fast_count += 1
        if movement_bucket == "SLOW" and available_stock > 0:
            slow_with_stock_count += 1
        if days_of_cover is not None and days_of_cover <= Decimal("7") and margin_rate_pct >= Decimal("25"):
            at_risk_high_margin_count += 1

        if margin_rate_pct >= Decimal("25") and movement_bucket in ("FAST", "MEDIUM"):
            action_hint = "Securiser le stock et augmenter la visibilite."
        elif margin_rate_pct <= Decimal("10") and movement_bucket == "FAST":
            action_hint = "Revoir prix de vente ou cout d'achat pour proteger la marge."
        elif movement_bucket == "SLOW" and available_stock > 0:
            action_hint = "Prevoir une promo ciblee ou un bundle pour accelerer la sortie."
        else:
            action_hint = "Maintenir le suivi hebdomadaire."

        all_items.append(
            {
                "product_id": str(row["product_id"]),
                "product_name": row["product__name"],
                "product_sku": row["product__sku"] or "",
                "quantity_sold": float(quantity_sold),
                "revenue": str(revenue.quantize(Decimal("0.01"))),
                "cost": str(cost.quantize(Decimal("0.01"))),
                "margin_total": str(margin_total.quantize(Decimal("0.01"))),
                "margin_rate_pct": str(margin_rate_pct.quantize(Decimal("0.01"))),
                "avg_daily_qty": str(avg_daily_qty.quantize(Decimal("0.01"))),
                "current_stock": current_stock,
                "reserved_stock": reserved_stock,
                "available_stock": available_stock,
                "min_stock": min_stock,
                "days_of_cover": str(days_of_cover.quantize(Decimal("0.01"))) if days_of_cover is not None else None,
                "movement_bucket": movement_bucket,
                "action_hint": action_hint,
            }
        )

        total_units += quantity_sold
        total_revenue += revenue
        total_margin += margin_total

    all_items.sort(
        key=lambda row: (
            _safe_decimal(row.get("margin_total")),
            _safe_decimal(row.get("quantity_sold"), default="0"),
        ),
        reverse=True,
    )
    margin_rate_global = (total_margin / total_revenue * Decimal("100")) if total_revenue > 0 else Decimal("0")
    summary = {
        "period_days": period_days,
        "sold_products": len(all_items),
        "units_sold": float(total_units),
        "revenue": str(total_revenue.quantize(Decimal("0.01"))),
        "margin_total": str(total_margin.quantize(Decimal("0.01"))),
        "margin_rate_pct": str(margin_rate_global.quantize(Decimal("0.01"))),
        "high_margin_fast_count": high_margin_fast_count,
        "low_margin_fast_count": low_margin_fast_count,
        "slow_with_stock_count": slow_with_stock_count,
        "at_risk_high_margin_count": at_risk_high_margin_count,
    }
    return all_items[:limit], summary, all_items


class MarginMoversAPIView(APIView):
    """Products combining margin and sell-through dynamics."""

    required_module_code = "ANALYTICS_MANAGER"
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

        limit = _parse_int(request.query_params.get("limit"), 25, minimum=1, maximum=200)
        min_qty = _parse_decimal(request.query_params.get("min_qty"), default="0.00")
        if min_qty < 0:
            min_qty = Decimal("0")

        items, summary, all_items = _build_margin_movers_payload(
            store,
            date_from,
            date_to,
            limit=limit,
            min_qty=min_qty,
        )
        return Response(
            {
                "date_from": str(date_from),
                "date_to": str(date_to),
                "limit": limit,
                "min_qty": str(min_qty),
                "total_rows": len(all_items),
                "summary": summary,
                "items": items,
            }
        )


class OrientationAdviceAPIView(APIView):
    """Strategic orientation recommendations based on multi-signal analytics."""

    required_module_code = "ANALYTICS_MANAGER"
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

        _, summary, all_items = _build_margin_movers_payload(
            store,
            date_from,
            date_to,
            limit=200,
        )
        focus_limit = _parse_int(request.query_params.get("focus_limit"), 5, minimum=1, maximum=15)

        signals = []
        recommendations = []

        def add_signal(code, level, metric, detail):
            signals.append(
                {
                    "code": code,
                    "level": level,
                    "metric": metric,
                    "detail": detail,
                }
            )

        def add_recommendation(theme, title, action, reason, expected_impact="MEDIUM"):
            recommendations.append(
                {
                    "priority": len(recommendations) + 1,
                    "theme": theme,
                    "title": title,
                    "action": action,
                    "reason": reason,
                    "expected_impact": expected_impact,
                }
            )

        if summary["sold_products"] == 0:
            add_signal(
                "NO_SALES_DATA",
                "WARNING",
                "0 produit",
                "Aucune vente payee sur la periode selectionnee.",
            )
            add_recommendation(
                "pilotage",
                "Collecter plus de donnees de vente",
                "Valider la remontee des ventes soumises/encaissees avant de piloter la marge.",
                "Sans donnees fiables de ventes, les orientations restent fragiles.",
                "HIGH",
            )
        else:
            if summary["high_margin_fast_count"] > 0:
                top_names = ", ".join([row["product_name"] for row in all_items[:3]])
                add_signal(
                    "HIGH_MARGIN_FAST",
                    "INFO",
                    str(summary["high_margin_fast_count"]),
                    f"Produits marge+rotation identifies: {top_names}.",
                )
                add_recommendation(
                    "growth",
                    "Pousser les best marges",
                    "Securiser le stock et renforcer la visibilite commerciale des produits a forte marge qui sortent vite.",
                    "Ces produits combinent contribution marge et traction commerciale.",
                    "HIGH",
                )

            if summary["low_margin_fast_count"] > 0:
                add_signal(
                    "LOW_MARGIN_FAST",
                    "WARNING",
                    str(summary["low_margin_fast_count"]),
                    "Des produits sortent vite mais avec une marge faible.",
                )
                add_recommendation(
                    "pricing",
                    "Revaloriser les marges faibles a fort volume",
                    "Ajuster le prix ou renegocier le cout d'achat des produits a forte sortie mais faible marge.",
                    "Le volume sans marge degrade la rentabilite globale.",
                    "HIGH",
                )

            if summary["slow_with_stock_count"] > 0:
                add_signal(
                    "SLOW_WITH_STOCK",
                    "WARNING",
                    str(summary["slow_with_stock_count"]),
                    "Produits lents avec stock disponible detectes.",
                )
                add_recommendation(
                    "inventory",
                    "Desengorger le stock lent",
                    "Lancer des promotions ciblees, bundles ou cross-sell sur les produits a rotation lente.",
                    "Le stock dormant immobilise du cash et augmente le risque d'obsolescence.",
                )

            if summary["at_risk_high_margin_count"] > 0:
                add_signal(
                    "HIGH_MARGIN_STOCKOUT_RISK",
                    "WARNING",
                    str(summary["at_risk_high_margin_count"]),
                    "Produits a forte marge exposes a un risque de rupture.",
                )
                add_recommendation(
                    "supply",
                    "Proteger les produits marge critique",
                    "Prioriser le reassort des produits marge elevee avec faible couverture.",
                    "Une rupture sur ces references impacte directement la marge totale.",
                    "HIGH",
                )

        latest_reorder_date = (
            ReorderRecommendation.objects.filter(store=store, computed_for__lte=date_to)
            .order_by("-computed_for")
            .values_list("computed_for", flat=True)
            .first()
        )
        if latest_reorder_date:
            urgent_reorders = ReorderRecommendation.objects.filter(
                store=store,
                computed_for=latest_reorder_date,
                urgency=ReorderRecommendation.Urgency.HIGH,
            ).count()
            if urgent_reorders > 0:
                add_signal(
                    "URGENT_REORDER",
                    "WARNING",
                    str(urgent_reorders),
                    f"{urgent_reorders} references en urgence de reassort ({latest_reorder_date}).",
                )
                add_recommendation(
                    "supply",
                    "Traiter les reassorts urgents",
                    "Executer en priorite les commandes de reassort urgentes.",
                    "Une rupture degrade le CA et la satisfaction client.",
                    "HIGH",
                )

        latest_credit_date = (
            CustomerCreditScore.objects.filter(store=store, computed_for__lte=date_to)
            .order_by("-computed_for")
            .values_list("computed_for", flat=True)
            .first()
        )
        if latest_credit_date:
            credit_qs = CustomerCreditScore.objects.filter(store=store, computed_for=latest_credit_date)
            avg_score = float(credit_qs.aggregate(avg=Avg("score"))["avg"] or 0)
            risky_count = credit_qs.filter(score__lt=50).count()
            if avg_score < 60 or risky_count > 0:
                add_signal(
                    "CREDIT_RISK",
                    "WARNING" if avg_score >= 45 else "CRITICAL",
                    f"score moyen {round(avg_score, 1)}",
                    f"{risky_count} comptes credits en zone de risque.",
                )
                add_recommendation(
                    "credit",
                    "Durcir la politique credit",
                    "Limiter les nouveaux credits risqus et renforcer le recouvrement cible.",
                    "Le risque credit eleve peut annuler la marge commerciale realisee.",
                    "MEDIUM",
                )

        unresolved_fraud = FraudEvent.objects.filter(
            store=store,
            detected_on__gte=date_from,
            detected_on__lte=date_to,
            is_resolved=False,
        )
        unresolved_count = unresolved_fraud.count()
        if unresolved_count > 0:
            critical_count = unresolved_fraud.filter(severity=FraudEvent.Severity.CRITICAL).count()
            add_signal(
                "FRAUD_UNRESOLVED",
                "CRITICAL" if critical_count > 0 else "WARNING",
                str(unresolved_count),
                f"{critical_count} critiques non resolus sur {unresolved_count} evenements.",
            )
            add_recommendation(
                "control",
                "Traiter les anomalies de fraude",
                "Mettre une revue hebdomadaire des ventes/paiements anormaux avec actions correctives.",
                "Les anomalies non resolues creent un risque direct sur la rentabilite et la tresorerie.",
                "HIGH",
            )

        if not recommendations:
            add_recommendation(
                "pilotage",
                "Maintenir le cap actuel",
                "Conserver le suivi hebdomadaire des produits marge/rotation et ajuster a la prochaine variation.",
                "Aucun signal critique n'a ete detecte sur la periode.",
                "LOW",
            )

        return Response(
            {
                "date_from": str(date_from),
                "date_to": str(date_to),
                "summary": summary,
                "signals": signals,
                "recommendations": recommendations,
                "focus_products": all_items[:focus_limit],
            }
        )


class ForecastSummaryView(APIView):
    """Aggregated forecast summary: daily predicted revenue & profit.

    GET /api/v1/analytics/forecast-summary/?store=UUID&horizon_days=30
    """

    required_module_code = "ANALYTICS_MANAGER"
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


class CustomerTopClientsAPIView(APIView):
    """Monthly top customers ranking (store scoped)."""

    required_module_code = "CLIENT_INTEL"
    permission_classes = [IsAuthenticated, IsStoreMember, FeatureAnalyticsEnabled]

    def get(self, request):
        store = _resolve_store(request)
        if not store:
            return Response({"detail": "Acces boutique refuse."}, status=status.HTTP_403_FORBIDDEN)

        today = date.today()
        period_month = _parse_period_month(request.query_params.get("period"), today)
        if period_month is None:
            return Response(
                {"detail": "Parametre period invalide. Format attendu: YYYY-MM."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        limit = _parse_int(request.query_params.get("limit"), 10, minimum=1, maximum=100)
        refresh = request.query_params.get("refresh") == "1"

        if refresh:
            items = refresh_top_clients_month(
                store=store,
                period_month=period_month,
                limit=limit,
                actor=request.user,
            )
        else:
            items = _serialize_top_from_cache(store, period_month, limit=limit)
            if not items:
                items = refresh_top_clients_month(
                    store=store,
                    period_month=period_month,
                    limit=limit,
                    actor=request.user,
                )

        return Response(
            {
                "store_id": str(store.id),
                "period": period_month.strftime("%Y-%m"),
                "limit": limit,
                "items": items,
            }
        )


class CustomerScoreAPIView(APIView):
    """Explainable customer score (0..100), rolling 90 days."""

    required_module_code = "CLIENT_INTEL"
    permission_classes = [IsAuthenticated, IsStoreMember, FeatureAnalyticsEnabled]

    def get(self, request, customer_id):
        store = _resolve_store(request)
        if not store:
            return Response({"detail": "Acces boutique refuse."}, status=status.HTTP_403_FORBIDDEN)

        customer = get_object_or_404(Customer, pk=customer_id, enterprise_id=store.enterprise_id)
        as_of = _parse_date(request.query_params.get("as_of"), date.today())
        payload = compute_customer_score(store=store, customer=customer, as_of=as_of, actor=request.user)
        return Response(payload)


class CustomerDormantAPIView(APIView):
    """Dormant customers with relaunch priority."""

    required_module_code = "CLIENT_INTEL"
    permission_classes = [IsAuthenticated, IsStoreMember, FeatureAnalyticsEnabled]

    def get(self, request):
        store = _resolve_store(request)
        if not store:
            return Response({"detail": "Acces boutique refuse."}, status=status.HTTP_403_FORBIDDEN)

        as_of = _parse_date(request.query_params.get("as_of"), date.today())
        days_param = request.query_params.get("days")
        days = _parse_int(days_param, 45, minimum=1, maximum=365) if days_param is not None else None
        limit = _parse_int(request.query_params.get("limit"), 50, minimum=1, maximum=500)

        rows = list_dormant_customers(
            store=store,
            as_of=as_of,
            days=days,
            actor=request.user,
        )

        return Response(
            {
                "store_id": str(store.id),
                "as_of": str(as_of),
                "days": days,
                "total": len(rows),
                "items": rows[:limit],
            }
        )


class CustomerCreditRiskAPIView(APIView):
    """Customer credit-risk analytics and recommendations."""

    required_module_code = "CLIENT_INTEL"
    permission_classes = [IsAuthenticated, IsStoreMember, FeatureAnalyticsEnabled]

    def get(self, request):
        store = _resolve_store(request)
        if not store:
            return Response({"detail": "Acces boutique refuse."}, status=status.HTTP_403_FORBIDDEN)

        as_of = _parse_date(request.query_params.get("as_of"), date.today())
        customer_id = request.query_params.get("customer_id")
        min_score = _parse_int(request.query_params.get("min_score"), 0, minimum=0, maximum=100)
        limit = _parse_int(request.query_params.get("limit"), 50, minimum=1, maximum=500)

        if customer_id:
            customer = get_object_or_404(Customer, pk=customer_id, enterprise_id=store.enterprise_id)
            payload = compute_credit_risk_for_customer(
                store=store,
                customer=customer,
                as_of=as_of,
                actor=request.user,
            )
            return Response(payload)

        rows = list_credit_risk_customers(
            store=store,
            as_of=as_of,
            min_risk_score=min_score,
            limit=limit,
            actor=request.user,
        )
        return Response(
            {
                "store_id": str(store.id),
                "as_of": str(as_of),
                "min_score": min_score,
                "total": len(rows),
                "items": rows,
            }
        )


class CustomerRecommendationsAPIView(APIView):
    """Cross-sell / up-sell recommendations for one customer."""

    required_module_code = "CLIENT_INTEL"
    permission_classes = [IsAuthenticated, IsStoreMember, FeatureAnalyticsEnabled]

    def get(self, request, customer_id):
        store = _resolve_store(request)
        if not store:
            return Response({"detail": "Acces boutique refuse."}, status=status.HTTP_403_FORBIDDEN)

        customer = get_object_or_404(Customer, pk=customer_id, enterprise_id=store.enterprise_id)
        as_of = _parse_date(request.query_params.get("as_of"), date.today())
        window_days = _parse_int(request.query_params.get("window_days"), 90, minimum=7, maximum=365)
        limit = _parse_int(request.query_params.get("limit"), 5, minimum=1, maximum=20)
        include_only_in_stock = _parse_bool(request.query_params.get("include_only_in_stock"), default=True)
        refresh = _parse_bool(request.query_params.get("refresh"), default=False)

        payload = get_customer_product_recommendations(
            store=store,
            customer=customer,
            as_of=as_of,
            window_days=window_days,
            limit=limit,
            include_only_in_stock=include_only_in_stock,
            force_refresh=refresh,
            actor=request.user,
        )
        return Response(payload)


class CustomerNextOrderAPIView(APIView):
    """Predict next purchase date for one customer."""

    required_module_code = "CLIENT_INTEL"
    permission_classes = [IsAuthenticated, IsStoreMember, FeatureAnalyticsEnabled]

    def get(self, request, customer_id):
        store = _resolve_store(request)
        if not store:
            return Response({"detail": "Acces boutique refuse."}, status=status.HTTP_403_FORBIDDEN)

        customer = get_object_or_404(Customer, pk=customer_id, enterprise_id=store.enterprise_id)
        as_of = _parse_date(request.query_params.get("as_of"), date.today())
        payload = predict_next_order_for_customer(
            store=store,
            customer=customer,
            as_of=as_of,
            actor=request.user,
        )
        return Response(payload)


class CustomerChurnRiskAPIView(APIView):
    """List customers with significant activity drop (churn risk)."""

    required_module_code = "CLIENT_INTEL"
    permission_classes = [IsAuthenticated, IsStoreMember, FeatureAnalyticsEnabled]

    def get(self, request):
        store = _resolve_store(request)
        if not store:
            return Response({"detail": "Acces boutique refuse."}, status=status.HTTP_403_FORBIDDEN)

        as_of = _parse_date(request.query_params.get("as_of"), date.today())
        window_days = _parse_int(request.query_params.get("window_days"), 30, minimum=7, maximum=90)
        drop_threshold_pct = _parse_decimal(request.query_params.get("drop_threshold_pct"), "30")
        limit = _parse_int(request.query_params.get("limit"), 50, minimum=1, maximum=500)

        rows = list_churn_risk_customers(
            store=store,
            as_of=as_of,
            window_days=window_days,
            drop_threshold_pct=drop_threshold_pct,
            limit=limit,
            actor=request.user,
        )
        return Response(
            {
                "store_id": str(store.id),
                "as_of": str(as_of),
                "window_days": window_days,
                "drop_threshold_pct": str(drop_threshold_pct),
                "total": len(rows),
                "items": rows,
            }
        )


class CustomerInsightsAPIView(APIView):
    """Aggregated customer intelligence snapshot for dashboard usage."""

    required_module_code = "CLIENT_INTEL"
    permission_classes = [IsAuthenticated, IsStoreMember, FeatureAnalyticsEnabled]

    def get(self, request):
        store = _resolve_store(request)
        if not store:
            return Response({"detail": "Acces boutique refuse."}, status=status.HTTP_403_FORBIDDEN)

        today = date.today()
        period_month = _parse_period_month(request.query_params.get("period"), today)
        if period_month is None:
            return Response(
                {"detail": "Parametre period invalide. Format attendu: YYYY-MM."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        limit = _parse_int(request.query_params.get("limit"), 10, minimum=1, maximum=100)
        refresh = request.query_params.get("refresh") == "1"

        if refresh:
            top_items = refresh_top_clients_month(
                store=store,
                period_month=period_month,
                limit=limit,
                actor=request.user,
            )
        else:
            top_items = _serialize_top_from_cache(store, period_month, limit=limit)
            if not top_items:
                top_items = refresh_top_clients_month(
                    store=store,
                    period_month=period_month,
                    limit=limit,
                    actor=request.user,
                )

        as_of = _parse_date(request.query_params.get("as_of"), today)
        dormant_preview = list_dormant_customers(store=store, as_of=as_of, actor=request.user)[:5]
        segment_rows = (
            CustomerScoreSnapshot.objects
            .filter(store=store, as_of_date=as_of)
            .values("segment")
            .annotate(count=Count("id"))
            .order_by()
        )
        segment_distribution = {row["segment"]: row["count"] for row in segment_rows}
        if not segment_distribution and top_items:
            for item in top_items[: min(5, len(top_items))]:
                customer = Customer.objects.filter(pk=item["customer_id"]).only("id", "enterprise_id").first()
                if customer:
                    compute_customer_score(store=store, customer=customer, as_of=as_of, actor=request.user)
            segment_rows = (
                CustomerScoreSnapshot.objects
                .filter(store=store, as_of_date=as_of)
                .values("segment")
                .annotate(count=Count("id"))
                .order_by()
            )
            segment_distribution = {row["segment"]: row["count"] for row in segment_rows}

        open_alerts = (
            CustomerIntelligenceAlert.objects
            .filter(store=store, status=CustomerIntelligenceAlert.Status.OPEN)
            .values("alert_type")
            .annotate(count=Count("id"))
            .order_by()
        )
        alerts_by_type = {row["alert_type"]: row["count"] for row in open_alerts}

        return Response(
            {
                "store_id": str(store.id),
                "period": period_month.strftime("%Y-%m"),
                "as_of": str(as_of),
                "top_clients": top_items,
                "dormant_preview": dormant_preview,
                "segment_distribution": segment_distribution,
                "open_alerts": alerts_by_type,
            }
        )


class CustomerAnalyticsRulesAPIView(APIView):
    """Read/update versioned customer analytics rules for one store."""

    required_module_code = "CLIENT_INTEL"
    permission_classes = [IsAuthenticated, IsManagerOrAdmin, FeatureAnalyticsEnabled]

    def get(self, request):
        store = _resolve_store(request)
        if not store:
            return Response({"detail": "Acces boutique refuse."}, status=status.HTTP_403_FORBIDDEN)
        as_of = _parse_date(request.query_params.get("as_of"), date.today())
        ruleset = get_or_create_active_ruleset(store=store, actor=request.user, as_of=as_of)
        return Response(_serialize_ruleset(ruleset))

    def post(self, request):
        store = _resolve_store(request)
        if not store:
            return Response({"detail": "Acces boutique refuse."}, status=status.HTTP_403_FORBIDDEN)
        payload = request.data if isinstance(request.data, dict) else {}
        try:
            ruleset = upsert_ruleset(store=store, actor=request.user, payload=payload)
        except (TypeError, ValueError, InvalidOperation):
            return Response(
                {"detail": "Payload invalide pour creation de regles analytics."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(_serialize_ruleset(ruleset), status=status.HTTP_201_CREATED)
