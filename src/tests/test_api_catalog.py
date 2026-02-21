"""Tests for Catalog API endpoints (products, categories, brands)."""
import pytest
from catalog.models import Category, Brand, Product


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
