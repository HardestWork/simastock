"""Business logic / service layer for the cashier app.

All cashier operations (open/close shifts, process payments) are
implemented here to keep views thin and make the logic testable
independently of the HTTP layer.
"""
from __future__ import annotations

import logging
from decimal import Decimal
from typing import Any

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from stores.services import create_audit_log

from .models import CashShift, Payment

logger = logging.getLogger("boutique")
ALLOWED_CASHIER_ROLES = ("CASHIER", "MANAGER", "ADMIN")


def _can_cash(user, store) -> bool:
    """Check whether *user* is allowed to operate the register at *store*.

    Uses capability-based check when the ``advanced_permissions`` feature
    flag is active; otherwise falls back to the legacy role check.
    """
    if getattr(user, "role", None) in ("ADMIN", "MANAGER"):
        return True
    if store and store.is_feature_enabled("advanced_permissions"):
        store_user = user.store_users.filter(store=store).first()
        if store_user:
            return store_user.has_capability("CAN_CASH")
    return getattr(user, "role", None) in ALLOWED_CASHIER_ROLES


def normalize_payment_method(value) -> str | None:
    """Normalize payment method to canonical Payment.Method code."""
    raw = (value or "").strip()
    if not raw:
        return None

    normalized = raw.upper().replace("-", "_").replace(" ", "_")
    valid_codes = {code for code, _label in Payment.Method.choices}
    if normalized in valid_codes:
        return normalized

    alias_map = {
        "ESPECES": Payment.Method.CASH,
        "ESPECE": Payment.Method.CASH,
        "CASH": Payment.Method.CASH,
        "MOBILEMONEY": Payment.Method.MOBILE_MONEY,
        "MOMO": Payment.Method.MOBILE_MONEY,
        "VIREMENT_BANCAIRE": Payment.Method.BANK_TRANSFER,
        "VIREMENT": Payment.Method.BANK_TRANSFER,
        "CREDIT": Payment.Method.CREDIT,
        "CHEQUE": Payment.Method.CHEQUE,
    }
    return alias_map.get(normalized)


# ==================================================================
# open_shift
# ==================================================================

def open_shift(store, cashier, opening_float: Decimal = Decimal("0")) -> CashShift:
    """Open a new cash shift for *cashier* at *store*.

    Parameters
    ----------
    store : stores.models.Store
        The store where the shift is being opened.
    cashier : accounts.models.User
        The cashier opening the shift.
    opening_float : Decimal
        The cash amount in the register at the start.

    Returns
    -------
    CashShift
        The newly created (OPEN) shift.

    Raises
    ------
    ValueError
        If the cashier already has an open shift at this store.
    """
    if not _can_cash(cashier, store):
        raise ValueError("Seuls les caissiers, managers ou admins peuvent ouvrir une session de caisse.")

    # Validate: no other open shift for this cashier at this store
    existing = CashShift.objects.filter(
        cashier=cashier,
        store=store,
        status=CashShift.Status.OPEN,
    ).exists()

    if existing:
        raise ValueError(
            "Ce caissier a deja une session de caisse ouverte dans cette boutique."
        )

    shift = CashShift.objects.create(
        store=store,
        cashier=cashier,
        status=CashShift.Status.OPEN,
        opening_float=opening_float,
        expected_cash=opening_float,
    )

    # Audit log
    create_audit_log(
        actor=cashier,
        store=store,
        action="OPEN_SHIFT",
        entity_type="CashShift",
        entity_id=str(shift.pk),
        after={
            "opening_float": str(opening_float),
            "cashier": str(cashier.pk),
        },
    )

    logger.info(
        "Shift opened: %s by %s at %s (float: %s)",
        shift.pk, cashier, store, opening_float,
    )

    return shift


# ==================================================================
# close_shift
# ==================================================================

def close_shift(
    shift: CashShift,
    closing_cash: Decimal,
    notes: str = "",
) -> CashShift:
    """Close an open cash shift.

    Calculates expected cash, variance, and totals by payment method.

    Parameters
    ----------
    shift : CashShift
        The shift to close (must be OPEN).
    closing_cash : Decimal
        The actual cash counted in the register.
    notes : str
        Optional notes about the closing.

    Returns
    -------
    CashShift
        The updated (CLOSED) shift.

    Raises
    ------
    ValueError
        If the shift is not in OPEN status.
    """
    if shift.status != CashShift.Status.OPEN:
        raise ValueError("Cette session de caisse est deja fermee.")

    with transaction.atomic():
        # Re-fetch with lock to avoid concurrent closing
        shift = CashShift.objects.select_for_update().get(pk=shift.pk)

        if shift.status != CashShift.Status.OPEN:
            raise ValueError("Cette session de caisse est deja fermee.")

        # Calculate totals from actual payment records
        totals = calculate_shift_totals(shift)

        shift.total_sales = totals["total_sales"]
        shift.total_cash_payments = totals["total_cash"]
        shift.total_mobile_payments = totals["total_mobile"]
        shift.total_bank_payments = totals["total_bank"]
        shift.total_credit_payments = totals["total_credit"]

        # Calculate expected cash = opening float + cash payments
        shift.calculate_expected_cash()

        # Set closing values
        shift.closing_cash = closing_cash
        shift.variance = closing_cash - shift.expected_cash
        shift.closed_at = timezone.now()
        shift.status = CashShift.Status.CLOSED
        shift.notes = notes

        shift.save()

    # Audit log
    create_audit_log(
        actor=shift.cashier,
        store=shift.store,
        action="CLOSE_SHIFT",
        entity_type="CashShift",
        entity_id=str(shift.pk),
        after={
            "closing_cash": str(closing_cash),
            "expected_cash": str(shift.expected_cash),
            "variance": str(shift.variance),
            "total_sales": str(shift.total_sales),
        },
    )

    logger.info(
        "Shift closed: %s (variance: %s %s)",
        shift.pk, shift.variance, shift.store.currency,
    )

    return shift


# ==================================================================
# process_payment
# ==================================================================

def process_payment(
    sale,
    payments_data: list[dict[str, Any]],
    cashier,
    shift: CashShift,
) -> list[Payment]:
    """Process one or more payments against a sale.

    Parameters
    ----------
    sale : sales.models.Sale
        The sale to pay. Must have status PENDING_PAYMENT or PARTIALLY_PAID.
    payments_data : list[dict]
        List of payment dicts, each containing:
        - ``method`` (str): Payment method code (e.g. "CASH", "MOBILE_MONEY").
        - ``amount`` (Decimal): Amount for this payment line.
        - ``reference`` (str, optional): External reference.
        - ``notes`` (str, optional): Additional notes.
    cashier : accounts.models.User
        The cashier processing the payment.
    shift : CashShift
        The current open shift for the cashier.

    Returns
    -------
    list[Payment]
        List of created Payment records.

    Raises
    ------
    ValueError
        On any validation failure (shift not open, sale status invalid,
        amounts incorrect, etc.).
    """
    # ------------------------------------------------------------------
    # Validations
    # ------------------------------------------------------------------
    if not _can_cash(cashier, sale.store if hasattr(sale, 'store') else None):
        raise ValueError("Seuls les caissiers, managers ou admins peuvent encaisser des paiements.")

    if shift.status != CashShift.Status.OPEN:
        raise ValueError("La session de caisse n'est pas ouverte.")

    if shift.cashier_id != cashier.pk:
        raise ValueError("Cette session de caisse n'appartient pas a ce caissier.")

    if shift.store_id != sale.store_id:
        raise ValueError("La session de caisse et la vente doivent appartenir a la meme boutique.")

    valid_statuses = ("PENDING_PAYMENT", "PARTIALLY_PAID")
    if sale.status not in valid_statuses:
        raise ValueError(
            f"Le statut de la vente ({sale.status}) ne permet pas de paiement. "
            f"Statuts valides: {', '.join(valid_statuses)}."
        )

    if not payments_data:
        raise ValueError("Aucune donnee de paiement fournie.")

    normalized_payments: list[dict[str, Any]] = []
    valid_methods = dict(Payment.Method.choices)
    for payment_info in payments_data:
        method = normalize_payment_method(payment_info.get("method"))
        amount = Decimal(str(payment_info["amount"]))
        reference = payment_info.get("reference", "")
        notes = payment_info.get("notes", "")

        if amount <= 0:
            raise ValueError("Chaque paiement doit avoir un montant positif.")

        if method not in valid_methods:
            raise ValueError(
                "Methode de paiement invalide. "
                f"Valeurs attendues: {', '.join(valid_methods.keys())}"
            )

        normalized_payments.append(
            {
                "method": method,
                "amount": amount,
                "reference": reference,
                "notes": notes,
            }
        )

    # CREDIT payments must always be linked to a real customer account.
    if any(p["method"] == Payment.Method.CREDIT for p in normalized_payments):
        if not sale.customer_id:
            raise ValueError("Un client est obligatoire pour enregistrer un paiement a credit.")
        # Block the generic default customer for credit operations.
        if bool(getattr(getattr(sale, "customer", None), "is_default", False)):
            raise ValueError("Un client nominatif est obligatoire pour enregistrer un paiement a credit.")

    # Validate credit limit before proceeding
    credit_total = sum(
        p["amount"] for p in normalized_payments
        if p["method"] == Payment.Method.CREDIT
    )
    if credit_total > 0 and sale.customer_id:
        try:
            from credits.models import CustomerAccount
            account = CustomerAccount.objects.filter(
                store=sale.store, customer_id=sale.customer_id, is_active=True,
            ).first()
            if account and account.available_credit < credit_total:
                raise ValueError(
                    f"Limite de credit insuffisante. "
                    f"Disponible: {account.available_credit}, demande: {credit_total}."
                )
        except ImportError:
            pass

    # Validate total amount
    total_payment = sum(Decimal(str(p["amount"])) for p in normalized_payments)
    if total_payment <= 0:
        raise ValueError("Le montant total du paiement doit etre positif.")

    if total_payment > sale.amount_due:
        raise ValueError(
            f"Le montant total ({total_payment}) depasse le montant du "
            f"({sale.amount_due})."
        )

    # ------------------------------------------------------------------
    # Process within a transaction
    # ------------------------------------------------------------------
    created_payments = []

    with transaction.atomic():
        # Lock the sale row to prevent concurrent payment processing
        from django.apps import apps
        Sale = apps.get_model("sales", "Sale")
        sale = Sale.objects.select_for_update().get(pk=sale.pk)
        shift = CashShift.objects.select_for_update().get(pk=shift.pk)

        # Re-validate shift after locking (it may have changed concurrently).
        if shift.status != CashShift.Status.OPEN:
            raise ValueError("La session de caisse n'est plus ouverte.")

        if shift.cashier_id != cashier.pk:
            raise ValueError("Cette session de caisse n'appartient pas a ce caissier.")

        if shift.store_id != sale.store_id:
            raise ValueError("La session de caisse et la vente doivent appartenir a la meme boutique.")

        # Re-validate status after locking
        if sale.status not in valid_statuses:
            raise ValueError(
                f"Le statut de la vente a change ({sale.status}). "
                f"Veuillez reessayer."
            )

        if sale.amount_due <= 0:
            raise ValueError("Cette vente est deja entierement reglee.")

        if total_payment > sale.amount_due:
            raise ValueError(
                f"Le montant total ({total_payment}) depasse le montant du "
                f"({sale.amount_due})."
            )

        for payment_info in normalized_payments:
            payment = Payment.objects.create(
                sale=sale,
                store=shift.store,
                cashier=cashier,
                shift=shift,
                method=payment_info["method"],
                amount=payment_info["amount"],
                reference=payment_info["reference"],
                notes=payment_info["notes"],
            )
            created_payments.append(payment)

        has_credit_payment = any(
            payment.method == Payment.Method.CREDIT
            for payment in created_payments
        )

        # ------------------------------------------------------------------
        # Update sale amounts
        # ------------------------------------------------------------------
        sale.amount_paid = (sale.amount_paid or Decimal("0")) + total_payment
        sale.amount_due = (sale.total or Decimal("0")) - sale.amount_paid

        # Keep sales workflows and reports in sync with credit-origin payments.
        if has_credit_payment:
            sale.is_credit_sale = True

        # Ensure amount_due does not go negative
        if sale.amount_due < 0:
            sale.amount_due = Decimal("0")

        # Determine new sale status
        if sale.amount_due <= 0:
            # Fully paid
            sale.status = Sale.Status.PAID
            sale.paid_at = timezone.now()
            sale.save()

            # Keep reserved quantities in sync once the sale leaves partial-paid state.
            if sale.reserve_stock:
                _sync_reserved_stock_for_sale_products(sale)

            # Decrement stock for each sale line
            _decrement_stock_for_sale(sale, cashier)
        else:
            # Partially paid
            sale.status = Sale.Status.PARTIALLY_PAID
            sale.save()

            # Optionally reserve stock for partially paid sales
            if sale.reserve_stock:
                _sync_reserved_stock_for_sale_products(sale)

        # ------------------------------------------------------------------
        # Handle credit payments: create credit ledger entry
        # ------------------------------------------------------------------
        for payment in created_payments:
            if payment.method == Payment.Method.CREDIT:
                _create_credit_entry(sale, payment, cashier)

        # ------------------------------------------------------------------
        # Update shift totals (incrementally)
        # ------------------------------------------------------------------
        _update_shift_totals(shift, created_payments)

        # ------------------------------------------------------------------
        # Audit log
        # ------------------------------------------------------------------
        create_audit_log(
            actor=cashier,
            store=shift.store,
            action="PROCESS_PAYMENT",
            entity_type="Sale",
            entity_id=str(sale.pk),
            after={
                "payments": [
                    {
                        "method": p.method,
                        "amount": str(p.amount),
                        "reference": p.reference,
                    }
                    for p in created_payments
                ],
                "total_paid": str(total_payment),
                "sale_status": sale.status,
                "amount_paid": str(sale.amount_paid),
                "amount_due": str(sale.amount_due),
            },
        )

    logger.info(
        "Payment processed for sale %s: %s payment(s), total %s",
        sale.pk, len(created_payments), total_payment,
    )

    # ------------------------------------------------------------------
    # Anti-fraud: detect self-checkout (seller == cashier)
    # ------------------------------------------------------------------
    if str(cashier.pk) == str(sale.seller_id):
        create_audit_log(
            actor=cashier,
            store=shift.store,
            action="SELF_CHECKOUT",
            entity_type="Sale",
            entity_id=str(sale.pk),
            after={
                "total": str(sale.total),
                "cashier": str(cashier.pk),
                "invoice_number": sale.invoice_number or "",
            },
        )
        try:
            from alerts.models import Alert
            Alert.objects.create(
                store=shift.store,
                alert_type="SELF_CHECKOUT",
                severity="MEDIUM",
                title="Auto-encaissement detecte",
                message=(
                    f"{cashier.get_full_name()} a encaisse sa propre vente "
                    f"#{sale.invoice_number or sale.pk} "
                    f"({sale.total} {shift.store.currency})."
                ),
            )
        except Exception:
            logger.warning(
                "Failed to create SELF_CHECKOUT alert for sale %s",
                sale.pk, exc_info=True,
            )

    return created_payments


# ==================================================================
# get_current_shift
# ==================================================================

def get_current_shift(cashier, store) -> CashShift | None:
    """Return the currently open shift for *cashier* at *store*, or None."""
    return (
        CashShift.objects
        .filter(
            cashier=cashier,
            store=store,
            status=CashShift.Status.OPEN,
        )
        .select_related("cashier", "store")
        .first()
    )


# ==================================================================
# calculate_shift_totals
# ==================================================================

def calculate_shift_totals(shift: CashShift) -> dict[str, Decimal]:
    """Calculate totals by payment method for a given shift.

    Parameters
    ----------
    shift : CashShift
        The shift to calculate totals for.

    Returns
    -------
    dict
        Dictionary with keys:
        - ``total_sales``: Sum of all payment amounts.
        - ``total_cash``: Sum of CASH payments.
        - ``total_mobile``: Sum of MOBILE_MONEY payments.
        - ``total_bank``: Sum of BANK_TRANSFER payments.
        - ``total_credit``: Sum of CREDIT payments.
        - ``total_cheque``: Sum of CHEQUE payments.
        - ``payment_count``: Total number of payments.
    """
    payments = shift.payments.all()

    total_sales = payments.aggregate(total=Sum("amount"))["total"] or Decimal("0")
    total_cash = (
        payments.filter(method=Payment.Method.CASH)
        .aggregate(total=Sum("amount"))["total"]
    ) or Decimal("0")
    total_mobile = (
        payments.filter(method=Payment.Method.MOBILE_MONEY)
        .aggregate(total=Sum("amount"))["total"]
    ) or Decimal("0")
    total_bank = (
        payments.filter(method=Payment.Method.BANK_TRANSFER)
        .aggregate(total=Sum("amount"))["total"]
    ) or Decimal("0")
    total_credit = (
        payments.filter(method=Payment.Method.CREDIT)
        .aggregate(total=Sum("amount"))["total"]
    ) or Decimal("0")
    total_cheque = (
        payments.filter(method=Payment.Method.CHEQUE)
        .aggregate(total=Sum("amount"))["total"]
    ) or Decimal("0")

    return {
        "total_sales": total_sales,
        "total_cash": total_cash,
        "total_mobile": total_mobile,
        "total_bank": total_bank,
        "total_credit": total_credit,
        "total_cheque": total_cheque,
        "payment_count": payments.count(),
    }


# ==================================================================
# Internal helpers
# ==================================================================

def _decrement_stock_for_sale(sale, actor):
    """Decrement stock for each line item in a fully paid sale.

    Attempts to use ``stock.services.adjust_stock`` if available;
    otherwise falls back to direct model manipulation.
    """
    try:
        from stock.services import adjust_stock
        for item in sale.items.select_related("product"):
            if not bool(getattr(item.product, "track_stock", True)):
                continue
            adjust_stock(
                store=sale.store,
                product=item.product,
                qty_delta=-item.quantity,
                movement_type="SALE",
                reason=f"Vente {sale.invoice_number or sale.pk}",
                actor=actor,
                reference=str(sale.pk),
            )
        _sync_reserved_stock_for_sale_products(sale)
    except ImportError:
        # Fallback: direct stock update
        logger.warning(
            "stock.services.adjust_stock not available; "
            "using direct ProductStock update."
        )
        try:
            from stock.models import ProductStock, InventoryMovement
            for item in sale.items.select_related("product"):
                if not bool(getattr(item.product, "track_stock", True)):
                    continue
                stock_record, _created = ProductStock.objects.select_for_update().get_or_create(
                    store=sale.store,
                    product=item.product,
                    defaults={"quantity": 0},
                )
                stock_record.quantity -= item.quantity
                stock_record.save(update_fields=["quantity", "updated_at"])

                # Record the inventory movement
                InventoryMovement.objects.create(
                    store=sale.store,
                    product=item.product,
                    movement_type=InventoryMovement.MovementType.SALE,
                    quantity=-item.quantity,
                    reference=str(sale.pk),
                    reason=f"Vente {sale.pk}",
                    actor=actor,
                )

            _sync_reserved_stock_for_sale_products(sale)
        except Exception:
            logger.exception(
                "Failed to decrement stock for sale %s", sale.pk
            )
            raise


def _sync_reserved_stock_for_sale_products(sale):
    """Synchronize ProductStock.reserved_qty for products involved in a sale.

    We recompute reserved quantities from all partially paid sales with
    ``reserve_stock=True`` to avoid drift when payments are edited or
    finalized concurrently.
    """
    try:
        from django.apps import apps
        from stock.models import ProductStock

        SaleItem = apps.get_model("sales", "SaleItem")
        product_ids = list(
            sale.items.filter(product__track_stock=True)
            .values_list("product_id", flat=True)
            .distinct()
        )

        if not product_ids:
            return

        for product_id in product_ids:
            stock_record, _created = ProductStock.objects.select_for_update().get_or_create(
                store=sale.store,
                product_id=product_id,
                defaults={"quantity": 0, "reserved_qty": 0},
            )

            reserved_target = (
                SaleItem.objects.filter(
                    sale__store=sale.store,
                    sale__status="PARTIALLY_PAID",
                    sale__reserve_stock=True,
                    product_id=product_id,
                ).aggregate(total=Sum("quantity"))["total"]
                or 0
            )

            if stock_record.reserved_qty != reserved_target:
                stock_record.reserved_qty = reserved_target
                stock_record.save(update_fields=["reserved_qty", "updated_at"])
                try:
                    from alerts.services import create_stock_level_alert_for_product_stock

                    create_stock_level_alert_for_product_stock(stock_record)
                except Exception:
                    logger.warning(
                        "Low-stock alert refresh failed for reserved stock %s/%s",
                        stock_record.store_id,
                        stock_record.product_id,
                        exc_info=True,
                    )
    except Exception:
        logger.exception(
            "Failed to sync reserved stock for sale %s", sale.pk,
        )
        raise


def _reserve_stock_for_sale(sale):
    """Backward-compatible alias for reservation synchronization."""
    _sync_reserved_stock_for_sale_products(sale)


def _create_credit_entry(sale, payment, cashier):
    """Create a credit ledger entry for a CREDIT payment.

    Uses the credits app's service layer to properly record the credit
    sale and update the customer account balance.
    """
    if not sale.customer:
        raise ValueError("Un client est obligatoire pour enregistrer un paiement a credit.")

    try:
        from credits.services import get_or_create_account, record_credit_sale
        account = get_or_create_account(store=sale.store, customer=sale.customer)
        record_credit_sale(
            account=account,
            sale=sale,
            amount=payment.amount,
            actor=cashier,
        )
        logger.info(
            "Credit ledger entry created for payment %s (sale %s)",
            payment.pk, sale.pk,
        )
    except (ImportError, LookupError):
        # credits app or model not available yet; log and continue
        logger.warning(
            "Could not create credit ledger entry for payment %s. "
            "The credits app may not be configured yet.",
            payment.pk,
            exc_info=True,
        )
    except Exception:
        logger.exception(
            "Failed to create credit ledger entry for payment %s",
            payment.pk,
        )
        raise


def _update_shift_totals(shift: CashShift, payments: list[Payment]):
    """Incrementally update shift totals with newly created payments.

    This is more efficient than recalculating all totals from scratch
    for every payment.
    """
    for payment in payments:
        shift.total_sales += payment.amount

        if payment.method == Payment.Method.CASH:
            shift.total_cash_payments += payment.amount
        elif payment.method == Payment.Method.MOBILE_MONEY:
            shift.total_mobile_payments += payment.amount
        elif payment.method == Payment.Method.BANK_TRANSFER:
            shift.total_bank_payments += payment.amount
        elif payment.method == Payment.Method.CREDIT:
            shift.total_credit_payments += payment.amount
        # CHEQUE payments are not tracked in a separate shift total field
        # but are included in total_sales

    # Recalculate expected cash
    shift.calculate_expected_cash()
    shift.save()


# Compatibility alias kept for old imports.
_release_reserved_stock_for_sale = _sync_reserved_stock_for_sale_products
