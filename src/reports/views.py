"""Views for the reports and dashboard app."""
import json
import logging
from datetime import date, timedelta

from django.contrib.auth.mixins import LoginRequiredMixin
from django.http import JsonResponse
from django.views import View
from django.views.generic import TemplateView

from accounts.models import User
from reports.forms import ExportForm, ReportFilterForm
from reports.services import (
    export_to_csv,
    export_to_excel,
    get_cashier_report,
    get_credit_report,
    get_dashboard_kpis,
    get_sales_report,
    get_stock_report,
)

logger = logging.getLogger("boutique")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_store(request):
    """Return the store to use for the current request."""
    return getattr(request, "current_store", None)


def _parse_dates(request):
    """Extract date_from / date_to from GET params, with sensible defaults."""
    today = date.today()
    date_from = request.GET.get("date_from")
    date_to = request.GET.get("date_to")

    if date_from:
        try:
            date_from = date.fromisoformat(date_from)
        except (ValueError, TypeError):
            date_from = today - timedelta(days=30)
    else:
        date_from = today - timedelta(days=30)

    if date_to:
        try:
            date_to = date.fromisoformat(date_to)
        except (ValueError, TypeError):
            date_to = today
    else:
        date_to = today

    return date_from, date_to


# =========================================================================
# Dashboard
# =========================================================================

class DashboardView(LoginRequiredMixin, TemplateView):
    """Main dashboard view.

    Displays different KPIs depending on the user's role:
    * ADMIN / MANAGER -- full overview (CA, orders, avg basket, margin,
      top products, stock alerts, credit alerts).
    * SALES -- personal sales stats, pending sales, top-selling products.
    * CASHIER -- shift stats, pending payments count, today's collections.
    """

    template_name = "dashboard/dashboard.html"

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        store = _get_store(self.request)
        user = self.request.user
        today = date.today()
        yesterday = today - timedelta(days=1)
        last_week = today - timedelta(days=7)

        if not store:
            ctx["no_store"] = True
            return ctx

        # -- Common KPIs for all roles --
        kpis = get_dashboard_kpis(store)
        ctx.update(kpis)

        # Period comparisons
        kpis_yesterday = get_dashboard_kpis(store, date_from=yesterday, date_to=yesterday)
        kpis_last_week = get_dashboard_kpis(store, date_from=last_week, date_to=last_week)
        ctx["yesterday_sales"] = kpis_yesterday.get("today_sales", 0)
        ctx["last_week_sales"] = kpis_last_week.get("today_sales", 0)

        # Role-specific data
        if user.role in (User.Role.ADMIN, User.Role.MANAGER):
            ctx["show_full_dashboard"] = True
        elif user.role == User.Role.SALES:
            ctx["show_sales_dashboard"] = True
            ctx["seller_user"] = user
        elif user.role == User.Role.CASHIER:
            ctx["show_cashier_dashboard"] = True
            ctx["cashier_user"] = user

        return ctx


class DashboardKPIDataView(LoginRequiredMixin, View):
    """Return JSON data for dashboard charts (HTMX / fetch endpoint).

    Returns the sales trend for the last 30 days as a list of
    ``{date, total_sales, total_orders}`` objects.
    """

    def get(self, request, *args, **kwargs):
        store = _get_store(request)
        if not store:
            return JsonResponse({"error": "Aucune boutique selectionnee."}, status=400)

        from reports.models import KPISnapshot

        today = date.today()
        date_from = today - timedelta(days=30)

        snapshots = (
            KPISnapshot.objects
            .filter(store=store, date__gte=date_from, date__lte=today)
            .order_by("date")
            .values("date", "total_sales", "total_orders", "net_sales")
        )

        data = []
        for snap in snapshots:
            data.append({
                "date": snap["date"].isoformat(),
                "total_sales": float(snap["total_sales"]),
                "total_orders": snap["total_orders"],
                "net_sales": float(snap["net_sales"]),
            })

        return JsonResponse({"trend": data})


# =========================================================================
# Reports index
# =========================================================================

class ReportsIndexView(LoginRequiredMixin, TemplateView):
    """Landing page listing all available reports."""

    template_name = "reports/reports_index.html"

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        store = _get_store(self.request)
        date_from, date_to = _parse_dates(self.request)

        ctx["filter_form"] = ReportFilterForm(
            self.request.GET,
            user=self.request.user,
        )
        ctx["export_form"] = ExportForm()
        ctx["date_from"] = date_from
        ctx["date_to"] = date_to
        if store:
            ctx["kpis"] = get_dashboard_kpis(store, date_from=date_from, date_to=date_to)
        else:
            ctx["kpis"] = {}
        return ctx


# =========================================================================
# Sales report
# =========================================================================

class SalesReportView(LoginRequiredMixin, TemplateView):
    """Detailed sales report with filters."""

    template_name = "reports/sales_report.html"

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        store = _get_store(self.request)
        date_from, date_to = _parse_dates(self.request)

        if store:
            report = get_sales_report(store, date_from, date_to)
            ctx["report"] = report

        ctx["filter_form"] = ReportFilterForm(
            self.request.GET,
            user=self.request.user,
        )
        ctx["export_form"] = ExportForm()
        ctx["date_from"] = date_from
        ctx["date_to"] = date_to
        return ctx


# =========================================================================
# Stock report
# =========================================================================

class StockReportView(LoginRequiredMixin, TemplateView):
    """Stock levels, movements, ruptures, and dormant products."""

    template_name = "reports/stock_report.html"

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        store = _get_store(self.request)
        date_from, date_to = _parse_dates(self.request)

        if store:
            report = get_stock_report(store)
            ctx["report"] = report

        ctx["filter_form"] = ReportFilterForm(
            self.request.GET,
            user=self.request.user,
        )
        ctx["export_form"] = ExportForm()
        ctx["date_from"] = date_from
        ctx["date_to"] = date_to
        return ctx


# =========================================================================
# Cashier report
# =========================================================================

class CashierReportView(LoginRequiredMixin, TemplateView):
    """Shift summaries, variance, and collections by payment method."""

    template_name = "reports/cashier_report.html"

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        store = _get_store(self.request)
        date_from, date_to = _parse_dates(self.request)

        if store:
            report = get_cashier_report(store, date_from, date_to)
            ctx["report"] = report

        ctx["filter_form"] = ReportFilterForm(
            self.request.GET,
            user=self.request.user,
        )
        ctx["export_form"] = ExportForm()
        ctx["date_from"] = date_from
        ctx["date_to"] = date_to
        return ctx


# =========================================================================
# Credit report
# =========================================================================

class CreditReportView(LoginRequiredMixin, TemplateView):
    """Outstanding credits, overdue amounts, and DSO."""

    template_name = "reports/credit_report.html"

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        store = _get_store(self.request)
        date_from, date_to = _parse_dates(self.request)

        if store:
            report = get_credit_report(store)
            ctx["report"] = report

        ctx["filter_form"] = ReportFilterForm(
            self.request.GET,
            user=self.request.user,
        )
        ctx["export_form"] = ExportForm()
        ctx["date_from"] = date_from
        ctx["date_to"] = date_to
        return ctx


# =========================================================================
# Export
# =========================================================================

class ExportView(LoginRequiredMixin, View):
    """Handle CSV / Excel / PDF export of report data.

    Expects GET parameters:
      - report_type: sales | stock | cashier | credit
      - format: csv | excel | pdf
      - date_from, date_to (optional)
    """

    def get(self, request, *args, **kwargs):
        store = _get_store(request)
        if not store:
            from django.shortcuts import redirect
            return redirect("reports:reports-index")

        report_type = request.GET.get("report_type", "sales")
        export_format = request.GET.get("format", "excel")
        date_from, date_to = _parse_dates(request)

        # Build report data based on type
        if report_type == "sales":
            data = get_sales_report(store, date_from, date_to)
        elif report_type == "stock":
            data = get_stock_report(store)
        elif report_type == "cashier":
            data = get_cashier_report(store, date_from, date_to)
        elif report_type == "credit":
            data = get_credit_report(store)
        else:
            data = get_sales_report(store, date_from, date_to)

        # Export
        if export_format == "csv":
            return export_to_csv(data, report_type)
        elif export_format == "excel":
            return export_to_excel(data, report_type)
        elif export_format == "pdf":
            # PDF generation is a placeholder -- requires a PDF library
            # (e.g. weasyprint, reportlab). For now, fall back to Excel.
            logger.warning("PDF export requested but not yet implemented; falling back to Excel.")
            return export_to_excel(data, report_type)

        return export_to_excel(data, report_type)
