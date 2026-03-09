"""Tests for the offline-sync sale endpoint."""
import uuid
from decimal import Decimal

import pytest

from customers.models import Customer
from sales.models import Sale, SaleItem
from catalog.models import Category, Product


URL = "/api/v1/sales/offline-sync/"


@pytest.fixture
def category(enterprise):
    return Category.objects.create(
        enterprise=enterprise,
        name="Electronique",
        slug="electronique",
    )


@pytest.fixture
def product_a(enterprise, category):
    return Product.objects.create(
        enterprise=enterprise,
        category=category,
        name="Chargeur USB",
        slug="chargeur-usb",
        sku="CHRG-001",
        selling_price=Decimal("5000.00"),
        cost_price=Decimal("2500.00"),
        track_stock=False,
    )


@pytest.fixture
def product_b(enterprise, category):
    return Product.objects.create(
        enterprise=enterprise,
        category=category,
        name="Cable HDMI",
        slug="cable-hdmi",
        sku="HDMI-001",
        selling_price=Decimal("3000.00"),
        cost_price=Decimal("1500.00"),
        track_stock=False,
    )


@pytest.fixture
def customer(enterprise):
    return Customer.objects.create(
        enterprise=enterprise,
        first_name="Offline",
        last_name="Client",
        phone="+237600000001",
    )


# ── Happy path ────────────────────────────────────────────────────────────


@pytest.mark.django_db
class TestOfflineSyncCreate:
    """POST /api/v1/sales/offline-sync/ — create sale from offline queue."""

    def test_creates_sale_with_items(self, sales_client, store, sales_user, product_a, product_b):
        offline_id = str(uuid.uuid4())
        payload = {
            "offline_id": offline_id,
            "store_id": str(store.pk),
            "items": [
                {"product_id": str(product_a.pk), "quantity": 2},
                {"product_id": str(product_b.pk), "quantity": 1, "discount_amount": "500"},
            ],
            "notes": "Vente offline test",
        }

        response = sales_client.post(URL, payload, format="json")

        assert response.status_code == 201, response.data
        sale = Sale.objects.get(offline_id=offline_id)
        assert sale.status == Sale.Status.PENDING_PAYMENT
        assert sale.seller == sales_user
        assert sale.store == store
        assert sale.notes == "Vente offline test"
        assert sale.items.count() == 2

    def test_returns_invoice_number(self, sales_client, store, product_a):
        payload = {
            "offline_id": str(uuid.uuid4()),
            "store_id": str(store.pk),
            "items": [{"product_id": str(product_a.pk), "quantity": 1}],
        }

        response = sales_client.post(URL, payload, format="json")

        assert response.status_code == 201
        assert response.data.get("invoice_number") is not None

    def test_assigns_customer(self, sales_client, store, product_a, customer):
        payload = {
            "offline_id": str(uuid.uuid4()),
            "store_id": str(store.pk),
            "customer_id": str(customer.pk),
            "items": [{"product_id": str(product_a.pk), "quantity": 3}],
        }

        response = sales_client.post(URL, payload, format="json")

        assert response.status_code == 201
        assert str(response.data["customer"]) == str(customer.pk)

    def test_applies_discount_percent(self, sales_client, store, product_a):
        payload = {
            "offline_id": str(uuid.uuid4()),
            "store_id": str(store.pk),
            "discount_percent": "10.00",
            "items": [{"product_id": str(product_a.pk), "quantity": 1}],
        }

        response = sales_client.post(URL, payload, format="json")

        assert response.status_code == 201
        sale = Sale.objects.get(offline_id=payload["offline_id"])
        assert sale.discount_percent == Decimal("10.00")


# ── Idempotency ──────────────────────────────────────────────────────────


@pytest.mark.django_db
class TestOfflineSyncIdempotency:
    """Sending the same offline_id twice must NOT create a duplicate."""

    def test_duplicate_returns_existing_sale(self, sales_client, store, product_a):
        offline_id = str(uuid.uuid4())
        payload = {
            "offline_id": offline_id,
            "store_id": str(store.pk),
            "items": [{"product_id": str(product_a.pk), "quantity": 1}],
        }

        r1 = sales_client.post(URL, payload, format="json")
        r2 = sales_client.post(URL, payload, format="json")

        assert r1.status_code == 201
        assert r2.status_code == 200  # 200 = already exists
        assert r1.data["id"] == r2.data["id"]
        assert Sale.objects.filter(offline_id=offline_id).count() == 1


# ── Validation & errors ──────────────────────────────────────────────────


@pytest.mark.django_db
class TestOfflineSyncValidation:
    """Error handling and input validation."""

    def test_rejects_empty_items(self, sales_client, store):
        payload = {
            "offline_id": str(uuid.uuid4()),
            "store_id": str(store.pk),
            "items": [],
        }

        response = sales_client.post(URL, payload, format="json")
        assert response.status_code == 400

    def test_rejects_missing_offline_id(self, sales_client, store, product_a):
        payload = {
            "store_id": str(store.pk),
            "items": [{"product_id": str(product_a.pk), "quantity": 1}],
        }

        response = sales_client.post(URL, payload, format="json")
        assert response.status_code == 400

    def test_rejects_invalid_store(self, sales_client, product_a):
        payload = {
            "offline_id": str(uuid.uuid4()),
            "store_id": str(uuid.uuid4()),  # non-existent
            "items": [{"product_id": str(product_a.pk), "quantity": 1}],
        }

        response = sales_client.post(URL, payload, format="json")
        assert response.status_code in (403, 404)

    def test_rejects_invalid_product(self, sales_client, store):
        payload = {
            "offline_id": str(uuid.uuid4()),
            "store_id": str(store.pk),
            "items": [{"product_id": str(uuid.uuid4()), "quantity": 1}],
        }

        response = sales_client.post(URL, payload, format="json")
        # Sale is created but items are empty → ValueError "Aucun article valide"
        assert response.status_code == 400
        assert "article" in response.data["detail"].lower()

    def test_reports_partial_item_warnings(self, sales_client, store, product_a):
        """One valid + one invalid product should still create the sale but report warnings."""
        payload = {
            "offline_id": str(uuid.uuid4()),
            "store_id": str(store.pk),
            "items": [
                {"product_id": str(product_a.pk), "quantity": 1},
                {"product_id": str(uuid.uuid4()), "quantity": 2},  # invalid
            ],
        }

        response = sales_client.post(URL, payload, format="json")
        assert response.status_code == 201
        assert "_warnings" in response.data
        assert len(response.data["_warnings"]) == 1


# ── Authorization ────────────────────────────────────────────────────────


@pytest.mark.django_db
class TestOfflineSyncAuthorization:
    """Only SALES roles can use offline-sync."""

    def test_unauthenticated_rejected(self, api_client, store, product_a):
        payload = {
            "offline_id": str(uuid.uuid4()),
            "store_id": str(store.pk),
            "items": [{"product_id": str(product_a.pk), "quantity": 1}],
        }

        response = api_client.post(URL, payload, format="json")
        assert response.status_code in (401, 403)

    def test_cashier_role_rejected(self, store, product_a, api_client):
        """A pure CASHIER user should not be able to sync offline sales."""
        from django.contrib.auth import get_user_model
        from stores.models import StoreUser

        User = get_user_model()
        cashier = User.objects.create_user(
            email="cashier_offline@test.com",
            password="TestPass123!",
            first_name="Cashier",
            last_name="Only",
            role="CASHIER",
        )
        StoreUser.objects.create(store=store, user=cashier, is_default=True)
        api_client.force_authenticate(user=cashier)

        payload = {
            "offline_id": str(uuid.uuid4()),
            "store_id": str(store.pk),
            "items": [{"product_id": str(product_a.pk), "quantity": 1}],
        }

        response = api_client.post(URL, payload, format="json")
        assert response.status_code == 403

    def test_cross_store_rejected(self, sales_client, enterprise, product_a):
        """A SALES user cannot sync to a store they don't belong to."""
        from stores.models import Store

        other_store = Store.objects.create(
            enterprise=enterprise,
            name="Other Store",
            code="OTHER-01",
        )

        payload = {
            "offline_id": str(uuid.uuid4()),
            "store_id": str(other_store.pk),
            "items": [{"product_id": str(product_a.pk), "quantity": 1}],
        }

        response = sales_client.post(URL, payload, format="json")
        assert response.status_code == 403


# ── Model field ──────────────────────────────────────────────────────────


@pytest.mark.django_db
class TestSaleOfflineIdField:
    """Sale.offline_id field integrity."""

    def test_offline_id_unique(self, store, sales_user):
        oid = uuid.uuid4()
        Sale.objects.create(
            store=store, seller=sales_user, offline_id=oid,
        )
        with pytest.raises(Exception):
            Sale.objects.create(
                store=store, seller=sales_user, offline_id=oid,
            )

    def test_offline_id_nullable(self, store, sales_user):
        sale = Sale.objects.create(
            store=store, seller=sales_user, offline_id=None,
        )
        assert sale.offline_id is None
