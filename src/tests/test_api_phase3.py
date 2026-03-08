"""Tests for Phase 3 features: variants, loyalty, pricing policies, recurring sales, denominations."""
import pytest
from decimal import Decimal
from django.utils import timezone

from catalog.models import Category, Product, ProductVariant, PricingPolicy
from customers.models import Customer, LoyaltyAccount, LoyaltyTransaction
from customers.services import award_points, redeem_points, compute_customer_score
from cashier.models import CashShift, CashShiftDenomination
from sales.models import RecurringSale
from stores.models import Enterprise


# ---------------------------------------------------------------------------
# ProductVariant
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestProductVariantAPI:
    """Tests for /api/v1/catalog/variants/"""

    def test_create_variant(self, admin_client, enterprise, store):
        Category.objects.create(enterprise=enterprise, name="Cat", slug="cat")
        product = Product.objects.create(
            enterprise=enterprise,
            name="T-Shirt",
            slug="t-shirt",
            sku="SKU-TSHIRT",
            selling_price="5000",
            cost_price="2000",
            track_stock=False,
        )
        resp = admin_client.post("/api/v1/catalog/variants/", {
            "product": str(product.id),
            "name": "Rouge / L",
            "sku": "SKU-TSHIRT-RL",
            "selling_price": "5500",
        }, format="json")
        assert resp.status_code == 201
        assert resp.data["name"] == "Rouge / L"
        assert resp.data["effective_selling_price"] == "5500.00"

    def test_variant_inherits_product_price_when_not_set(self, admin_client, enterprise, store):
        product = Product.objects.create(
            enterprise=enterprise, name="Chemise", slug="chemise", sku="SKU-CH",
            selling_price="8000", cost_price="3000", track_stock=False,
        )
        resp = admin_client.post("/api/v1/catalog/variants/", {
            "product": str(product.id),
            "name": "Bleu / M",
        }, format="json")
        assert resp.status_code == 201
        assert resp.data["effective_selling_price"] == "8000.00"

    def test_duplicate_variant_name_rejected(self, admin_client, enterprise, store):
        product = Product.objects.create(
            enterprise=enterprise, name="Pantalon", slug="pantalon", sku="SKU-PNT",
            selling_price="12000", cost_price="5000", track_stock=False,
        )
        ProductVariant.objects.create(product=product, name="Noir / 42")
        resp = admin_client.post("/api/v1/catalog/variants/", {
            "product": str(product.id),
            "name": "Noir / 42",
        }, format="json")
        assert resp.status_code == 400

    def test_list_filtered_by_product(self, admin_client, enterprise, store):
        product = Product.objects.create(
            enterprise=enterprise, name="Robe", slug="robe", sku="SKU-ROBE",
            selling_price="15000", cost_price="6000", track_stock=False,
        )
        ProductVariant.objects.create(product=product, name="Rouge")
        ProductVariant.objects.create(product=product, name="Bleu")
        resp = admin_client.get(f"/api/v1/catalog/variants/?product={product.id}")
        assert resp.status_code == 200
        assert resp.data["count"] == 2


# ---------------------------------------------------------------------------
# Loyalty
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestLoyaltyServices:
    """Unit tests for loyalty service functions."""

    def test_award_points(self, enterprise, store):
        customer = Customer.objects.create(
            enterprise=enterprise, first_name="Alice", last_name="Diallo", phone="1111",
        )
        account = LoyaltyAccount.objects.create(store=store, customer=customer)
        award_points(account=account, points=Decimal("50"), reference="test-ref")
        account.refresh_from_db()
        assert account.points_balance == Decimal("50")
        assert account.points_earned == Decimal("50")
        assert LoyaltyTransaction.objects.filter(account=account, transaction_type="EARN").exists()

    def test_redeem_points(self, enterprise, store):
        customer = Customer.objects.create(
            enterprise=enterprise, first_name="Bob", last_name="Traore", phone="2222",
        )
        account = LoyaltyAccount.objects.create(
            store=store, customer=customer,
            points_balance=Decimal("100"), points_earned=Decimal("100"),
        )
        redeem_points(account=account, points=30)
        account.refresh_from_db()
        assert account.points_balance == Decimal("70")
        assert account.points_redeemed == Decimal("30")

    def test_redeem_insufficient_balance_raises(self, enterprise, store):
        customer = Customer.objects.create(
            enterprise=enterprise, first_name="Carl", last_name="Kabore", phone="3333",
        )
        account = LoyaltyAccount.objects.create(
            store=store, customer=customer, points_balance=Decimal("10"),
        )
        with pytest.raises(ValueError, match="Solde insuffisant"):
            redeem_points(account=account, points=50)

    def test_compute_customer_score(self, enterprise):
        customer = Customer.objects.create(
            enterprise=enterprise, first_name="Diane", last_name="Sawadogo", phone="4444",
            purchase_count=5,
            total_purchase_amount=Decimal("50000"),
            last_purchase_at=timezone.now(),
        )
        score = compute_customer_score(customer)
        # 5×20=100 + 50000/10000=5 + recency_bonus=30 = 135
        assert score == Decimal("135")

    def test_loyalty_api_list(self, admin_client, enterprise, store):
        customer = Customer.objects.create(
            enterprise=enterprise, first_name="Eve", last_name="Ouedraogo", phone="5555",
        )
        LoyaltyAccount.objects.create(store=store, customer=customer, points_balance=Decimal("200"))
        resp = admin_client.get("/api/v1/loyalty/accounts/")
        assert resp.status_code == 200
        assert resp.data["count"] == 1

    def test_loyalty_redeem_api(self, admin_client, enterprise, store):
        customer = Customer.objects.create(
            enterprise=enterprise, first_name="Felix", last_name="Bamba", phone="6666",
        )
        account = LoyaltyAccount.objects.create(
            store=store, customer=customer,
            points_balance=Decimal("500"), points_earned=Decimal("500"),
        )
        resp = admin_client.post("/api/v1/loyalty/accounts/redeem/", {
            "customer_id": str(customer.id),
            "points": 100,
        }, format="json")
        assert resp.status_code == 200
        account.refresh_from_db()
        assert account.points_balance == Decimal("400")


# ---------------------------------------------------------------------------
# Pricing Policies
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestPricingPolicyAPI:
    """Tests for /api/v1/catalog/pricing-policies/"""

    def test_create_pricing_policy(self, admin_client, enterprise, store):
        resp = admin_client.post("/api/v1/catalog/pricing-policies/", {
            "name": "Remise VIP Or",
            "priority": 10,
            "is_active": True,
            "customer_tier": "GOLD",
        }, format="json")
        assert resp.status_code == 201
        assert resp.data["name"] == "Remise VIP Or"
        assert PricingPolicy.objects.filter(enterprise=enterprise, name="Remise VIP Or").exists()

    def test_list_pricing_policies(self, admin_client, enterprise, store):
        PricingPolicy.objects.create(enterprise=enterprise, name="P1", priority=1)
        PricingPolicy.objects.create(enterprise=enterprise, name="P2", priority=2)
        resp = admin_client.get("/api/v1/catalog/pricing-policies/")
        assert resp.status_code == 200
        assert resp.data["count"] == 2

    def test_policy_scoped_to_enterprise(self, admin_client, enterprise, store):
        other_enterprise = Enterprise.objects.create(name="Other", code="OTHER-ENT")
        PricingPolicy.objects.create(enterprise=other_enterprise, name="Other P")
        PricingPolicy.objects.create(enterprise=enterprise, name="Own P")
        resp = admin_client.get("/api/v1/catalog/pricing-policies/")
        assert resp.data["count"] == 1
        assert resp.data["results"][0]["name"] == "Own P"


# ---------------------------------------------------------------------------
# Recurring Sales
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestRecurringSaleAPI:
    """Tests for /api/v1/recurring-sales/"""

    def test_create_recurring_sale(self, admin_client, enterprise, store, admin_user):
        Product.objects.create(
            enterprise=enterprise, name="Eau Minérale 5L", slug="eau-5l", sku="SKU-EAU",
            selling_price="500", cost_price="200", track_stock=False,
        )
        from datetime import date
        resp = admin_client.post("/api/v1/recurring-sales/", {
            "seller": str(admin_user.id),
            "name": "Livraison eau hebdo",
            "frequency": "WEEKLY",
            "next_due_date": date.today().isoformat(),
            "auto_submit": False,
        }, format="json")
        assert resp.status_code == 201
        assert resp.data["name"] == "Livraison eau hebdo"
        assert RecurringSale.objects.filter(store=store).exists()

    def test_list_recurring_sales(self, admin_client, enterprise, store, admin_user):
        from datetime import date
        RecurringSale.objects.create(
            store=store, seller=admin_user,
            name="Weekly", frequency=RecurringSale.Frequency.WEEKLY,
            next_due_date=date.today(),
        )
        resp = admin_client.get("/api/v1/recurring-sales/")
        assert resp.status_code == 200
        assert resp.data["count"] == 1


# ---------------------------------------------------------------------------
# CashShift Denominations
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestCashShiftDenominationAPI:
    """Tests for /api/v1/cash-shifts/{id}/denominations/"""

    def test_save_denomination(self, admin_client, store, admin_user):
        shift = CashShift.objects.create(
            store=store, cashier=admin_user, opening_float=Decimal("10000"),
        )
        resp = admin_client.post(f"/api/v1/cash-shifts/{shift.id}/denominations/", {
            "denomination": 10000,
            "count": 5,
        }, format="json")
        assert resp.status_code == 201, resp.data
        assert resp.data["amount"] == 50000

    def test_list_denominations(self, admin_client, store, admin_user):
        shift = CashShift.objects.create(
            store=store, cashier=admin_user, opening_float=Decimal("5000"),
        )
        CashShiftDenomination.objects.create(shift=shift, denomination=5000, count=3)
        CashShiftDenomination.objects.create(shift=shift, denomination=1000, count=10)
        resp = admin_client.get(f"/api/v1/cash-shifts/{shift.id}/denominations/")
        assert resp.status_code == 200, resp.data
        assert resp.data["count"] == 2

    def test_denomination_total_amount(self, enterprise, store, admin_user):
        shift = CashShift.objects.create(
            store=store, cashier=admin_user, opening_float=Decimal("0"),
        )
        d = CashShiftDenomination.objects.create(shift=shift, denomination=2000, count=7)
        assert d.amount == 14000

    def test_upsert_denomination(self, admin_client, store, admin_user):
        """POSTing same denomination twice should update, not create duplicate."""
        shift = CashShift.objects.create(
            store=store, cashier=admin_user, opening_float=Decimal("0"),
        )
        admin_client.post(f"/api/v1/cash-shifts/{shift.id}/denominations/", {
            "denomination": 500, "count": 2,
        }, format="json")
        admin_client.post(f"/api/v1/cash-shifts/{shift.id}/denominations/", {
            "denomination": 500, "count": 8,
        }, format="json")
        assert CashShiftDenomination.objects.filter(shift=shift, denomination=500).count() == 1
        d = CashShiftDenomination.objects.get(shift=shift, denomination=500)
        assert d.count == 8


# ---------------------------------------------------------------------------
# Store receipt fields
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestStoreReceiptFields:
    """Tests for store receipt customization fields."""

    def test_receipt_fields_defaults(self, store):
        store.refresh_from_db()
        assert store.receipt_promo_message == ""
        assert store.receipt_show_loyalty_points is False
        assert store.receipt_custom_footer == ""

    def test_receipt_fields_patch(self, admin_client, store):
        resp = admin_client.patch(f"/api/v1/stores/{store.id}/", {
            "receipt_promo_message": "Merci de votre visite !",
            "receipt_show_loyalty_points": True,
            "receipt_custom_footer": "Ligne 1\nLigne 2",
        }, format="json")
        assert resp.status_code == 200
        store.refresh_from_db()
        assert store.receipt_promo_message == "Merci de votre visite !"
        assert store.receipt_show_loyalty_points is True
