from django.urls import path

from .views import GoodsReceiptListView, PurchaseOrderListView, SupplierListView

app_name = "purchases"

urlpatterns = [
    path("suppliers/", SupplierListView.as_view(), name="supplier-list"),
    path("purchase-orders/", PurchaseOrderListView.as_view(), name="purchase-order-list"),
    path("receipts/", GoodsReceiptListView.as_view(), name="receipt-list"),
]

