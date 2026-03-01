"""Regression tests for commercial module security and business rules."""
from datetime import date, datetime
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from commercial.models import (
    CommercialProspect,
    CommercialIncentivePolicy,
    CommercialIncentiveResult,
    CommercialIncentiveTier,
    CommercialObjectiveMonthly,
    CommercialOpportunity,
)
from stores.models import Enterprise, Store, StoreUser

User = get_user_model()


@pytest.mark.django_db
def test_commercial_region_create_uses_store_enterprise(admin_client, store):
    response = admin_client.post(
        "/api/v1/commercial/regions/",
        {
            "store": str(store.id),
            "name": "Nord",
            "code": "NORD",
        },
        format="json",
    )

    assert response.status_code == 201, response.data
    assert str(response.data["enterprise"]) == str(store.enterprise_id)


@pytest.mark.django_db
def test_sales_user_sees_only_own_objectives(sales_client, sales_user, store):
    other_sales = User.objects.create_user(
        email="other.sales@test.com",
        password="TestPass123!",
        first_name="Other",
        last_name="Seller",
        role="SALES",
    )
    StoreUser.objects.create(store=store, user=other_sales, is_default=False)

    CommercialObjectiveMonthly.objects.create(
        store=store,
        seller=sales_user,
        period="2026-01",
        target_signed_revenue=Decimal("100000"),
    )
    CommercialObjectiveMonthly.objects.create(
        store=store,
        seller=other_sales,
        period="2026-01",
        target_signed_revenue=Decimal("200000"),
    )

    response = sales_client.get("/api/v1/commercial/objectives/", {"store": str(store.id)})
    assert response.status_code == 200, response.data
    rows = response.data["results"]
    assert len(rows) == 1
    assert str(rows[0]["seller"]) == str(sales_user.id)


@pytest.mark.django_db
def test_move_stage_rejects_invalid_transition(sales_client, sales_user, store):
    opportunity = CommercialOpportunity.objects.create(
        store=store,
        owner=sales_user,
        name="Opp test",
        stage=CommercialOpportunity.Stage.PROSPECT,
        estimated_amount=Decimal("250000"),
    )

    response = sales_client.post(
        f"/api/v1/commercial/opportunities/{opportunity.id}/move-stage/",
        {"to_stage": CommercialOpportunity.Stage.NEGOTIATION},
        format="json",
    )
    assert response.status_code == 400
    assert "to_stage" in response.data


@pytest.mark.django_db
def test_qualify_prospect_is_idempotent(sales_client, sales_user, store):
    prospect = CommercialProspect.objects.create(
        store=store,
        owner=sales_user,
        company_name="Prospect unique",
        status=CommercialProspect.Status.NEW,
        estimated_potential=Decimal("180000"),
    )

    first_response = sales_client.post(
        f"/api/v1/commercial/prospects/{prospect.id}/qualify/",
        {"store": str(store.id)},
        format="json",
    )
    second_response = sales_client.post(
        f"/api/v1/commercial/prospects/{prospect.id}/qualify/",
        {"store": str(store.id)},
        format="json",
    )

    assert first_response.status_code == 201, first_response.data
    assert second_response.status_code == 400
    assert second_response.data["detail"] == "Ce prospect est deja qualifie."
    assert CommercialOpportunity.objects.filter(prospect=prospect).count() == 1


@pytest.mark.django_db
def test_incentive_compute_rejects_foreign_policy(admin_client, store):
    foreign_enterprise = Enterprise.objects.create(name="Foreign Ent", code="FOREIGN", currency="FCFA")
    foreign_store = Store.objects.create(enterprise=foreign_enterprise, name="Foreign Store", code="FOREIGN-1")
    foreign_policy = CommercialIncentivePolicy.objects.create(
        scope=CommercialIncentivePolicy.Scope.STORE,
        enterprise=foreign_enterprise,
        store=foreign_store,
        name="Foreign Policy",
        effective_from=date(2026, 1, 1),
        is_active=True,
    )

    response = admin_client.post(
        "/api/v1/commercial/incentive-runs/compute/",
        {"store": str(store.id), "period": "2026-01", "policy": str(foreign_policy.id)},
        format="json",
    )
    assert response.status_code == 400
    assert "policy" in response.data


@pytest.mark.django_db
def test_incentive_compute_excludes_non_sales_roles(admin_client, sales_user, store):
    cashier = User.objects.create_user(
        email="cashier.for.prime@test.com",
        password="TestPass123!",
        first_name="Cash",
        last_name="Ier",
        role="CASHIER",
    )
    StoreUser.objects.create(store=store, user=cashier, is_default=False)

    period = "2026-01"
    close_dt = timezone.make_aware(datetime(2026, 1, 20, 10, 0, 0))
    CommercialOpportunity.objects.create(
        store=store,
        owner=sales_user,
        name="Won by sales",
        stage=CommercialOpportunity.Stage.WON,
        estimated_amount=Decimal("500000"),
        estimated_margin_pct=Decimal("20"),
        closed_at=close_dt,
    )
    CommercialOpportunity.objects.create(
        store=store,
        owner=cashier,
        name="Won by cashier",
        stage=CommercialOpportunity.Stage.WON,
        estimated_amount=Decimal("900000"),
        estimated_margin_pct=Decimal("15"),
        closed_at=close_dt,
    )

    policy = CommercialIncentivePolicy.objects.create(
        scope=CommercialIncentivePolicy.Scope.STORE,
        enterprise=store.enterprise,
        store=store,
        name="Store Policy",
        effective_from=date(2025, 1, 1),
        effective_to=date(2026, 12, 31),
        is_active=True,
    )
    CommercialIncentiveTier.objects.create(
        policy=policy,
        rank=1,
        name="Base",
        min_signed_revenue=Decimal("0"),
        fixed_bonus=Decimal("10000"),
        variable_rate_pct=Decimal("0"),
    )

    response = admin_client.post(
        "/api/v1/commercial/incentive-runs/compute/",
        {"store": str(store.id), "period": period, "policy": str(policy.id)},
        format="json",
    )
    assert response.status_code == 200, response.data

    run_id = response.data["id"]
    results = CommercialIncentiveResult.objects.filter(run_id=run_id)
    assert results.count() == 1
    assert results.first().seller_id == sales_user.id


@pytest.mark.django_db
def test_incentive_compute_rejects_invalid_period(admin_client, store):
    response = admin_client.post(
        "/api/v1/commercial/incentive-runs/compute/",
        {"store": str(store.id), "period": "2026-13"},
        format="json",
    )
    assert response.status_code == 400
    assert "period" in response.data


@pytest.mark.django_db
def test_pipeline_csv_export_returns_csv_file(admin_client, sales_user, store):
    CommercialOpportunity.objects.create(
        store=store,
        owner=sales_user,
        name="CSV opportunity",
        stage=CommercialOpportunity.Stage.CONTACTED,
        estimated_amount=Decimal("150000"),
    )

    response = admin_client.get("/api/v1/commercial/exports/pipeline-csv/", {"store": str(store.id)})
    assert response.status_code == 200
    assert response["Content-Type"].startswith("text/csv")
    assert "opportunity_id" in response.content.decode("utf-8")
