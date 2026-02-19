"""URL routes for analytics dashboard."""
from django.urls import path

from analytics import views

app_name = "analytics"

urlpatterns = [
    path("strategic/", views.StrategicDashboardView.as_view(), name="strategic-dashboard"),
    path("strategic/kpi-json/", views.StrategicKPIJsonView.as_view(), name="strategic-kpi-json"),
]

