"""Services for suppliers, purchase orders and goods receipts."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation

from django.db import models, transaction
from django.utils import timezone

from stock.services import adjust_stock
from stores.models import Sequence
from stores.services import create_audit_log

from .models import GoodsReceipt, GoodsReceiptLine, PurchaseOrder, PurchaseOrderLine, Supplier


def _safe_decimal(value, default: str = "0.00") -> Decimal:
    if value is None:
        return Decimal(default)
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal(default)


def _get_or_create_sequence(store, prefix: str) -> Sequence:
    current_year = timezone.now().year
    sequence, _created = Sequence.objects.get_or_create(
        store=store,
        prefix=prefix,
        year=current_year,
        defaults={"next_number": 1},
    )
    return sequence


def generate_purchase_order_number(store) -> str:
    """Generate next purchase order number (PO-STORE-YYYY-000001)."""
    return _get_or_create_sequence(store, "PO").generate_next()


def generate_goods_receipt_number(store) -> str:
    """Generate next goods receipt number (BR-STORE-YYYY-000001)."""
    return _get_or_create_sequence(store, "BR").generate_next()


def _validate_order_lines(store, lines: list[dict]) -> list[dict]:
    """Validate purchase lines and resolve product objects."""
    if not isinstance(lines, list) or not lines:
        raise ValueError("Le bon de commande doit contenir au moins une ligne.")

    from catalog.models import Product

    normalized: list[dict] = []
    seen_products: set[str] = set()

    for idx, line in enumerate(lines, start=1):
        product_id = line.get("product_id")
        if not product_id:
            raise ValueError(f"Ligne {idx}: produit requis.")

        try:
            qty = int(line.get("quantity_ordered") or 0)
        except (TypeError, ValueError):
            raise ValueError(f"Ligne {idx}: quantite commandee invalide.")
        if qty <= 0:
            raise ValueError(f"Ligne {idx}: quantite commandee doit etre positive.")

        unit_cost = _safe_decimal(line.get("unit_cost"))
        if unit_cost < 0:
            raise ValueError(f"Ligne {idx}: cout unitaire invalide.")

        key = str(product_id)
        if key in seen_products:
            raise ValueError(f"Ligne {idx}: produit duplique dans le bon de commande.")
        seen_products.add(key)

        try:
            product = Product.objects.get(pk=product_id, enterprise_id=store.enterprise_id)
        except Product.DoesNotExist:
            raise ValueError(f"Ligne {idx}: produit introuvable dans cette entreprise.")

        normalized.append(
            {
                "product": product,
                "quantity_ordered": qty,
                "unit_cost": unit_cost.quantize(Decimal("0.01")),
            }
        )

    return normalized


def _recalculate_purchase_order_subtotal(purchase_order: PurchaseOrder) -> Decimal:
    subtotal = (
        purchase_order.lines.aggregate(
            total=models.Sum("line_total"),
        )["total"]
        or Decimal("0.00")
    )
    purchase_order.subtotal = _safe_decimal(subtotal).quantize(Decimal("0.01"))
    purchase_order.save(update_fields=["subtotal", "updated_at"])
    return purchase_order.subtotal


@transaction.atomic
def create_purchase_order(
    *,
    store,
    supplier: Supplier,
    actor,
    lines: list[dict],
    notes: str = "",
    po_number: str = "",
    submit_now: bool = False,
) -> PurchaseOrder:
    """Create a purchase order with lines (optionally submitted immediately)."""
    if supplier.enterprise_id != store.enterprise_id:
        raise ValueError(
            "Le fournisseur doit appartenir a la meme entreprise que la boutique."
        )

    normalized_lines = _validate_order_lines(store, lines)

    final_number = (po_number or "").strip() or generate_purchase_order_number(store)
    if PurchaseOrder.objects.filter(po_number=final_number).exists():
        raise ValueError("Numero de bon de commande deja utilise.")

    purchase_order = PurchaseOrder.objects.create(
        store=store,
        supplier=supplier,
        created_by=actor,
        po_number=final_number,
        status=PurchaseOrder.Status.DRAFT,
        notes=(notes or "").strip(),
    )

    for line in normalized_lines:
        PurchaseOrderLine.objects.create(
            purchase_order=purchase_order,
            product=line["product"],
            quantity_ordered=line["quantity_ordered"],
            unit_cost=line["unit_cost"],
        )

    _recalculate_purchase_order_subtotal(purchase_order)

    create_audit_log(
        actor=actor,
        store=store,
        action="PURCHASE_ORDER_CREATED",
        entity_type="PurchaseOrder",
        entity_id=str(purchase_order.pk),
        after={
            "po_number": purchase_order.po_number,
            "status": purchase_order.status,
            "supplier": supplier.name,
            "subtotal": str(purchase_order.subtotal),
            "lines_count": len(normalized_lines),
        },
    )

    if submit_now:
        purchase_order = submit_purchase_order(purchase_order, actor=actor)

    return purchase_order


@transaction.atomic
def update_purchase_order(
    purchase_order: PurchaseOrder,
    *,
    actor,
    supplier: Supplier | None = None,
    notes: str | None = None,
    lines: list[dict] | None = None,
) -> PurchaseOrder:
    """Update a DRAFT purchase order (supplier, notes, lines)."""
    purchase_order = PurchaseOrder.objects.select_for_update().get(pk=purchase_order.pk)
    if purchase_order.status != PurchaseOrder.Status.DRAFT:
        raise ValueError("Seuls les bons de commande en brouillon peuvent etre modifies.")

    if supplier is not None:
        if supplier.enterprise_id != purchase_order.store.enterprise_id:
            raise ValueError(
                "Le fournisseur doit appartenir a la meme entreprise que la boutique."
            )
        purchase_order.supplier = supplier

    if notes is not None:
        purchase_order.notes = (notes or "").strip()

    purchase_order.save(update_fields=["supplier", "notes", "updated_at"])

    if lines is not None:
        normalized_lines = _validate_order_lines(purchase_order.store, lines)
        purchase_order.lines.all().delete()
        for line in normalized_lines:
            PurchaseOrderLine.objects.create(
                purchase_order=purchase_order,
                product=line["product"],
                quantity_ordered=line["quantity_ordered"],
                unit_cost=line["unit_cost"],
            )

    subtotal = _recalculate_purchase_order_subtotal(purchase_order)

    create_audit_log(
        actor=actor,
        store=purchase_order.store,
        action="PURCHASE_ORDER_UPDATED",
        entity_type="PurchaseOrder",
        entity_id=str(purchase_order.pk),
        after={
            "po_number": purchase_order.po_number,
            "supplier": purchase_order.supplier.name,
            "subtotal": str(subtotal),
        },
    )

    return purchase_order


@transaction.atomic
def submit_purchase_order(purchase_order: PurchaseOrder, *, actor) -> PurchaseOrder:
    """Submit a draft purchase order for receiving."""
    purchase_order = PurchaseOrder.objects.select_for_update().get(pk=purchase_order.pk)
    if purchase_order.status != PurchaseOrder.Status.DRAFT:
        raise ValueError("Seul un bon de commande en brouillon peut etre soumis.")
    if not purchase_order.lines.exists():
        raise ValueError("Impossible de soumettre un bon de commande sans lignes.")

    purchase_order.status = PurchaseOrder.Status.SUBMITTED
    purchase_order.save(update_fields=["status", "updated_at"])

    create_audit_log(
        actor=actor,
        store=purchase_order.store,
        action="PURCHASE_ORDER_SUBMITTED",
        entity_type="PurchaseOrder",
        entity_id=str(purchase_order.pk),
        after={"po_number": purchase_order.po_number, "status": purchase_order.status},
    )
    return purchase_order


@transaction.atomic
def cancel_purchase_order(
    purchase_order: PurchaseOrder,
    *,
    actor,
    reason: str = "",
) -> PurchaseOrder:
    """Cancel a purchase order that is not fully received."""
    purchase_order = PurchaseOrder.objects.select_for_update().get(pk=purchase_order.pk)
    if purchase_order.status == PurchaseOrder.Status.CANCELLED:
        return purchase_order
    if purchase_order.status == PurchaseOrder.Status.RECEIVED:
        raise ValueError("Un bon de commande deja recu ne peut pas etre annule.")

    purchase_order.status = PurchaseOrder.Status.CANCELLED
    if reason.strip():
        existing = (purchase_order.notes or "").strip()
        suffix = f"[ANNULATION] {reason.strip()}"
        purchase_order.notes = f"{existing}\n{suffix}".strip() if existing else suffix
        purchase_order.save(update_fields=["status", "notes", "updated_at"])
    else:
        purchase_order.save(update_fields=["status", "updated_at"])

    create_audit_log(
        actor=actor,
        store=purchase_order.store,
        action="PURCHASE_ORDER_CANCELLED",
        entity_type="PurchaseOrder",
        entity_id=str(purchase_order.pk),
        after={
            "po_number": purchase_order.po_number,
            "status": purchase_order.status,
            "reason": reason.strip(),
        },
    )
    return purchase_order


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

    if not lines:
        raise ValueError("Veuillez saisir au moins une ligne de reception.")

    receipt = GoodsReceipt.objects.create(
        store=purchase_order.store,
        purchase_order=purchase_order,
        received_by=actor,
        receipt_number=receipt_number,
        notes=notes,
    )

    received_lines = 0
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
        received_lines += 1

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

    if received_lines == 0:
        raise ValueError("Aucune ligne de reception valide.")

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
            "lines_count": received_lines,
        },
    )
    return receipt
