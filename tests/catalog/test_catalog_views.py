import pytest

from catalog.models import Product
from stock.models import InventoryMovement, ProductStock


@pytest.mark.django_db
def test_product_create_generates_store_stock_with_initial_quantity(
    client,
    admin_user,
    store_user_admin,
    category,
    brand,
):
    client.force_login(admin_user)

    response = client.post(
        "/catalog/products/create/",
        data={
            "name": "Switch Distribution 24",
            "sku": "SW-DIST-24",
            "barcode": "",
            "category": str(category.pk),
            "brand": str(brand.pk),
            "description": "Modele entreprise",
            "cost_price": "100000",
            "selling_price": "145000",
            "initial_quantity": "18",
            "is_active": "on",
        },
    )

    assert response.status_code == 302
    assert response["Location"].endswith("/catalog/products/")

    product = Product.objects.get(sku="SW-DIST-24")
    stock = ProductStock.objects.get(store=store_user_admin.store, product=product)

    assert product.slug == "switch-distribution-24"
    assert product.barcode == "SW-DIST-24"
    assert stock.quantity == 18
    assert stock.reserved_qty == 0
    assert stock.available_qty == 18


@pytest.mark.django_db
def test_product_create_page_contains_category_and_brand_search_inputs(
    client,
    admin_user,
    store_user_admin,
):
    client.force_login(admin_user)

    response = client.get("/catalog/products/create/")

    assert response.status_code == 200
    html = response.content.decode("utf-8")
    assert 'id="category-search"' in html
    assert 'id="brand-search"' in html


@pytest.mark.django_db
def test_product_list_live_search_uses_htmx_and_returns_partial(
    client,
    admin_user,
    store_user_admin,
    category,
    brand,
):
    Product.objects.create(
        enterprise=category.enterprise,
        category=category,
        brand=brand,
        name="Routeur Pro 1",
        slug="routeur-pro-1",
        sku="RTR-001",
        selling_price="25000.00",
        cost_price="18000.00",
    )
    Product.objects.create(
        enterprise=category.enterprise,
        category=category,
        brand=brand,
        name="Switch Core 24",
        slug="switch-core-24",
        sku="SWT-024",
        selling_price="55000.00",
        cost_price="42000.00",
    )

    client.force_login(admin_user)

    response = client.get("/catalog/products/")
    assert response.status_code == 200
    html = response.content.decode("utf-8")
    assert 'hx-get="/catalog/products/"' in html
    assert 'id="product-results"' in html

    partial = client.get(
        "/catalog/products/?search=routeur",
        HTTP_HX_REQUEST="true",
    )
    assert partial.status_code == 200
    partial_html = partial.content.decode("utf-8").lower()
    assert "routeur pro 1" in partial_html
    assert "switch core 24" not in partial_html
    assert "<html" not in partial_html


@pytest.mark.django_db
def test_product_detail_displays_stock_and_recent_movements(
    client,
    admin_user,
    store_user_admin,
    product,
    product_stock,
):
    product_stock.quantity = 42
    product_stock.reserved_qty = 5
    product_stock.min_qty = 10
    product_stock.save(update_fields=["quantity", "reserved_qty", "min_qty", "updated_at"])

    InventoryMovement.objects.create(
        store=store_user_admin.store,
        product=product,
        movement_type=InventoryMovement.MovementType.IN,
        quantity=12,
        reference="TEST-IN-001",
        reason="Test movement",
        actor=admin_user,
    )

    client.force_login(admin_user)
    response = client.get(f"/catalog/products/{product.pk}/")

    assert response.status_code == 200
    html = response.content.decode("utf-8")
    assert product.name in html
    assert "Stock (boutique courante)" in html
    assert "Mouvements recents" in html
    assert "TEST-IN-001" in html
    assert "42" in html
    assert "37" in html


@pytest.mark.django_db
def test_product_import_page_displays_upload_form_and_columns(
    client,
    admin_user,
    store_user_admin,
):
    client.force_login(admin_user)

    response = client.get("/catalog/products/import/")

    assert response.status_code == 200
    html = response.content.decode("utf-8")
    assert "Import produits" in html
    assert 'type="file"' in html
    assert "nom" in html
    assert "sku" in html
    assert "prix_vente" in html


@pytest.mark.django_db
def test_product_edit_page_prefills_prices_and_has_category_brand_search(
    client,
    admin_user,
    store_user_admin,
    product,
):
    client.force_login(admin_user)

    response = client.get(f"/catalog/products/{product.pk}/edit/")

    assert response.status_code == 200
    html = response.content.decode("utf-8")
    assert 'name="cost_price"' in html
    assert 'name="selling_price"' in html
    assert 'value="30000.00"' in html
    assert 'value="50000.00"' in html
    assert 'id="category-search"' in html
    assert 'id="brand-search"' in html


@pytest.mark.django_db
def test_category_list_page_renders_and_filters(client, admin_user, store_user_admin):
    from catalog.models import Category

    enterprise = store_user_admin.store.enterprise
    parent = Category.objects.create(
        enterprise=enterprise,
        name="Informatique",
        slug="informatique",
        is_active=True,
    )
    Category.objects.create(
        enterprise=enterprise,
        name="Reseau",
        slug="reseau",
        parent=parent,
        is_active=True,
    )
    Category.objects.create(
        enterprise=enterprise,
        name="Archive",
        slug="archive",
        is_active=False,
    )

    client.force_login(admin_user)

    response = client.get("/catalog/categories/")
    assert response.status_code == 200
    html = response.content.decode("utf-8")
    assert "Categories" in html
    assert "Informatique" in html
    assert "Reseau" in html
    assert "Archive" in html
    assert 'hx-get="/catalog/categories/"' in html
    assert 'id="category-results"' in html

    active_only = client.get("/catalog/categories/?status=active")
    active_html = active_only.content.decode("utf-8")
    assert "Informatique" in active_html
    assert "Reseau" in active_html
    assert "Archive" not in active_html

    search = client.get("/catalog/categories/?search=rese")
    filtered_names = [c.name for c in search.context["categories"]]
    assert filtered_names == ["Reseau"]

    partial = client.get(
        "/catalog/categories/?search=arch",
        HTTP_HX_REQUEST="true",
    )
    assert partial.status_code == 200
    partial_html = partial.content.decode("utf-8").lower()
    assert "archive" in partial_html
    assert "reseau" not in partial_html
    assert "<html" not in partial_html


@pytest.mark.django_db
def test_category_form_page_contains_expected_fields(
    client,
    admin_user,
    store_user_admin,
):
    client.force_login(admin_user)

    response = client.get("/catalog/categories/create/")

    assert response.status_code == 200
    html = response.content.decode("utf-8")
    assert 'name="name"' in html
    assert 'name="slug"' in html
    assert 'id="parent-search"' in html
    assert 'name="description"' in html
    assert 'name="is_active"' in html


@pytest.mark.django_db
def test_category_create_generates_slug_when_omitted(
    client,
    admin_user,
    store_user_admin,
):
    from catalog.models import Category

    client.force_login(admin_user)

    response = client.post(
        "/catalog/categories/create/",
        data={
            "name": "Telephonie Mobile",
            "slug": "",
            "description": "Rayon smartphones et accessoires",
            "is_active": "on",
        },
    )

    assert response.status_code == 302
    assert response["Location"].endswith("/catalog/categories/")

    category = Category.objects.get(name="Telephonie Mobile")
    assert category.slug == "telephonie-mobile"
