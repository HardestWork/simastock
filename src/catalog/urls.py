"""URL configuration for the catalog app."""
from django.urls import path

from . import views

app_name = "catalog"

urlpatterns = [
    # ------------------------------------------------------------------
    # Products
    # ------------------------------------------------------------------
    path(
        "products/",
        views.ProductListView.as_view(),
        name="product-list",
    ),
    path(
        "products/create/",
        views.ProductCreateView.as_view(),
        name="product-create",
    ),
    path(
        "products/<uuid:pk>/",
        views.ProductDetailView.as_view(),
        name="product-detail",
    ),
    path(
        "products/<uuid:pk>/edit/",
        views.ProductUpdateView.as_view(),
        name="product-edit",
    ),
    path(
        "products/import/",
        views.ProductImportView.as_view(),
        name="product-import",
    ),
    path(
        "products/export/",
        views.ProductExportView.as_view(),
        name="product-export",
    ),

    # ------------------------------------------------------------------
    # Categories
    # ------------------------------------------------------------------
    path(
        "categories/",
        views.CategoryListView.as_view(),
        name="category-list",
    ),
    path(
        "categories/create/",
        views.CategoryCreateView.as_view(),
        name="category-create",
    ),
    path(
        "categories/<uuid:pk>/edit/",
        views.CategoryUpdateView.as_view(),
        name="category-edit",
    ),

    # ------------------------------------------------------------------
    # Brands
    # ------------------------------------------------------------------
    path(
        "brands/",
        views.BrandListView.as_view(),
        name="brand-list",
    ),
    path(
        "brands/create/",
        views.BrandCreateView.as_view(),
        name="brand-create",
    ),
    path(
        "brands/<uuid:pk>/edit/",
        views.BrandUpdateView.as_view(),
        name="brand-edit",
    ),
]
