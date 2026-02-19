import json
from decimal import Decimal

import pytest

from cashier.services import open_shift, process_payment
from catalog.models import Category, Product
from customers.models import Customer
from sales.models import Sale
from sales.services import add_item_to_sale, create_sale, recalculate_sale, submit_sale_to_cashier
from stock.models import ProductStock
from stores.models import Enterprise, Store, StoreUser


def _unwrap_results(payload):
    if isinstance(payload, dict) and "results" in payload:
        return payload["results"]
    return payload


@pytest.mark.django_db
def test_enterprise_scoped_list_returns_empty_without_store_membership(
    client,
    manager_user,
    category,
):
    client.force_login(manager_user)

    response = client.get("/api/v1/categories/")

    assert response.status_code == 200
    assert _unwrap_results(response.json()) == []


@pytest.mark.django_db
def test_enterprise_scoped_create_is_denied_without_store_membership(
    client,
    manager_user,
):
    client.force_login(manager_user)

    response = client.post(
        "/api/v1/categories/",
        {"name": "Sans entreprise", "slug": "sans-entreprise"},
    )

    assert response.status_code == 403


@pytest.mark.django_db
def test_enterprise_scoped_list_isolated_to_user_enterprise(
    client,
    admin_user,
    store_user_admin,
    category,
    enterprise,
):
    other_enterprise = Enterprise.objects.create(
        name="Entreprise 2",
        code="ENT-002",
        legal_name="Entreprise 2 SARL",
        currency="FCFA",
    )
    leaked_category = Category.objects.create(
        enterprise=other_enterprise,
        name="Interdit",
        slug="interdit",
    )

    client.force_login(admin_user)
    response = client.get("/api/v1/categories/")

    assert response.status_code == 200
    payload = _unwrap_results(response.json())
    returned_ids = {entry["id"] for entry in payload}
    assert str(category.pk) in returned_ids
    assert str(leaked_category.pk) not in returned_ids


@pytest.mark.django_db
def test_payment_api_denies_cross_store_sale_access(
    client,
    cashier_user,
    store_user_cashier,
    sales_user,
    enterprise,
    product,
):
    # Cashier is linked only to the default fixture store through store_user_cashier.
    foreign_store = Store.objects.create(
        enterprise=enterprise,
        name="Boutique Etrangere",
        code="BT-999",
        address="9 Rue distante",
    )
    foreign_customer = Customer.objects.create(
        enterprise=enterprise,
        first_name="Client",
        last_name="Etranger",
        phone="+237611111111",
        email="foreign@test.com",
    )
    ProductStock.objects.create(store=foreign_store, product=product, quantity=50)

    foreign_sale = create_sale(store=foreign_store, seller=sales_user, customer=foreign_customer)
    add_item_to_sale(sale=foreign_sale, product=product, qty=1, actor=sales_user)
    recalculate_sale(foreign_sale)
    submit_sale_to_cashier(sale=foreign_sale, actor=sales_user)

    client.force_login(cashier_user)
    response = client.post(
        "/api/v1/payments/",
        data=json.dumps(
            {
                "sale_id": str(foreign_sale.pk),
                "payments": [{"method": "CASH", "amount": str(foreign_sale.total)}],
            }
        ),
        content_type="application/json",
    )

    assert response.status_code == 403


@pytest.mark.django_db
def test_sale_to_payment_flow_over_http_updates_stock_and_status(
    client,
    store,
    sales_user,
    cashier_user,
    store_user_sales,
    store_user_cashier,
    customer,
    product,
    product_stock,
):
    client.force_login(sales_user)
    create_resp = client.post(
        "/api/v1/sales/",
        {"store_id": str(store.pk), "customer_id": str(customer.pk)},
    )
    assert create_resp.status_code == 201
    create_payload = create_resp.json()
    sale_id = create_payload["id"]
    assert create_payload["customer"] == str(customer.pk)

    add_item_resp = client.post(
        f"/api/v1/sales/{sale_id}/add-item/",
        {"product_id": str(product.pk), "quantity": 2},
    )
    assert add_item_resp.status_code == 200
    from sales.models import Sale

    draft_sale = Sale.objects.get(pk=sale_id)
    assert draft_sale.status == Sale.Status.DRAFT
    assert draft_sale.customer_id == customer.pk
    assert draft_sale.items.exists()
    assert draft_sale.total > Decimal("0.00")

    submit_resp = client.post(f"/api/v1/sales/{sale_id}/submit/", {})
    assert submit_resp.status_code == 200, submit_resp.json()

    client.force_login(cashier_user)
    open_shift_resp = client.post(
        "/api/v1/cash-shifts/open/",
        data=json.dumps({"store": str(store.pk), "opening_float": "10000.00"}),
        content_type="application/json",
    )
    assert open_shift_resp.status_code == 201

    pay_resp = client.post(
        "/api/v1/payments/",
        data=json.dumps(
            {
                "sale_id": sale_id,
                "payments": [{"method": "CASH", "amount": "100000.00"}],
            }
        ),
        content_type="application/json",
    )
    assert pay_resp.status_code == 201

    # Sale and stock assertions from DB state
    sale = Sale.objects.get(pk=sale_id)
    assert sale.status == Sale.Status.PAID
    assert sale.amount_due == Decimal("0.00")

    product_stock.refresh_from_db()
    assert product_stock.quantity == 98


@pytest.mark.django_db
def test_product_api_supports_page_size_for_heavy_lists(
    client,
    sales_user,
    store_user_sales,
    category,
    brand,
):
    for idx in range(12):
        Product.objects.create(
            enterprise=category.enterprise,
            category=category,
            brand=brand,
            name=f"Produit API {idx}",
            slug=f"produit-api-{idx}",
            sku=f"API-{idx:03d}",
            selling_price=Decimal("1000.00"),
            cost_price=Decimal("500.00"),
        )

    client.force_login(sales_user)
    response = client.get("/api/v1/products/?page_size=5")

    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] >= 12
    assert len(payload["results"]) == 5


@pytest.mark.django_db
def test_payment_api_search_matches_invoice_reference(
    client,
    store,
    sales_user,
    cashier_user,
    store_user_cashier,
    customer,
    product,
    product_stock,
):
    sale = create_sale(store=store, seller=sales_user, customer=customer)
    add_item_to_sale(sale=sale, product=product, qty=1, actor=sales_user)
    recalculate_sale(sale)
    submit_sale_to_cashier(sale=sale, actor=sales_user)

    shift = open_shift(store=store, cashier=cashier_user, opening_float=Decimal("10000"))
    process_payment(
        sale=sale,
        payments_data=[{"method": "CASH", "amount": sale.amount_due}],
        cashier=cashier_user,
        shift=shift,
    )

    client.force_login(cashier_user)
    response = client.get(f"/api/v1/payments/?search={sale.invoice_number}")

    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] >= 1
    assert any(entry["sale"] == str(sale.pk) for entry in payload["results"])


@pytest.mark.django_db
def test_refund_api_denies_cross_store_sale_access(
    client,
    manager_user,
    store,
    enterprise,
    sales_user,
):
    StoreUser.objects.create(store=store, user=manager_user, is_default=True)

    foreign_store = Store.objects.create(
        enterprise=enterprise,
        name="Boutique Hors Portee",
        code="BT-998",
        address="Zone distante",
    )
    foreign_sale = Sale.objects.create(
        store=foreign_store,
        seller=sales_user,
        status=Sale.Status.PAID,
        total=Decimal("10000.00"),
        amount_paid=Decimal("10000.00"),
        amount_due=Decimal("0.00"),
        invoice_number="FAC-FOREIGN-0001",
    )

    client.force_login(manager_user)
    response = client.post(
        "/api/v1/refunds/",
        data=json.dumps(
            {
                "sale_id": str(foreign_sale.pk),
                "amount": "1000.00",
                "reason": "Test isolation",
                "refund_method": "CASH",
            }
        ),
        content_type="application/json",
    )

    assert response.status_code == 403
