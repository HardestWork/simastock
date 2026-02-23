"""Tests for Catalog API endpoints (products, categories, brands)."""
import pytest
from catalog.models import Category, Brand, Product
from stock.models import ProductStock


class TestCategoryAPI:
    """CRUD /api/v1/categories/"""

    def test_list(self, admin_client, enterprise):
        Category.objects.create(enterprise=enterprise, name="Electronique")
        resp = admin_client.get("/api/v1/categories/")
        assert resp.status_code == 200
        assert resp.data["count"] >= 1

    def test_create(self, admin_client):
        resp = admin_client.post("/api/v1/categories/", {"name": "Alimentation"})
        assert resp.status_code == 201
        assert resp.data["name"] == "Alimentation"

    def test_delete(self, admin_client, enterprise):
        cat = Category.objects.create(enterprise=enterprise, name="ToDelete")
        resp = admin_client.delete(f"/api/v1/categories/{cat.pk}/")
        assert resp.status_code == 204


class TestBrandAPI:
    """CRUD /api/v1/brands/"""

    def test_list(self, admin_client, enterprise):
        Brand.objects.create(enterprise=enterprise, name="Apple")
        resp = admin_client.get("/api/v1/brands/")
        assert resp.status_code == 200
        assert resp.data["count"] >= 1

    def test_create(self, admin_client):
        resp = admin_client.post("/api/v1/brands/", {"name": "Samsung"})
        assert resp.status_code == 201


class TestProductAPI:
    """CRUD /api/v1/products/"""

    @pytest.fixture
    def category(self, enterprise):
        return Category.objects.create(enterprise=enterprise, name="General")

    def test_create_product(self, admin_client, store, category):
        resp = admin_client.post("/api/v1/products/", {
            "name": "Test Product",
            "sku": "TST-001",
            "selling_price": "10000",
            "cost_price": "7000",
            "category": str(category.pk),
        })
        assert resp.status_code == 201
        assert resp.data["name"] == "Test Product"

    def test_list_products(self, admin_client, enterprise, category):
        Product.objects.create(
            enterprise=enterprise,
            name="Prod1",
            sku="P1",
            selling_price=5000,
            cost_price=3000,
            category=category,
        )
        resp = admin_client.get("/api/v1/products/")
        assert resp.status_code == 200
        assert resp.data["count"] >= 1

    def test_sales_user_can_list(self, sales_client, enterprise, category):
        Product.objects.create(
            enterprise=enterprise,
            name="Prod2",
            sku="P2",
            selling_price=5000,
            cost_price=3000,
            category=category,
        )
        resp = sales_client.get("/api/v1/products/")
        assert resp.status_code == 200

    def test_create_service_forces_no_stock_tracking(self, admin_client):
        resp = admin_client.post("/api/v1/products/", {
            "name": "Installation reseau",
            "sku": "SRV-001",
            "selling_price": "30000",
            "cost_price": "0",
            "product_type": "SERVICE",
            "track_stock": True,
        })
        assert resp.status_code == 201
        assert resp.data["product_type"] == "SERVICE"
        assert resp.data["track_stock"] is False

    def test_service_can_be_added_to_sale_without_stock_row(self, admin_client, store, enterprise):
        service = Product.objects.create(
            enterprise=enterprise,
            name="Maintenance PC",
            sku="SRV-002",
            product_type=Product.ProductType.SERVICE,
            track_stock=False,
            selling_price=15000,
            cost_price=0,
        )
        sale_resp = admin_client.post("/api/v1/sales/", {"store_id": str(store.pk)})
        assert sale_resp.status_code == 201
        sale_id = sale_resp.data["id"]

        add_item_resp = admin_client.post(
            f"/api/v1/sales/{sale_id}/add-item/",
            {"product_id": str(service.pk), "quantity": 1},
        )
        assert add_item_resp.status_code == 200
        assert len(add_item_resp.data["items"]) == 1
        assert ProductStock.objects.filter(store=store, product=service).exists() is False

    def test_delete_product_with_only_stock_row(self, admin_client, store, enterprise):
        product = Product.objects.create(
            enterprise=enterprise,
            name="Produit supprimable",
            sku="DEL-001",
            selling_price=12000,
            cost_price=8000,
        )
        ProductStock.objects.create(store=store, product=product, quantity=0, reserved_qty=0)

        resp = admin_client.delete(f"/api/v1/products/{product.pk}/")
        assert resp.status_code == 204
        assert Product.objects.filter(pk=product.pk).exists() is False
        assert ProductStock.objects.filter(product=product).exists() is False

    def test_delete_product_linked_to_sale_returns_business_error(self, admin_client, store, enterprise):
        service = Product.objects.create(
            enterprise=enterprise,
            name="Service protege",
            sku="DEL-002",
            product_type=Product.ProductType.SERVICE,
            track_stock=False,
            selling_price=9000,
            cost_price=0,
        )
        sale_resp = admin_client.post("/api/v1/sales/", {"store_id": str(store.pk)})
        assert sale_resp.status_code == 201
        sale_id = sale_resp.data["id"]
        add_item_resp = admin_client.post(
            f"/api/v1/sales/{sale_id}/add-item/",
            {"product_id": str(service.pk), "quantity": 1},
        )
        assert add_item_resp.status_code == 200

        delete_resp = admin_client.delete(f"/api/v1/products/{service.pk}/")
        assert delete_resp.status_code == 400
        assert "Impossible de supprimer ce produit" in str(delete_resp.data.get("detail", ""))
