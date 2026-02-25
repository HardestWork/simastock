"""API views for stock analytics."""
from __future__ import annotations

from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import FeatureStockManagementEnabled, IsStoreMember
from stock.stock_analytics_engine import StockAnalyticsEngine
from stores.models import Store, StoreUser


def _require_store(request):
    store_id = request.query_params.get("store") or getattr(request, "current_store_id", None)
    if not store_id:
        return None
    try:
        return Store.objects.get(id=store_id)
    except Store.DoesNotExist:
        return None


def _current_period() -> str:
    now = timezone.now()
    return f"{now.year}-{str(now.month).zfill(2)}"


def _is_valid_period(period: str) -> bool:
    try:
        year_raw, month_raw = period.split("-")
        if len(year_raw) != 4:
            return False
        month = int(month_raw)
        return 1 <= month <= 12
    except (TypeError, ValueError):
        return False


def _can_access_stock_analytics(request, store: Store) -> bool:
    if request.user.is_superuser:
        return True

    role = getattr(request.user, "role", None)
    if role in ("ADMIN", "MANAGER", "STOCKER"):
        return True

    if store.is_feature_enabled("advanced_permissions"):
        membership = StoreUser.objects.filter(store=store, user=request.user).first()
        if membership and membership.has_capability("CAN_STOCK"):
            return True

    return False


class StockAnalyticsDashboardView(APIView):
    """
    GET /api/v1/stock-analytics/dashboard/?store=&period=
    Returns stock health score, KPIs, rotation, dead stock, rupture risk,
    suspicious adjustments.
    """

    required_module_code = "ANALYTICS_STOCK"
    permission_classes = [
        IsAuthenticated,
        IsStoreMember,
        FeatureStockManagementEnabled,
    ]

    def get(self, request):
        store = _require_store(request)
        if not store:
            return Response({"detail": "Parametre store requis."}, status=400)
        if not _can_access_stock_analytics(request, store):
            return Response({"detail": "Acces refuse."}, status=403)

        period = request.query_params.get("period") or _current_period()
        if not _is_valid_period(period):
            return Response({"detail": "Format de periode invalide (attendu: YYYY-MM)."}, status=400)

        engine = StockAnalyticsEngine(store_id=str(store.id))
        kpis = engine.compute_kpis()
        score = engine.compute_health_score(kpis)
        rotation = engine.compute_rotation(period)
        dead_stock = engine.get_dead_stock(days=90)
        rupture_risk = engine.compute_rupture_risk()
        suspicious = engine.compute_suspicious_adjustments(period)

        return Response(
            {
                "store_id": str(store.id),
                "period": period,
                "kpis": kpis,
                "score": score,
                "top_rotation": rotation["top_rotation"],
                "bottom_rotation": rotation["bottom_rotation"],
                "dead_stock": dead_stock,
                "rupture_risk": rupture_risk,
                "suspicious_adjustments": suspicious,
            }
        )


class StockAnalyticsAlertsView(APIView):
    """
    GET /api/v1/stock-analytics/alerts/?store=
    Quick alerts: critical ruptures + dead stock count.
    """

    required_module_code = "ANALYTICS_STOCK"
    permission_classes = [
        IsAuthenticated,
        IsStoreMember,
        FeatureStockManagementEnabled,
    ]

    def get(self, request):
        store = _require_store(request)
        if not store:
            return Response({"detail": "Parametre store requis."}, status=400)
        if not _can_access_stock_analytics(request, store):
            return Response({"detail": "Acces refuse."}, status=403)

        engine = StockAnalyticsEngine(store_id=str(store.id))
        kpis = engine.compute_kpis()
        rupture_risk = engine.compute_rupture_risk()
        critical_ruptures = [r for r in rupture_risk if r["urgency"] == "CRITICAL"]
        warning_ruptures = [r for r in rupture_risk if r["urgency"] == "WARNING"]

        return Response(
            {
                "store_id": str(store.id),
                "low_stock_count": kpis["low_stock_count"],
                "out_of_stock_count": kpis["out_of_stock_count"],
                "dead_stock_count": kpis["dead_stock_count"],
                "critical_ruptures": critical_ruptures,
                "warning_ruptures": warning_ruptures,
            }
        )
