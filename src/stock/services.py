"""Business logic / service functions for stock management."""
import uuid
import logging

from django.db import transaction
from django.utils import timezone

from .models import (
    InventoryMovement,
    ProductStock,
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
        The created InventoryMovement instance.

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

    # For outgoing movements, verify sufficient available stock (respects reservations)
    if qty_delta < 0 and (stock.available_qty + qty_delta) < 0:
        raise ValueError(
            f"Stock insuffisant pour {product} dans {store}. "
            f"Disponible: {stock.available_qty}, demande: {abs(qty_delta)}."
        )

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
        # Deduct from source store
        source_stock, _ = ProductStock.objects.select_for_update().get_or_create(
            store=transfer.from_store,
            product=line.product,
            defaults={"quantity": 0},
        )

        if source_stock.quantity < line.quantity:
            raise ValueError(
                f"Stock insuffisant pour {line.product} dans {transfer.from_store}. "
                f"Disponible: {source_stock.quantity}, demande: {line.quantity}."
            )

        source_stock.quantity -= line.quantity
        source_stock.save(update_fields=["quantity", "updated_at"])
        _refresh_low_stock_alert_for_stock(source_stock)

        InventoryMovement.objects.create(
            store=transfer.from_store,
            product=line.product,
            movement_type=InventoryMovement.MovementType.TRANSFER_OUT,
            quantity=-line.quantity,
            reference=str(transfer.pk),
            reason=f"Transfert vers {transfer.to_store}",
            actor=actor,
            batch_id=batch_id,
        )

        # Add to destination store
        dest_stock, _ = ProductStock.objects.select_for_update().get_or_create(
            store=transfer.to_store,
            product=line.product,
            defaults={"quantity": 0},
        )

        dest_stock.quantity += line.quantity
        dest_stock.save(update_fields=["quantity", "updated_at"])
        _refresh_low_stock_alert_for_stock(dest_stock)

        InventoryMovement.objects.create(
            store=transfer.to_store,
            product=line.product,
            movement_type=InventoryMovement.MovementType.TRANSFER_IN,
            quantity=line.quantity,
            reference=str(transfer.pk),
            reason=f"Transfert depuis {transfer.from_store}",
            actor=actor,
            batch_id=batch_id,
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

        # Adjust the actual stock
        stock, _ = ProductStock.objects.select_for_update().get_or_create(
            store=stock_count.store,
            product=line.product,
            defaults={"quantity": 0},
        )

        stock.quantity += variance
        stock.save(update_fields=["quantity", "updated_at"])
        _refresh_low_stock_alert_for_stock(stock)

        InventoryMovement.objects.create(
            store=stock_count.store,
            product=line.product,
            movement_type=InventoryMovement.MovementType.ADJUST,
            quantity=variance,
            reference=str(stock_count.pk),
            reason=f"Ajustement inventaire (systeme={line.system_qty}, compte={line.counted_qty})",
            actor=actor,
            batch_id=batch_id,
        )

    stock_count.status = StockCount.Status.COMPLETED
    stock_count.completed_at = timezone.now()
    stock_count.save(update_fields=["status", "completed_at", "updated_at"])

    logger.info(
        "Stock count completed: %s (%d lines, batch=%s) by %s",
        stock_count, lines.count(), batch_id, actor,
    )
