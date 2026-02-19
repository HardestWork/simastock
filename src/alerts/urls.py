"""URL configuration for the alerts app."""
from django.urls import path

from alerts import views

app_name = "alerts"

urlpatterns = [
    path("", views.AlertListView.as_view(), name="alert-list"),
    path("<uuid:pk>/", views.AlertDetailView.as_view(), name="alert-detail"),
    path(
        "<uuid:pk>/mark-read/",
        views.AlertMarkReadView.as_view(),
        name="alert-mark-read",
    ),
    path(
        "mark-all-read/",
        views.AlertMarkAllReadView.as_view(),
        name="alert-mark-all-read",
    ),
]
