"""URL configuration for the customers app."""
from django.urls import path

from . import views

app_name = "customers"

urlpatterns = [
    path(
        "",
        views.CustomerListView.as_view(),
        name="customer-list",
    ),
    path(
        "create/",
        views.CustomerCreateView.as_view(),
        name="customer-create",
    ),
    path(
        "<uuid:pk>/",
        views.CustomerDetailView.as_view(),
        name="customer-detail",
    ),
    path(
        "<uuid:pk>/edit/",
        views.CustomerUpdateView.as_view(),
        name="customer-edit",
    ),
    path(
        "search/",
        views.CustomerSearchView.as_view(),
        name="customer-search",
    ),
]
