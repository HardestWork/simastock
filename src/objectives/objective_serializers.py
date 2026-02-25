"""DRF Serializers for the objectives module."""
from __future__ import annotations

from decimal import Decimal

from django.utils import timezone
from rest_framework import serializers

from objectives.models import (
    LeaderboardSettings,
    LeaderboardSnapshot,
    ObjectiveRule,
    ObjectiveTier,
    SellerBadge,
    SellerBonusHistory,
    SellerMonthlyStats,
    SellerObjective,
    SellerPenalty,
    SellerPenaltyType,
    SellerSprint,
    SellerSprintResult,
)


# ────────────────────────────────────────────────────────────
# Tiers & Rules
# ────────────────────────────────────────────────────────────

class ObjectiveTierSerializer(serializers.ModelSerializer):
    class Meta:
        model = ObjectiveTier
        fields = [
            "id", "rank", "name", "threshold", "bonus_amount",
            "bonus_rate", "color", "icon",
        ]


class ObjectiveRuleSerializer(serializers.ModelSerializer):
    tiers = ObjectiveTierSerializer(many=True, read_only=True)

    class Meta:
        model = ObjectiveRule
        fields = [
            "id", "store", "name", "is_active", "valid_from", "valid_until",
            "version", "notes", "tiers", "created_at",
        ]
        read_only_fields = ["id", "version", "created_at"]


class ObjectiveRuleWriteSerializer(serializers.ModelSerializer):
    """Used for create/update — validates tiers inline."""
    tiers = ObjectiveTierSerializer(many=True)

    class Meta:
        model = ObjectiveRule
        fields = [
            "name", "is_active", "valid_from", "valid_until",
            "notes", "tiers",
        ]

    def validate_tiers(self, tiers):
        if len(tiers) < 1:
            raise serializers.ValidationError("Au moins un palier est requis.")
        ranks = [t["rank"] for t in tiers]
        if len(ranks) != len(set(ranks)):
            raise serializers.ValidationError("Les rangs des paliers doivent etre uniques.")
        sorted_tiers = sorted(tiers, key=lambda t: t["rank"])
        prev = Decimal("-1")
        for t in sorted_tiers:
            if t["threshold"] <= prev:
                raise serializers.ValidationError("Les seuils doivent etre croissants.")
            prev = t["threshold"]
        return tiers

    def create(self, validated_data):
        tiers_data = validated_data.pop("tiers")
        rule = ObjectiveRule.objects.create(**validated_data)
        for t in tiers_data:
            ObjectiveTier.objects.create(rule=rule, **t)
        return rule

    def update(self, instance, validated_data):
        # Versioning: create a new rule, deactivate old one.
        # tiers may be absent in a PATCH request — fall back to copying existing tiers.
        tiers_data = validated_data.pop("tiers", None)
        if tiers_data is None:
            tiers_data = list(
                instance.tiers.order_by("rank").values(
                    "rank", "name", "threshold",
                    "bonus_amount", "bonus_rate", "color", "icon",
                )
            )

        instance.is_active = False
        instance.save(update_fields=["is_active"])

        new_rule = ObjectiveRule.objects.create(
            store=instance.store,
            version=instance.version + 1,
            **validated_data,
        )
        for t in tiers_data:
            ObjectiveTier.objects.create(rule=new_rule, **t)
        return new_rule


# ────────────────────────────────────────────────────────────
# SellerObjective
# ────────────────────────────────────────────────────────────

class SellerObjectiveSerializer(serializers.ModelSerializer):
    seller_name = serializers.SerializerMethodField()

    class Meta:
        model = SellerObjective
        fields = ["id", "store", "seller", "seller_name", "rule", "period"]
        read_only_fields = ["id", "store"]

    def get_seller_name(self, obj) -> str:
        return obj.seller.get_full_name() or obj.seller.email


# ────────────────────────────────────────────────────────────
# Monthly Stats
# ────────────────────────────────────────────────────────────

class SellerMonthlyStatsSerializer(serializers.ModelSerializer):
    net_amount = serializers.DecimalField(
        max_digits=14, decimal_places=2, read_only=True
    )
    seller_name = serializers.SerializerMethodField()

    class Meta:
        model = SellerMonthlyStats
        fields = [
            "id", "store", "seller", "seller_name", "period",
            "gross_amount", "refund_amount", "net_amount",
            "sale_count", "cancellation_count", "avg_basket", "credit_recovered",
            "current_tier_rank", "current_tier_name", "bonus_earned",
            "tier_snapshot", "is_final", "last_trigger", "computed_at",
        ]
        read_only_fields = ["id", "computed_at"]

    def get_seller_name(self, obj) -> str:
        return obj.seller.get_full_name() or obj.seller.email


# ────────────────────────────────────────────────────────────
# Seller Dashboard (composite)
# ────────────────────────────────────────────────────────────

class SellerDashboardSerializer(serializers.Serializer):
    """
    Composite serializer that flattens all dashboard data for the frontend.
    The `stats` object + `projection` dict are passed via serializer context.
    """
    seller = serializers.SerializerMethodField()
    objective = serializers.SerializerMethodField()
    has_active_rule = serializers.SerializerMethodField()
    progress = serializers.SerializerMethodField()
    bonus = serializers.SerializerMethodField()
    tiers = serializers.SerializerMethodField()
    statistics = serializers.SerializerMethodField()
    penalties = serializers.SerializerMethodField()
    projection = serializers.SerializerMethodField()
    ranking = serializers.SerializerMethodField()
    last_updated = serializers.SerializerMethodField()
    score_360 = serializers.SerializerMethodField()
    risk = serializers.SerializerMethodField()
    profile = serializers.SerializerMethodField()

    def get_seller(self, stats):
        u = stats.seller
        return {
            "id": str(u.id),
            "name": u.get_full_name() or u.email,
            "email": u.email,
        }

    def get_objective(self, stats):
        return {
            "period": stats.period,
            "is_final": stats.is_final,
        }

    def get_has_active_rule(self, stats) -> bool:
        return bool(self.context.get("has_active_rule", False))

    def get_progress(self, stats):
        net = stats.net_amount
        tiers = sorted(stats.tier_snapshot or [], key=lambda x: int(x["rank"]))
        current_rank = stats.current_tier_rank
        current_threshold = Decimal("0")
        next_threshold = None

        for t in tiers:
            threshold = Decimal(str(t["threshold"]))
            rank = int(t["rank"])
            if rank == current_rank:
                current_threshold = threshold
            if rank > current_rank and next_threshold is None:
                next_threshold = threshold

        if current_rank == 0 and tiers and next_threshold is None:
            next_threshold = Decimal(str(tiers[0]["threshold"]))

        if next_threshold is not None and next_threshold > current_threshold:
            pct = float(
                ((net - current_threshold) / (next_threshold - current_threshold) * 100)
                .quantize(Decimal("0.1"))
            )
            pct = max(0.0, min(100.0, pct))
        elif next_threshold is None and current_rank > 0:
            pct = 100.0
        else:
            pct = 0.0

        remaining_to_next = Decimal("0")
        if next_threshold is not None:
            remaining_to_next = max(Decimal("0"), next_threshold - net)

        return {
            "net_amount": str(net),
            "current_tier_rank": stats.current_tier_rank,
            "current_tier_name": stats.current_tier_name,
            "progress_pct": pct,
            "remaining_to_next": str(remaining_to_next),
        }

    def get_bonus(self, stats):
        return {
            "earned": str(stats.bonus_earned),
        }

    def get_tiers(self, stats):
        return stats.tier_snapshot or []

    def get_statistics(self, stats):
        return {
            "sale_count": stats.sale_count,
            "cancellation_count": stats.cancellation_count,
            "avg_basket": str(stats.avg_basket),
            "credit_recovered": str(stats.credit_recovered),
            "gross_amount": str(stats.gross_amount),
            "refund_amount": str(stats.refund_amount),
        }

    def get_penalties(self, stats):
        from objectives.models import SellerPenalty
        penalties = SellerPenalty.objects.filter(
            stats=stats, is_void=False
        ).select_related("penalty_type")
        result = []
        total = Decimal("0")
        for p in penalties:
            result.append({
                "id": str(p.id),
                "type": p.penalty_type.name,
                "mode": p.penalty_type.mode,
                "amount": str(p.amount),
                "reason": p.reason,
                "created_at": p.created_at.isoformat(),
            })
            if p.penalty_type.mode == "DEDUCTION":
                total += p.amount
        return {"items": result, "total_deduction": str(total)}

    def get_projection(self, stats):
        proj = self.context.get("projection")
        if not proj:
            return None
        return {
            "daily_rate": str(proj["daily_rate"]),
            "projected_amount": str(proj["projected_amount"]),
            "next_tier_name": proj["next_tier"].name if proj["next_tier"] else None,
            "next_tier_threshold": str(proj["next_tier"].threshold) if proj["next_tier"] else None,
            "days_to_next_tier": proj["days_to_next_tier"],
            "elapsed_days": proj["elapsed_days"],
            "remaining_days": proj["remaining_days"],
        }

    def get_ranking(self, stats):
        return self.context.get("ranking")

    def get_last_updated(self, stats):
        if stats.computed_at:
            return stats.computed_at.isoformat()
        return None

    def get_score_360(self, stats):
        return self.context.get("score_360")

    def get_risk(self, stats):
        return self.context.get("risk")

    def get_profile(self, stats):
        return self.context.get("profile")


# ────────────────────────────────────────────────────────────
# History
# ────────────────────────────────────────────────────────────

class SellerHistoryItemSerializer(serializers.Serializer):
    period = serializers.CharField()
    net_amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    sale_count = serializers.IntegerField()
    current_tier_rank = serializers.IntegerField()
    current_tier_name = serializers.CharField()
    bonus_earned = serializers.DecimalField(max_digits=14, decimal_places=2)
    rank = serializers.IntegerField(allow_null=True)
    is_final = serializers.BooleanField()


# ────────────────────────────────────────────────────────────
# Leaderboard
# ────────────────────────────────────────────────────────────

class LeaderboardSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = LeaderboardSettings
        fields = [
            "id", "store", "visibility", "show_amounts",
            "show_tier", "refresh_interval_minutes",
        ]
        read_only_fields = ["id"]


# ────────────────────────────────────────────────────────────
# Bonuses
# ────────────────────────────────────────────────────────────

class SellerBonusHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = SellerBonusHistory
        fields = [
            "id", "stats", "amount", "status",
            "paid_at", "notes", "paid_by", "created_at",
        ]
        read_only_fields = ["id", "created_at"]


# ────────────────────────────────────────────────────────────
# Penalties
# ────────────────────────────────────────────────────────────

class SellerPenaltyTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = SellerPenaltyType
        fields = [
            "id", "store", "name", "mode",
            "default_amount", "cap_tier_rank", "is_active",
        ]
        read_only_fields = ["id", "store"]


class SellerPenaltySerializer(serializers.ModelSerializer):
    penalty_type_name = serializers.CharField(
        source="penalty_type.name", read_only=True
    )
    penalty_mode = serializers.CharField(
        source="penalty_type.mode", read_only=True
    )

    class Meta:
        model = SellerPenalty
        fields = [
            "id", "stats", "penalty_type", "penalty_type_name", "penalty_mode",
            "amount", "reason", "is_void", "voided_by", "voided_at",
            "applied_by", "created_at",
        ]
        read_only_fields = [
            "id", "is_void", "voided_by", "voided_at", "applied_by", "created_at"
        ]

    def validate(self, attrs):
        stats = attrs.get("stats") or getattr(self.instance, "stats", None)
        penalty_type = attrs.get("penalty_type") or getattr(self.instance, "penalty_type", None)
        if stats and penalty_type and stats.store_id != penalty_type.store_id:
            raise serializers.ValidationError(
                {
                    "penalty_type": "Le type de penalite doit appartenir a la meme boutique que les stats.",
                }
            )
        return attrs


# ────────────────────────────────────────────────────────────
# Badges
# ────────────────────────────────────────────────────────────

class SellerBadgeSerializer(serializers.ModelSerializer):
    class Meta:
        model = SellerBadge
        fields = [
            "id", "seller", "store", "badge_type",
            "period", "label", "icon", "created_at",
        ]
        read_only_fields = ["id", "created_at"]


# ────────────────────────────────────────────────────────────
# Sprints
# ────────────────────────────────────────────────────────────

class SellerSprintResultSerializer(serializers.ModelSerializer):
    seller_name = serializers.SerializerMethodField()

    class Meta:
        model = SellerSprintResult
        fields = [
            "id", "sprint", "seller", "seller_name",
            "rank", "amount", "is_winner",
        ]
        read_only_fields = ["id"]

    def get_seller_name(self, obj) -> str:
        return obj.seller.get_full_name() or obj.seller.email


class SellerSprintSerializer(serializers.ModelSerializer):
    results = SellerSprintResultSerializer(many=True, read_only=True)

    class Meta:
        model = SellerSprint
        fields = [
            "id", "store", "name", "starts_at", "ends_at",
            "status", "prize_description", "created_by", "results", "created_at",
        ]
        read_only_fields = ["id", "created_at"]
