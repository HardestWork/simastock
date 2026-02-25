"""Signals: trigger objective recomputation on payments/sales/refunds."""
from __future__ import annotations

import logging
from django.db import transaction
from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver
from django.utils import timezone

logger = logging.getLogger(__name__)


def _get_period(dt) -> str:
    if dt is None:
        dt = timezone.now()
    return dt.strftime("%Y-%m")


def _recompute_now(*, store_id, seller_id, period: str) -> None:
    """Best-effort local recompute for immediate dashboard consistency."""
    from objectives.engine import ObjectiveCalculationEngine

    engine = ObjectiveCalculationEngine(store_id=str(store_id))
    engine.compute_for_seller(
        seller_id=str(seller_id),
        period=period,
        trigger="SIGNAL",
    )


def _queue_recompute(*, store_id, seller_id, period: str, sync_recompute: bool = True) -> None:
    def _dispatch() -> None:
        queued = False
        try:
            from objectives.tasks import recompute_seller_objective

            recompute_seller_objective.delay(
                store_id=str(store_id),
                seller_id=str(seller_id),
                period=period,
            )
            queued = True
        except Exception as exc:
            logger.warning("objectives async dispatch failed: %s", exc, exc_info=True)

        if sync_recompute:
            # Keep seller metrics up-to-date even when workers are unavailable.
            try:
                _recompute_now(
                    store_id=store_id,
                    seller_id=seller_id,
                    period=period,
                )
            except Exception as exc:
                # Never let a signal crash a business transaction.
                level = logger.warning if queued else logger.error
                level("objectives sync recompute failed: %s", exc, exc_info=True)

    # Queue after DB commit so worker reads committed payment/sale state.
    # Fallback to immediate dispatch in contexts where no DB transaction/
    # connection is available (e.g. lightweight unit tests).
    try:
        transaction.on_commit(_dispatch)
    except Exception:
        _dispatch()


def _queue_for_sale(sale, *, period: str) -> None:
    if not sale or not getattr(sale, "seller_id", None):
        return
    sync_recompute = bool(getattr(sale, "pk", None))
    _queue_recompute(
        store_id=sale.store_id,
        seller_id=sale.seller_id,
        period=period,
        sync_recompute=sync_recompute,
    )


@receiver(post_save, sender="cashier.Payment")
def on_payment_saved(sender, instance, **kwargs):
    # Objectives are anchored on money-in date, not sale creation date.
    _queue_for_sale(instance.sale, period=_get_period(instance.created_at))


@receiver(post_delete, sender="cashier.Payment")
def on_payment_deleted(sender, instance, **kwargs):
    _queue_for_sale(instance.sale, period=_get_period(instance.created_at))


@receiver(pre_save, sender="sales.Sale")
def on_sale_pre_save(sender, instance, **kwargs):
    """Capture previous status to detect transitions in post_save."""
    if not getattr(instance, "pk", None):
        instance._previous_status = None
        return
    previous = sender.objects.filter(pk=instance.pk).only("status").first()
    instance._previous_status = getattr(previous, "status", None)


@receiver(post_save, sender="sales.Sale")
def on_sale_saved(sender, instance, created, **kwargs):
    """Recompute on cancellation, which impacts cancellation_count."""
    if created:
        return
    previous_status = getattr(instance, "_previous_status", None)
    if previous_status == instance.status:
        return
    if instance.status != "CANCELLED":
        return
    _queue_for_sale(instance, period=_get_period(instance.created_at))


@receiver(post_save, sender="sales.Refund")
def on_refund_saved(sender, instance, **kwargs):
    # Refunds are anchored on refund processing date.
    _queue_for_sale(instance.sale, period=_get_period(instance.created_at))


@receiver(post_delete, sender="sales.Refund")
def on_refund_deleted(sender, instance, **kwargs):
    _queue_for_sale(instance.sale, period=_get_period(instance.created_at))
