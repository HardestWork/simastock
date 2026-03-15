"""Tests for stock decrement, refund shift tracking, and credit exclusion fixes."""
from decimal import Decimal

import pytest
from django.utils import timezone

from cashier.models import CashShift
from catalog.models import Product
from customers.models import Customer
from sales.models import Sale, SaleItem, Refund
from stock.models import ProductStock


@pytest.fixture
def customer(enterprise):
    return Customer.objects.create(
        enterprise=enterprise,
        first_name="Client",
        last_name="Test",
        phone="0612345678",
    )


@pytest.fixture
def product(enterprise):
    return Product.objects.create(
        enterprise=enterprise,
        name="Produit Test",
        sku="PROD-001",
        selling_price=Decimal("10000"),
        cost_price=Decimal("5000"),
        track_stock=True,
    )


@pytest.fixture
def product_stock(store, product):
    return ProductStock.objects.create(
        store=store,
        product=product,
        quantity=50,
    )


@pytest.fixture
def draft_sale(store, admin_user, customer, product):
    sale = Sale.objects.create(
        store=store,
        seller=admin_user,
        customer=customer,
        status=Sale.Status.DRAFT,
    )
    SaleItem.objects.create(
        sale=sale,
        product=product,
        product_name=product.name,
        unit_price=product.selling_price,
        cost_price=product.cost_price,
        quantity=3,
    )
    sale.total = Decimal("30000")
    sale.amount_due = Decimal("30000")
    sale.save()
    return sale


@pytest.fixture
def open_shift(store, admin_user):
    return CashShift.objects.create(
        store=store,
        cashier=admin_user,
        status=CashShift.Status.OPEN,
        opening_float=Decimal("0"),
        opened_at=timezone.now(),
    )


# -----------------------------------------------------------------------
# Stock decrement at submission
# -----------------------------------------------------------------------

@pytest.mark.django_db
class TestStockDecrementAtPayment:
    """Stock must be decremented when payment is processed (full or partial)."""

    def test_stock_not_decremented_on_submit(self, draft_sale, product_stock, admin_user):
        from sales.services import submit_sale_to_cashier
        submit_sale_to_cashier(draft_sale, admin_user)

        product_stock.refresh_from_db()
        assert product_stock.quantity == 50  # unchanged at submission
        draft_sale.refresh_from_db()
        assert draft_sale.stock_decremented is False

    def test_stock_decremented_on_full_payment(self, draft_sale, product_stock, admin_user, open_shift):
        from sales.services import submit_sale_to_cashier
        from cashier.services import process_payment

        submit_sale_to_cashier(draft_sale, admin_user)
        draft_sale.refresh_from_db()

        process_payment(
            sale=draft_sale,
            payments_data=[{"method": "CASH", "amount": "30000"}],
            cashier=admin_user,
            shift=open_shift,
        )

        product_stock.refresh_from_db()
        assert product_stock.quantity == 47  # 50 - 3
        draft_sale.refresh_from_db()
        assert draft_sale.stock_decremented is True

    def test_stock_decremented_on_partial_payment(self, draft_sale, product_stock, admin_user, open_shift):
        from sales.services import submit_sale_to_cashier
        from cashier.services import process_payment

        submit_sale_to_cashier(draft_sale, admin_user)
        draft_sale.refresh_from_db()

        process_payment(
            sale=draft_sale,
            payments_data=[{"method": "CASH", "amount": "10000"}],
            cashier=admin_user,
            shift=open_shift,
        )

        product_stock.refresh_from_db()
        assert product_stock.quantity == 47  # 50 - 3 (decremented on first partial payment)
        draft_sale.refresh_from_db()
        assert draft_sale.stock_decremented is True
        assert draft_sale.status == "PARTIALLY_PAID"


# -----------------------------------------------------------------------
# Credit payments excluded from total_sales
# -----------------------------------------------------------------------

@pytest.mark.django_db
class TestCreditExcludedFromTotalSales:
    """Credit payments should NOT be counted in shift total_sales."""

    def test_credit_not_in_total_sales(self, draft_sale, product_stock, admin_user, open_shift, customer):
        from sales.services import submit_sale_to_cashier
        from cashier.services import process_payment

        submit_sale_to_cashier(draft_sale, admin_user)
        draft_sale.refresh_from_db()

        process_payment(
            sale=draft_sale,
            payments_data=[{"method": "CREDIT", "amount": "30000"}],
            cashier=admin_user,
            shift=open_shift,
        )

        open_shift.refresh_from_db()
        assert open_shift.total_credit_payments == Decimal("30000")
        # Credit should NOT be in total_sales
        assert open_shift.total_sales == Decimal("0")

    def test_cash_in_total_sales(self, draft_sale, product_stock, admin_user, open_shift):
        from sales.services import submit_sale_to_cashier
        from cashier.services import process_payment

        submit_sale_to_cashier(draft_sale, admin_user)
        draft_sale.refresh_from_db()

        process_payment(
            sale=draft_sale,
            payments_data=[{"method": "CASH", "amount": "30000"}],
            cashier=admin_user,
            shift=open_shift,
        )

        open_shift.refresh_from_db()
        assert open_shift.total_sales == Decimal("30000")
        assert open_shift.total_cash_payments == Decimal("30000")


# -----------------------------------------------------------------------
# Refund tracking in shift
# -----------------------------------------------------------------------

@pytest.mark.django_db
class TestRefundShiftTracking:
    """Refunds must update shift totals and track by method."""

    def _make_paid_sale(self, draft_sale, product_stock, admin_user, open_shift):
        from sales.services import submit_sale_to_cashier
        from cashier.services import process_payment

        submit_sale_to_cashier(draft_sale, admin_user)
        draft_sale.refresh_from_db()

        process_payment(
            sale=draft_sale,
            payments_data=[{"method": "CASH", "amount": "30000"}],
            cashier=admin_user,
            shift=open_shift,
        )
        draft_sale.refresh_from_db()
        return draft_sale

    def test_refund_cash_updates_shift(self, draft_sale, product_stock, admin_user, open_shift):
        sale = self._make_paid_sale(draft_sale, product_stock, admin_user, open_shift)
        from sales.services import create_refund

        create_refund(
            sale=sale,
            amount=Decimal("10000"),
            reason="Defaut produit",
            refund_method="CASH",
            approved_by=admin_user,
            processed_by=admin_user,
        )

        open_shift.refresh_from_db()
        assert open_shift.total_refunds == Decimal("10000")
        assert open_shift.total_cash_refunds == Decimal("10000")
        assert open_shift.total_mobile_refunds == Decimal("0")

    def test_refund_mobile_money_updates_shift(self, draft_sale, product_stock, admin_user, open_shift):
        sale = self._make_paid_sale(draft_sale, product_stock, admin_user, open_shift)
        from sales.services import create_refund

        create_refund(
            sale=sale,
            amount=Decimal("10000"),
            reason="Defaut produit",
            refund_method="MOBILE_MONEY",
            approved_by=admin_user,
            processed_by=admin_user,
        )

        open_shift.refresh_from_db()
        assert open_shift.total_refunds == Decimal("10000")
        assert open_shift.total_mobile_refunds == Decimal("10000")
        assert open_shift.total_cash_refunds == Decimal("0")

    def test_calculate_shift_totals_excludes_credit(self, draft_sale, product_stock, admin_user, open_shift):
        from sales.services import submit_sale_to_cashier
        from cashier.services import process_payment, calculate_shift_totals

        submit_sale_to_cashier(draft_sale, admin_user)
        draft_sale.refresh_from_db()

        process_payment(
            sale=draft_sale,
            payments_data=[{"method": "CREDIT", "amount": "30000"}],
            cashier=admin_user,
            shift=open_shift,
        )

        computed = calculate_shift_totals(open_shift)
        assert computed["total_credit"] == Decimal("30000")
        # total_sales should exclude credit
        assert computed["total_sales"] == Decimal("0")
        assert computed["net_sales"] == Decimal("0")
