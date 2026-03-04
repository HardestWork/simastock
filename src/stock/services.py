"""Business logic / service functions for stock management."""
import uuid
import logging
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.utils import timezone

from .models import (
    InventoryMovement,
    ProductStock,
    StockLot,
    StockCount,
    StockTransfer,
)

logger = logging.getLogger("boutique")


def _refresh_low_stock_alert_for_stock(stock):
    """Create low-stock/out-of-stock alert for a ProductStock row when needed."""
    try:
        from alerts.services import create_stock_level_alert_for_product_stock
        create_stock_level_alert_for_product_stock(stock)
    except Exception:
        logger.warning(
            "Low-stock alert refresh failed for stock %s/%s",
            stock.store_id,
            stock.product_id,
            exc_info=True,
        )


def _safe_decimal(value, default: str = "0.00") -> Decimal:
    if value is None:
        return Decimal(default)
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal(default)


def _resolve_lot_source_type(movement_type: str) -> str:
    movement = (movement_type or "").strip().upper()
    mapping = {
        InventoryMovement.MovementType.PURCHASE: StockLot.SourceType.PURCHASE,
        InventoryMovement.MovementType.IN: StockLot.SourceType.MANUAL_IN,
        InventoryMovement.MovementType.TRANSFER_IN: StockLot.SourceType.TRANSFER_IN,
        InventoryMovement.MovementType.RETURN: StockLot.SourceType.RETURN,
        InventoryMovement.MovementType.ADJUST: StockLot.SourceType.ADJUST,
    }
    return mapping.get(movement, StockLot.SourceType.UNKNOWN)


def _create_stock_lot(
    *,
    store,
    product,
    quantity: int,
    unit_cost: Decimal,
    movement_type: str,
    reference: str = "",
):
    qty = int(quantity or 0)
    if qty <= 0:
        return None

    lot = StockLot.objects.create(
        store=store,
        product=product,
        quantity_initial=qty,
        quantity_remaining=qty,
        unit_cost=_safe_decimal(unit_cost).quantize(Decimal("0.01")),
        source_type=_resolve_lot_source_type(movement_type),
        source_reference=(reference or "").strip(),
        received_at=timezone.now(),
    )
    return lot


def _consume_stock_lots_fifo(*, store, product, quantity: int, allow_negative: bool):
    """Consume product lots in FIFO order and return valuation details."""
    requested_qty = max(int(quantity or 0), 0)
    if requested_qty == 0:
        return {
            "requested_qty": 0,
            "consumed_qty": 0,
            "shortage_qty": 0,
            "applied_unit_cost": _safe_decimal(getattr(product, "cost_price", Decimal("0.00"))).quantize(Decimal("0.01")),
            "consumed_lots": [],
        }

    lots = list(
        StockLot.objects.select_for_update()
        .filter(
            store=store,
            product=product,
            quantity_remaining__gt=0,
        )
        .order_by("received_at", "created_at")
    )

    remaining = requested_qty
    consumed_lots = []
    total_cost = Decimal("0.00")
    total_qty = 0

    for lot in lots:
        if remaining <= 0:
            break
        take = min(int(lot.quantity_remaining), remaining)
        if take <= 0:
            continue
        lot.quantity_remaining -= take
        lot.save(update_fields=["quantity_remaining", "updated_at"])

        take_dec = Decimal(str(take))
        lot_cost = _safe_decimal(lot.unit_cost)
        total_cost += take_dec * lot_cost
        total_qty += take
        remaining -= take
        consumed_lots.append(
            {
                "lot_id": str(lot.pk),
                "qty": take,
                "unit_cost": lot_cost.quantize(Decimal("0.01")),
            }
        )

    shortage_qty = max(remaining, 0)
    if shortage_qty > 0:
        # Backward compatibility: existing stock may predate FIFO lots.
        fallback_cost = _safe_decimal(getattr(product, "cost_price", Decimal("0.00"))).quantize(Decimal("0.01"))
        shortage_dec = Decimal(str(shortage_qty))
        total_cost += shortage_dec * fallback_cost
        total_qty += shortage_qty
        consumed_lots.append(
            {
                "lot_id": "LEGACY",
                "qty": shortage_qty,
                "unit_cost": fallback_cost,
            }
        )

    if total_qty > 0:
        applied_unit_cost = (total_cost / Decimal(str(total_qty))).quantize(Decimal("0.01"))
    else:
        applied_unit_cost = _safe_decimal(getattr(product, "cost_price", Decimal("0.00"))).quantize(Decimal("0.01"))

    return {
        "requested_qty": requested_qty,
        "consumed_qty": total_qty,
        "shortage_qty": shortage_qty,
        "applied_unit_cost": applied_unit_cost,
        "consumed_lots": consumed_lots,
    }


@transaction.atomic
def adjust_stock(
    store,
    product,
    qty_delta,
    movement_type,
    reason,
    actor,
    reference="",
    batch_id=None,
    unit_cost=None,
    return_details=False,
):
    """
    Adjust the stock level of a product in a store.

    Uses ``select_for_update`` on the ProductStock row to prevent race
    conditions.  Creates an InventoryMovement record for traceability.

    Args:
        store: The Store instance.
        product: The Product instance.
        qty_delta: Integer delta (positive to add, negative to remove).
        movement_type: An InventoryMovement.MovementType value.
        reason: Free-text reason for the movement.
        actor: The User performing the action.
        reference: Optional reference string (sale number, PO number, etc.).

    Returns:
        The created InventoryMovement instance (or tuple when return_details=True).

    Raises:
        ValueError: If an OUT-type movement would result in insufficient stock.
    """
    if not bool(getattr(product, "track_stock", True)):
        raise ValueError(
            f"Le produit '{product}' est un service et ne suit pas le stock."
        )

    stock, _created = ProductStock.objects.select_for_update().get_or_create(
        store=store,
        product=product,
        defaults={"quantity": 0},
    )
    allow_negative = bool(getattr(store, "allow_negative_stock", False))

    # For outgoing movements, verify sufficient available stock (respects reservations)
    if qty_delta < 0 and (stock.available_qty + qty_delta) < 0:
        if not allow_negative:
            raise ValueError(
                f"Stock insuffisant pour {product} dans {store}. "
                f"Disponible: {stock.available_qty}, demande: {abs(qty_delta)}."
            )

    fifo_details = {
        "applied_unit_cost": None,
        "consumed_lots": [],
        "shortage_qty": 0,
        "created_lot_id": "",
    }
    if qty_delta > 0:
        applied_in_cost = _safe_decimal(
            unit_cost if unit_cost is not None else getattr(product, "cost_price", Decimal("0.00"))
        ).quantize(Decimal("0.01"))
        created_lot = _create_stock_lot(
            store=store,
            product=product,
            quantity=int(qty_delta),
            unit_cost=applied_in_cost,
            movement_type=movement_type,
            reference=reference,
        )
        fifo_details["applied_unit_cost"] = applied_in_cost
        fifo_details["created_lot_id"] = str(created_lot.pk) if created_lot else ""
    elif qty_delta < 0:
        consumption = _consume_stock_lots_fifo(
            store=store,
            product=product,
            quantity=abs(int(qty_delta)),
            allow_negative=allow_negative,
        )
        fifo_details["applied_unit_cost"] = consumption["applied_unit_cost"]
        fifo_details["consumed_lots"] = consumption["consumed_lots"]
        fifo_details["shortage_qty"] = int(consumption["shortage_qty"])

    stock.quantity += qty_delta
    stock.save(update_fields=["quantity", "updated_at"])
    _refresh_low_stock_alert_for_stock(stock)

    movement = InventoryMovement.objects.create(
        store=store,
        product=product,
        movement_type=movement_type,
        quantity=qty_delta,
        reference=reference,
        reason=reason,
        actor=actor,
        batch_id=batch_id,
    )

    logger.info(
        "Stock adjusted: %s %+d @ %s by %s (type=%s, ref=%s)",
        product, qty_delta, store, actor, movement_type, reference,
    )

    if return_details:
        return movement, fifo_details
    return movement


@transaction.atomic
def reserve_stock(store, product, qty, actor, reference=""):
    """
    Reserve stock for a partially paid sale.

    Increases ``reserved_qty`` on the ProductStock record. The reserved
    quantity is not available for other sales.

    Args:
        store: The Store instance.
        product: The Product instance.
        qty: Positive integer quantity to reserve.
        actor: The User performing the action.
        reference: Optional reference string.

    Raises:
        ValueError: If there is not enough available stock to reserve.
    """
    if qty <= 0:
        raise ValueError("La quantite a reserver doit etre positive.")

    stock = ProductStock.objects.select_for_update().get(
        store=store, product=product,
    )

    if stock.available_qty < qty:
        raise ValueError(
            f"Stock disponible insuffisant pour reserver {qty} x {product} "
            f"dans {store}. Disponible: {stock.available_qty}."
        )

    stock.reserved_qty += qty
    stock.save(update_fields=["reserved_qty", "updated_at"])
    _refresh_low_stock_alert_for_stock(stock)

    logger.info(
        "Stock reserved: %s +%d reserved @ %s by %s (ref=%s)",
        product, qty, store, actor, reference,
    )


@transaction.atomic
def release_stock(store, product, qty, actor, reference=""):
    """
    Release previously reserved stock.

    Decreases ``reserved_qty`` on the ProductStock record, making the
    quantity available again.

    Args:
        store: The Store instance.
        product: The Product instance.
        qty: Positive integer quantity to release.
        actor: The User performing the action.
        reference: Optional reference string.

    Raises:
        ValueError: If attempting to release more than is reserved.
    """
    if qty <= 0:
        raise ValueError("La quantite a liberer doit etre positive.")

    stock = ProductStock.objects.select_for_update().get(
        store=store, product=product,
    )

    if stock.reserved_qty < qty:
        raise ValueError(
            f"Impossible de liberer {qty} x {product} dans {store}. "
            f"Seulement {stock.reserved_qty} reserve(s)."
        )

    stock.reserved_qty -= qty
    stock.save(update_fields=["reserved_qty", "updated_at"])
    _refresh_low_stock_alert_for_stock(stock)

    logger.info(
        "Stock released: %s -%d reserved @ %s by %s (ref=%s)",
        product, qty, store, actor, reference,
    )


@transaction.atomic
def process_transfer(transfer, actor):
    """
    Process an approved stock transfer.

    Creates TRANSFER_OUT movements in the source store and TRANSFER_IN
    movements in the destination store for each line.  All movements
    share a common ``batch_id``.

    Args:
        transfer: The StockTransfer instance (must be APPROVED).
        actor: The User processing the transfer.

    Raises:
        ValueError: If any line has insufficient stock in the source store.
    """
    if transfer.status != StockTransfer.Status.APPROVED:
        raise ValueError("Le transfert doit etre approuve avant d'etre traite.")

    batch_id = uuid.uuid4()
    lines = transfer.lines.select_related("product").all()

    if not lines.exists():
        raise ValueError("Le transfert ne contient aucune ligne.")

    for line in lines:
        # Transfer-out consumes source lots in FIFO; incoming lot keeps moved unit cost.
        _out_movement, out_details = adjust_stock(
            store=transfer.from_store,
            product=line.product,
            qty_delta=-int(line.quantity),
            movement_type=InventoryMovement.MovementType.TRANSFER_OUT,
            reason=f"Transfert vers {transfer.to_store}",
            actor=actor,
            reference=str(transfer.pk),
            batch_id=batch_id,
            return_details=True,
        )
        adjust_stock(
            store=transfer.to_store,
            product=line.product,
            qty_delta=int(line.quantity),
            movement_type=InventoryMovement.MovementType.TRANSFER_IN,
            reason=f"Transfert depuis {transfer.from_store}",
            actor=actor,
            reference=str(transfer.pk),
            batch_id=batch_id,
            unit_cost=out_details.get("applied_unit_cost"),
        )

    # Mark transfer as in-transit
    transfer.status = StockTransfer.Status.IN_TRANSIT
    transfer.save(update_fields=["status", "updated_at"])

    logger.info(
        "Transfer processed: %s -> %s (%d lines, batch=%s) by %s",
        transfer.from_store, transfer.to_store, lines.count(), batch_id, actor,
    )


@transaction.atomic
def complete_stock_count(stock_count, actor=None):
    """
    Complete an inventory count and create adjustment movements for variances.

    For each StockCountLine where ``counted_qty`` differs from
    ``system_qty``, an ADJUST movement is created and the ProductStock
    quantity is updated accordingly.

    Args:
        stock_count: The StockCount instance (must be IN_PROGRESS).
        actor: The User completing the count (defaults to stock_count.created_by).

    Raises:
        ValueError: If the count is not in IN_PROGRESS status or has
                     uncounted lines.
    """
    if stock_count.status != StockCount.Status.IN_PROGRESS:
        raise ValueError("L'inventaire doit etre en cours pour etre termine.")

    actor = actor or stock_count.created_by

    lines = stock_count.lines.select_related("product").all()
    uncounted = lines.filter(counted_qty__isnull=True)
    if uncounted.exists():
        raise ValueError(
            f"{uncounted.count()} ligne(s) n'ont pas encore ete comptee(s)."
        )

    batch_id = uuid.uuid4()

    for line in lines:
        variance = line.variance
        if variance == 0:
            continue

        adjust_stock(
            store=stock_count.store,
            product=line.product,
            qty_delta=variance,
            movement_type=InventoryMovement.MovementType.ADJUST,
            reference=str(stock_count.pk),
            reason=f"Ajustement inventaire (systeme={line.system_qty}, compte={line.counted_qty})",
            actor=actor,
            batch_id=batch_id,
            unit_cost=getattr(line.product, "cost_price", Decimal("0.00")),
        )

    stock_count.status = StockCount.Status.COMPLETED
    stock_count.completed_at = timezone.now()
    stock_count.save(update_fields=["status", "completed_at", "updated_at"])

    logger.info(
        "Stock count completed: %s (%d lines, batch=%s) by %s",
        stock_count, lines.count(), batch_id, actor,
    )
