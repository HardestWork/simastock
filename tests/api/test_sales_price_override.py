from decimal import Decimal

import pytest

from catalog.models import Product
from stock.models import ProductStock
from stores.models import Store, StoreUser


@pytest.mark.django_db
def test_add_item_with_price_override_uses_sale_store_capability(
    client,
    enterprise,
    sales_user,
    category,
    brand,
):
    default_store = Store.objects.create(
        enterprise=enterprise,
        name="Boutique Defaut",
        code="BT-OVR-DEF",
        address="Rue A",
    )
    target_store = Store.objects.create(
        enterprise=enterprise,
        name="Boutique Cible",
        code="BT-OVR-TGT",
        address="Rue B",
    )

    # Default store does not grant price override.
    StoreUser.objects.create(
        store=default_store,
        user=sales_user,
        is_default=True,
        capabilities=["CAN_SELL"],
    )
    # Target store grants CAN_OVERRIDE_PRICE.
    StoreUser.objects.create(
        store=target_store,
        user=sales_user,
        is_default=False,
        capabilities=["CAN_SELL", "CAN_OVERRIDE_PRICE"],
    )

    product = Product.objects.create(
        enterprise=enterprise,
        category=category,
        brand=brand,
        name="Produit Override",
        slug="produit-override",
        sku="OVR-001",
        selling_price=Decimal("10000.00"),
        cost_price=Decimal("7000.00"),
    )
    ProductStock.objects.create(store=target_store, product=product, quantity=20)

    client.force_login(sales_user)

    create_resp = client.post("/api/v1/sales/", {"store_id": str(target_store.pk)})
    assert create_resp.status_code == 201, create_resp.json()
    sale_id = create_resp.json()["id"]

    add_resp = client.post(
        f"/api/v1/sales/{sale_id}/add-item/",
        {
            "product_id": str(product.pk),
            "quantity": 1,
            "unit_price_override": "8500.00",
        },
    )
    assert add_resp.status_code == 200, add_resp.json()
    payload = add_resp.json()
    assert payload["items"][0]["unit_price"] == "8500.00"


@pytest.mark.django_db
def test_set_item_unit_price_requires_override_capability(
    client,
    sales_user,
    store,
    store_user_sales,
    product,
    product_stock,
):
    store_user_sales.capabilities = ["CAN_SELL"]
    store_user_sales.save(update_fields=["capabilities"])

    client.force_login(sales_user)
    create_resp = client.post("/api/v1/sales/", {"store_id": str(store.pk)})
    sale_id = create_resp.json()["id"]
    add_resp = client.post(
        f"/api/v1/sales/{sale_id}/add-item/",
        {"product_id": str(product.pk), "quantity": 1},
    )
    item_id = add_resp.json()["items"][0]["id"]

    price_resp = client.post(
        f"/api/v1/sales/{sale_id}/set-item-unit-price/",
        {"item_id": item_id, "unit_price": "42000.00"},
    )
    assert price_resp.status_code == 403


@pytest.mark.django_db
def test_set_item_unit_price_allows_sales_with_capability(
    client,
    sales_user,
    store,
    store_user_sales,
    product,
    product_stock,
):
    store_user_sales.capabilities = ["CAN_SELL", "CAN_OVERRIDE_PRICE"]
    store_user_sales.save(update_fields=["capabilities"])

    client.force_login(sales_user)
    create_resp = client.post("/api/v1/sales/", {"store_id": str(store.pk)})
    assert create_resp.status_code == 201, create_resp.json()
    sale_id = create_resp.json()["id"]

    add_resp = client.post(
        f"/api/v1/sales/{sale_id}/add-item/",
        {"product_id": str(product.pk), "quantity": 1},
    )
    assert add_resp.status_code == 200, add_resp.json()
    item_id = add_resp.json()["items"][0]["id"]

    price_resp = client.post(
        f"/api/v1/sales/{sale_id}/set-item-unit-price/",
        {"item_id": item_id, "unit_price": "42000.00"},
    )
    assert price_resp.status_code == 200, price_resp.json()
    payload = price_resp.json()
    assert payload["items"][0]["unit_price"] == "42000.00"
