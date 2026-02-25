"""DG dashboard -- aggregates seller, cashier and stock performance."""
from __future__ import annotations

import logging
from datetime import datetime, timezone as dt_timezone
from decimal import Decimal

from django.db.models import Avg, Count, Sum
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsStoreMember, ModuleAnalyticsDGEnabled
from cashier.cashier_analytics_engine import CashierAnalyticsEngine
from stock.stock_analytics_engine import StockAnalyticsEngine
from stores.models import Store

logger = logging.getLogger("boutique")


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


def _period_bounds(period: str):
    year, month = int(period[:4]), int(period[5:7])
    start = datetime(year, month, 1, tzinfo=dt_timezone.utc)
    if month == 12:
        end = datetime(year + 1, 1, 1, tzinfo=dt_timezone.utc)
    else:
        end = datetime(year, month + 1, 1, tzinfo=dt_timezone.utc)
    return start, end


class DGDashboardView(APIView):
    """
    GET /api/v1/dg/dashboard/?store=&period=
    Aggregates seller, cashier and stock analytics into a single executive view.
    """

    permission_classes = [IsAuthenticated, IsStoreMember, ModuleAnalyticsDGEnabled]

    def get(self, request):
        from cashier.models import Payment
        from objectives.engine import ObjectiveCalculationEngine
        from objectives.models import SellerMonthlyStats
        from sales.models import Sale

        store = _require_store(request)
        if not store:
            return Response({"detail": "Parametre store requis."}, status=400)

        if not request.user.is_superuser and getattr(request.user, "role", None) not in ("ADMIN", "MANAGER"):
            return Response({"detail": "Acces reserve aux managers et admins."}, status=403)

        period = request.query_params.get("period") or _current_period()
        if not _is_valid_period(period):
            return Response({"detail": "Format de periode invalide (attendu: YYYY-MM)."}, status=400)

        start, end = _period_bounds(period)
        store_id = str(store.id)

        # 1) Stock
        stock_engine = StockAnalyticsEngine(store_id=store_id)
        stock_kpis = stock_engine.compute_kpis()
        stock_score = stock_engine.compute_health_score(stock_kpis)
        rupture_risk = stock_engine.compute_rupture_risk()
        critical_ruptures = [r for r in rupture_risk if r["urgency"] == "CRITICAL"]

        # 2) Cashiers
        cashier_engine = CashierAnalyticsEngine(store_id=store_id)
        cashier_team = cashier_engine.compute_team_overview(period)
        avg_cashier_score = 50.0
        if cashier_team:
            avg_cashier_score = sum(m["score"]["total"] for m in cashier_team) / len(cashier_team)
        top_cashiers = [
            {
                "id": m["cashier_id"],
                "name": m["cashier_name"],
                "score": m["score"]["total"],
                "segment": m["score"]["segment"],
                "total_collected": m["kpis"]["total_collected"],
            }
            for m in cashier_team[:3]
        ]

        # 3) Sellers
        seller_stats_qs = (
            SellerMonthlyStats.objects
            .filter(store_id=store_id, period=period)
            .select_related("seller")
            .order_by("-gross_amount")
        )

        obj_engine = ObjectiveCalculationEngine(store_id=store_id)
        seller_scores: list[float] = []
        scored_sellers: list[dict] = []

        for stat in seller_stats_qs:
            try:
                score_360 = obj_engine.compute_score_360(stat, period)
            except Exception:
                logger.warning(
                    "DG dashboard: seller score computation failed",
                    extra={"store_id": store_id, "period": period, "seller_id": str(stat.seller_id)},
                    exc_info=True,
                )
                continue

            score_total = float(score_360["total"])
            seller_scores.append(score_total)
            scored_sellers.append(
                {
                    "id": str(stat.seller_id),
                    "name": stat.seller.get_full_name() or stat.seller.email,
                    "gross_amount": str(stat.gross_amount),
                    "score_360": score_total,
                    "current_tier_name": stat.current_tier_name or "-",
                }
            )

        top_sellers = sorted(scored_sellers, key=lambda x: x["score_360"], reverse=True)[:3]
        avg_seller_score = sum(seller_scores) / len(seller_scores) if seller_scores else 50.0

        # 4) Revenue KPIs
        sales_qs = Sale.objects.filter(
            store=store,
            created_at__gte=start,
            created_at__lt=end,
        )
        revenue_agg = (
            sales_qs
            .filter(status__in=["PAID", "PARTIALLY_PAID", "REFUNDED"])
            .aggregate(
                total_sales=Sum("total"),
                sale_count=Count("id"),
                avg_basket=Avg("total"),
            )
        )
        cancel_count = sales_qs.filter(status="CANCELLED").count()
        total_count = sales_qs.count()
        refund_agg = sales_qs.filter(status="REFUNDED").aggregate(amt=Sum("total"))

        payments_in_period = Payment.objects.filter(
            store=store,
            created_at__gte=start,
            created_at__lt=end,
        )
        total_collected = payments_in_period.aggregate(t=Sum("amount"))["t"] or Decimal("0")
        collected_on_period_sales = (
            payments_in_period
            .filter(sale__created_at__gte=start, sale__created_at__lt=end)
            .aggregate(t=Sum("amount"))["t"] or Decimal("0")
        )

        total_sales = revenue_agg["total_sales"] or Decimal("0")
        sale_count = revenue_agg["sale_count"] or 0
        avg_basket = revenue_agg["avg_basket"] or Decimal("0")
        cancellation_rate = cancel_count / max(total_count, 1)
        refund_amount = refund_agg["amt"] or Decimal("0")
        collection_rate = (
            float(collected_on_period_sales) / float(total_sales)
            if total_sales
            else 0.0
        )
        cash_in_rate = (
            float(total_collected) / float(total_sales)
            if total_sales
            else 0.0
        )

        # 5) Global score
        global_score = round(
            avg_seller_score * 0.40 + avg_cashier_score * 0.30 + stock_score["total"] * 0.30,
            1,
        )

        # 6) Organizational alerts
        org_alerts = []

        if avg_cashier_score < 45:
            org_alerts.append(
                {
                    "type": "CASHIER_RISK",
                    "severity": "CRITICAL",
                    "title": "Equipe caisse en difficulte",
                    "detail": f"Score moyen caissiers: {avg_cashier_score:.0f}/100 - intervention requise",
                }
            )
        elif avg_cashier_score < 65:
            org_alerts.append(
                {
                    "type": "CASHIER_RISK",
                    "severity": "WARNING",
                    "title": "Performance caissiers degradee",
                    "detail": f"Score moyen caissiers: {avg_cashier_score:.0f}/100 - coaching recommande",
                }
            )

        if seller_scores:
            if avg_seller_score < 40:
                org_alerts.append(
                    {
                        "type": "SELLER_UNDERPERFORMANCE",
                        "severity": "CRITICAL",
                        "title": "Equipe vendeurs sous objectif",
                        "detail": f"Score 360 moyen: {avg_seller_score:.0f}/100",
                    }
                )
            elif avg_seller_score < 60:
                org_alerts.append(
                    {
                        "type": "SELLER_UNDERPERFORMANCE",
                        "severity": "WARNING",
                        "title": "Vendeurs sous-performants ce mois",
                        "detail": f"Score 360 moyen: {avg_seller_score:.0f}/100 - session coaching recommandee",
                    }
                )

        if len(critical_ruptures) >= 3:
            org_alerts.append(
                {
                    "type": "STOCK_RUPTURE",
                    "severity": "CRITICAL",
                    "title": "Ruptures critiques imminentes",
                    "detail": f"{len(critical_ruptures)} produit(s) en rupture dans moins de 7 jours - commander en urgence",
                }
            )
        elif len(critical_ruptures) > 0:
            org_alerts.append(
                {
                    "type": "STOCK_RUPTURE",
                    "severity": "WARNING",
                    "title": "Risque de rupture de stock",
                    "detail": f"{len(critical_ruptures)} produit(s) critique(s) - reapprovisionner rapidement",
                }
            )

        if stock_kpis["dead_stock_count"] > 10:
            org_alerts.append(
                {
                    "type": "DEAD_STOCK",
                    "severity": "WARNING",
                    "title": "Volume de stock dormant eleve",
                    "detail": f"{stock_kpis['dead_stock_count']} references sans vente depuis 90 jours - impact tresorerie",
                }
            )

        if total_sales > 0:
            if collection_rate < 0.60:
                org_alerts.append(
                    {
                        "type": "REVENUE_DECLINE",
                        "severity": "CRITICAL",
                        "title": "Taux d'encaissement insuffisant",
                        "detail": f"Seulement {collection_rate*100:.0f}% du CA du mois est encaisse",
                    }
                )
            elif collection_rate < 0.80:
                org_alerts.append(
                    {
                        "type": "REVENUE_DECLINE",
                        "severity": "WARNING",
                        "title": "Encaissement a surveiller",
                        "detail": f"{collection_rate*100:.0f}% du CA du mois est encaisse",
                    }
                )

        if cancellation_rate > 0.20:
            org_alerts.append(
                {
                    "type": "HIGH_CANCELLATIONS",
                    "severity": "WARNING",
                    "title": "Taux d'annulation eleve",
                    "detail": f"{cancellation_rate*100:.0f}% des ventes annulees - verifier le processus de validation",
                }
            )

        return Response(
            {
                "period": period,
                "store_id": store_id,
                "global_score": global_score,
                "scores": {
                    "sellers": round(avg_seller_score, 1),
                    "cashiers": round(avg_cashier_score, 1),
                    "stock": stock_score["total"],
                },
                "revenue": {
                    "total_sales": str(total_sales),
                    "total_collected": str(total_collected),
                    "collected_on_period_sales": str(collected_on_period_sales),
                    "sale_count": sale_count,
                    "avg_basket": str(avg_basket),
                    "cancellation_rate": round(cancellation_rate * 100, 1),
                    "refund_amount": str(refund_amount),
                    "collection_rate_cohort": round(collection_rate * 100, 1),
                    "cash_in_rate": round(cash_in_rate * 100, 1),
                    "collection_rate": round(collection_rate * 100, 1),
                },
                "team": {
                    "seller_count": seller_stats_qs.count(),
                    "cashier_count": len(cashier_team),
                },
                "stock_summary": {
                    "health_score": stock_score["total"],
                    "segment": stock_score["segment"],
                    "low_stock_count": stock_kpis["low_stock_count"],
                    "dead_stock_count": stock_kpis["dead_stock_count"],
                    "critical_ruptures": len(critical_ruptures),
                    "total_stock_value": stock_kpis["total_stock_value"],
                },
                "top_sellers": top_sellers,
                "top_cashiers": top_cashiers,
                "org_alerts": org_alerts,
            }
        )
