"""API views for cashier analytics."""
from __future__ import annotations

from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import (
    FeatureCashierOperationsEnabled,
    IsCashier,
    IsStoreMember,
)
from cashier.cashier_analytics_engine import CashierAnalyticsEngine
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


class CashierAnalyticsDashboardView(APIView):
    """
    GET /api/v1/cashier-analytics/dashboard/?store=&period=
    Returns reliability score, KPIs, anomalies, payment methods, shift history
    for the currently authenticated cashier.
    """

    required_module_code = "ANALYTICS_CASHIER"
    permission_classes = [
        IsAuthenticated,
        IsStoreMember,
        IsCashier,
        FeatureCashierOperationsEnabled,
    ]

    def get(self, request):
        store = _require_store(request)
        if not store:
            return Response({"detail": "Parametre store requis."}, status=400)

        period = request.query_params.get("period") or _current_period()
        if not _is_valid_period(period):
            return Response({"detail": "Format de periode invalide (attendu: YYYY-MM)."}, status=400)

        cashier_id = str(request.user.id)
        engine = CashierAnalyticsEngine(store_id=str(store.id))
        kpis = engine.compute_kpis(cashier_id, period)
        score = engine.compute_reliability_score(cashier_id, period, kpis)
        anomalies = engine.compute_anomalies(cashier_id, period, kpis)
        methods = engine.compute_payment_methods(cashier_id, period)
        shifts = engine.compute_shift_history(cashier_id, period)

        cashier = request.user
        return Response(
            {
                "cashier": {
                    "id": cashier_id,
                    "name": cashier.get_full_name() or cashier.email,
                },
                "period": period,
                "kpis": kpis,
                "score": score,
                "anomalies": anomalies,
                "payment_methods": methods,
                "shifts": shifts,
            }
        )


class CashierAnalyticsTeamView(APIView):
    """
    GET /api/v1/cashier-analytics/team/?store=&period=
    Returns analytics for all cashiers in the store. Admin/Manager only.
    """

    required_module_code = "ANALYTICS_CASHIER"
    permission_classes = [
        IsAuthenticated,
        IsStoreMember,
        FeatureCashierOperationsEnabled,
    ]

    def get(self, request):
        store = _require_store(request)
        if not store:
            return Response({"detail": "Parametre store requis."}, status=400)

        if not request.user.is_superuser:
            membership = StoreUser.objects.filter(store=store, user=request.user).first()
            if not membership:
                return Response({"detail": "Acces refuse."}, status=403)
            role = getattr(request.user, "role", None)
            if role not in ("ADMIN", "MANAGER"):
                return Response({"detail": "Acces reserve aux managers et admins."}, status=403)

        period = request.query_params.get("period") or _current_period()
        if not _is_valid_period(period):
            return Response({"detail": "Format de periode invalide (attendu: YYYY-MM)."}, status=400)

        engine = CashierAnalyticsEngine(store_id=str(store.id))
        team = engine.compute_team_overview(period)

        return Response(
            {
                "period": period,
                "team": team,
            }
        )
