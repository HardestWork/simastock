"""URL configuration for the cashier app."""
from django.urls import path

from . import views

app_name = "cashier"

urlpatterns = [
    # Dashboard
    path(
        "",
        views.CashierDashboardView.as_view(),
        name="dashboard",
    ),

    # Pending sales
    path(
        "pending-sales/",
        views.PendingSalesView.as_view(),
        name="pending-sales",
    ),

    # Process payment for a sale
    path(
        "process-payment/<uuid:sale_id>/",
        views.ProcessPaymentView.as_view(),
        name="process-payment",
    ),

    # Cash shifts
    path(
        "shift-open/",
        views.OpenShiftView.as_view(),
        name="shift-open",
    ),
    path(
        "shift-close/",
        views.CloseShiftView.as_view(),
        name="shift-close",
    ),
    path(
        "shift-list/",
        views.ShiftListView.as_view(),
        name="shift-list",
    ),
    path(
        "shift-detail/<uuid:pk>/",
        views.ShiftDetailView.as_view(),
        name="shift-detail",
    ),
    path(
        "shift-report-pdf/<uuid:pk>/",
        views.ShiftReportPDFView.as_view(),
        name="shift-report-pdf",
    ),

    # Payments
    path(
        "payment-list/",
        views.PaymentListView.as_view(),
        name="payment-list",
    ),
]
