"""Leaderboard computation engine."""
from __future__ import annotations

import logging
from decimal import Decimal

from django.utils import timezone

logger = logging.getLogger(__name__)


class LeaderboardEngine:
    """Build and cache ranked leaderboard data for a store/period."""

    def __init__(self, store_id: str) -> None:
        self.store_id = store_id

    def compute_snapshot(self, period: str) -> "LeaderboardSnapshot":
        """Compute rankings, detect rank changes, award overtake badges, persist."""
        from objectives.models import (
            LeaderboardSnapshot,
            SellerBadge,
            SellerMonthlyStats,
        )
        from accounts.models import User
        from django.db.models import ExpressionWrapper, F, DecimalField

        stats_qs = (
            SellerMonthlyStats.objects.filter(
                store_id=self.store_id,
                period=period,
            )
            .select_related("seller")
            .annotate(
                net_amount_db=ExpressionWrapper(
                    F("gross_amount") - F("refund_amount"),
                    output_field=DecimalField(max_digits=14, decimal_places=2),
                )
            )
            .order_by("-net_amount_db", "-sale_count")
        )

        # Build new ranking list
        entries = []
        for rank, stats in enumerate(stats_qs, start=1):
            entries.append(
                {
                    "rank": rank,
                    "seller_id": str(stats.seller_id),
                    "seller_name": stats.seller.get_full_name() or stats.seller.email,
                    "net_amount": str(stats.net_amount),
                    "sale_count": stats.sale_count,
                    "current_tier_rank": stats.current_tier_rank,
                    "current_tier_name": stats.current_tier_name,
                    "bonus_earned": str(stats.bonus_earned),
                }
            )

        # Load previous snapshot for rank-change detection
        prev_snapshot = LeaderboardSnapshot.objects.filter(
            store_id=self.store_id,
            period=period,
        ).first()

        if prev_snapshot and prev_snapshot.data:
            prev_ranks = {e["seller_id"]: e["rank"] for e in prev_snapshot.data}
            for entry in entries:
                prev_rank = prev_ranks.get(entry["seller_id"])
                if prev_rank is not None:
                    entry["rank_change"] = prev_rank - entry["rank"]  # positive = moved up
                else:
                    entry["rank_change"] = 0
        else:
            for entry in entries:
                entry["rank_change"] = 0

        # Persist snapshot
        snapshot, _ = LeaderboardSnapshot.objects.update_or_create(
            store_id=self.store_id,
            period=period,
            defaults={"data": entries},
        )

        # Award MOST_IMPROVED badge to seller with biggest positive rank_change
        if entries:
            best_improvement = max(entries, key=lambda e: e.get("rank_change", 0))
            if best_improvement.get("rank_change", 0) > 1:
                SellerBadge.objects.get_or_create(
                    seller_id=best_improvement["seller_id"],
                    store_id=self.store_id,
                    badge_type=SellerBadge.BadgeType.MOST_IMPROVED,
                    period=period,
                    defaults={
                        "label": f"Plus grande progression {period}",
                        "icon": "trending-up",
                    },
                )

        return snapshot

    def get_cached_snapshot(
        self,
        period: str,
        max_age_minutes: int = 60,
    ) -> "LeaderboardSnapshot | None":
        """Return snapshot if fresh enough, else None (caller should recompute)."""
        from datetime import timedelta
        from objectives.models import LeaderboardSnapshot

        threshold = timezone.now() - timedelta(minutes=max_age_minutes)
        return LeaderboardSnapshot.objects.filter(
            store_id=self.store_id,
            period=period,
            computed_at__gte=threshold,
        ).first()
