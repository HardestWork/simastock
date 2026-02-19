"""URL configuration for Boutique Management System."""
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from django.views.generic import RedirectView

urlpatterns = [
    path("accounts/", include("accounts.urls")),
    path("accounts/", include("allauth.urls")),
    path("stores/", include("stores.urls")),
    path("dashboard/", include("reports.urls_dashboard")),
    path("catalog/", include("catalog.urls")),
    path("stock/", include("stock.urls")),
    path("pos/", include("sales.urls")),
    path("cashier/", include("cashier.urls")),
    path("customers/", include("customers.urls")),
    path("credits/", include("credits.urls")),
    path("purchases/", include("purchases.urls")),
    path("reports/", include("reports.urls")),
    path("analytics/", include("analytics.urls")),
    path("alerts/", include("alerts.urls")),
    path("settings/", include("stores.urls_settings")),
    # API
    path("api/v1/", include("api.urls")),
    # Root redirect
    path("", RedirectView.as_view(url="/dashboard/", permanent=False)),
]

if getattr(settings, "ENABLE_DJANGO_ADMIN", False):
    urlpatterns.insert(0, path("admin/", admin.site.urls))

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    if "debug_toolbar" in settings.INSTALLED_APPS:
        try:
            import debug_toolbar  # noqa: F401
            urlpatterns += [path("__debug__/", include("debug_toolbar.urls"))]
        except ImportError:
            pass
