import pytest
from decimal import Decimal

from catalog.models import Product
from customers.models import Customer
from sales.models import Sale
from sales.services import add_item_to_sale, create_sale
from stock.models import ProductStock


@pytest.mark.django_db
def test_pos_create_creates_draft_and_redirects_to_detail(client, sales_user, store_user_sales):
    client.force_login(sales_user)

    response = client.get("/pos/create/")

    assert response.status_code == 302
    assert Sale.objects.count() == 1

    sale = Sale.objects.get()
    assert response["Location"] == f"/pos/{sale.pk}/"

    detail_response = client.get(response["Location"])
    assert detail_response.status_code == 200
    used_templates = [template.name for template in detail_response.templates if template.name]
    assert "pos/sale_create.html" in used_templates


@pytest.mark.django_db
def test_pos_create_requires_active_store_membership(client, sales_user):
    client.force_login(sales_user)

    response = client.get("/pos/create/")

    assert response.status_code == 302
    assert response["Location"] == "/stores/"
    assert Sale.objects.count() == 0


@pytest.mark.django_db
def test_add_item_view_accepts_product_id_payload(
    client,
    store,
    sales_user,
    store_user_sales,
    product,
    product_stock,
):
    client.force_login(sales_user)
    sale = create_sale(store=store, seller=sales_user)

    response = client.post(
        f"/pos/{sale.pk}/add-item/",
        {
            "product_id": str(product.pk),
            "quantity": "1",
        },
    )

    assert response.status_code == 302
    sale.refresh_from_db()
    assert sale.items.count() == 1
    assert sale.items.first().product_id == product.pk


@pytest.mark.django_db
def test_product_search_returns_products_with_remaining_stock(
    client,
    store,
    sales_user,
    store_user_sales,
    category,
    brand,
):
    client.force_login(sales_user)

    available_product = Product.objects.create(
        enterprise=category.enterprise,
        category=category,
        brand=brand,
        name="Routeur Disponible",
        slug="routeur-disponible",
        sku="POS-001",
        selling_price="10000.00",
        cost_price="7000.00",
        is_active=True,
    )
    ProductStock.objects.create(
        store=store,
        product=available_product,
        quantity=5,
        reserved_qty=1,
    )

    out_of_stock_product = Product.objects.create(
        enterprise=category.enterprise,
        category=category,
        brand=brand,
        name="Routeur Rupture",
        slug="routeur-rupture",
        sku="POS-002",
        selling_price="10000.00",
        cost_price="7000.00",
        is_active=True,
    )
    ProductStock.objects.create(
        store=store,
        product=out_of_stock_product,
        quantity=1,
        reserved_qty=1,
    )

    no_stock_row_product = Product.objects.create(
        enterprise=category.enterprise,
        category=category,
        brand=brand,
        name="Routeur Sans Ligne Stock",
        slug="routeur-sans-ligne-stock",
        sku="POS-003",
        selling_price="10000.00",
        cost_price="7000.00",
        is_active=True,
    )

    response = client.get("/pos/products/search/?q=routeur")

    assert response.status_code == 200
    data = response.json()
    product_map = {entry["id"]: entry for entry in data["results"]}

    assert str(available_product.pk) in product_map
    assert str(out_of_stock_product.pk) in product_map
    assert str(no_stock_row_product.pk) in product_map

    assert product_map[str(available_product.pk)]["stock"] == 4
    assert product_map[str(out_of_stock_product.pk)]["stock"] == 0
    assert product_map[str(no_stock_row_product.pk)]["stock"] == 0


@pytest.mark.django_db
def test_product_search_returns_pagination_metadata(
    client,
    store,
    sales_user,
    store_user_sales,
    category,
    brand,
):
    client.force_login(sales_user)

    for idx in range(11):
        product = Product.objects.create(
            enterprise=category.enterprise,
            category=category,
            brand=brand,
            name=f"Switch pagination {idx}",
            slug=f"switch-pagination-{idx}",
            sku=f"PAG-{idx:03d}",
            selling_price="25000.00",
            cost_price="15000.00",
            is_active=True,
        )
        ProductStock.objects.create(
            store=store,
            product=product,
            quantity=idx + 1,
            reserved_qty=0,
        )

    response = client.get("/pos/products/search/?q=switch&page=2&page_size=5")

    assert response.status_code == 200
    payload = response.json()
    assert len(payload["results"]) == 5
    assert payload["pagination"]["page"] == 2
    assert payload["pagination"]["page_size"] == 5
    assert payload["pagination"]["total"] >= 11
    assert payload["pagination"]["has_previous"] is True


@pytest.mark.django_db
def test_customer_search_supports_name_and_phone(
    client,
    sales_user,
    store_user_sales,
    customer,
):
    client.force_login(sales_user)

    by_name = client.get("/customers/search/?q=Jean")
    assert by_name.status_code == 200
    by_name_data = by_name.json()
    assert len(by_name_data["results"]) == 1
    assert by_name_data["results"][0]["id"] == str(customer.pk)

    by_phone = client.get("/customers/search/?q=9999")
    assert by_phone.status_code == 200
    by_phone_data = by_phone.json()
    assert len(by_phone_data["results"]) == 1
    assert by_phone_data["results"][0]["id"] == str(customer.pk)


@pytest.mark.django_db
def test_sale_customer_quick_create_creates_and_attaches_customer(
    client,
    store,
    sales_user,
    store_user_sales,
):
    client.force_login(sales_user)
    sale = create_sale(store=store, seller=sales_user)

    response = client.post(
        f"/pos/{sale.pk}/customer-create/",
        {
            "first_name": "Paul",
            "last_name": "Mbia",
            "phone": "+237611223344",
            "email": "paul@test.com",
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["created"] is True

    sale.refresh_from_db()
    assert sale.customer is not None
    assert sale.customer.phone == "+237611223344"


@pytest.mark.django_db
def test_sale_customer_quick_create_reuses_existing_phone(
    client,
    store,
    sales_user,
    store_user_sales,
    customer,
):
    client.force_login(sales_user)
    sale = create_sale(store=store, seller=sales_user)

    response = client.post(
        f"/pos/{sale.pk}/customer-create/",
        {
            "first_name": "Autre",
            "last_name": "Nom",
            "phone": customer.phone,
            "email": "other@test.com",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["created"] is False
    assert payload["customer"]["id"] == str(customer.pk)

    sale.refresh_from_db()
    assert sale.customer_id == customer.pk
    assert Customer.objects.filter(
        enterprise=store.enterprise,
        phone=customer.phone,
    ).count() == 1


@pytest.mark.django_db
def test_sale_edit_discount_percent_mode(
    client,
    store,
    sales_user,
    store_user_sales,
    product,
    product_stock,
):
    client.force_login(sales_user)
    sale = create_sale(store=store, seller=sales_user)
    add_item_to_sale(sale=sale, product=product, qty=2, actor=sales_user)  # subtotal 100000

    response = client.post(
        f"/pos/{sale.pk}/edit/",
        {
            "discount_type": "percent",
            "discount_value": "10",
        },
    )

    assert response.status_code == 302
    sale.refresh_from_db()
    assert sale.discount_percent == Decimal("10")
    assert sale.discount_amount == Decimal("10000.00")
    assert sale.total == Decimal("90000.00")


@pytest.mark.django_db
def test_sale_edit_discount_amount_mode(
    client,
    store,
    sales_user,
    store_user_sales,
    product,
    product_stock,
):
    client.force_login(sales_user)
    sale = create_sale(store=store, seller=sales_user)
    add_item_to_sale(sale=sale, product=product, qty=2, actor=sales_user)  # subtotal 100000

    response = client.post(
        f"/pos/{sale.pk}/edit/",
        {
            "discount_type": "amount",
            "discount_value": "15000",
        },
    )

    assert response.status_code == 302
    sale.refresh_from_db()
    assert sale.discount_percent == Decimal("0.00")
    assert sale.discount_amount == Decimal("15000.00")
    assert sale.total == Decimal("85000.00")


@pytest.mark.django_db
def test_sale_submit_view_accepts_confirm_flag(
    client,
    store,
    sales_user,
    store_user_sales,
    customer,
    product,
    product_stock,
):
    client.force_login(sales_user)
    sale = create_sale(store=store, seller=sales_user, customer=customer)
    add_item_to_sale(sale=sale, product=product, qty=1, actor=sales_user)

    response = client.post(
        f"/pos/{sale.pk}/submit/",
        {
            "confirm": "on",
        },
    )

    assert response.status_code == 302
    sale.refresh_from_db()
    assert sale.status == "PENDING_PAYMENT"
    assert sale.invoice_number


@pytest.mark.django_db
def test_sale_submit_view_with_receipt_print_option(
    client,
    store,
    sales_user,
    store_user_sales,
    customer,
    product,
    product_stock,
):
    client.force_login(sales_user)
    sale = create_sale(store=store, seller=sales_user, customer=customer)
    add_item_to_sale(sale=sale, product=product, qty=1, actor=sales_user)

    response = client.post(
        f"/pos/{sale.pk}/submit/",
        {
            "confirm": "on",
            "print_document": "receipt",
        },
    )

    assert response.status_code == 302
    assert response["Location"].endswith(f"/pos/{sale.pk}/?print_document=receipt")


@pytest.mark.django_db
def test_sale_submit_view_with_proforma_print_option(
    client,
    store,
    sales_user,
    store_user_sales,
    customer,
    product,
    product_stock,
):
    client.force_login(sales_user)
    sale = create_sale(store=store, seller=sales_user, customer=customer)
    add_item_to_sale(sale=sale, product=product, qty=1, actor=sales_user)

    response = client.post(
        f"/pos/{sale.pk}/submit/",
        {
            "confirm": "on",
            "print_document": "proforma",
        },
    )

    assert response.status_code == 302
    assert response["Location"].endswith(f"/pos/{sale.pk}/?print_document=proforma")


@pytest.mark.django_db
def test_sale_submit_view_requires_customer(
    client,
    store,
    sales_user,
    store_user_sales,
    product,
    product_stock,
):
    client.force_login(sales_user)
    sale = create_sale(store=store, seller=sales_user)
    add_item_to_sale(sale=sale, product=product, qty=1, actor=sales_user)

    response = client.post(
        f"/pos/{sale.pk}/submit/",
        {"confirm": "on"},
    )

    assert response.status_code == 302
    sale.refresh_from_db()
    assert sale.status == "DRAFT"


@pytest.mark.django_db
def test_sale_submit_view_returns_json_for_single_page_mode(
    client,
    store,
    sales_user,
    store_user_sales,
    customer,
    product,
    product_stock,
):
    client.force_login(sales_user)
    sale = create_sale(store=store, seller=sales_user, customer=customer)
    add_item_to_sale(sale=sale, product=product, qty=1, actor=sales_user)

    response = client.post(
        f"/pos/{sale.pk}/submit/",
        {"confirm": "on", "print_document": "receipt"},
        HTTP_ACCEPT="application/json",
        HTTP_X_REQUESTED_WITH="XMLHttpRequest",
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["redirect_url"] == "/cashier/pending-sales/"
    assert payload["print_document_url"].endswith(f"/pos/{sale.pk}/receipt/")


@pytest.mark.django_db
def test_my_sales_list_supports_customer_search_filter(
    client,
    store,
    sales_user,
    store_user_sales,
    customer,
):
    client.force_login(sales_user)
    sale_match = create_sale(store=store, seller=sales_user, customer=customer)

    other_customer = Customer.objects.create(
        enterprise=store.enterprise,
        first_name="Paul",
        last_name="Other",
        phone="+237600001111",
        email="paul.other@test.com",
    )
    create_sale(store=store, seller=sales_user, customer=other_customer)

    response = client.get("/pos/my/?customer_search=Jean")

    assert response.status_code == 200
    sales = list(response.context["sales"])
    assert len(sales) == 1
    assert sales[0].pk == sale_match.pk
