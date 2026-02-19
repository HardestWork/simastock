"""URL configuration for the credits app."""
from django.urls import path

from . import views

app_name = "credits"

urlpatterns = [
    # ------------------------------------------------------------------
    # Accounts
    # ------------------------------------------------------------------
    path(
        "",
        views.AccountListView.as_view(),
        name="account-list",
    ),
    path(
        "accounts/create/",
        views.AccountCreateView.as_view(),
        name="account-create",
    ),
    path(
        "accounts/<uuid:pk>/",
        views.AccountDetailView.as_view(),
        name="account-detail",
    ),

    # ------------------------------------------------------------------
    # Payments
    # ------------------------------------------------------------------
    path(
        "accounts/<uuid:pk>/payment/",
        views.CreditPaymentView.as_view(),
        name="credit-payment",
    ),
    path(
        "accounts/<uuid:pk>/repay-all/",
        views.CreditRepayAllView.as_view(),
        name="credit-repay-all",
    ),
    path(
        "accounts/<uuid:pk>/payments/<uuid:entry_id>/receipt/",
        views.CreditPaymentReceiptView.as_view(),
        name="credit-payment-receipt",
    ),

    # ------------------------------------------------------------------
    # Ledger
    # ------------------------------------------------------------------
    path(
        "accounts/<uuid:pk>/ledger/",
        views.LedgerView.as_view(),
        name="ledger",
    ),

    # ------------------------------------------------------------------
    # Schedules
    # ------------------------------------------------------------------
    path(
        "accounts/<uuid:pk>/schedules/",
        views.ScheduleListView.as_view(),
        name="schedule-list",
    ),
    path(
        "accounts/<uuid:pk>/schedules/create/",
        views.ScheduleCreateView.as_view(),
        name="schedule-create",
    ),

    # ------------------------------------------------------------------
    # Overdue
    # ------------------------------------------------------------------
    path(
        "overdue/",
        views.OverdueListView.as_view(),
        name="overdue-list",
    ),
]
