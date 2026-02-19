"""URL configuration for the sales app."""
from django.urls import path

from sales import views

app_name = "sales"

urlpatterns = [
    # ------------------------------------------------------------------
    # Sale CRUD & workflow
    # ------------------------------------------------------------------
    path(
        "",
        views.SaleListView.as_view(),
        name="sale-list",
    ),
    path(
        "my/",
        views.MySalesView.as_view(),
        name="my-sales",
    ),
    path(
        "create/",
        views.SaleCreateView.as_view(),
        name="sale-create",
    ),
    path(
        "products/search/",
        views.ProductSearchView.as_view(),
        name="product-search",
    ),
    path(
        "<uuid:pk>/",
        views.SaleDetailView.as_view(),
        name="sale-detail",
    ),
    path(
        "<uuid:pk>/snapshot/",
        views.SaleSnapshotView.as_view(),
        name="sale-snapshot",
    ),
    path(
        "<uuid:pk>/edit/",
        views.SaleEditView.as_view(),
        name="sale-edit",
    ),
    path(
        "<uuid:pk>/customer-create/",
        views.SaleCustomerQuickCreateView.as_view(),
        name="sale-customer-create",
    ),
    path(
        "<uuid:pk>/submit/",
        views.SaleSubmitView.as_view(),
        name="sale-submit",
    ),
    path(
        "<uuid:pk>/receipt/",
        views.SaleReceiptView.as_view(),
        name="sale-receipt",
    ),
    path(
        "<uuid:pk>/invoice/",
        views.SaleInvoiceView.as_view(),
        name="sale-invoice",
    ),
    path(
        "<uuid:pk>/ticket/",
        views.SaleReceiptView.as_view(),
        name="sale-ticket",
    ),
    path(
        "<uuid:pk>/cancel/",
        views.SaleCancelView.as_view(),
        name="sale-cancel",
    ),

    # ------------------------------------------------------------------
    # HTMX item management
    # ------------------------------------------------------------------
    path(
        "<uuid:pk>/add-item/",
        views.AddItemView.as_view(),
        name="sale-add-item",
    ),
    path(
        "<uuid:pk>/remove-item/<uuid:item_pk>/",
        views.RemoveItemView.as_view(),
        name="sale-remove-item",
    ),
    path(
        "<uuid:pk>/update-qty/<uuid:item_pk>/",
        views.UpdateItemQtyView.as_view(),
        name="sale-update-qty",
    ),

    # ------------------------------------------------------------------
    # Refund
    # ------------------------------------------------------------------
    path(
        "<uuid:pk>/refund/",
        views.RefundCreateView.as_view(),
        name="refund-create",
    ),
]
