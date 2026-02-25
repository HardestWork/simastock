"""Celery tasks for the objectives module."""
from __future__ import annotations

import logging
from datetime import date

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=30)
def recompute_seller_objective(self, *, store_id: str, seller_id: str, period: str):
    """Recompute SellerMonthlyStats for a single seller/period."""
    try:
        from objectives.engine import ObjectiveCalculationEngine
        engine = ObjectiveCalculationEngine(store_id=store_id)
        result = engine.compute_for_seller(
            seller_id=seller_id,
            period=period,
            trigger="PAYMENT",
        )
        if result is None:
            # Lock not acquired — schedule a retry
            raise self.retry(countdown=5)
        logger.info("Recomputed objectives for seller=%s period=%s", seller_id, period)
    except Exception as exc:
        logger.exception("recompute_seller_objective failed: %s", exc)
        raise self.retry(exc=exc)


@shared_task
def recompute_store_month(*, store_id: str, period: str):
    """Recompute stats for ALL sellers in a store for a given period."""
    from accounts.models import User
    from stores.models import StoreUser
    from objectives.engine import ObjectiveCalculationEngine

    engine = ObjectiveCalculationEngine(store_id=store_id)
    # Only compute for SALES-role users — managers and admins don't have seller objectives
    seller_ids = StoreUser.objects.filter(
        store_id=store_id,
        user__role="SALES",
    ).values_list("user_id", flat=True)

    for seller_id in seller_ids:
        engine.compute_for_seller(
            seller_id=str(seller_id),
            period=period,
            trigger="SCHEDULED",
        )
    logger.info(
        "Recomputed store month store=%s period=%s (%d sellers)",
        store_id,
        period,
        len(seller_ids),
    )


@shared_task
def close_month_objectives():
    """
    Scheduled daily (Celery Beat). Only runs logic on the 1st of each month.
    Mark previous month stats as final and award badges.
    """
    from calendar import monthrange
    from objectives.models import SellerMonthlyStats, SellerBadge
    from objectives.leaderboard import LeaderboardEngine

    today = date.today()
    # Guard: only run on day 1 of month
    if today.day != 1:
        logger.debug("close_month_objectives: skipping (today is day %d)", today.day)
        return
    # Compute previous month period string
    if today.month == 1:
        prev_year, prev_month = today.year - 1, 12
    else:
        prev_year, prev_month = today.year, today.month - 1
    period = f"{prev_year}-{prev_month:02d}"

    # Mark all non-final stats as final
    updated = SellerMonthlyStats.objects.filter(
        period=period,
        is_final=False,
    ).update(is_final=True)
    logger.info("Closed %d stats records for period %s", updated, period)

    # Award BEST_MONTH badge to top seller per store
    from django.db.models import Max
    stores = SellerMonthlyStats.objects.filter(period=period).values_list(
        "store_id", flat=True
    ).distinct()

    for store_id in stores:
        engine = LeaderboardEngine(store_id=str(store_id))
        engine.compute_snapshot(period=period)

        top = (
            SellerMonthlyStats.objects.filter(store_id=store_id, period=period)
            .order_by("-gross_amount")
            .first()
        )
        if top:
            SellerBadge.objects.get_or_create(
                seller_id=top.seller_id,
                store_id=store_id,
                badge_type=SellerBadge.BadgeType.BEST_MONTH,
                period=period,
                defaults={"label": f"Meilleur vendeur {period}", "icon": "trophy"},
            )


@shared_task
def refresh_all_leaderboards():
    """
    Run every hour (Celery Beat).
    Refresh leaderboard snapshots for the current month for all stores.
    """
    from objectives.leaderboard import LeaderboardEngine
    from stores.models import Store

    today = date.today()
    period = f"{today.year}-{today.month:02d}"

    stores = Store.objects.filter(is_active=True).values_list("id", flat=True)
    for store_id in stores:
        try:
            engine = LeaderboardEngine(store_id=str(store_id))
            engine.compute_snapshot(period=period)
        except Exception as exc:
            logger.warning("Leaderboard refresh failed store=%s: %s", store_id, exc)

    logger.info("Refreshed leaderboards for %d stores (period=%s)", len(stores), period)
