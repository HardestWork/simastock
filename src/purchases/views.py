from django.contrib.auth.mixins import LoginRequiredMixin
from django.views.generic import ListView

from .models import GoodsReceipt, PurchaseOrder, Supplier


class SupplierListView(LoginRequiredMixin, ListView):
    model = Supplier
    template_name = "purchases/supplier_list.html"
    context_object_name = "suppliers"

    def get_queryset(self):
        enterprise = getattr(self.request, "current_enterprise", None)
        if enterprise:
            return Supplier.objects.filter(enterprise=enterprise).order_by("name")
        return Supplier.objects.none()


class PurchaseOrderListView(LoginRequiredMixin, ListView):
    model = PurchaseOrder
    template_name = "purchases/purchase_order_list.html"
    context_object_name = "purchase_orders"

    def get_queryset(self):
        return (
            PurchaseOrder.objects.filter(store=self.request.current_store)
            .select_related("supplier")
            .order_by("-created_at")
        )


class GoodsReceiptListView(LoginRequiredMixin, ListView):
    model = GoodsReceipt
    template_name = "purchases/goods_receipt_list.html"
    context_object_name = "receipts"

    def get_queryset(self):
        return (
            GoodsReceipt.objects.filter(store=self.request.current_store)
            .select_related("purchase_order", "received_by")
            .order_by("-created_at")
        )

