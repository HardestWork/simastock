"""URL configuration for the stock app."""
from django.urls import path

from . import views

app_name = "stock"

urlpatterns = [
    # Stock levels
    path("", views.StockListView.as_view(), name="stock-list"),
    path("movements/", views.MovementListView.as_view(), name="movement-list"),
    path("adjust/", views.StockAdjustView.as_view(), name="stock-adjust"),
    path(
        "adjust/products/search/",
        views.StockEntryProductSearchView.as_view(),
        name="stock-adjust-product-search",
    ),
    path("entries/", views.StockEntryView.as_view(), name="stock-entry"),
    path(
        "entries/products/search/",
        views.StockEntryProductSearchView.as_view(),
        name="stock-entry-product-search",
    ),
    path(
        "movements/document/<uuid:batch_id>/",
        views.StockMovementDocumentView.as_view(),
        name="movement-document",
    ),

    # Transfers
    path("transfers/", views.TransferListView.as_view(), name="transfer-list"),
    path("transfers/create/", views.TransferCreateView.as_view(), name="transfer-create"),
    path("transfers/<uuid:pk>/", views.TransferDetailView.as_view(), name="transfer-detail"),
    path("transfers/<uuid:pk>/approve/", views.TransferApproveView.as_view(), name="transfer-approve"),
    path("transfers/<uuid:pk>/receive/", views.TransferReceiveView.as_view(), name="transfer-receive"),

    # Inventory counts
    path("counts/", views.StockCountListView.as_view(), name="count-list"),
    path("counts/create/", views.StockCountCreateView.as_view(), name="count-create"),
    path("counts/<uuid:pk>/", views.StockCountDetailView.as_view(), name="count-detail"),
    path("counts/<uuid:pk>/complete/", views.StockCountCompleteView.as_view(), name="count-complete"),
]
