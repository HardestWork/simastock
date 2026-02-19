"""Views for the alerts app."""
import logging

from django.contrib import messages
from django.contrib.auth.mixins import LoginRequiredMixin
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect
from django.utils import timezone
from django.views import View
from django.views.generic import DetailView, ListView

from alerts.models import Alert

logger = logging.getLogger("boutique")


class AlertListView(LoginRequiredMixin, ListView):
    """List alerts for the current store with optional filters.

    Supported GET parameters:
      - type: filter by alert_type (e.g. LOW_STOCK, CASH_VARIANCE)
      - severity: filter by severity (INFO, WARNING, CRITICAL)
      - status: ``read`` or ``unread``
    """

    model = Alert
    template_name = "alerts/alert_list.html"
    context_object_name = "alerts"
    paginate_by = 25

    def get_queryset(self):
        store = getattr(self.request, "current_store", None)
        if not store:
            return Alert.objects.none()

        # Keep low-stock alerts fresh even when Celery beat is not running.
        try:
            from alerts.services import sync_low_stock_alerts_for_store
            sync_low_stock_alerts_for_store(store)
        except Exception:
            logger.warning(
                "Low-stock alert sync failed for store %s",
                store,
                exc_info=True,
            )

        qs = Alert.objects.filter(store=store).select_related("read_by")

        # Filter by type
        alert_type = self.request.GET.get("type")
        if alert_type and alert_type in dict(Alert.Type.choices):
            qs = qs.filter(alert_type=alert_type)

        # Filter by severity
        severity = self.request.GET.get("severity")
        if severity and severity in dict(Alert.Severity.choices):
            qs = qs.filter(severity=severity)

        # Filter by read status
        status = self.request.GET.get("status")
        if status == "read":
            qs = qs.filter(is_read=True)
        elif status == "unread":
            qs = qs.filter(is_read=False)

        return qs

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["alert_types"] = Alert.Type.choices
        ctx["severity_choices"] = Alert.Severity.choices
        ctx["current_type"] = self.request.GET.get("type", "")
        ctx["current_severity"] = self.request.GET.get("severity", "")
        ctx["current_status"] = self.request.GET.get("status", "")
        return ctx


class AlertDetailView(LoginRequiredMixin, DetailView):
    """Display a single alert and automatically mark it as read."""

    model = Alert
    template_name = "alerts/alert_detail.html"
    context_object_name = "alert"

    def get_queryset(self):
        store = getattr(self.request, "current_store", None)
        if not store:
            return Alert.objects.none()
        return Alert.objects.filter(store=store)

    def get_object(self, queryset=None):
        obj = super().get_object(queryset)
        # Auto-mark as read when viewed
        if not obj.is_read:
            obj.mark_as_read(self.request.user)
        return obj


class AlertMarkReadView(LoginRequiredMixin, View):
    """Mark a single alert as read (POST only).

    Returns a JSON response if the request is AJAX / htmx, otherwise
    redirects back to the alert list.
    """

    def post(self, request, pk, *args, **kwargs):
        store = getattr(request, "current_store", None)
        alert = get_object_or_404(Alert, pk=pk, store=store)

        alert.mark_as_read(request.user)

        # HTMX / AJAX response
        if request.headers.get("HX-Request") or request.headers.get("X-Requested-With") == "XMLHttpRequest":
            return JsonResponse({"status": "ok", "alert_id": str(pk)})

        messages.success(request, "Alerte marquee comme lue.")
        return redirect("alerts:alert-list")


class AlertMarkAllReadView(LoginRequiredMixin, View):
    """Mark all unread alerts for the current store as read (POST only)."""

    def post(self, request, *args, **kwargs):
        store = getattr(request, "current_store", None)
        if not store:
            messages.error(request, "Aucune boutique selectionnee.")
            return redirect("alerts:alert-list")

        updated = Alert.objects.filter(
            store=store,
            is_read=False,
        ).update(
            is_read=True,
            read_by=request.user,
            read_at=timezone.now(),
        )

        logger.info(
            "User %s marked %d alerts as read for store %s",
            request.user, updated, store,
        )

        # HTMX / AJAX response
        if request.headers.get("HX-Request") or request.headers.get("X-Requested-With") == "XMLHttpRequest":
            return JsonResponse({"status": "ok", "count": updated})

        messages.success(request, f"{updated} alerte(s) marquee(s) comme lue(s).")
        return redirect("alerts:alert-list")
