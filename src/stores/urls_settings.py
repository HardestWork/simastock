"""URL configuration for system settings (admin only)."""
from django.urls import path

from stores import views

app_name = "settings"

urlpatterns = [
    path("", views.system_settings, name="system_settings"),
]
