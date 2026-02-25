"""Signals for incremental customer intelligence refresh."""
from __future__ import annotations

from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from cashier.models import Payment
from credits.models import CreditLedgerEntry, PaymentSchedule
from sales.models import Refund


def _refresh_customer_intelligence_async(store_id, customer_id):
    if not store_id or not customer_id:
        return

    def _dispatch():
        try:
            from analytics.tasks import refresh_customer_intelligence_customer

            refresh_customer_intelligence_customer.delay(str(store_id), str(customer_id))
            return
        except Exception:
            # Fallback in case broker/worker is unavailable.
            from analytics.customer_intelligence import refresh_customer_intelligence_for_customer
            from customers.models import Customer
            from stores.models import Store

            store = Store.objects.filter(pk=store_id, is_active=True).first()
            customer = Customer.objects.filter(pk=customer_id, is_default=False).first()
            if store and customer:
                refresh_customer_intelligence_for_customer(
                    store=store,
                    customer=customer,
                    actor=None,
                    force_recommendations_refresh=True,
                )

    transaction.on_commit(_dispatch)


@receiver(post_save, sender=Payment)
def payment_saved_refresh_customer_intelligence(sender, instance: Payment, created, **kwargs):
    if not created:
        return
    sale = getattr(instance, "sale", None)
    customer_id = getattr(sale, "customer_id", None)
    store_id = getattr(instance, "store_id", None)
    _refresh_customer_intelligence_async(store_id=store_id, customer_id=customer_id)


@receiver(post_save, sender=Refund)
def refund_saved_refresh_customer_intelligence(sender, instance: Refund, created, **kwargs):
    if not created:
        return
    sale = getattr(instance, "sale", None)
    customer_id = getattr(sale, "customer_id", None)
    store_id = getattr(instance, "store_id", None)
    _refresh_customer_intelligence_async(store_id=store_id, customer_id=customer_id)


@receiver(post_save, sender=CreditLedgerEntry)
def credit_ledger_saved_refresh_customer_intelligence(sender, instance: CreditLedgerEntry, created, **kwargs):
    if not created:
        return
    account = getattr(instance, "account", None)
    if not account:
        return
    _refresh_customer_intelligence_async(
        store_id=getattr(account, "store_id", None),
        customer_id=getattr(account, "customer_id", None),
    )


@receiver(post_save, sender=PaymentSchedule)
def payment_schedule_saved_refresh_customer_intelligence(sender, instance: PaymentSchedule, created, **kwargs):
    account = getattr(instance, "account", None)
    if not account:
        return
    _refresh_customer_intelligence_async(
        store_id=getattr(account, "store_id", None),
        customer_id=getattr(account, "customer_id", None),
    )

