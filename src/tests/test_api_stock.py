"""Tests for the Stock Management module API endpoints."""
import uuid
from decimal import Decimal

import pytest

from catalog.models import Category, Product
from stock.models import (
    InventoryMovement,
    ProductStock,
    StockCount,
    StockCountLine,
    StockTransfer,
    StockTransferLine,
)


# ── Helpers ──────────────────────────────────────────────────────────────

def _enable_stock_module(store):
    ent = store.enterprise
    flags = ent.analytics_feature_flags or {}
    flags["stock_management"] = True
    flags["stock_entries"] = True
    ent.analytics_feature_flags = flags
    ent.save(update_fields=["analytics_feature_flags"])


URL_STOCK = "/api/v1/stock/"
URL_MOVEMENTS = "/api/v1/stock-movements/"
URL_TRANSFERS = "/api/v1/stock-transfers/"
URL_COUNTS = "/api/v1/stock-counts/"


# ── Fixtures ─────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def enable_stock(store):
    _enable_stock_module(store)


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
        track_stock=True,
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
        track_stock=True,
    )


@pytest.fixture
def stock_a(store, product_a):
    return ProductStock.objects.create(
        store=store, product=product_a, quantity=50, min_qty=10,
    )


@pytest.fixture
def stock_b(store, product_b):
    return ProductStock.objects.create(
        store=store, product=product_b, quantity=30, min_qty=5,
    )


@pytest.fixture
def second_store(enterprise):
    from stores.models import Store
    s = Store.objects.create(enterprise=enterprise, name="Store B", code="STORE-B")
    _enable_stock_module(s)
    return s


# ── ProductStock (read) ─────────────────────────────────────────────────


@pytest.mark.django_db
class TestProductStockList:
    def test_list_stock(self, admin_client, stock_a, stock_b):
        r = admin_client.get(URL_STOCK)
        assert r.status_code == 200
        assert len(r.data["results"]) >= 2

    def test_search_by_sku(self, admin_client, stock_a):
        r = admin_client.get(URL_STOCK, {"search": "CHRG"})
        assert r.status_code == 200
        assert len(r.data["results"]) >= 1


# ── Inventory Movements ─────────────────────────────────────────────────


@pytest.mark.django_db
class TestInventoryMovements:
    def test_list_movements(self, admin_client, store, product_a, stock_a, admin_user):
        InventoryMovement.objects.create(
            store=store, product=product_a, movement_type="IN",
            quantity=10, reference="REF", reason="Test", actor=admin_user,
        )
        r = admin_client.get(URL_MOVEMENTS)
        assert r.status_code == 200
        assert len(r.data["results"]) >= 1

    def test_filter_by_type(self, admin_client, store, product_a, admin_user):
        InventoryMovement.objects.create(
            store=store, product=product_a, movement_type="IN",
            quantity=5, reference="IN", reason="In", actor=admin_user,
        )
        InventoryMovement.objects.create(
            store=store, product=product_a, movement_type="ADJUST",
            quantity=-2, reference="ADJ", reason="Adj", actor=admin_user,
        )
        r = admin_client.get(URL_MOVEMENTS, {"movement_type": "IN"})
        assert r.status_code == 200
        assert all(m["movement_type"] == "IN" for m in r.data["results"])

    def test_bulk_entry(self, admin_client, store, product_a, product_b, stock_a, stock_b):
        r = admin_client.post(f"{URL_MOVEMENTS}bulk-entry/", {
            "store_id": str(store.pk),
            "reference": "PO-BULK",
            "reason": "Bulk purchase",
            "entries": [
                {"product_id": str(product_a.pk), "quantity": 10},
                {"product_id": str(product_b.pk), "quantity": 5},
            ],
        }, format="json")
        assert r.status_code == 201, r.data
        stock_a.refresh_from_db()
        stock_b.refresh_from_db()
        assert stock_a.quantity == 60  # 50 + 10
        assert stock_b.quantity == 35  # 30 + 5

    def test_bulk_adjust(self, admin_client, store, product_a, product_b, stock_a, stock_b):
        r = admin_client.post(f"{URL_MOVEMENTS}bulk-adjust/", {
            "store_id": str(store.pk),
            "reason": "Inventaire correction",
            "adjustments": [
                {"product_id": str(product_a.pk), "quantity": -5},
                {"product_id": str(product_b.pk), "quantity": 3},
            ],
        }, format="json")
        assert r.status_code == 201, r.data
        stock_a.refresh_from_db()
        stock_b.refresh_from_db()
        assert stock_a.quantity == 45  # 50 - 5
        assert stock_b.quantity == 33  # 30 + 3

    def test_bulk_entry_rejects_service_product(self, admin_client, store, enterprise, category):
        service = Product.objects.create(
            enterprise=enterprise, category=category, name="Service",
            slug="service", sku="SVC-001", selling_price=Decimal("1000"),
            track_stock=False,
        )
        r = admin_client.post(f"{URL_MOVEMENTS}bulk-entry/", {
            "store_id": str(store.pk),
            "entries": [{"product_id": str(service.pk), "quantity": 5}],
        }, format="json")
        assert r.status_code == 400


# ── Stock Transfers ──────────────────────────────────────────────────────


@pytest.mark.django_db
class TestStockTransfers:
    def test_create_transfer(self, admin_client, store, second_store, product_a, stock_a):
        r = admin_client.post(URL_TRANSFERS, {
            "from_store_id": str(store.pk),
            "to_store": str(second_store.pk),
            "notes": "Transfer to Store B",
            "lines": [
                {"product_id": str(product_a.pk), "quantity": 10},
            ],
        }, format="json")
        assert r.status_code == 201
        assert r.data["status"] == "PENDING"

    def test_approve_and_process_transfer(
        self, admin_client, manager_client, store, second_store,
        product_a, stock_a, manager_user,
    ):
        from stores.models import StoreUser
        # Manager needs access to second_store too
        StoreUser.objects.get_or_create(store=second_store, user=manager_user, defaults={"is_default": False})

        # Create
        r = admin_client.post(URL_TRANSFERS, {
            "from_store_id": str(store.pk),
            "to_store": str(second_store.pk),
            "lines": [{"product_id": str(product_a.pk), "quantity": 10}],
        }, format="json")
        transfer_id = r.data["id"]

        # Approve (manager)
        r2 = manager_client.post(f"{URL_TRANSFERS}{transfer_id}/approve/")
        assert r2.status_code == 200
        assert r2.data["status"] in ("APPROVED", "IN_TRANSIT")

        stock_a.refresh_from_db()
        assert stock_a.quantity == 40  # 50 - 10

    def test_list_transfers(self, admin_client, store, second_store, admin_user):
        StockTransfer.objects.create(
            from_store=store, to_store=second_store, created_by=admin_user,
        )
        r = admin_client.get(URL_TRANSFERS)
        assert r.status_code == 200
        assert len(r.data["results"]) >= 1

    def test_filter_by_status(self, admin_client, store, second_store, admin_user):
        StockTransfer.objects.create(
            from_store=store, to_store=second_store, created_by=admin_user,
            status=StockTransfer.Status.PENDING,
        )
        r = admin_client.get(URL_TRANSFERS, {"status": "PENDING"})
        assert r.status_code == 200
        assert all(t["status"] == "PENDING" for t in r.data["results"])


# ── Stock Counts ─────────────────────────────────────────────────────────


@pytest.mark.django_db
class TestStockCounts:
    def test_create_count(self, admin_client, store, stock_a, stock_b):
        r = admin_client.post(URL_COUNTS, {
            "store_id": str(store.pk),
            "notes": "Inventaire mensuel",
        }, format="json")
        assert r.status_code == 201
        assert r.data["status"] == "IN_PROGRESS"

    def test_update_count_lines(self, admin_client, store, stock_a, stock_b, admin_user):
        count = StockCount.objects.create(
            store=store, created_by=admin_user, status="IN_PROGRESS",
        )
        line_a = StockCountLine.objects.create(
            stock_count=count, product=stock_a.product,
            system_qty=stock_a.quantity,
        )
        line_b = StockCountLine.objects.create(
            stock_count=count, product=stock_b.product,
            system_qty=stock_b.quantity,
        )
        r = admin_client.patch(f"{URL_COUNTS}{count.pk}/update-lines/", {
            "lines": [
                {"id": str(line_a.pk), "counted_qty": 48},
                {"id": str(line_b.pk), "counted_qty": 30},
            ],
        }, format="json")
        assert r.status_code == 200
        line_a.refresh_from_db()
        assert line_a.counted_qty == 48

    def test_complete_count(self, admin_client, store, stock_a, stock_b, admin_user):
        count = StockCount.objects.create(
            store=store, created_by=admin_user, status="IN_PROGRESS",
        )
        StockCountLine.objects.create(
            stock_count=count, product=stock_a.product,
            system_qty=50, counted_qty=48,
        )
        StockCountLine.objects.create(
            stock_count=count, product=stock_b.product,
            system_qty=30, counted_qty=30,
        )
        r = admin_client.post(f"{URL_COUNTS}{count.pk}/complete/")
        assert r.status_code == 200
        stock_a.refresh_from_db()
        assert stock_a.quantity == 48  # adjusted from 50 to 48

    def test_complete_rejects_uncounted_lines(self, admin_client, store, stock_a, admin_user):
        count = StockCount.objects.create(
            store=store, created_by=admin_user, status="IN_PROGRESS",
        )
        StockCountLine.objects.create(
            stock_count=count, product=stock_a.product,
            system_qty=50, counted_qty=None,
        )
        with pytest.raises(ValueError, match="comptee"):
            admin_client.post(f"{URL_COUNTS}{count.pk}/complete/")

    def test_list_counts(self, admin_client, store, admin_user):
        StockCount.objects.create(store=store, created_by=admin_user)
        r = admin_client.get(URL_COUNTS)
        assert r.status_code == 200
        assert len(r.data["results"]) >= 1


# ── Authorization ────────────────────────────────────────────────────────


@pytest.mark.django_db
class TestStockAuthorization:
    def test_unauthenticated_rejected(self, api_client):
        r = api_client.get(URL_STOCK)
        assert r.status_code in (401, 403)

    def test_module_disabled_rejected(self, admin_client, store):
        ent = store.enterprise
        flags = ent.analytics_feature_flags or {}
        flags["stock_management"] = False
        ent.analytics_feature_flags = flags
        ent.save(update_fields=["analytics_feature_flags"])

        r = admin_client.get(URL_STOCK)
        assert r.status_code == 403
