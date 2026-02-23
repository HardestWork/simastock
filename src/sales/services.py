"""Business-logic / service functions for the sales app."""
from __future__ import annotations

import logging
from decimal import Decimal
from typing import Optional

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from sales.models import Quote, QuoteItem, Refund, Sale, SaleItem

User = get_user_model()
logger = logging.getLogger("boutique")


# ---------------------------------------------------------------------------
# create_sale
# ---------------------------------------------------------------------------

def create_sale(store, seller, customer=None) -> Sale:
    """Create a new DRAFT sale.

    Parameters
    ----------
    store : stores.models.Store
    seller : accounts.models.User
    customer : customers.models.Customer, optional

    Returns
    -------
    Sale
    """
    if store is None:
        raise ValueError("Impossible de creer une vente sans boutique active.")

    sale = Sale.objects.create(
        store=store,
        seller=seller,
        customer=customer,
        status=Sale.Status.DRAFT,
    )
    logger.info(
        "Sale %s created (DRAFT) by %s in store %s",
        sale.pk, seller, store,
    )
    return sale


# ---------------------------------------------------------------------------
# add_item_to_sale
# ---------------------------------------------------------------------------

@transaction.atomic
def add_item_to_sale(
    sale: Sale,
    product,
    qty: int = 1,
    discount: Decimal | int | float = 0,
    unit_price: Decimal | None = None,
    actor=None,
) -> SaleItem:
    """Add a product to a DRAFT sale.

    Validates that:
    - The sale is in DRAFT status.
    - The product is active.
    - Sufficient stock is available (if the stock app provides it).

    Parameters
    ----------
    sale : Sale
    product : catalog.models.Product
    qty : int
    discount : Decimal
    unit_price : Decimal, optional
        Override the product's selling price (requires MANAGER/ADMIN).
    actor : User, optional

    Returns
    -------
    SaleItem

    Raises
    ------
    ValueError
        If validation fails.
    """
    # Lock the sale row to prevent concurrent modifications
    sale = Sale.objects.select_for_update().get(pk=sale.pk)

    if sale.status != Sale.Status.DRAFT:
        raise ValueError("Impossible d'ajouter un article: la vente n'est pas en brouillon.")

    if not product.is_active:
        raise ValueError(f"Le produit '{product.name}' n'est pas actif.")

    if qty < 1:
        raise ValueError("La quantite doit etre d'au moins 1.")

    # Check stock availability (optional -- depends on stock app being set up)
    _check_stock_availability(sale.store, product, qty)

    # Check if the product already exists in the sale -- if so, increase qty
    existing_item = sale.items.select_for_update().filter(product=product).first()
    if existing_item:
        # Stock check must consider the *resulting* quantity, not only the increment.
        desired_qty = int(existing_item.quantity) + int(qty)
        _check_stock_availability(sale.store, product, desired_qty)
        existing_item.quantity += qty
        existing_item.discount_amount += Decimal(str(discount))
        existing_item.save()
        recalculate_sale(sale)
        logger.info(
            "Updated qty for product %s on sale %s (new qty=%d)",
            product.pk, sale.pk, existing_item.quantity,
        )
        return existing_item

    effective_unit_price = unit_price if unit_price is not None else product.selling_price
    item = SaleItem(
        sale=sale,
        product=product,
        product_name=product.name,
        unit_price=effective_unit_price,
        cost_price=product.cost_price,
        quantity=qty,
        discount_amount=Decimal(str(discount)),
    )
    item.save()

    recalculate_sale(sale)
    logger.info(
        "Added product %s (qty=%d) to sale %s",
        product.pk, qty, sale.pk,
    )
    return item


# ---------------------------------------------------------------------------
# remove_item_from_sale
# ---------------------------------------------------------------------------

@transaction.atomic
def remove_item_from_sale(sale: Sale, item_id, actor=None) -> None:
    """Remove an item from a DRAFT sale.

    Parameters
    ----------
    sale : Sale
    item_id : uuid
    actor : User, optional

    Raises
    ------
    ValueError
        If the sale is not in DRAFT or the item does not exist.
    """
    sale = Sale.objects.select_for_update().get(pk=sale.pk)

    if sale.status != Sale.Status.DRAFT:
        raise ValueError("Impossible de supprimer un article: la vente n'est pas en brouillon.")

    try:
        item = sale.items.get(pk=item_id)
    except SaleItem.DoesNotExist:
        raise ValueError("Article introuvable dans cette vente.")

    product_name = item.product_name
    item.delete()
    recalculate_sale(sale)
    logger.info(
        "Removed item '%s' from sale %s",
        product_name, sale.pk,
    )


# ---------------------------------------------------------------------------
# update_item_quantity
# ---------------------------------------------------------------------------

@transaction.atomic
def update_item_quantity(sale: Sale, item_id, new_qty: int, actor=None) -> SaleItem:
    """Update the quantity of an item on a DRAFT sale.

    Parameters
    ----------
    sale : Sale
    item_id : uuid
    new_qty : int
    actor : User, optional

    Returns
    -------
    SaleItem

    Raises
    ------
    ValueError
    """
    sale = Sale.objects.select_for_update().get(pk=sale.pk)

    if sale.status != Sale.Status.DRAFT:
        raise ValueError("Impossible de modifier la quantite: la vente n'est pas en brouillon.")

    if new_qty < 1:
        raise ValueError("La quantite doit etre d'au moins 1.")

    try:
        item = sale.items.select_for_update().get(pk=item_id)
    except SaleItem.DoesNotExist:
        raise ValueError("Article introuvable dans cette vente.")

    # Check stock for the new quantity
    _check_stock_availability(sale.store, item.product, new_qty)

    item.quantity = new_qty
    item.save()
    recalculate_sale(sale)
    logger.info(
        "Updated qty for item %s on sale %s to %d",
        item_id, sale.pk, new_qty,
    )
    return item


# ---------------------------------------------------------------------------
# submit_sale_to_cashier
# ---------------------------------------------------------------------------

@transaction.atomic
def submit_sale_to_cashier(sale: Sale, actor) -> Sale:
    """Submit a DRAFT sale to the cashier for payment.

    - Changes status to PENDING_PAYMENT.
    - Generates an invoice number using the store's Sequence model.
    - Sets ``submitted_at``.
    - Creates an audit log entry.

    Parameters
    ----------
    sale : Sale
    actor : User

    Returns
    -------
    Sale

    Raises
    ------
    ValueError
        If the sale cannot be submitted.
    """
    if not sale.can_submit():
        if sale.customer_id is None:
            raise ValueError(
                "Veuillez selectionner un client avant la soumission en caisse."
            )
        raise ValueError(
            "Cette vente ne peut pas etre soumise.  "
            "Verifiez qu'elle est en brouillon, contient un client et des articles."
        )

    # Generate invoice number
    sale.invoice_number = generate_invoice_number(sale.store)
    sale.status = Sale.Status.PENDING_PAYMENT
    sale.submitted_at = timezone.now()
    sale.save(update_fields=[
        "invoice_number",
        "status",
        "submitted_at",
        "updated_at",
    ])

    # Audit log
    _create_audit_log(
        actor=actor,
        store=sale.store,
        action="SALE_SUBMITTED",
        entity_type="Sale",
        entity_id=str(sale.pk),
        after={
            "invoice_number": sale.invoice_number,
            "status": sale.status,
            "total": str(sale.total),
        },
    )

    logger.info(
        "Sale %s submitted (invoice=%s) by %s",
        sale.pk, sale.invoice_number, actor,
    )
    return sale


# ---------------------------------------------------------------------------
# cancel_sale
# ---------------------------------------------------------------------------

@transaction.atomic
def cancel_sale(sale: Sale, reason: str, actor) -> Sale:
    """Cancel a sale.

    Validates cancellation rules, sets status to CANCELLED,
    records cancellation metadata, and creates an audit log.

    Parameters
    ----------
    sale : Sale
    reason : str
    actor : User

    Returns
    -------
    Sale

    Raises
    ------
    ValueError
        If the sale cannot be cancelled.
    """
    if not sale.can_cancel():
        raise ValueError("Cette vente ne peut pas etre annulee dans son etat actuel.")

    if not reason.strip():
        raise ValueError("Une raison d'annulation est requise.")

    previous_status = sale.status

    sale.status = Sale.Status.CANCELLED
    sale.cancelled_at = timezone.now()
    sale.cancelled_by = actor
    sale.cancellation_reason = reason
    sale.save(update_fields=[
        "status",
        "cancelled_at",
        "cancelled_by",
        "cancellation_reason",
        "updated_at",
    ])

    # Audit log
    _create_audit_log(
        actor=actor,
        store=sale.store,
        action="SALE_CANCELLED",
        entity_type="Sale",
        entity_id=str(sale.pk),
        before={"status": previous_status},
        after={
            "status": sale.status,
            "cancellation_reason": reason,
        },
    )

    logger.info(
        "Sale %s cancelled by %s.  Reason: %s",
        sale.pk, actor, reason,
    )
    return sale


# ---------------------------------------------------------------------------
# recalculate_sale
# ---------------------------------------------------------------------------

def recalculate_sale(sale: Sale) -> None:
    """Recalculate and persist subtotal, total, amount_due on a sale.

    Delegates to ``sale.recalculate_totals()`` then saves the relevant
    fields.
    """
    # If the sale instance was loaded with prefetch_related("items"),
    # the prefetched cache can be stale right after add/remove operations.
    # Drop it to force a fresh queryset when recomputing totals.
    prefetched_cache = getattr(sale, "_prefetched_objects_cache", None)
    if prefetched_cache:
        prefetched_cache.pop("items", None)
        prefetched_cache.pop("items__product", None)

    sale.recalculate_totals()
    sale.save(update_fields=[
        "subtotal",
        "discount_amount",
        "discount_percent",
        "tax_amount",
        "total",
        "amount_due",
        "updated_at",
    ])


# ---------------------------------------------------------------------------
# generate_invoice_number
# ---------------------------------------------------------------------------

def _get_or_create_sequence(store, prefix: str):
    """Get or create a year-scoped sequence for the given store and prefix."""
    from stores.models import Sequence

    current_year = timezone.now().year
    sequence, _created = Sequence.objects.get_or_create(
        store=store,
        prefix=prefix,
        year=current_year,
        defaults={"next_number": 1},
    )
    return sequence


def generate_invoice_number(store) -> str:
    """Generate the next invoice number for *store*.

    Uses prefix ``FAC`` with format: ``FAC-STORE-2026-000001``.

    Parameters
    ----------
    store : stores.models.Store

    Returns
    -------
    str
    """
    sequence = _get_or_create_sequence(store, "FAC")
    return sequence.generate_next()


def generate_quote_number(store) -> str:
    """Generate the next quote number for *store*.

    Uses prefix ``DEV`` with format: ``DEV-STORE-2026-000001``.

    Parameters
    ----------
    store : stores.models.Store

    Returns
    -------
    str
    """
    sequence = _get_or_create_sequence(store, "DEV")
    return sequence.generate_next()


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _check_stock_availability(store, product, qty: int) -> None:
    """Check whether the store has enough stock for the requested quantity.

    If no ProductStock row exists for (store, product), we treat it as
    "stock not initialized" and block the sale flow. This prevents users
    from selling items that cannot be decremented at payment time.

    Raises
    ------
    ValueError
        If stock is insufficient.
    """
    if not bool(getattr(product, "track_stock", True)):
        return

    try:
        from stock.models import ProductStock
    except ImportError as exc:
        raise ValueError(
            "Le module de stock est indisponible; impossible de verifier la disponibilite produit.",
        ) from exc

    stock = ProductStock.objects.filter(
        store=store,
        product=product,
    ).first()
    if not stock:
        raise ValueError(
            f"Stock non initialise pour '{product.name}'. "
            "Veuillez initialiser le stock avant la vente."
        )
    if stock.available_qty < qty:
        raise ValueError(
            f"Stock insuffisant pour '{product.name}'.  "
            f"Disponible: {stock.available_qty}, demande: {qty}."
        )


def _create_audit_log(
    actor,
    store,
    action: str,
    entity_type: str,
    entity_id: str,
    before: Optional[dict] = None,
    after: Optional[dict] = None,
) -> None:
    """Create an audit log entry via the stores service helper."""
    try:
        from stores.services import create_audit_log
        create_audit_log(
            actor=actor,
            store=store,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            before=before,
            after=after,
        )
    except ImportError:
        logger.warning(
            "Could not create audit log -- stores.services not available."
        )


@transaction.atomic
def create_refund(
    sale: Sale,
    amount: Decimal,
    reason: str,
    refund_method: str,
    approved_by,
    processed_by=None,
    reference: str = "",
) -> Refund:
    """Create a refund and apply business side effects atomically.

    Rules:
    - Sale must be PAID or PARTIALLY_PAID.
    - Refund amount must be positive and <= amount_paid.
    - If the sale becomes fully refunded, stock is reintroduced once.
    """
    sale = Sale.objects.select_for_update().get(pk=sale.pk)

    if sale.status not in (Sale.Status.PAID, Sale.Status.PARTIALLY_PAID):
        raise ValueError("Seules les ventes payees peuvent recevoir un remboursement.")
    if amount <= Decimal("0"):
        raise ValueError("Le montant du remboursement doit etre positif.")
    if amount > sale.amount_paid:
        raise ValueError("Le montant du remboursement depasse le montant paye.")
    if not reason.strip():
        raise ValueError("La raison du remboursement est requise.")

    refund = Refund.objects.create(
        sale=sale,
        store=sale.store,
        amount=amount,
        reason=reason.strip(),
        refund_method=refund_method,
        approved_by=approved_by,
        processed_by=processed_by,
        reference=(reference or "").strip(),
    )

    sale.amount_paid = (sale.amount_paid or Decimal("0.00")) - amount
    if sale.amount_paid < Decimal("0.00"):
        sale.amount_paid = Decimal("0.00")
    sale.amount_due = (sale.total or Decimal("0.00")) - sale.amount_paid
    if sale.amount_due < Decimal("0.00"):
        sale.amount_due = Decimal("0.00")

    fully_refunded = sale.amount_paid == Decimal("0.00")
    # Keep compatibility with existing back-office flows:
    # any refund flags the sale as REFUNDED.
    sale.status = Sale.Status.REFUNDED

    sale.save(update_fields=["amount_paid", "amount_due", "status", "updated_at"])

    if fully_refunded:
        try:
            from stock.services import adjust_stock
            for item in sale.items.select_related("product"):
                if not bool(getattr(item.product, "track_stock", True)):
                    continue
                adjust_stock(
                    store=sale.store,
                    product=item.product,
                    qty_delta=int(item.quantity),
                    movement_type="RETURN",
                    reason=f"Remboursement vente {sale.invoice_number or sale.pk}",
                    actor=processed_by or approved_by,
                    reference=str(refund.pk),
                )
        except ImportError:
            logger.exception("Stock service indisponible pendant le remboursement %s", refund.pk)
            raise ValueError("Impossible de remettre le stock: service stock indisponible.")

    _create_audit_log(
        actor=processed_by or approved_by,
        store=sale.store,
        action="SALE_REFUNDED",
        entity_type="Sale",
        entity_id=str(sale.pk),
        after={
            "refund_id": str(refund.pk),
            "refund_amount": str(refund.amount),
            "refund_method": refund.refund_method,
            "sale_status": sale.status,
            "amount_paid": str(sale.amount_paid),
            "amount_due": str(sale.amount_due),
        },
    )

    logger.info("Refund %s created for sale %s (amount=%s)", refund.pk, sale.pk, refund.amount)
    return refund


# ===========================================================================
# Quote (Devis) services
# ===========================================================================


def create_quote(store, created_by, customer=None) -> Quote:
    """Create a new DRAFT quote."""
    if store is None:
        raise ValueError("Impossible de creer un devis sans boutique active.")

    quote = Quote.objects.create(
        store=store,
        created_by=created_by,
        customer=customer,
        status=Quote.Status.DRAFT,
    )
    logger.info("Quote %s created (DRAFT) by %s in store %s", quote.pk, created_by, store)
    return quote


@transaction.atomic
def add_item_to_quote(
    quote: Quote,
    product,
    qty: int = 1,
    discount: Decimal | int | float = 0,
    unit_price: Decimal | None = None,
    actor=None,
) -> QuoteItem:
    """Add a product to a DRAFT quote.

    Unlike sales, no stock availability check is performed because
    quotes are non-binding.
    """
    quote = Quote.objects.select_for_update().get(pk=quote.pk)

    if quote.status != Quote.Status.DRAFT:
        raise ValueError("Impossible d'ajouter un article: le devis n'est pas en brouillon.")

    if not product.is_active:
        raise ValueError(f"Le produit '{product.name}' n'est pas actif.")

    if qty < 1:
        raise ValueError("La quantite doit etre d'au moins 1.")

    # Check if the product already exists — if so, increase qty
    existing_item = quote.items.select_for_update().filter(product=product).first()
    if existing_item:
        existing_item.quantity += qty
        existing_item.discount_amount += Decimal(str(discount))
        existing_item.save()
        recalculate_quote(quote)
        return existing_item

    effective_unit_price = unit_price if unit_price is not None else product.selling_price
    item = QuoteItem(
        quote=quote,
        product=product,
        product_name=product.name,
        unit_price=effective_unit_price,
        cost_price=product.cost_price,
        quantity=qty,
        discount_amount=Decimal(str(discount)),
    )
    item.save()
    recalculate_quote(quote)
    logger.info("Added product %s (qty=%d) to quote %s", product.pk, qty, quote.pk)
    return item


@transaction.atomic
def remove_item_from_quote(quote: Quote, item_id, actor=None) -> None:
    """Remove an item from a DRAFT quote."""
    quote = Quote.objects.select_for_update().get(pk=quote.pk)

    if quote.status != Quote.Status.DRAFT:
        raise ValueError("Impossible de supprimer un article: le devis n'est pas en brouillon.")

    try:
        item = quote.items.get(pk=item_id)
    except QuoteItem.DoesNotExist:
        raise ValueError("Article introuvable dans ce devis.")

    item.delete()
    recalculate_quote(quote)
    logger.info("Removed item from quote %s", quote.pk)


def recalculate_quote(quote: Quote) -> None:
    """Recalculate and persist totals on a quote."""
    prefetched_cache = getattr(quote, "_prefetched_objects_cache", None)
    if prefetched_cache:
        prefetched_cache.pop("items", None)

    quote.recalculate_totals()
    quote.save(update_fields=[
        "subtotal", "discount_amount", "discount_percent",
        "tax_amount", "total", "updated_at",
    ])


@transaction.atomic
def send_quote(quote: Quote, actor) -> Quote:
    """Mark a DRAFT quote as SENT and generate its number.

    Sets ``sent_at`` and computes ``valid_until`` from the enterprise's
    ``offer_validity_days`` setting (defaults to 30 days).
    """
    quote = Quote.objects.select_for_update().get(pk=quote.pk)

    if quote.status != Quote.Status.DRAFT:
        raise ValueError("Seul un devis en brouillon peut etre envoye.")

    if not quote.items.exists():
        raise ValueError("Le devis doit contenir au moins un article.")

    if not quote.customer_id:
        raise ValueError("Veuillez selectionner un client avant d'envoyer le devis.")

    # Generate quote number
    quote.quote_number = generate_quote_number(quote.store)
    quote.status = Quote.Status.SENT
    quote.sent_at = timezone.now()

    # Set validity if not already set
    if not quote.valid_until:
        validity_days = 30
        try:
            enterprise = quote.store.enterprise
            if hasattr(enterprise, "offer_validity_days") and enterprise.offer_validity_days:
                validity_days = enterprise.offer_validity_days
        except Exception:
            pass
        quote.valid_until = (timezone.now() + timezone.timedelta(days=validity_days)).date()

    quote.save(update_fields=[
        "quote_number", "status", "sent_at", "valid_until", "updated_at",
    ])

    _create_audit_log(
        actor=actor,
        store=quote.store,
        action="QUOTE_SENT",
        entity_type="Quote",
        entity_id=str(quote.pk),
        after={"quote_number": quote.quote_number, "status": quote.status},
    )
    logger.info("Quote %s sent (number=%s) by %s", quote.pk, quote.quote_number, actor)
    return quote


@transaction.atomic
def accept_quote(quote: Quote, actor) -> Quote:
    """Mark a SENT quote as ACCEPTED."""
    quote = Quote.objects.select_for_update().get(pk=quote.pk)

    if quote.status != Quote.Status.SENT:
        raise ValueError("Seul un devis envoye peut etre accepte.")

    quote.status = Quote.Status.ACCEPTED
    quote.accepted_at = timezone.now()
    quote.save(update_fields=["status", "accepted_at", "updated_at"])

    _create_audit_log(
        actor=actor,
        store=quote.store,
        action="QUOTE_ACCEPTED",
        entity_type="Quote",
        entity_id=str(quote.pk),
        after={"status": quote.status},
    )
    logger.info("Quote %s accepted by %s", quote.pk, actor)
    return quote


@transaction.atomic
def refuse_quote(quote: Quote, reason: str, actor) -> Quote:
    """Mark a SENT quote as REFUSED."""
    quote = Quote.objects.select_for_update().get(pk=quote.pk)

    if quote.status != Quote.Status.SENT:
        raise ValueError("Seul un devis envoye peut etre refuse.")

    quote.status = Quote.Status.REFUSED
    quote.refused_at = timezone.now()
    quote.refusal_reason = reason.strip()
    quote.save(update_fields=["status", "refused_at", "refusal_reason", "updated_at"])

    _create_audit_log(
        actor=actor,
        store=quote.store,
        action="QUOTE_REFUSED",
        entity_type="Quote",
        entity_id=str(quote.pk),
        after={"status": quote.status, "reason": reason},
    )
    logger.info("Quote %s refused by %s. Reason: %s", quote.pk, actor, reason)
    return quote


@transaction.atomic
def convert_quote_to_sale(quote: Quote, actor) -> Sale:
    """Convert an ACCEPTED quote into a DRAFT sale.

    Copies customer, items, discounts, and notes from the quote.
    Links the sale back to the quote via ``source_quote``.
    """
    quote = Quote.objects.select_for_update().get(pk=quote.pk)

    if quote.status != Quote.Status.ACCEPTED:
        raise ValueError("Seul un devis accepte peut etre converti en facture.")

    if quote.converted_sale_id:
        raise ValueError("Ce devis a deja ete converti en facture.")

    # Create the sale
    sale = Sale.objects.create(
        store=quote.store,
        seller=actor,
        customer=quote.customer,
        status=Sale.Status.DRAFT,
        discount_percent=quote.discount_percent,
        discount_amount=quote.discount_amount,
        notes=quote.notes,
        source_quote=quote,
    )

    # Copy items from quote to sale
    for qi in quote.items.select_related("product"):
        SaleItem.objects.create(
            sale=sale,
            product=qi.product,
            product_name=qi.product_name,
            unit_price=qi.unit_price,
            cost_price=qi.cost_price,
            quantity=qi.quantity,
            discount_amount=qi.discount_amount,
        )

    # Recalculate sale totals
    recalculate_sale(sale)

    # Auto-submit to cashier (generate invoice number, set PENDING_PAYMENT)
    sale.invoice_number = generate_invoice_number(sale.store)
    sale.status = Sale.Status.PENDING_PAYMENT
    sale.submitted_at = timezone.now()
    sale.save(update_fields=[
        "invoice_number", "status", "submitted_at", "updated_at",
    ])

    # Update quote status
    quote.status = Quote.Status.CONVERTED
    quote.converted_at = timezone.now()
    quote.converted_sale = sale
    quote.save(update_fields=["status", "converted_at", "converted_sale", "updated_at"])

    _create_audit_log(
        actor=actor,
        store=quote.store,
        action="QUOTE_CONVERTED",
        entity_type="Quote",
        entity_id=str(quote.pk),
        after={
            "status": quote.status,
            "sale_id": str(sale.pk),
            "invoice_number": sale.invoice_number,
        },
    )
    logger.info(
        "Quote %s converted to sale %s (invoice=%s) by %s",
        quote.pk, sale.pk, sale.invoice_number, actor,
    )
    return sale


def duplicate_quote(quote: Quote, actor) -> Quote:
    """Create a new DRAFT quote copying items from an existing quote."""
    new_quote = Quote.objects.create(
        store=quote.store,
        created_by=actor,
        customer=quote.customer,
        status=Quote.Status.DRAFT,
        discount_percent=quote.discount_percent,
        discount_amount=quote.discount_amount,
        notes=quote.notes,
        conditions=quote.conditions,
    )

    for qi in quote.items.select_related("product"):
        QuoteItem.objects.create(
            quote=new_quote,
            product=qi.product,
            product_name=qi.product_name,
            unit_price=qi.unit_price,
            cost_price=qi.cost_price,
            quantity=qi.quantity,
            discount_amount=qi.discount_amount,
        )

    recalculate_quote(new_quote)
    logger.info("Quote %s duplicated to %s by %s", quote.pk, new_quote.pk, actor)
    return new_quote
