"""Signal receivers for automatic accounting entry generation.

Each receiver checks:
1. Feature flag "accounting" is enabled for the enterprise
2. AccountingSettings exist
3. No duplicate entry (handled inside service functions)
"""

import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

logger = logging.getLogger(__name__)


def _is_accounting_enabled(store):
    """Check if the accounting feature flag is active for this store."""
    if not store:
        return False
    checker = getattr(store, "is_feature_enabled", None)
    return bool(callable(checker) and checker("accounting"))


# ---------------------------------------------------------------------------
# Sale → PAID
# ---------------------------------------------------------------------------

@receiver(post_save, sender="sales.Sale")
def on_sale_saved(sender, instance, **kwargs):
    """When a sale transitions to PAID, generate a VE journal entry."""
    if instance.status != "PAID":
        return
    if not _is_accounting_enabled(instance.store):
        return
    try:
        from accounting.services import post_sale_entry
        post_sale_entry(instance)
    except Exception:
        logger.exception("Erreur generation ecriture vente %s", instance.pk)


# ---------------------------------------------------------------------------
# Payment → created
# ---------------------------------------------------------------------------

@receiver(post_save, sender="cashier.Payment")
def on_payment_saved(sender, instance, created, **kwargs):
    """When a payment is created, generate a treasury journal entry."""
    if not created:
        return
    sale = instance.sale
    if not sale or not _is_accounting_enabled(sale.store):
        return
    try:
        from accounting.services import post_payment_entry
        post_payment_entry(instance)
    except Exception:
        logger.exception("Erreur generation ecriture paiement %s", instance.pk)


# ---------------------------------------------------------------------------
# Refund → created
# ---------------------------------------------------------------------------

@receiver(post_save, sender="sales.Refund")
def on_refund_saved(sender, instance, created, **kwargs):
    """When a refund is created, generate reversal entries."""
    if not created:
        return
    store = instance.store or (instance.sale.store if instance.sale else None)
    if not store or not _is_accounting_enabled(store):
        return
    try:
        from accounting.services import post_refund_entry
        post_refund_entry(instance)
    except Exception:
        logger.exception("Erreur generation ecriture remboursement %s", instance.pk)


# ---------------------------------------------------------------------------
# GoodsReceipt → created
# ---------------------------------------------------------------------------

@receiver(post_save, sender="purchases.GoodsReceipt")
def on_goods_receipt_saved(sender, instance, created, **kwargs):
    """When goods are received, generate an AC journal entry."""
    if not created:
        return
    store = instance.store
    if not store or not _is_accounting_enabled(store):
        return
    try:
        from accounting.services import post_purchase_entry
        post_purchase_entry(instance)
    except Exception:
        logger.exception("Erreur generation ecriture achat %s", instance.pk)


# ---------------------------------------------------------------------------
# Expense → POSTED / VOIDED
# ---------------------------------------------------------------------------

@receiver(post_save, sender="expenses.Expense")
def on_expense_saved(sender, instance, **kwargs):
    """When an expense is posted or voided, generate the corresponding entry."""
    if not _is_accounting_enabled(instance.store):
        return
    try:
        if instance.status == "POSTED":
            from accounting.services import post_expense_entry
            post_expense_entry(instance)
        elif instance.status == "VOIDED":
            from accounting.services import post_expense_void_entry
            post_expense_void_entry(instance)
    except Exception:
        logger.exception("Erreur generation ecriture depense %s", instance.pk)


# ---------------------------------------------------------------------------
# CreditLedgerEntry → CREDIT_PAYMENT
# ---------------------------------------------------------------------------

@receiver(post_save, sender="credits.CreditLedgerEntry")
def on_credit_ledger_entry_saved(sender, instance, created, **kwargs):
    """When a credit payment is recorded, generate a treasury entry."""
    if not created:
        return
    if instance.entry_type != "CREDIT_PAYMENT":
        return
    # Navigate to store via account → customer → enterprise → stores
    account = instance.account
    if not account or not account.customer:
        return
    customer = account.customer
    enterprise = customer.enterprise
    if not enterprise:
        return
    # Check any store of the enterprise for the flag
    from stores.models import Store
    store = Store.objects.filter(enterprise=enterprise, is_active=True).first()
    if not store or not _is_accounting_enabled(store):
        return
    try:
        from accounting.services import post_credit_payment_entry
        post_credit_payment_entry(instance)
    except Exception:
        logger.exception("Erreur generation ecriture credit %s", instance.pk)
