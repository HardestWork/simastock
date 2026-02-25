"""Tests for objectives module API and validations."""
from datetime import date
from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError
from rest_framework.test import APIRequestFactory, force_authenticate

from objectives.models import (
    ObjectiveRule,
    ObjectiveTier,
    SellerMonthlyStats,
    SellerObjective,
    SellerPenalty,
    SellerPenaltyType,
)
from objectives.engine import ObjectiveCalculationEngine
from objectives.objective_views import SellerDashboardView
from objectives.objective_serializers import SellerObjectiveSerializer, SellerPenaltySerializer
from stores.models import Store


class TestObjectiveRuleValidation:
    def test_active_rules_cannot_overlap(self, store):
        ObjectiveRule.objects.create(
            store=store,
            name="Regle Janvier",
            is_active=True,
            valid_from=date(2026, 1, 1),
            valid_until=None,
            version=1,
        )
        overlapping = ObjectiveRule(
            store=store,
            name="Regle Fevrier",
            is_active=True,
            valid_from=date(2026, 2, 1),
            valid_until=None,
            version=2,
        )
        with pytest.raises(ValidationError):
            overlapping.full_clean()


class TestSellerObjectiveAPI:
    def test_serializer_ignores_store_update(self, enterprise, store, sales_user):
        target = SellerObjective.objects.create(
            store=store,
            seller=sales_user,
            period="2026-02",
        )
        other_store = Store.objects.create(
            enterprise=enterprise,
            name="Other Store",
            code="OTHER-ST-1",
        )

        serializer = SellerObjectiveSerializer(
            target,
            data={"store": str(other_store.pk)},
            partial=True,
        )
        assert serializer.is_valid(), serializer.errors
        serializer.save()
        target.refresh_from_db()
        assert target.store_id == store.id


class TestPenaltyStoreGuards:
    @pytest.fixture
    def stats(self, store, sales_user):
        return SellerMonthlyStats.objects.create(
            store=store,
            seller=sales_user,
            period="2026-02",
        )

    @pytest.fixture
    def local_penalty_type(self, store):
        return SellerPenaltyType.objects.create(
            store=store,
            name="Retard",
            mode=SellerPenaltyType.PenaltyMode.DEDUCTION,
            default_amount=Decimal("5000"),
        )

    def test_create_penalty_rejects_foreign_penalty_type(
        self, admin_client, admin_user, enterprise, stats
    ):
        other_store = Store.objects.create(
            enterprise=enterprise,
            name="Other Store Two",
            code="OTHER-ST-2",
        )
        foreign_type = SellerPenaltyType.objects.create(
            store=other_store,
            name="Type Externe",
            mode=SellerPenaltyType.PenaltyMode.DEDUCTION,
            default_amount=Decimal("1000"),
        )

        resp = admin_client.post(
            "/api/v1/objective-penalties/",
            {
                "stats": str(stats.pk),
                "penalty_type": str(foreign_type.pk),
                "amount": "1000",
                "reason": "Test",
            },
            format="json",
        )

        assert resp.status_code == 400
        assert "penalty_type" in resp.data

    def test_serializer_rejects_foreign_penalty_type_on_update(
        self, admin_user, enterprise, stats, local_penalty_type
    ):
        penalty = SellerPenalty.objects.create(
            stats=stats,
            penalty_type=local_penalty_type,
            amount=Decimal("2000"),
            reason="Initial",
            applied_by=admin_user,
        )
        other_store = Store.objects.create(
            enterprise=enterprise,
            name="Other Store Three",
            code="OTHER-ST-3",
        )
        foreign_type = SellerPenaltyType.objects.create(
            store=other_store,
            name="Type Externe 2",
            mode=SellerPenaltyType.PenaltyMode.DEDUCTION,
            default_amount=Decimal("700"),
        )

        serializer = SellerPenaltySerializer(
            penalty,
            data={"penalty_type": str(foreign_type.pk)},
            partial=True,
        )
        assert not serializer.is_valid()
        assert "penalty_type" in serializer.errors


class TestStoreResolutionFallback:
    def test_dashboard_uses_default_store_when_current_store_missing(self, store, sales_user):
        rule = ObjectiveRule.objects.create(
            store=store,
            name="Regle Fallback",
            is_active=True,
            valid_from=date(2026, 1, 1),
            valid_until=None,
            version=1,
        )
        ObjectiveTier.objects.create(
            rule=rule,
            name="Bronze",
            rank=1,
            threshold=Decimal("0"),
            bonus_amount=Decimal("0"),
            bonus_rate=Decimal("0"),
            color="#6B7280",
            icon="",
        )

        factory = APIRequestFactory()
        request = factory.get("/api/v1/objectives/seller/dashboard/?period=2026-02")
        force_authenticate(request, user=sales_user)

        response = SellerDashboardView.as_view()(request)

        assert response.status_code == 200
        assert response.data["objective"]["period"] == "2026-02"
        assert response.data["seller"]["email"] == sales_user.email


class TestObjectiveEngineHardCap:
    def test_hard_cap_penalty_recomputes_bonus_on_capped_tier(
        self, monkeypatch, store, sales_user, admin_user
    ):
        rule = ObjectiveRule.objects.create(
            store=store,
            name="Regle cap",
            is_active=True,
            valid_from=date(2026, 1, 1),
            valid_until=None,
            version=1,
        )
        ObjectiveTier.objects.create(
            rule=rule,
            name="Bronze",
            rank=1,
            threshold=Decimal("100000"),
            bonus_amount=Decimal("50000"),
            bonus_rate=Decimal("0"),
            color="#CD7F32",
            icon="",
        )
        ObjectiveTier.objects.create(
            rule=rule,
            name="Argent",
            rank=2,
            threshold=Decimal("7000000"),
            bonus_amount=Decimal("120000"),
            bonus_rate=Decimal("0"),
            color="#9CA3AF",
            icon="",
        )
        ObjectiveTier.objects.create(
            rule=rule,
            name="Or",
            rank=3,
            threshold=Decimal("11000000"),
            bonus_amount=Decimal("220000"),
            bonus_rate=Decimal("0"),
            color="#F59E0B",
            icon="",
        )
        ObjectiveTier.objects.create(
            rule=rule,
            name="Elite",
            rank=4,
            threshold=Decimal("15000000"),
            bonus_amount=Decimal("350000"),
            bonus_rate=Decimal("0"),
            color="#10B981",
            icon="",
        )

        stats = SellerMonthlyStats.objects.create(
            store=store,
            seller=sales_user,
            period="2026-02",
        )
        penalty_type = SellerPenaltyType.objects.create(
            store=store,
            name="Plafond discipline",
            mode=SellerPenaltyType.PenaltyMode.HARD_CAP,
            default_amount=Decimal("0"),
            cap_tier_rank=2,
        )
        SellerPenalty.objects.create(
            stats=stats,
            penalty_type=penalty_type,
            amount=Decimal("0"),
            applied_by=admin_user,
        )

        def fake_aggregate(_self, _seller_id, _period):
            return {
                "gross": Decimal("17474600"),
                "refunds": Decimal("0"),
                "sale_count": 10,
                "cancellation_count": 0,
                "credit_recovered": Decimal("0"),
            }

        monkeypatch.setattr(
            ObjectiveCalculationEngine,
            "_aggregate_financials",
            fake_aggregate,
        )

        engine = ObjectiveCalculationEngine(store_id=str(store.id))
        result = engine.compute_for_seller(
            seller_id=str(sales_user.id),
            period="2026-02",
            trigger="MANUAL",
        )

        assert result is not None
        assert result.current_tier_rank == 2
        assert result.current_tier_name == "Argent"
        assert result.bonus_earned == Decimal("120000")
