"""Views for strategic analytics dashboard."""
import json
from datetime import date, timedelta

from django.contrib import messages
from django.contrib.auth.mixins import LoginRequiredMixin, UserPassesTestMixin
from django.http import JsonResponse
from django.views import View
from django.views.generic import TemplateView

from analytics.models import (
    ABCAnalysis,
    CustomerCreditScore,
    FraudEvent,
    ReorderRecommendation,
    SalesForecast,
)
from analytics.services import (
    build_strategic_dashboard,
    compute_abc_analysis,
    compute_credit_scores,
    compute_dynamic_reorder,
    compute_sales_forecast,
    detect_fraud_signals,
)
from stores.services import create_audit_log


def _parse_period(request):
    today = date.today()
    default_start = today - timedelta(days=29)
    raw_from = request.GET.get("date_from")
    raw_to = request.GET.get("date_to")
    try:
        date_from = date.fromisoformat(raw_from) if raw_from else default_start
    except (TypeError, ValueError):
        date_from = default_start
    try:
        date_to = date.fromisoformat(raw_to) if raw_to else today
    except (TypeError, ValueError):
        date_to = today
    if date_from > date_to:
        date_from, date_to = date_to, date_from
    return date_from, date_to


class StrategicAccessMixin(UserPassesTestMixin):
    """Only managers/admins can access strategic analytics."""

    def test_func(self):
        user = self.request.user
        return user.is_authenticated and user.role in ("ADMIN", "MANAGER")


class StrategicDashboardView(LoginRequiredMixin, StrategicAccessMixin, TemplateView):
    template_name = "analytics/strategic_dashboard.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        store = getattr(self.request, "current_store", None)
        date_from, date_to = _parse_period(self.request)
        context["date_from"] = date_from
        context["date_to"] = date_to

        if not store:
            context["no_store"] = True
            return context

        if not store.is_analytics_feature_enabled("dashboard_strategic"):
            context["dashboard_disabled"] = True
            context["feature_flags"] = store.effective_analytics_feature_flags
            return context

        if self.request.GET.get("refresh") == "1":
            compute_abc_analysis(store, date_from, date_to)
            compute_dynamic_reorder(store, as_of=date.today())
            compute_credit_scores(store, as_of=date.today())
            compute_sales_forecast(store, as_of=date.today())
            detect_fraud_signals(store, date_from=date_from, date_to=date_to)
            create_audit_log(
                actor=self.request.user,
                store=store,
                action="ANALYTICS_REFRESH",
                entity_type="Analytics",
                entity_id=str(store.pk),
                after={
                    "date_from": str(date_from),
                    "date_to": str(date_to),
                },
                ip=self.request.META.get("REMOTE_ADDR", ""),
            )
            messages.success(self.request, "Module intelligent recalcule.")

        payload = build_strategic_dashboard(store, date_from, date_to)
        context["kpi"] = payload
        context["feature_flags"] = payload.get("feature_flags", store.effective_analytics_feature_flags)

        context["abc_rows"] = ABCAnalysis.objects.none()
        if store.is_analytics_feature_enabled("abc_analysis"):
            context["abc_rows"] = (
                ABCAnalysis.objects.filter(
                    store=store,
                    period_start=date_from,
                    period_end=date_to,
                )
                .select_related("product")
                .order_by("abc_class", "-revenue")[:20]
            )

        context["reorder_rows"] = ReorderRecommendation.objects.none()
        if store.is_analytics_feature_enabled("dynamic_reorder"):
            context["reorder_rows"] = (
                ReorderRecommendation.objects.filter(store=store, computed_for=date.today())
                .select_related("product")
                .order_by("-suggested_order_qty")[:20]
            )

        context["credit_rows"] = CustomerCreditScore.objects.none()
        if store.is_analytics_feature_enabled("credit_scoring"):
            context["credit_rows"] = (
                CustomerCreditScore.objects.filter(store=store, computed_for=date.today())
                .select_related("customer")
                .order_by("score")[:20]
            )

        context["fraud_rows"] = FraudEvent.objects.none()
        if store.is_analytics_feature_enabled("fraud_detection"):
            context["fraud_rows"] = (
                FraudEvent.objects.filter(store=store, detected_on__gte=date_from, detected_on__lte=date_to)
                .select_related("sale")
                .order_by("-risk_score", "-created_at")[:20]
            )

        context["forecast_rows"] = SalesForecast.objects.none()
        if store.is_analytics_feature_enabled("sales_forecast"):
            context["forecast_rows"] = (
                SalesForecast.objects.filter(
                    store=store,
                    forecast_date__gt=date.today(),
                    forecast_date__lte=date.today() + timedelta(days=14),
                )
                .select_related("product")
                .order_by("-predicted_qty")[:20]
            )

        abc_chart = payload.get("abc_distribution", {})
        context["abc_labels_json"] = json.dumps(["A", "B", "C"])
        context["abc_revenue_json"] = json.dumps(
            [
                float(abc_chart.get("A", {}).get("revenue", 0)),
                float(abc_chart.get("B", {}).get("revenue", 0)),
                float(abc_chart.get("C", {}).get("revenue", 0)),
            ]
        )
        return context


class StrategicKPIJsonView(LoginRequiredMixin, StrategicAccessMixin, View):
    """JSON endpoint for strategic dashboard widgets."""

    def get(self, request, *args, **kwargs):
        store = getattr(request, "current_store", None)
        if not store:
            return JsonResponse({"error": "Aucune boutique selectionnee."}, status=400)
        if not store.is_analytics_feature_enabled("dashboard_strategic"):
            return JsonResponse({"error": "Dashboard strategique desactive pour cette boutique."}, status=403)

        date_from, date_to = _parse_period(request)
        payload = build_strategic_dashboard(store, date_from, date_to)
        serializable = {
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
        return JsonResponse(serializable)
