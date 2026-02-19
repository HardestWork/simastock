"""URL configuration for the dashboard (served under /dashboard/)."""
from django.urls import path

from reports import views

app_name = "dashboard"

urlpatterns = [
    path("", views.DashboardView.as_view(), name="index"),
    path(
        "kpi-data/",
        views.DashboardKPIDataView.as_view(),
        name="dashboard-kpi-data",
    ),
]
