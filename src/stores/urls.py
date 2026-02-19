"""URL configuration for the stores app."""
from django.urls import path

from stores import views

app_name = "stores"

urlpatterns = [
    # Enterprise
    path("enterprise/", views.enterprise_detail, name="enterprise-detail"),
    path("enterprise/edit/", views.enterprise_edit, name="enterprise-edit"),
    # Store list & switch
    path("", views.store_list, name="store-list"),
    path("switch/", views.store_switch, name="switch"),
    # Store CRUD
    path("create/", views.store_create, name="store-create"),
    path("<uuid:store_id>/", views.store_detail, name="store-detail"),
    path("<uuid:store_id>/edit/", views.store_edit, name="store-edit"),
]
