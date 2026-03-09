"""Tests for sales API workflow filters and CRUD operations."""
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from catalog.models import Category, Product
from customers.models import Customer
from sales.models import Sale, SaleItem
from stores.models import StoreUser

User = get_user_model()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

URL_SALES = "/api/v1/sales/"


def _enable_sales_pos(store):
    """Enable the sales_pos feature flag on the store's enterprise."""
    ent = store.enterprise
    flags = ent.analytics_feature_flags or {}
    flags["sales_pos"] = True
    ent.analytics_feature_flags = flags
    ent.save(update_fields=["analytics_feature_flags"])


def _make_product(enterprise, *, name="Produit Test", selling_price="5000.00"):
    """Create a simple product that does not track stock."""
    cat = Category.objects.create(enterprise=enterprise, name="Cat Test")
    return Product.objects.create(
        enterprise=enterprise,
        category=cat,
        name=name,
        sku=f"SKU-{name[:8].upper().replace(' ', '')}",
        selling_price=Decimal(selling_price),
        cost_price=Decimal("2000.00"),
        track_stock=False,
    )


def _make_customer(enterprise, *, first_name="Client", last_name="Test"):
    return Customer.objects.create(
        enterprise=enterprise,
        first_name=first_name,
        last_name=last_name,
        phone="+237699000000",
    )


@pytest.mark.django_db
def test_sales_list_supports_multi_status_filter(admin_client, store, admin_user):
    pending_sale = Sale.objects.create(
        store=store,
        seller=admin_user,
        invoice_number="FAC-WF-001",
        status=Sale.Status.PENDING_PAYMENT,
        total=Decimal("10000.00"),
        amount_due=Decimal("10000.00"),
    )
    partial_sale = Sale.objects.create(
        store=store,
        seller=admin_user,
        invoice_number="FAC-WF-002",
        status=Sale.Status.PARTIALLY_PAID,
        total=Decimal("12000.00"),
        amount_paid=Decimal("4000.00"),
        amount_due=Decimal("8000.00"),
    )
    Sale.objects.create(
        store=store,
        seller=admin_user,
        invoice_number="FAC-WF-003",
        status=Sale.Status.PAID,
        total=Decimal("9000.00"),
        amount_paid=Decimal("9000.00"),
        amount_due=Decimal("0.00"),
    )

    response = admin_client.get(
        "/api/v1/sales/",
        {
            "store": str(store.pk),
            "status_in": "PENDING_PAYMENT,PARTIALLY_PAID",
        },
    )

    assert response.status_code == 200
    assert "submitted_at" in response.data["results"][0]
    invoices = {row["invoice_number"] for row in response.data["results"]}
    assert pending_sale.invoice_number in invoices
    assert partial_sale.invoice_number in invoices
    assert "FAC-WF-003" not in invoices


@pytest.mark.django_db
def test_sales_list_multi_status_ignores_invalid_values(admin_client, store, admin_user):
    Sale.objects.create(
        store=store,
        seller=admin_user,
        invoice_number="FAC-WF-010",
        status=Sale.Status.PENDING_PAYMENT,
        total=Decimal("15000.00"),
        amount_due=Decimal("15000.00"),
    )

    response = admin_client.get(
        "/api/v1/sales/",
        {
            "store": str(store.pk),
            "status_in": "NOT_A_STATUS",
        },
    )

    assert response.status_code == 200
    assert response.data["count"] == 0
    assert response.data["results"] == []


@pytest.mark.django_db
def test_sales_list_filters_by_customer(admin_client, store, admin_user, enterprise):
    target_customer = Customer.objects.create(
        enterprise=enterprise,
        first_name="Alice",
        last_name="Target",
        phone="+237611111111",
    )
    other_customer = Customer.objects.create(
        enterprise=enterprise,
        first_name="Bob",
        last_name="Other",
        phone="+237622222222",
    )

    target_sale = Sale.objects.create(
        store=store,
        seller=admin_user,
        customer=target_customer,
        invoice_number="FAC-CUST-001",
        status=Sale.Status.PAID,
        total=Decimal("11000.00"),
        amount_paid=Decimal("11000.00"),
        amount_due=Decimal("0.00"),
    )
    Sale.objects.create(
        store=store,
        seller=admin_user,
        customer=other_customer,
        invoice_number="FAC-CUST-002",
        status=Sale.Status.PAID,
        total=Decimal("22000.00"),
        amount_paid=Decimal("22000.00"),
        amount_due=Decimal("0.00"),
    )

    response = admin_client.get(
        "/api/v1/sales/",
        {
            "store": str(store.pk),
            "customer": str(target_customer.pk),
        },
    )

    assert response.status_code == 200
    assert response.data["count"] == 1
    assert [row["id"] for row in response.data["results"]] == [str(target_sale.pk)]


# ===========================================================================
# TestSaleCreate
# ===========================================================================


@pytest.mark.django_db
class TestSaleCreate:
    """POST /api/v1/sales/ — create a DRAFT sale."""

    def test_create_draft_sale(self, sales_client, store, sales_user):
        """Sales user can create a DRAFT sale with a store_id."""
        _enable_sales_pos(store)
        customer = _make_customer(store.enterprise)

        response = sales_client.post(
            URL_SALES,
            {"store_id": str(store.pk), "customer_id": str(customer.pk)},
            format="json",
        )

        assert response.status_code == 201
        assert response.data["status"] == "DRAFT"
        assert str(response.data["store"]) == str(store.pk)

    def test_create_draft_sale_without_customer_uses_default(
        self, sales_client, store, sales_user
    ):
        """Omitting customer_id should assign a default walk-in customer."""
        _enable_sales_pos(store)

        response = sales_client.post(
            URL_SALES,
            {"store_id": str(store.pk)},
            format="json",
        )

        assert response.status_code == 201
        assert response.data["status"] == "DRAFT"

    def test_create_sale_invalid_store_rejected(self, sales_client, store, sales_user):
        """Providing a non-existent store_id returns an error."""
        _enable_sales_pos(store)
        import uuid

        response = sales_client.post(
            URL_SALES,
            {"store_id": str(uuid.uuid4())},
            format="json",
        )

        assert response.status_code in (400, 403, 404)


# ===========================================================================
# TestSaleItemWorkflow
# ===========================================================================


@pytest.mark.django_db
class TestSaleItemWorkflow:
    """add-item, set-item-quantity, remove-item actions on a DRAFT sale."""

    @pytest.fixture(autouse=True)
    def _setup(self, sales_client, store, sales_user, enterprise):
        _enable_sales_pos(store)
        self.client = sales_client
        self.store = store
        self.enterprise = enterprise
        self.product = _make_product(enterprise)
        self.customer = _make_customer(enterprise)

        # Create a draft sale
        resp = self.client.post(
            URL_SALES,
            {"store_id": str(store.pk), "customer_id": str(self.customer.pk)},
            format="json",
        )
        assert resp.status_code == 201
        self.sale_id = resp.data["id"]

    def test_add_item(self):
        """POST /api/v1/sales/{id}/add-item/ adds a product to the sale."""
        url = f"{URL_SALES}{self.sale_id}/add-item/"
        response = self.client.post(
            url,
            {"product_id": str(self.product.pk), "quantity": 2},
            format="json",
        )

        assert response.status_code == 200
        items = response.data.get("items", [])
        assert len(items) == 1
        assert str(items[0]["product"]) == str(self.product.pk)
        assert items[0]["quantity"] == 2

    def test_set_item_quantity(self):
        """POST /api/v1/sales/{id}/set-item-quantity/ changes the quantity."""
        # First add an item
        add_url = f"{URL_SALES}{self.sale_id}/add-item/"
        add_resp = self.client.post(
            add_url,
            {"product_id": str(self.product.pk), "quantity": 1},
            format="json",
        )
        assert add_resp.status_code == 200
        item_id = add_resp.data["items"][0]["id"]

        # Now set quantity to 5
        set_url = f"{URL_SALES}{self.sale_id}/set-item-quantity/"
        response = self.client.post(
            set_url,
            {"item_id": item_id, "quantity": 5},
            format="json",
        )

        assert response.status_code == 200
        items = response.data.get("items", [])
        assert len(items) == 1
        assert items[0]["quantity"] == 5

    def test_remove_item_decrements(self):
        """POST /api/v1/sales/{id}/remove-item/ decrements quantity by 1 when qty > 1."""
        # Add item with qty 3
        add_url = f"{URL_SALES}{self.sale_id}/add-item/"
        add_resp = self.client.post(
            add_url,
            {"product_id": str(self.product.pk), "quantity": 3},
            format="json",
        )
        assert add_resp.status_code == 200
        item_id = add_resp.data["items"][0]["id"]

        # Remove (should decrement to 2)
        remove_url = f"{URL_SALES}{self.sale_id}/remove-item/"
        response = self.client.post(
            remove_url,
            {"item_id": item_id},
            format="json",
        )

        assert response.status_code == 200
        items = response.data.get("items", [])
        assert len(items) == 1
        assert items[0]["quantity"] == 2

    def test_remove_item_deletes_when_qty_one(self):
        """POST /api/v1/sales/{id}/remove-item/ deletes the line when qty == 1."""
        # Add item with qty 1
        add_url = f"{URL_SALES}{self.sale_id}/add-item/"
        add_resp = self.client.post(
            add_url,
            {"product_id": str(self.product.pk), "quantity": 1},
            format="json",
        )
        assert add_resp.status_code == 200
        item_id = add_resp.data["items"][0]["id"]

        # Remove (should delete the line)
        remove_url = f"{URL_SALES}{self.sale_id}/remove-item/"
        response = self.client.post(
            remove_url,
            {"item_id": item_id},
            format="json",
        )

        assert response.status_code == 200
        items = response.data.get("items", [])
        assert len(items) == 0


# ===========================================================================
# TestSaleSubmit
# ===========================================================================


@pytest.mark.django_db
class TestSaleSubmit:
    """POST /api/v1/sales/{id}/submit/ — submit a sale to the cashier."""

    def test_submit_sale_with_items(self, sales_client, store, sales_user, enterprise):
        """Submitting a draft sale with items and total > 0 succeeds."""
        _enable_sales_pos(store)
        product = _make_product(enterprise)
        customer = _make_customer(enterprise)

        # Create draft
        resp = sales_client.post(
            URL_SALES,
            {"store_id": str(store.pk), "customer_id": str(customer.pk)},
            format="json",
        )
        assert resp.status_code == 201
        sale_id = resp.data["id"]

        # Add item so total > 0
        add_resp = sales_client.post(
            f"{URL_SALES}{sale_id}/add-item/",
            {"product_id": str(product.pk), "quantity": 2},
            format="json",
        )
        assert add_resp.status_code == 200

        # Verify total > 0 before submitting
        sale = Sale.objects.get(pk=sale_id)
        sale.refresh_from_db()
        assert sale.total > 0

        # Submit
        response = sales_client.post(f"{URL_SALES}{sale_id}/submit/")

        assert response.status_code == 200
        assert response.data["status"] == "PENDING_PAYMENT"

    def test_submit_empty_sale_rejected(self, sales_client, store, sales_user, enterprise):
        """Submitting a draft sale with no items is rejected."""
        _enable_sales_pos(store)
        customer = _make_customer(enterprise)

        resp = sales_client.post(
            URL_SALES,
            {"store_id": str(store.pk), "customer_id": str(customer.pk)},
            format="json",
        )
        assert resp.status_code == 201
        sale_id = resp.data["id"]

        response = sales_client.post(f"{URL_SALES}{sale_id}/submit/")

        assert response.status_code == 400


# ===========================================================================
# TestSaleCancel
# ===========================================================================


@pytest.mark.django_db
class TestSaleCancel:
    """POST /api/v1/sales/{id}/cancel/ — cancel a sale."""

    def _create_draft_sale(self, client, store, enterprise):
        """Helper to create a draft sale with an item."""
        _enable_sales_pos(store)
        product = _make_product(
            enterprise,
            name=f"Produit-{store.pk}",
            selling_price="8000.00",
        )
        customer = _make_customer(enterprise, first_name="Cancel", last_name="Test")

        resp = client.post(
            URL_SALES,
            {"store_id": str(store.pk), "customer_id": str(customer.pk)},
            format="json",
        )
        assert resp.status_code == 201
        sale_id = resp.data["id"]

        add_resp = client.post(
            f"{URL_SALES}{sale_id}/add-item/",
            {"product_id": str(product.pk), "quantity": 1},
            format="json",
        )
        assert add_resp.status_code == 200
        return sale_id

    def test_manager_can_cancel_draft(
        self, sales_client, store, enterprise, manager_user, sales_user
    ):
        """A manager can cancel a DRAFT sale."""
        sale_id = self._create_draft_sale(sales_client, store, enterprise)

        # Use a separate APIClient for manager to avoid shared-instance issues
        mgr_client = APIClient()
        mgr_client.force_authenticate(user=manager_user)
        response = mgr_client.post(
            f"{URL_SALES}{sale_id}/cancel/",
            {"reason": "Test annulation par manager"},
            format="json",
        )

        assert response.status_code == 200
        assert response.data["status"] == "CANCELLED"

    def test_sales_user_cannot_cancel(
        self, sales_client, store, enterprise, sales_user
    ):
        """A sales user is forbidden from cancelling a sale."""
        sale_id = self._create_draft_sale(sales_client, store, enterprise)

        response = sales_client.post(
            f"{URL_SALES}{sale_id}/cancel/",
            {"reason": "Tentative non autorisee"},
            format="json",
        )

        assert response.status_code == 403


# ===========================================================================
# TestSaleAuthorization
# ===========================================================================


@pytest.mark.django_db
class TestSaleAuthorization:
    """Authorization checks: unauthenticated and wrong-role users are rejected."""

    def test_unauthenticated_user_rejected(self, api_client, store):
        """An unauthenticated request is rejected with 401."""
        _enable_sales_pos(store)

        response = api_client.post(
            URL_SALES,
            {"store_id": str(store.pk)},
            format="json",
        )

        assert response.status_code == 401

    def test_cashier_cannot_create_sale(self, api_client, store, db):
        """A user with CASHIER role cannot create a sale (requires IsSales)."""
        _enable_sales_pos(store)

        cashier_user = User.objects.create_user(
            email="cashier@test.com",
            password="TestPass123!",
            first_name="Cashier",
            last_name="User",
            role="CASHIER",
        )
        StoreUser.objects.create(store=store, user=cashier_user, is_default=True)
        api_client.force_authenticate(user=cashier_user)

        response = api_client.post(
            URL_SALES,
            {"store_id": str(store.pk)},
            format="json",
        )

        assert response.status_code == 403

    def test_unauthenticated_list_rejected(self, api_client, store):
        """An unauthenticated request to list sales is rejected."""
        _enable_sales_pos(store)

        response = api_client.get(URL_SALES, {"store": str(store.pk)})

        assert response.status_code == 401
