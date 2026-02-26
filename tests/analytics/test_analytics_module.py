from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.urls import reverse
from django.utils import timezone

from analytics.models import (
    ABCAnalysis,
    CustomerAnalyticsRuleSet,
    CustomerCreditScore,
    CustomerScoreSnapshot,
    FraudEvent,
    ReorderRecommendation,
    SalesForecast,
)
from analytics.services import (
    build_strategic_dashboard,
    compute_abc_analysis,
    compute_credit_scores,
    compute_dynamic_reorder,
    compute_sales_forecast,
)
from cashier.models import CashShift, Payment
from catalog.models import Product
from credits.models import CustomerAccount, PaymentSchedule
from customers.models import Customer
from sales.models import Sale, SaleItem
from stock.models import ProductStock
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


@pytest.mark.django_db
def test_margin_movers_api_returns_ranked_products(client, store, manager_user, customer, product):
    StoreUser.objects.get_or_create(store=store, user=manager_user, defaults={"is_default": True})

    product_2 = Product.objects.create(
        enterprise=store.enterprise,
        category=product.category,
        brand=product.brand,
        name="Cordon reseau RJ45",
        slug="cordon-reseau-rj45",
        sku="TST-003",
        selling_price=Decimal("10000.00"),
        cost_price=Decimal("9000.00"),
    )

    sale = Sale.objects.create(
        store=store,
        seller=manager_user,
        customer=customer,
        status=Sale.Status.PAID,
        subtotal=Decimal("450000.00"),
        total=Decimal("450000.00"),
    )
    SaleItem.objects.create(
        sale=sale,
        product=product,
        product_name=product.name,
        unit_price=Decimal("50000.00"),
        cost_price=Decimal("30000.00"),
        quantity=8,
        line_total=Decimal("400000.00"),
    )
    SaleItem.objects.create(
        sale=sale,
        product=product_2,
        product_name=product_2.name,
        unit_price=Decimal("10000.00"),
        cost_price=Decimal("9000.00"),
        quantity=5,
        line_total=Decimal("50000.00"),
    )

    client.force_login(manager_user)
    session = client.session
    session["store_id"] = str(store.id)
    session.save()

    response = client.get(
        reverse("api:analytics-margin-movers"),
        {"store": str(store.id)},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["summary"]["sold_products"] == 2
    assert len(payload["items"]) == 2
    assert payload["items"][0]["product_name"] == product.name
    assert Decimal(payload["items"][0]["margin_total"]) > Decimal("0")


@pytest.mark.django_db
def test_orientation_api_returns_recommendations_and_signals(client, store, manager_user, customer, product):
    StoreUser.objects.get_or_create(store=store, user=manager_user, defaults={"is_default": True})

    sale = Sale.objects.create(
        store=store,
        seller=manager_user,
        customer=customer,
        status=Sale.Status.PAID,
        subtotal=Decimal("250000.00"),
        total=Decimal("250000.00"),
    )
    SaleItem.objects.create(
        sale=sale,
        product=product,
        product_name=product.name,
        unit_price=Decimal("50000.00"),
        cost_price=Decimal("30000.00"),
        quantity=5,
        line_total=Decimal("250000.00"),
    )
    FraudEvent.objects.create(
        store=store,
        sale=sale,
        detected_on=date.today(),
        rule_code="TEST_UNRESOLVED",
        severity=FraudEvent.Severity.CRITICAL,
        risk_score=95,
        title="Signal test",
        description="Anomalie test non resolue",
        is_resolved=False,
    )

    client.force_login(manager_user)
    session = client.session
    session["store_id"] = str(store.id)
    session.save()

    response = client.get(
        reverse("api:analytics-orientation"),
        {"store": str(store.id)},
    )
    assert response.status_code == 200
    payload = response.json()
    assert len(payload["recommendations"]) >= 1
    assert any(signal["code"] == "FRAUD_UNRESOLVED" for signal in payload["signals"])
    assert len(payload["focus_products"]) >= 1


@pytest.mark.django_db
def test_customer_top_clients_api_returns_ranked_rows(client, store, manager_user, cashier_user, customer, product):
    StoreUser.objects.get_or_create(store=store, user=manager_user, defaults={"is_default": True})
    StoreUser.objects.get_or_create(store=store, user=cashier_user, defaults={"is_default": False})

    sale = Sale.objects.create(
        store=store,
        seller=manager_user,
        customer=customer,
        status=Sale.Status.PAID,
        subtotal=Decimal("240000.00"),
        total=Decimal("240000.00"),
    )
    SaleItem.objects.create(
        sale=sale,
        product=product,
        product_name=product.name,
        unit_price=Decimal("60000.00"),
        cost_price=Decimal("35000.00"),
        quantity=4,
        line_total=Decimal("240000.00"),
    )
    shift = CashShift.objects.create(
        store=store,
        cashier=cashier_user,
        status=CashShift.Status.OPEN,
        opening_float=Decimal("50000.00"),
    )
    Payment.objects.create(
        sale=sale,
        store=store,
        cashier=cashier_user,
        shift=shift,
        method=Payment.Method.CASH,
        amount=Decimal("240000.00"),
    )

    client.force_login(manager_user)
    session = client.session
    session["store_id"] = str(store.id)
    session.save()

    response = client.get(
        reverse("api:analytics-customers-top"),
        {
            "store": str(store.id),
            "period": date.today().strftime("%Y-%m"),
            "limit": 10,
            "refresh": "1",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["period"] == date.today().strftime("%Y-%m")
    assert len(payload["items"]) >= 1
    assert payload["items"][0]["customer_id"] == str(customer.id)
    assert payload["items"][0]["rank"] == 1


@pytest.mark.django_db
def test_customer_insights_api_returns_dashboard_payload(client, store, manager_user):
    StoreUser.objects.get_or_create(store=store, user=manager_user, defaults={"is_default": True})

    client.force_login(manager_user)
    session = client.session
    session["store_id"] = str(store.id)
    session.save()

    response = client.get(
        reverse("api:analytics-customers-insights"),
        {
            "store": str(store.id),
            "limit": 10,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["store_id"] == str(store.id)
    assert isinstance(payload["top_clients"], list)
    assert isinstance(payload["dormant_preview"], list)
    assert isinstance(payload["segment_distribution"], dict)
    assert isinstance(payload["open_alerts"], dict)


@pytest.mark.django_db
def test_customer_score_api_computes_snapshot(client, store, manager_user, cashier_user, customer, product):
    StoreUser.objects.get_or_create(store=store, user=manager_user, defaults={"is_default": True})
    StoreUser.objects.get_or_create(store=store, user=cashier_user, defaults={"is_default": False})

    sale = Sale.objects.create(
        store=store,
        seller=manager_user,
        customer=customer,
        status=Sale.Status.PAID,
        subtotal=Decimal("100000.00"),
        discount_amount=Decimal("5000.00"),
        total=Decimal("95000.00"),
    )
    SaleItem.objects.create(
        sale=sale,
        product=product,
        product_name=product.name,
        unit_price=Decimal("50000.00"),
        cost_price=Decimal("30000.00"),
        quantity=2,
        discount_amount=Decimal("5000.00"),
        line_total=Decimal("95000.00"),
    )
    shift = CashShift.objects.create(
        store=store,
        cashier=cashier_user,
        status=CashShift.Status.OPEN,
        opening_float=Decimal("25000.00"),
    )
    Payment.objects.create(
        sale=sale,
        store=store,
        cashier=cashier_user,
        shift=shift,
        method=Payment.Method.CASH,
        amount=Decimal("95000.00"),
    )

    client.force_login(manager_user)
    session = client.session
    session["store_id"] = str(store.id)
    session.save()

    response = client.get(
        reverse("api:analytics-customers-score", kwargs={"customer_id": customer.id}),
        {"store": str(store.id)},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["customer_id"] == str(customer.id)
    assert 0 <= payload["score_total"] <= 100
    assert "segment" in payload
    assert CustomerScoreSnapshot.objects.filter(
        store=store,
        customer=customer,
        as_of_date=date.today(),
    ).exists()


@pytest.mark.django_db
def test_customer_dormant_and_rules_endpoints(client, store, manager_user, cashier_user, customer, product):
    StoreUser.objects.get_or_create(store=store, user=manager_user, defaults={"is_default": True})
    StoreUser.objects.get_or_create(store=store, user=cashier_user, defaults={"is_default": False})

    sale = Sale.objects.create(
        store=store,
        seller=manager_user,
        customer=customer,
        status=Sale.Status.PAID,
        subtotal=Decimal("120000.00"),
        total=Decimal("120000.00"),
    )
    SaleItem.objects.create(
        sale=sale,
        product=product,
        product_name=product.name,
        unit_price=Decimal("60000.00"),
        cost_price=Decimal("30000.00"),
        quantity=2,
        line_total=Decimal("120000.00"),
    )
    shift = CashShift.objects.create(
        store=store,
        cashier=cashier_user,
        status=CashShift.Status.OPEN,
        opening_float=Decimal("10000.00"),
    )
    payment = Payment.objects.create(
        sale=sale,
        store=store,
        cashier=cashier_user,
        shift=shift,
        method=Payment.Method.CASH,
        amount=Decimal("120000.00"),
    )
    Payment.objects.filter(pk=payment.pk).update(created_at=timezone.now() - timedelta(days=70))

    client.force_login(manager_user)
    session = client.session
    session["store_id"] = str(store.id)
    session.save()

    dormant_response = client.get(
        reverse("api:analytics-customers-dormant"),
        {"store": str(store.id), "days": 45, "limit": 20},
    )
    assert dormant_response.status_code == 200
    dormant_payload = dormant_response.json()
    assert dormant_payload["total"] >= 1
    assert any(item["customer_id"] == str(customer.id) for item in dormant_payload["items"])

    get_rules = client.get(
        reverse("api:analytics-customer-rules"),
        {"store": str(store.id)},
    )
    assert get_rules.status_code == 200
    initial_version = get_rules.json()["version"]

    post_rules = client.post(
        reverse("api:analytics-customer-rules") + f"?store={store.id}",
        data={
            "thresholds": {"dormant_days": 60, "vip_score": 82},
            "dormant_days": 60,
            "notes": "Regles test v2",
        },
        content_type="application/json",
    )
    assert post_rules.status_code == 201
    payload_rules = post_rules.json()
    assert payload_rules["version"] == initial_version + 1
    assert payload_rules["dormant_days"] == 60
    assert CustomerAnalyticsRuleSet.objects.filter(store=store, version=payload_rules["version"]).exists()


@pytest.mark.django_db
def test_customer_credit_risk_api_returns_recommendation(client, store, manager_user, customer_account):
    StoreUser.objects.get_or_create(store=store, user=manager_user, defaults={"is_default": True})

    customer_account.balance = Decimal("350000.00")
    customer_account.save(update_fields=["balance", "updated_at"])
    PaymentSchedule.objects.create(
        account=customer_account,
        due_date=date.today() - timedelta(days=60),
        amount_due=Decimal("300000.00"),
        amount_paid=Decimal("0.00"),
        status=PaymentSchedule.Status.OVERDUE,
    )

    client.force_login(manager_user)
    session = client.session
    session["store_id"] = str(store.id)
    session.save()

    response = client.get(
        reverse("api:analytics-customers-credit-risk"),
        {"store": str(store.id), "customer_id": str(customer_account.customer_id)},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["customer_id"] == str(customer_account.customer_id)
    assert payload["credit_risk_score"] >= 45
    assert payload["recommendation"]["action"] in {
        "BLOCK_CREDIT",
        "REDUCE_LIMIT_AND_DEPOSIT",
        "DEPOSIT_REQUIRED",
        "ALLOW_CREDIT",
    }


@pytest.mark.django_db
def test_customer_recommendations_api_returns_products(client, store, manager_user, customer, product):
    StoreUser.objects.get_or_create(store=store, user=manager_user, defaults={"is_default": True})

    product_b = Product.objects.create(
        enterprise=store.enterprise,
        category=product.category,
        brand=product.brand,
        name="Routeur pro dual WAN",
        slug="routeur-pro-dual-wan",
        sku="TST-RECO-001",
        selling_price=Decimal("120000.00"),
        cost_price=Decimal("80000.00"),
    )
    ProductStock.objects.create(store=store, product=product, quantity=10, reserved_qty=0)
    ProductStock.objects.create(store=store, product=product_b, quantity=8, reserved_qty=0)

    own_sale = Sale.objects.create(
        store=store,
        seller=manager_user,
        customer=customer,
        status=Sale.Status.PAID,
        subtotal=Decimal("200000.00"),
        total=Decimal("200000.00"),
    )
    SaleItem.objects.create(
        sale=own_sale,
        product=product,
        product_name=product.name,
        unit_price=Decimal("50000.00"),
        cost_price=Decimal("30000.00"),
        quantity=4,
        line_total=Decimal("200000.00"),
    )

    customer_2 = Customer.objects.create(
        enterprise=store.enterprise,
        first_name="Martin",
        last_name="Nguimfack",
        phone="+237611111111",
    )
    co_sale = Sale.objects.create(
        store=store,
        seller=manager_user,
        customer=customer_2,
        status=Sale.Status.PAID,
        subtotal=Decimal("170000.00"),
        total=Decimal("170000.00"),
    )
    SaleItem.objects.create(
        sale=co_sale,
        product=product,
        product_name=product.name,
        unit_price=Decimal("50000.00"),
        cost_price=Decimal("30000.00"),
        quantity=1,
        line_total=Decimal("50000.00"),
    )
    SaleItem.objects.create(
        sale=co_sale,
        product=product_b,
        product_name=product_b.name,
        unit_price=Decimal("120000.00"),
        cost_price=Decimal("80000.00"),
        quantity=1,
        line_total=Decimal("120000.00"),
    )

    client.force_login(manager_user)
    session = client.session
    session["store_id"] = str(store.id)
    session.save()

    response = client.get(
        reverse("api:analytics-customers-recommendations", kwargs={"customer_id": customer.id}),
        {
            "store": str(store.id),
            "window_days": 90,
            "limit": 5,
            "include_only_in_stock": "1",
            "refresh": "1",
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["customer_id"] == str(customer.id)
    assert isinstance(payload["items"], list)
    assert any(item["product_id"] == str(product_b.id) for item in payload["items"])


@pytest.mark.django_db
def test_customer_next_order_api_predicts_purchase_date(client, store, manager_user, cashier_user, customer, product):
    StoreUser.objects.get_or_create(store=store, user=manager_user, defaults={"is_default": True})
    StoreUser.objects.get_or_create(store=store, user=cashier_user, defaults={"is_default": False})

    shift = CashShift.objects.create(
        store=store,
        cashier=cashier_user,
        status=CashShift.Status.OPEN,
        opening_float=Decimal("20000.00"),
    )

    for days_ago in (30, 20, 10):
        sale = Sale.objects.create(
            store=store,
            seller=manager_user,
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
        payment = Payment.objects.create(
            sale=sale,
            store=store,
            cashier=cashier_user,
            shift=shift,
            method=Payment.Method.CASH,
            amount=Decimal("100000.00"),
        )
        Payment.objects.filter(pk=payment.pk).update(created_at=timezone.now() - timedelta(days=days_ago))

    client.force_login(manager_user)
    session = client.session
    session["store_id"] = str(store.id)
    session.save()

    response = client.get(
        reverse("api:analytics-customers-next-order", kwargs={"customer_id": customer.id}),
        {"store": str(store.id)},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["customer_id"] == str(customer.id)
    assert payload["predicted_next_purchase_date"] is not None
    assert payload["purchase_count"] >= 3
    assert payload["probability"] in {"LOW", "MEDIUM", "HIGH"}


@pytest.mark.django_db
def test_customer_churn_risk_api_flags_activity_drop(client, store, manager_user, cashier_user, customer, product):
    StoreUser.objects.get_or_create(store=store, user=manager_user, defaults={"is_default": True})
    StoreUser.objects.get_or_create(store=store, user=cashier_user, defaults={"is_default": False})

    customer_2 = Customer.objects.create(
        enterprise=store.enterprise,
        first_name="Alice",
        last_name="Fouda",
        phone="+237622222222",
    )
    shift = CashShift.objects.create(
        store=store,
        cashier=cashier_user,
        status=CashShift.Status.OPEN,
        opening_float=Decimal("30000.00"),
    )

    def _create_paid_sale_with_payment(target_customer, amount: Decimal, days_ago: int):
        sale = Sale.objects.create(
            store=store,
            seller=manager_user,
            customer=target_customer,
            status=Sale.Status.PAID,
            subtotal=amount,
            total=amount,
        )
        SaleItem.objects.create(
            sale=sale,
            product=product,
            product_name=product.name,
            unit_price=amount,
            cost_price=Decimal("30000.00"),
            quantity=1,
            line_total=amount,
        )
        payment = Payment.objects.create(
            sale=sale,
            store=store,
            cashier=cashier_user,
            shift=shift,
            method=Payment.Method.CASH,
            amount=amount,
        )
        Payment.objects.filter(pk=payment.pk).update(created_at=timezone.now() - timedelta(days=days_ago))

    _create_paid_sale_with_payment(customer, Decimal("150000.00"), 50)
    _create_paid_sale_with_payment(customer, Decimal("150000.00"), 45)
    _create_paid_sale_with_payment(customer, Decimal("50000.00"), 5)

    _create_paid_sale_with_payment(customer_2, Decimal("100000.00"), 48)
    _create_paid_sale_with_payment(customer_2, Decimal("95000.00"), 4)

    client.force_login(manager_user)
    session = client.session
    session["store_id"] = str(store.id)
    session.save()

    response = client.get(
        reverse("api:analytics-customers-churn-risk"),
        {
            "store": str(store.id),
            "window_days": 30,
            "drop_threshold_pct": 30,
            "limit": 20,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    flagged_customer_ids = {item["customer_id"] for item in payload["items"]}
    assert str(customer.id) in flagged_customer_ids
    assert str(customer_2.id) not in flagged_customer_ids
