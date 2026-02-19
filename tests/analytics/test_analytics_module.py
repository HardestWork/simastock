from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.urls import reverse

from analytics.models import ABCAnalysis, CustomerCreditScore, ReorderRecommendation, SalesForecast
from analytics.services import (
    build_strategic_dashboard,
    compute_abc_analysis,
    compute_credit_scores,
    compute_dynamic_reorder,
    compute_sales_forecast,
)
from catalog.models import Product
from sales.models import Sale, SaleItem
from stores.models import StoreUser


@pytest.mark.django_db
def test_compute_abc_analysis_creates_rows(store, sales_user, customer, product):
    sale = Sale.objects.create(
        store=store,
        seller=sales_user,
        customer=customer,
        status=Sale.Status.PAID,
        subtotal=Decimal("100000.00"),
        total=Decimal("100000.00"),
    )
    SaleItem.objects.create(
        sale=sale,
        product=product,
        product_name=product.name,
        unit_price=Decimal("50000.00"),
        cost_price=Decimal("30000.00"),
        quantity=2,
        line_total=Decimal("100000.00"),
    )

    count = compute_abc_analysis(store, date.today() - timedelta(days=7), date.today())
    assert count >= 1
    assert ABCAnalysis.objects.filter(store=store).exists()


@pytest.mark.django_db
def test_compute_reorder_credit_forecast(store, customer_account, product_stock):
    reorder_count = compute_dynamic_reorder(store, as_of=date.today())
    credit_count = compute_credit_scores(store, as_of=date.today())
    forecast_count = compute_sales_forecast(store, as_of=date.today(), horizon_days=7)

    assert reorder_count >= 1
    assert credit_count >= 1
    assert forecast_count >= 1

    assert ReorderRecommendation.objects.filter(store=store).exists()
    assert CustomerCreditScore.objects.filter(store=store).exists()
    assert SalesForecast.objects.filter(store=store).exists()


@pytest.mark.django_db
def test_build_strategic_dashboard_payload(store, manager_user):
    StoreUser.objects.get_or_create(store=store, user=manager_user, defaults={"is_default": True})
    payload = build_strategic_dashboard(
        store=store,
        date_from=date.today() - timedelta(days=30),
        date_to=date.today(),
    )
    assert "revenue" in payload
    assert "abc_distribution" in payload
    assert "fraud" in payload


@pytest.mark.django_db
def test_strategic_dashboard_view_permissions(client, store, manager_user, sales_user):
    StoreUser.objects.get_or_create(store=store, user=manager_user, defaults={"is_default": True})
    StoreUser.objects.get_or_create(store=store, user=sales_user, defaults={"is_default": True})

    client.force_login(manager_user)
    session = client.session
    session["store_id"] = str(store.id)
    session.save()
    ok_response = client.get(reverse("analytics:strategic-dashboard"))
    assert ok_response.status_code == 200

    client.force_login(sales_user)
    session = client.session
    session["store_id"] = str(store.id)
    session.save()
    denied_response = client.get(reverse("analytics:strategic-dashboard"))
    assert denied_response.status_code in (302, 403)


@pytest.mark.django_db
def test_store_feature_flags_inheritance_and_override(store):
    store.enterprise.analytics_feature_flags = {
        "enabled": True,
        "abc_analysis": False,
        "sales_forecast": True,
    }
    store.enterprise.save(update_fields=["analytics_feature_flags", "updated_at"])
    store.refresh_from_db()

    assert store.is_analytics_feature_enabled("abc_analysis") is False
    assert store.is_analytics_feature_enabled("sales_forecast") is True

    store.analytics_feature_overrides = {"abc_analysis": True}
    store.save(update_fields=["analytics_feature_overrides", "updated_at"])
    store.refresh_from_db()
    assert store.is_analytics_feature_enabled("abc_analysis") is True


@pytest.mark.django_db
def test_abc_service_respects_feature_flag(store, product, sales_user, customer):
    store.enterprise.analytics_feature_flags = {"enabled": True, "abc_analysis": False}
    store.enterprise.save(update_fields=["analytics_feature_flags", "updated_at"])

    sale = Sale.objects.create(
        store=store,
        seller=sales_user,
        customer=customer,
        status=Sale.Status.PAID,
        subtotal=Decimal("50000.00"),
        total=Decimal("50000.00"),
    )
    SaleItem.objects.create(
        sale=sale,
        product=product,
        product_name=product.name,
        unit_price=Decimal("50000.00"),
        cost_price=Decimal("30000.00"),
        quantity=1,
        line_total=Decimal("50000.00"),
    )

    count = compute_abc_analysis(store, date.today() - timedelta(days=7), date.today())
    assert count == 0
    assert ABCAnalysis.objects.filter(store=store).count() == 0


@pytest.mark.django_db
def test_forecast_summary_api_returns_aggregates(client, store, manager_user, product):
    StoreUser.objects.get_or_create(store=store, user=manager_user, defaults={"is_default": True})

    product_2 = Product.objects.create(
        enterprise=store.enterprise,
        category=product.category,
        brand=product.brand,
        name="Switch Backup 8 ports",
        slug="switch-backup-8-ports",
        sku="TST-002",
        selling_price=Decimal("80000.00"),
        cost_price=Decimal("50000.00"),
    )
    forecast_date = date.today() + timedelta(days=1)
    SalesForecast.objects.create(
        store=store,
        product=product,
        forecast_date=forecast_date,
        predicted_qty=Decimal("2.00"),
    )
    SalesForecast.objects.create(
        store=store,
        product=product_2,
        forecast_date=forecast_date,
        predicted_qty=Decimal("1.00"),
    )

    client.force_login(manager_user)
    session = client.session
    session["store_id"] = str(store.id)
    session.save()

    response = client.get(
        reverse("api:analytics-forecast-summary"),
        {"store": str(store.id), "horizon_days": 30},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["totals"]["predicted_qty"] == 3.0
    assert Decimal(payload["totals"]["predicted_revenue"]) == Decimal("180000.00")
    assert Decimal(payload["totals"]["predicted_profit"]) == Decimal("70000.00")
