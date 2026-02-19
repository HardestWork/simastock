"""Services for purchase orders and goods receipts."""
from django.db import models, transaction

from stock.services import adjust_stock
from stores.services import create_audit_log

from .models import GoodsReceipt, GoodsReceiptLine, PurchaseOrder


@transaction.atomic
def receive_goods(
    purchase_order: PurchaseOrder,
    receipt_number: str,
    lines: list[dict],
    actor,
    notes: str = "",
) -> GoodsReceipt:
    """Register a goods receipt and increase stock for received quantities."""
    if purchase_order.status not in (
        PurchaseOrder.Status.SUBMITTED,
        PurchaseOrder.Status.PARTIALLY_RECEIVED,
    ):
        raise ValueError("Ce bon de commande ne peut pas etre receptionne.")

    receipt = GoodsReceipt.objects.create(
        store=purchase_order.store,
        purchase_order=purchase_order,
        received_by=actor,
        receipt_number=receipt_number,
        notes=notes,
    )

    for entry in lines:
        pol = (
            purchase_order.lines.select_for_update()
            .select_related("product")
            .get(pk=entry["purchase_order_line_id"])
        )
        qty = int(entry["quantity_received"])
        if qty <= 0:
            raise ValueError("La quantite recue doit etre positive.")
        remaining = pol.quantity_ordered - pol.quantity_received
        if qty > remaining:
            raise ValueError("La quantite recue depasse la quantite restante.")

        GoodsReceiptLine.objects.create(
            receipt=receipt,
            purchase_order_line=pol,
            quantity_received=qty,
        )

        pol.quantity_received += qty
        pol.save(update_fields=["quantity_received", "updated_at"])

        adjust_stock(
            store=purchase_order.store,
            product=pol.product,
            qty_delta=qty,
            movement_type="PURCHASE",
            reason=f"Reception achat {purchase_order.po_number}",
            actor=actor,
            reference=receipt.receipt_number,
        )

    if purchase_order.lines.filter(quantity_received__lt=models.F("quantity_ordered")).exists():
        purchase_order.status = PurchaseOrder.Status.PARTIALLY_RECEIVED
    else:
        purchase_order.status = PurchaseOrder.Status.RECEIVED
    purchase_order.save(update_fields=["status", "updated_at"])

    create_audit_log(
        actor=actor,
        store=purchase_order.store,
        action="GOODS_RECEIPT_CREATED",
        entity_type="GoodsReceipt",
        entity_id=str(receipt.pk),
        after={
            "purchase_order": purchase_order.po_number,
            "receipt_number": receipt.receipt_number,
        },
    )
    return receipt
