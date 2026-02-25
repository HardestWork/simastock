"""Objective calculation engine for seller stats & bonuses.

Core design principles:
- PostgreSQL advisory locks prevent race conditions (no SELECT FOR UPDATE needed)
- JSONB tier_snapshot freezes tier data at computation time
- Incremental computation: queries aggregate from raw Payment records
- Projection: daily_rate x remaining_days for next-tier estimate
"""
from __future__ import annotations

import hashlib
import logging
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from django.db.models import Count, Q, Sum

from django.db import connection, transaction
from django.utils import timezone

if TYPE_CHECKING:
    from accounts.models import User

logger = logging.getLogger(__name__)


class ObjectiveCalculationEngine:
    """Recompute SellerMonthlyStats for one seller + period."""

    def __init__(self, store_id: str) -> None:
        self.store_id = store_id

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def compute_for_seller(
        self,
        seller_id: str,
        period: str,  # "YYYY-MM"
        trigger: str = "PAYMENT",
    ) -> "SellerMonthlyStats | None":
        """
        Compute and persist stats for seller/period.

        Returns None if a PostgreSQL advisory lock could not be acquired
        (another task is already processing the same row).
        """
        # Late imports to avoid circular deps
        from objectives.models import (
            ObjectiveRule,
            ObjectiveTier,
            SellerMonthlyStats,
            SellerPenalty,
        )

        lock_key = self._make_lock_key(seller_id, period)

        with transaction.atomic():
            # On PostgreSQL, use an advisory lock to avoid concurrent recomputes.
            # On other DB engines (sqlite in local tests), continue without lock.
            acquired = True
            if connection.vendor == "postgresql":
                with connection.cursor() as cursor:
                    cursor.execute(
                        "SELECT pg_try_advisory_xact_lock(%s)", [lock_key]
                    )
                    row = cursor.fetchone()
                    acquired = bool(row and row[0])

            if not acquired:
                logger.debug(
                    "Advisory lock not acquired for seller=%s period=%s — skipping",
                    seller_id,
                    period,
                )
                return None

            # Fetch the active rule for this store + period
            rule = self._get_active_rule(period)
            if rule is None:
                logger.warning(
                    "No active ObjectiveRule for store=%s period=%s",
                    self.store_id,
                    period,
                )
                return None

            tiers = list(rule.tiers.order_by("rank"))

            # Aggregate raw financials from Payment records
            financials = self._aggregate_financials(seller_id, period)

            gross = financials["gross"]
            refunds = financials["refunds"]
            net = gross - refunds
            sale_count = financials["sale_count"]
            cancellation_count = financials["cancellation_count"]
            avg_basket = (net / sale_count) if sale_count > 0 else Decimal("0")
            credit_recovered = financials["credit_recovered"]

            # Determine tier
            reached_tier = self._determine_tier(net, tiers)

            # Apply active penalties
            stats_obj, _ = SellerMonthlyStats.objects.get_or_create(
                store_id=self.store_id,
                seller_id=seller_id,
                period=period,
            )

            active_penalties = SellerPenalty.objects.filter(
                stats=stats_obj,
                is_void=False,
            )
            total_deduction = sum(
                p.amount for p in active_penalties
                if p.penalty_type.mode == "DEDUCTION"
            )
            hard_cap_ranks = [
                p.penalty_type.cap_tier_rank
                for p in active_penalties
                if p.penalty_type.mode == "HARD_CAP"
                and p.penalty_type.cap_tier_rank is not None
            ]
            if hard_cap_ranks and reached_tier:
                max_allowed_rank = min(hard_cap_ranks)
                if reached_tier.rank > max_allowed_rank:
                    capped_tiers = [t for t in tiers if t.rank == max_allowed_rank]
                    reached_tier = capped_tiers[0] if capped_tiers else None

            # Recompute bonus after HARD_CAP adjustments to keep tier/bonus consistent.
            bonus = self._compute_bonus(net, reached_tier)
            final_bonus = max(Decimal("0"), bonus - total_deduction)

            # Build tier snapshot (frozen JSONB)
            tier_snapshot = [
                {
                    "rank": t.rank,
                    "name": t.name,
                    "threshold": str(t.threshold),
                    "bonus_amount": str(t.bonus_amount),
                    "bonus_rate": str(t.bonus_rate),
                    "color": t.color,
                    "icon": t.icon,
                }
                for t in tiers
            ]

            # Persist
            stats_obj.gross_amount = gross
            stats_obj.refund_amount = refunds
            stats_obj.sale_count = sale_count
            stats_obj.cancellation_count = cancellation_count
            stats_obj.avg_basket = avg_basket
            stats_obj.credit_recovered = credit_recovered
            stats_obj.current_tier_rank = reached_tier.rank if reached_tier else 0
            stats_obj.current_tier_name = reached_tier.name if reached_tier else ""
            stats_obj.bonus_earned = final_bonus
            stats_obj.tier_snapshot = tier_snapshot
            stats_obj.last_trigger = trigger
            stats_obj.computed_at = timezone.now()
            stats_obj.save()

            return stats_obj

    def compute_projection(self, stats: "SellerMonthlyStats", period: str) -> dict:
        """
        Project final-month amount and days-to-next-tier based on daily rate.
        Returns dict with daily_rate, projected_amount, days_to_next_tier, next_tier.
        """
        from objectives.models import ObjectiveRule

        today = date.today()
        year, month = int(period[:4]), int(period[5:7])
        period_start = date(year, month, 1)
        # Last day of month
        if month == 12:
            period_end = date(year + 1, 1, 1)
        else:
            period_end = date(year, month + 1, 1)
        total_days = (period_end - period_start).days
        elapsed = max(1, (today - period_start).days)
        remaining = max(0, (period_end - today).days)  # 0 for past/completed months

        net = stats.net_amount
        if remaining == 0:
            # Month is over — projection equals actual, daily rate over full month
            daily_rate = (net / total_days) if total_days > 0 else Decimal("0")
            projected = net
        else:
            daily_rate = net / elapsed if elapsed > 0 else Decimal("0")
            projected = net + daily_rate * remaining

        # Find next tier
        rule = self._get_active_rule(period)
        next_tier = None
        days_to_next = None
        if rule:
            tiers = list(rule.tiers.order_by("rank"))
            for tier in tiers:
                if tier.threshold > net:
                    next_tier = tier
                    gap = tier.threshold - net
                    days_to_next = int(gap / daily_rate) if daily_rate > 0 else None
                    break

        return {
            "daily_rate": daily_rate,
            "projected_amount": projected,
            "next_tier": next_tier,
            "days_to_next_tier": days_to_next,
            "elapsed_days": elapsed,
            "remaining_days": remaining,
        }

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _make_lock_key(self, seller_id: str, period: str) -> int:
        raw = f"{seller_id}:{period}:{self.store_id}"
        hex_digest = hashlib.md5(raw.encode()).hexdigest()[:8]
        return int(hex_digest, 16) % (2**31)

    def _get_active_rule(self, period: str):
        from objectives.models import ObjectiveRule

        year, month = int(period[:4]), int(period[5:7])
        period_date = date(year, month, 15)  # mid-month probe
        return (
            ObjectiveRule.objects.filter(
                store_id=self.store_id,
                is_active=True,
                valid_from__lte=period_date,
            )
            .filter(
                Q(valid_until__isnull=True) | Q(valid_until__gte=period_date)
            )
            .order_by("-valid_from")
            .first()
        )

    def _aggregate_financials(self, seller_id: str, period: str) -> dict:
        """Aggregate Payment/Sale data for seller in the given period.

        Period anchor: Payment.created_at (money-in date, per user preference).
        Refund anchor: Refund.created_at (date the refund was processed).
        """
        from cashier.models import Payment
        from sales.models import Refund, Sale

        year, month = int(period[:4]), int(period[5:7])

        # Gross: sum of all payments received this period for this seller's sales
        payments = Payment.objects.filter(
            store_id=self.store_id,
            sale__seller_id=seller_id,
            created_at__year=year,
            created_at__month=month,
        )

        agg = payments.aggregate(total=Sum("amount"))
        gross = agg["total"] or Decimal("0")

        # Refunds: use actual Refund.amount to support partial refunds
        refund_agg = Refund.objects.filter(
            store_id=self.store_id,
            sale__seller_id=seller_id,
            created_at__year=year,
            created_at__month=month,
        ).aggregate(total=Sum("amount"))
        refunds = refund_agg["total"] or Decimal("0")

        # Sale counts (anchored on sale creation date)
        sale_agg = Sale.objects.filter(
            store_id=self.store_id,
            seller_id=seller_id,
            created_at__year=year,
            created_at__month=month,
        ).aggregate(
            completed=Count(
                "id",
                filter=Q(status__in=[Sale.Status.PAID, Sale.Status.PARTIALLY_PAID]),
            ),
            cancelled=Count("id", filter=Q(status=Sale.Status.CANCELLED)),
        )

        # Credit sales: on-credit payments received in this period
        credit_agg = payments.filter(method=Payment.Method.CREDIT).aggregate(
            total=Sum("amount")
        )
        credit_recovered = credit_agg["total"] or Decimal("0")

        return {
            "gross": gross,
            "refunds": refunds,
            "sale_count": sale_agg["completed"] or 0,
            "cancellation_count": sale_agg["cancelled"] or 0,
            "credit_recovered": credit_recovered,
        }

    def _determine_tier(self, net: Decimal, tiers: list) -> "ObjectiveTier | None":
        """Return the highest tier whose threshold <= net amount."""
        reached = None
        for tier in sorted(tiers, key=lambda t: t.rank):
            if net >= tier.threshold:
                reached = tier
        return reached

    def _compute_bonus(self, net: Decimal, tier) -> Decimal:
        if tier is None:
            return Decimal("0")
        if tier.bonus_amount > 0:
            return tier.bonus_amount
        if tier.bonus_rate > 0:
            return (net * tier.bonus_rate / Decimal("100")).quantize(Decimal("1"))
        return Decimal("0")

    # ------------------------------------------------------------------
    # Score 360 analytics
    # ------------------------------------------------------------------

    def compute_score_360(self, stats, period):
        from objectives.models import SellerPenalty
        net = float(stats.net_amount)
        gross = float(stats.gross_amount) or 1.0
        first_tier_threshold = 1.0
        if stats.tier_snapshot:
            sorted_tiers = sorted(stats.tier_snapshot, key=lambda t: int(t["rank"]))
            if sorted_tiers:
                first_tier_threshold = float(sorted_tiers[0]["threshold"]) or 500_000
        encaissement_score = min(net / max(first_tier_threshold, 1) * 2, 2) * 20
        encaissement_score = round(min(encaissement_score, 40))
        credit_recovered = float(stats.credit_recovered)
        credit_score = min(credit_recovered / max(gross * 0.10, 1), 1) * 20
        credit_score = round(credit_score)
        total_sales = max(stats.sale_count + stats.cancellation_count, 1)
        cancel_rate = stats.cancellation_count / total_sales
        active_penalties = SellerPenalty.objects.filter(
            stats=stats, is_void=False, penalty_type__mode="DEDUCTION"
        )
        penalty_total = float(sum(p.amount for p in active_penalties))
        penalty_ratio = penalty_total / max(net * 0.10, 1)
        discipline_score = round(25 * (1 - cancel_rate) * (1 - min(penalty_ratio, 1)))
        discipline_score = max(0, discipline_score)
        avg_delay = self._compute_avg_payment_delay(str(stats.seller_id), period)
        vitesse_score = max(0, round(15 - avg_delay * 1.5))
        vitesse_score = min(vitesse_score, 15)
        total = encaissement_score + credit_score + discipline_score + vitesse_score
        components = [
            ("encaissement", encaissement_score, 40, "Augmente tes ventes pour atteindre le prochain palier"),
            ("credit", credit_score, 20, "Recouvre davantage de creances clients"),
            ("discipline", discipline_score, 25, "Reduis tes annulations et penalites"),
            ("vitesse", vitesse_score, 15, "Encourage tes clients a payer plus rapidement"),
        ]
        sorted_by_gap = sorted(components, key=lambda c: c[2] - c[1], reverse=True)
        actions = [c[3] for c in sorted_by_gap[:3]]
        return {
            "total": total,
            "encaissement": encaissement_score,
            "credit": credit_score,
            "discipline": discipline_score,
            "vitesse": vitesse_score,
            "actions": actions,
        }

    def compute_risk_score(self, seller_id, period):
        from cashier.models import Payment
        from sales.models import Refund, Sale
        year, month = int(period[:4]), int(period[5:7])
        payments = Payment.objects.filter(
            store_id=self.store_id,
            sale__seller_id=seller_id,
            created_at__year=year,
            created_at__month=month,
        )
        agg = payments.aggregate(total=Sum("amount"))
        gross = float(agg["total"] or 0)
        refund_agg = Refund.objects.filter(
            store_id=self.store_id,
            sale__seller_id=seller_id,
            created_at__year=year,
            created_at__month=month,
        ).aggregate(total=Sum("amount"))
        refunds = float(refund_agg["total"] or 0)
        sales_qs = Sale.objects.filter(
            store_id=self.store_id,
            seller_id=seller_id,
            created_at__year=year,
            created_at__month=month,
        )
        from django.db.models import Avg
        discount_agg = sales_qs.exclude(status=Sale.Status.CANCELLED).aggregate(avg_discount=Avg("discount_percent"))
        avg_discount = float(discount_agg["avg_discount"] or 0)
        sale_count = sales_qs.filter(status__in=[Sale.Status.PAID, Sale.Status.PARTIALLY_PAID]).count()
        cancel_count = sales_qs.filter(status=Sale.Status.CANCELLED).count()
        total_sales = max(sale_count + cancel_count, 1)
        cancel_rate = cancel_count / total_sales * 100
        credit_recovered = float(payments.filter(method=Payment.Method.CREDIT).aggregate(total=Sum("amount"))["total"] or 0)
        avg_delay = self._compute_avg_payment_delay(seller_id, period)
        anomalies = []
        if avg_discount > 20:
            anomalies.append({"type": "HIGH_DISCOUNT", "label": "Remises excessives", "value": f"{avg_discount:.1f}%", "threshold": "20%"})
        if cancel_rate > 30:
            anomalies.append({"type": "HIGH_CANCELLATION", "label": "Taux d'annulations eleve", "value": f"{cancel_rate:.1f}%", "threshold": "30%"})
        if gross > 0 and refunds / gross > 0.15:
            anomalies.append({"type": "REFUND_SPIKE", "label": "Taux de remboursements eleve", "value": f"{refunds / gross * 100:.1f}%", "threshold": "15%"})
        if avg_delay > 7:
            anomalies.append({"type": "SLOW_PAYMENT", "label": "Delai de paiement trop long", "value": f"{avg_delay:.1f} jours", "threshold": "7 jours"})
        if gross > 0 and credit_recovered / gross > 0.5:
            anomalies.append({"type": "UNUSUAL_CREDIT", "label": "Ratio credit inhabituel", "value": f"{credit_recovered / gross * 100:.1f}%", "threshold": "50%"})
        risk_score = min(len(anomalies) * 20, 100)
        return {"risk_score": risk_score, "anomalies": anomalies}

    def compute_seller_profile(self, stats, risk_score):
        if risk_score >= 60:
            return "RISQUE"
        gross = float(stats.gross_amount) or 1.0
        credit = float(stats.credit_recovered)
        if credit / gross > 0.20:
            return "RECOUVREUR"
        avg_basket = float(stats.avg_basket)
        if avg_basket > 100_000:
            return "CLOSER"
        if stats.sale_count > 40:
            return "SPRINTER"
        return "STANDARD"

    def compute_coaching_missions(self, seller_id, period, stats):
        missions_pool = []
        net = float(stats.net_amount)
        gross = float(stats.gross_amount) or 1.0
        credit = float(stats.credit_recovered)
        if credit < 50_000:
            missions_pool.append({
                "id": "credit_recovery",
                "category": "credit",
                "priority": 1,
                "title": "Recouvre tes creances",
                "detail": f"Tu as recupere {int(credit):,} FCFA. Vise au moins 50 000 FCFA de recouvrement ce mois.".replace(",", " "),
                "urgency": max(0, 50_000 - credit),
            })
        if stats.cancellation_count > 2:
            missions_pool.append({
                "id": "reduce_cancellations",
                "category": "discipline",
                "priority": 2,
                "title": "Reduis tes annulations",
                "detail": f"Tu as {stats.cancellation_count} annulation(s) ce mois. Chaque annulation impacte ton score.",
                "urgency": stats.cancellation_count * 10_000,
            })
        progress_pct = 0.0
        if stats.tier_snapshot:
            sorted_tiers = sorted(stats.tier_snapshot, key=lambda t: int(t["rank"]))
            if sorted_tiers:
                first_threshold = float(sorted_tiers[0]["threshold"]) or 1
                progress_pct = min(net / first_threshold * 100, 100)
        if progress_pct < 50:
            from datetime import date
            today = date.today()
            year_p, month_p = int(period[:4]), int(period[5:7])
            if month_p == 12:
                from datetime import date as d
                remaining_days = (d(year_p + 1, 1, 1) - today).days
            else:
                from datetime import date as d
                remaining_days = (d(year_p, month_p + 1, 1) - today).days
            remaining_days = max(remaining_days, 1)
            if stats.tier_snapshot:
                first_threshold = float(sorted(stats.tier_snapshot, key=lambda t: int(t["rank"]))[0]["threshold"])
                gap = max(0, first_threshold - net)
                per_day = int(gap / remaining_days)
                tier_name = sorted(stats.tier_snapshot, key=lambda t: int(t["rank"]))[0]["name"]
                missions_pool.append({
                    "id": "accelerate_revenue",
                    "category": "performance",
                    "priority": 1,
                    "title": "Accelere tes ventes",
                    "detail": f"Il te faut {per_day:,} FCFA/jour pour atteindre le palier {tier_name}.".replace(",", " "),
                    "urgency": gap,
                })
        avg_discount = self._compute_avg_discount_rate(seller_id, period)
        if avg_discount > 15:
            missions_pool.append({
                "id": "reduce_discounts",
                "category": "discipline",
                "priority": 3,
                "title": "Limite tes remises",
                "detail": f"Tes remises moyennes sont a {avg_discount:.1f}%. Vise moins de 15%.",
                "urgency": (avg_discount - 15) * 5_000,
            })
        avg_delay = self._compute_avg_payment_delay(seller_id, period)
        if avg_delay > 5:
            missions_pool.append({
                "id": "speed_up_payments",
                "category": "speed",
                "priority": 4,
                "title": "Accelere les encaissements",
                "detail": f"Delai moyen de paiement: {avg_delay:.1f} jours. Encourage tes clients a payer plus vite.",
                "urgency": (avg_delay - 5) * 3_000,
            })
        missions_pool.sort(key=lambda m: m["urgency"], reverse=True)
        result = []
        for i, m in enumerate(missions_pool[:3]):
            result.append({
                "id": m["id"],
                "category": m["category"],
                "title": m["title"],
                "detail": m["detail"],
                "priority": i + 1,
            })
        return result

    def _compute_avg_payment_delay(self, seller_id, period):
        from cashier.models import Payment
        from django.db.models import F, ExpressionWrapper, DurationField, Avg
        year, month = int(period[:4]), int(period[5:7])
        payments = Payment.objects.filter(
            store_id=self.store_id,
            sale__seller_id=seller_id,
            sale__submitted_at__isnull=False,
            created_at__year=year,
            created_at__month=month,
        ).annotate(
            delay=ExpressionWrapper(
                F("created_at") - F("sale__submitted_at"),
                output_field=DurationField(),
            )
        ).aggregate(avg_delay=Avg("delay"))
        delta = payments["avg_delay"]
        if delta is None:
            return 0.0
        return max(0.0, delta.total_seconds() / 86400)

    def _compute_avg_discount_rate(self, seller_id, period):
        from sales.models import Sale
        from django.db.models import Avg
        year, month = int(period[:4]), int(period[5:7])
        result = Sale.objects.filter(
            store_id=self.store_id,
            seller_id=seller_id,
            created_at__year=year,
            created_at__month=month,
        ).exclude(status=Sale.Status.CANCELLED).aggregate(avg=Avg("discount_percent"))
        return float(result["avg"] or 0)

    def compute_multi_period_ranking(self, period, me_id):
        from cashier.models import Payment
        from django.db.models import Sum, Count
        from datetime import date, timedelta
        today = date.today()
        week_start = today - timedelta(days=today.weekday())

        def _build_ranking(qs_filter):
            rows = (
                Payment.objects.filter(store_id=self.store_id, **qs_filter)
                .values("sale__seller_id", "sale__seller__first_name", "sale__seller__last_name")
                .annotate(total=Sum("amount"), count=Count("id"))
                .order_by("-total")
            )
            result = []
            for idx, r in enumerate(rows):
                sid = str(r["sale__seller_id"])
                fname = r.get("sale__seller__first_name") or ""
                lname = r.get("sale__seller__last_name") or ""
                result.append({
                    "rank": idx + 1,
                    "seller_id": sid,
                    "seller_name": f"{fname} {lname}".strip(),
                    "total": str(r["total"] or 0),
                    "sale_count": r["count"],
                    "is_me": sid == me_id,
                })
            return result

        year, month = int(period[:4]), int(period[5:7])
        day_ranking = _build_ranking({"created_at__date": today})
        week_ranking = _build_ranking({"created_at__date__gte": week_start})
        month_ranking = _build_ranking({"created_at__year": year, "created_at__month": month})

        def _gap_message(ranking):
            my_entry = next((e for e in ranking if e["is_me"]), None)
            if my_entry is None:
                return None
            my_rank = my_entry["rank"]
            if my_rank <= 1:
                return None
            target_entry = next((e for e in ranking if e["rank"] == my_rank - 1), None)
            if target_entry is None:
                return None
            gap = float(target_entry["total"]) - float(my_entry["total"])
            if gap <= 0:
                return None
            return f"Il te manque {int(gap):,} FCFA pour depasser #{my_rank - 1}".replace(",", " ")

        return {
            "day": day_ranking,
            "week": week_ranking,
            "month": month_ranking,
            "gap_messages": {
                "day": _gap_message(day_ranking),
                "week": _gap_message(week_ranking),
                "month": _gap_message(month_ranking),
            },
        }
