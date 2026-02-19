"""URL configuration for the reports app."""
from django.urls import path

from reports import views

app_name = "reports"

urlpatterns = [
    path("", views.ReportsIndexView.as_view(), name="reports-index"),
    path("sales/", views.SalesReportView.as_view(), name="sales-report"),
    path("stock/", views.StockReportView.as_view(), name="stock-report"),
    path("cashier/", views.CashierReportView.as_view(), name="cashier-report"),
    path("credit/", views.CreditReportView.as_view(), name="credit-report"),
    path("export/", views.ExportView.as_view(), name="export"),
]
