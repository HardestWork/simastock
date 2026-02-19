from decimal import Decimal
from uuid import UUID

import pytest

from catalog.models import Product
from stock.models import InventoryMovement, ProductStock, StockCount, StockCountLine, StockTransfer
from stores.models import Store


@pytest.mark.django_db
def test_stock_adjust_post_updates_quantity(
    client,
    admin_user,
    store,
    store_user_admin,
    product,
    product_stock,
):
    client.force_login(admin_user)

    response = client.post(
        "/stock/adjust/",
        {
            "product": str(product.pk),
            "quantity": "-5",
            "reason": "Correction inventaire",
        },
    )

    assert response.status_code == 302
    assert "/stock/movements/document/" in response["Location"]
    batch_id = UUID(response["Location"].rstrip("/").split("/")[-1])
    stock = ProductStock.objects.get(store=store, product=product)
    assert stock.quantity == 95
    movement = InventoryMovement.objects.get(store=store, product=product, batch_id=batch_id)
    assert movement.quantity == -5


@pytest.mark.django_db
def test_stock_adjust_post_accepts_adjust_data_json(
    client,
    admin_user,
    store,
    store_user_admin,
    product,
    category,
    brand,
):
    second_product = Product.objects.create(
        enterprise=store.enterprise,
        category=category,
        brand=brand,
        name="Patch Panel 24",
        slug="patch-panel-24",
        sku="AJ-002",
        selling_price=Decimal("25000.00"),
        cost_price=Decimal("18000.00"),
        is_active=True,
    )
    ProductStock.objects.create(store=store, product=product, quantity=20, reserved_qty=0)
    ProductStock.objects.create(store=store, product=second_product, quantity=10, reserved_qty=0)

    client.force_login(admin_user)
    response = client.post(
        "/stock/adjust/",
        {
            "adjust_data": (
                "["
                f"{{\"product_id\":\"{product.pk}\",\"quantity\":5}},"
                f"{{\"product_id\":\"{second_product.pk}\",\"quantity\":-3}}"
                "]"
            ),
            "reference": "AJ-BATCH-001",
            "reason": "Ajustement groupe",
        },
    )

    assert response.status_code == 302
    assert "/stock/movements/document/" in response["Location"]
    batch_id = UUID(response["Location"].rstrip("/").split("/")[-1])

    stock1 = ProductStock.objects.get(store=store, product=product)
    stock2 = ProductStock.objects.get(store=store, product=second_product)
    assert stock1.quantity == 25
    assert stock2.quantity == 7

    movements = InventoryMovement.objects.filter(
        store=store,
        movement_type=InventoryMovement.MovementType.ADJUST,
        reference="AJ-BATCH-001",
        batch_id=batch_id,
    )
    assert movements.count() == 2


@pytest.mark.django_db
def test_stock_list_creates_missing_stock_rows_for_current_store(
    client,
    admin_user,
    store,
    store_user_admin,
    product,
):
    client.force_login(admin_user)
    assert not ProductStock.objects.filter(store=store, product=product).exists()

    response = client.get("/stock/")

    assert response.status_code == 200
    assert ProductStock.objects.filter(store=store, product=product).exists()
    assert product.name in response.content.decode("utf-8")


@pytest.mark.django_db
def test_stock_entry_post_creates_in_movement_and_increments_stock(
    client,
    admin_user,
    store,
    store_user_admin,
    product,
    product_stock,
):
    client.force_login(admin_user)

    response = client.post(
        "/stock/entries/",
        {
            "product": str(product.pk),
            "quantity": "12",
            "reference": "ENT-001",
            "reason": "Reception fournisseur",
        },
    )

    assert response.status_code == 302
    assert "/stock/movements/document/" in response["Location"]
    batch_id = UUID(response["Location"].rstrip("/").split("/")[-1])

    stock = ProductStock.objects.get(store=store, product=product)
    assert stock.quantity == 112

    movement = InventoryMovement.objects.filter(
        store=store,
        product=product,
        movement_type=InventoryMovement.MovementType.IN,
        batch_id=batch_id,
    ).latest("created_at")
    assert movement.quantity == 12
    assert movement.reference == "ENT-001"


@pytest.mark.django_db
def test_stock_entry_product_search_returns_active_products_with_stock(
    client,
    admin_user,
    store,
    store_user_admin,
    category,
    brand,
):
    in_stock = Product.objects.create(
        enterprise=store.enterprise,
        category=category,
        brand=brand,
        name="Switch Entree",
        slug="switch-entree",
        sku="ENT-100",
        selling_price=Decimal("50000.00"),
        cost_price=Decimal("30000.00"),
        is_active=True,
    )
    ProductStock.objects.create(store=store, product=in_stock, quantity=7, reserved_qty=2)

    no_stock = Product.objects.create(
        enterprise=store.enterprise,
        category=category,
        brand=brand,
        name="Routeur Entree",
        slug="routeur-entree",
        sku="ENT-200",
        selling_price=Decimal("90000.00"),
        cost_price=Decimal("60000.00"),
        is_active=True,
    )

    client.force_login(admin_user)
    response = client.get("/stock/entries/products/search/?q=entree")

    assert response.status_code == 200
    data = response.json()
    by_id = {row["id"]: row for row in data["results"]}
    assert str(in_stock.pk) in by_id
    assert str(no_stock.pk) in by_id
    assert by_id[str(in_stock.pk)]["stock"] == 5
    assert by_id[str(no_stock.pk)]["stock"] == 0


@pytest.mark.django_db
def test_stock_entry_post_accepts_entry_data_json(
    client,
    admin_user,
    store,
    store_user_admin,
    product,
    category,
    brand,
):
    second_product = Product.objects.create(
        enterprise=store.enterprise,
        category=category,
        brand=brand,
        name="Panneau Cat6",
        slug="panneau-cat6",
        sku="ENT-300",
        selling_price=Decimal("15000.00"),
        cost_price=Decimal("9000.00"),
        is_active=True,
    )
    ProductStock.objects.create(store=store, product=product, quantity=3, reserved_qty=0)
    ProductStock.objects.create(store=store, product=second_product, quantity=1, reserved_qty=0)

    client.force_login(admin_user)
    response = client.post(
        "/stock/entries/",
        {
            "entry_data": (
                "["
                f"{{\"product_id\":\"{product.pk}\",\"quantity\":4}},"
                f"{{\"product_id\":\"{second_product.pk}\",\"quantity\":2}}"
                "]"
            ),
            "reference": "ENT-BATCH-001",
            "reason": "Reception lot fournisseur",
        },
    )

    assert response.status_code == 302
    assert "/stock/movements/document/" in response["Location"]
    batch_id = UUID(response["Location"].rstrip("/").split("/")[-1])

    stock1 = ProductStock.objects.get(store=store, product=product)
    stock2 = ProductStock.objects.get(store=store, product=second_product)
    assert stock1.quantity == 7
    assert stock2.quantity == 3

    movements = InventoryMovement.objects.filter(
        store=store,
        movement_type=InventoryMovement.MovementType.IN,
        reference="ENT-BATCH-001",
        batch_id=batch_id,
    )
    assert movements.count() == 2


@pytest.mark.django_db
def test_movement_document_view_renders_batch(
    client,
    admin_user,
    store,
    store_user_admin,
    product,
    product_stock,
):
    client.force_login(admin_user)
    response = client.post(
        "/stock/entries/",
        {
            "entry_data": f"[{{\"product_id\":\"{product.pk}\",\"quantity\":3}}]",
            "reference": "DOC-001",
            "reason": "Test document",
        },
    )
    assert response.status_code == 302
    document_url = response["Location"]

    doc_response = client.get(document_url)
    assert doc_response.status_code == 200
    html = doc_response.content.decode("utf-8")
    assert "Bon d&#x27;entree de stock" in html or "Bon d'entree de stock" in html
    assert "DOC-001" in html


@pytest.mark.django_db
def test_transfer_views_render(client, admin_user, store, store_user_admin):
    client.force_login(admin_user)

    destination = Store.objects.create(
        enterprise=store.enterprise,
        name="Boutique B",
        code="BT-002",
        address="Rue B",
        phone="+237600000001",
        email="b@test.com",
    )

    transfer = StockTransfer.objects.create(
        from_store=store,
        to_store=destination,
        status=StockTransfer.Status.PENDING,
        created_by=admin_user,
    )

    list_response = client.get("/stock/transfers/")
    assert list_response.status_code == 200
    assert "stock/transfer_list.html" in [t.name for t in list_response.templates if t.name]

    detail_response = client.get(f"/stock/transfers/{transfer.pk}/")
    assert detail_response.status_code == 200
    assert "stock/transfer_detail.html" in [t.name for t in detail_response.templates if t.name]


@pytest.mark.django_db
def test_count_list_dynamic_search_filters_results(
    client,
    admin_user,
    manager_user,
    store,
    store_user_admin,
):
    StockCount.objects.create(
        store=store,
        status=StockCount.Status.IN_PROGRESS,
        created_by=admin_user,
        notes="Inventaire principal",
    )
    StockCount.objects.create(
        store=store,
        status=StockCount.Status.COMPLETED,
        created_by=manager_user,
        notes="Controle manager",
    )

    client.force_login(admin_user)

    response = client.get("/stock/counts/")
    assert response.status_code == 200
    html = response.content.decode("utf-8")
    assert 'hx-get="/stock/counts/"' in html
    assert 'id="count-results"' in html

    partial = client.get(
        "/stock/counts/?q=manager",
        HTTP_HX_REQUEST="true",
    )
    assert partial.status_code == 200
    partial_html = partial.content.decode("utf-8")
    assert "Manager User" in partial_html
    assert "Admin User" not in partial_html
    assert "<html" not in partial_html.lower()


@pytest.mark.django_db
def test_count_detail_post_updates_line(
    client,
    admin_user,
    store,
    store_user_admin,
    product,
    product_stock,
):
    client.force_login(admin_user)

    stock_count = StockCount.objects.create(
        store=store,
        status=StockCount.Status.IN_PROGRESS,
        created_by=admin_user,
        notes="Inventaire test",
    )
    line = StockCountLine.objects.create(
        stock_count=stock_count,
        product=product,
        system_qty=100,
        counted_qty=None,
    )

    response = client.post(
        f"/stock/counts/{stock_count.pk}/",
        {f"counted_{line.pk}": "97"},
    )

    assert response.status_code == 302
    line.refresh_from_db()
    assert line.counted_qty == 97
    assert line.variance == -3


@pytest.mark.django_db
def test_count_detail_contains_live_product_search_input(
    client,
    admin_user,
    store,
    store_user_admin,
    product,
):
    stock_count = StockCount.objects.create(
        store=store,
        status=StockCount.Status.IN_PROGRESS,
        created_by=admin_user,
    )
    StockCountLine.objects.create(
        stock_count=stock_count,
        product=product,
        system_qty=10,
    )

    client.force_login(admin_user)
    response = client.get(f"/stock/counts/{stock_count.pk}/")

    assert response.status_code == 200
    html = response.content.decode("utf-8")
    assert 'id="count-line-search"' in html
    assert 'data-search="' in html
