import pytest
from decimal import Decimal
from django.utils import timezone
from sales.models import Sale, SaleItem
from sales.services import (
    add_item_to_sale,
    create_refund,
    create_sale,
    recalculate_sale,
    submit_sale_to_cashier,
)
from cashier.services import open_shift, process_payment, close_shift
from stock.models import ProductStock


@pytest.mark.django_db
class TestSaleFlow:
    def test_create_draft_sale(self, store, sales_user, customer):
        sale = create_sale(store=store, seller=sales_user, customer=customer)
        assert sale.status == 'DRAFT'
        assert sale.store == store
        assert sale.seller == sales_user

    def test_add_item_to_sale(self, store, sales_user, customer, product, product_stock):
        sale = create_sale(store=store, seller=sales_user, customer=customer)
        item = add_item_to_sale(sale=sale, product=product, qty=2, actor=sales_user)
        assert item.quantity == 2
        assert item.unit_price == product.selling_price
        assert item.line_total == product.selling_price * 2
        sale.refresh_from_db()
        assert sale.subtotal == product.selling_price * 2

    def test_submit_sale_to_cashier(self, store, sales_user, customer, product, product_stock):
        sale = create_sale(store=store, seller=sales_user, customer=customer)
        add_item_to_sale(sale=sale, product=product, qty=1, actor=sales_user)
        recalculate_sale(sale)
        submitted = submit_sale_to_cashier(sale=sale, actor=sales_user)
        assert submitted.status == 'PENDING_PAYMENT'
        assert submitted.invoice_number  # should have generated invoice number
        assert submitted.submitted_at is not None

    def test_full_payment_flow(self, store, sales_user, cashier_user, customer, product, product_stock):
        # Create and submit sale
        sale = create_sale(store=store, seller=sales_user, customer=customer)
        add_item_to_sale(sale=sale, product=product, qty=2, actor=sales_user)
        recalculate_sale(sale)
        submit_sale_to_cashier(sale=sale, actor=sales_user)

        # Open shift and process payment
        shift = open_shift(store=store, cashier=cashier_user, opening_float=Decimal('50000'))
        payments = process_payment(
            sale=sale,
            payments_data=[{'method': 'CASH', 'amount': float(sale.total), 'reference': ''}],
            cashier=cashier_user,
            shift=shift
        )

        sale.refresh_from_db()
        assert sale.status == 'PAID'
        assert sale.amount_paid == sale.total
        assert sale.amount_due == 0
        assert sale.paid_at is not None
        assert len(payments) == 1

        # Stock should be decremented
        ps = ProductStock.objects.get(store=store, product=product)
        assert ps.quantity == 98  # was 100, sold 2

    def test_partial_payment(self, store, sales_user, cashier_user, customer, product, product_stock):
        sale = create_sale(store=store, seller=sales_user, customer=customer)
        add_item_to_sale(sale=sale, product=product, qty=2, actor=sales_user)
        recalculate_sale(sale)
        submit_sale_to_cashier(sale=sale, actor=sales_user)

        shift = open_shift(store=store, cashier=cashier_user, opening_float=Decimal('50000'))
        partial_amount = float(sale.total / 2)
        process_payment(
            sale=sale,
            payments_data=[{'method': 'CASH', 'amount': partial_amount, 'reference': ''}],
            cashier=cashier_user,
            shift=shift
        )

        sale.refresh_from_db()
        assert sale.status == 'PARTIALLY_PAID'
        assert sale.amount_due > 0

    def test_reserved_stock_syncs_across_multiple_partial_sales(
        self,
        store,
        sales_user,
        cashier_user,
        customer,
        product,
        product_stock,
    ):
        sale_a = create_sale(store=store, seller=sales_user, customer=customer)
        add_item_to_sale(sale=sale_a, product=product, qty=2, actor=sales_user)
        recalculate_sale(sale_a)
        sale_a.reserve_stock = True
        sale_a.save(update_fields=["reserve_stock", "updated_at"])
        submit_sale_to_cashier(sale=sale_a, actor=sales_user)

        sale_b = create_sale(store=store, seller=sales_user, customer=customer)
        add_item_to_sale(sale=sale_b, product=product, qty=3, actor=sales_user)
        recalculate_sale(sale_b)
        sale_b.reserve_stock = True
        sale_b.save(update_fields=["reserve_stock", "updated_at"])
        submit_sale_to_cashier(sale=sale_b, actor=sales_user)

        shift = open_shift(store=store, cashier=cashier_user, opening_float=Decimal("50000"))

        process_payment(
            sale=sale_a,
            payments_data=[{"method": "CASH", "amount": float(sale_a.total / 2), "reference": ""}],
            cashier=cashier_user,
            shift=shift,
        )
        stock = ProductStock.objects.get(store=store, product=product)
        assert stock.reserved_qty == 2
        assert stock.quantity == 100

        process_payment(
            sale=sale_b,
            payments_data=[{"method": "CASH", "amount": float(sale_b.total / 2), "reference": ""}],
            cashier=cashier_user,
            shift=shift,
        )
        stock.refresh_from_db()
        assert stock.reserved_qty == 5

        sale_a.refresh_from_db()
        process_payment(
            sale=sale_a,
            payments_data=[{"method": "CASH", "amount": float(sale_a.amount_due), "reference": ""}],
            cashier=cashier_user,
            shift=shift,
        )
        stock.refresh_from_db()
        assert stock.reserved_qty == 3
        assert stock.quantity == 98

    def test_credit_payment_requires_customer(self, store, sales_user, cashier_user):
        sale = create_sale(store=store, seller=sales_user, customer=None)
        sale.status = Sale.Status.PENDING_PAYMENT
        sale.total = Decimal("1000.00")
        sale.amount_due = Decimal("1000.00")
        sale.save(update_fields=["status", "total", "amount_due", "updated_at"])

        shift = open_shift(store=store, cashier=cashier_user, opening_float=Decimal("50000"))
        with pytest.raises(ValueError, match="client est obligatoire"):
            process_payment(
                sale=sale,
                payments_data=[{"method": "CREDIT", "amount": 1000, "reference": ""}],
                cashier=cashier_user,
                shift=shift,
            )

    def test_credit_payment_marks_sale_as_credit_sale(
        self,
        store,
        sales_user,
        cashier_user,
        customer,
        customer_account,
        product,
        product_stock,
    ):
        sale = create_sale(store=store, seller=sales_user, customer=customer)
        add_item_to_sale(sale=sale, product=product, qty=1, actor=sales_user)
        recalculate_sale(sale)
        submit_sale_to_cashier(sale=sale, actor=sales_user)

        shift = open_shift(store=store, cashier=cashier_user, opening_float=Decimal("50000"))
        process_payment(
            sale=sale,
            payments_data=[{"method": "CREDIT", "amount": float(sale.total), "reference": ""}],
            cashier=cashier_user,
            shift=shift,
        )

        sale.refresh_from_db()
        assert sale.is_credit_sale is True

    def test_full_refund_restocks_inventory(self, store, sales_user, cashier_user, customer, product, product_stock):
        sale = create_sale(store=store, seller=sales_user, customer=customer)
        add_item_to_sale(sale=sale, product=product, qty=2, actor=sales_user)
        recalculate_sale(sale)
        submit_sale_to_cashier(sale=sale, actor=sales_user)

        shift = open_shift(store=store, cashier=cashier_user, opening_float=Decimal("50000"))
        process_payment(
            sale=sale,
            payments_data=[{"method": "CASH", "amount": float(sale.total), "reference": ""}],
            cashier=cashier_user,
            shift=shift,
        )

        stock_after_sale = ProductStock.objects.get(store=store, product=product)
        assert stock_after_sale.quantity == 98

        refund = create_refund(
            sale=sale,
            amount=sale.total,
            reason="Retour complet",
            refund_method="CASH",
            approved_by=sales_user,
            processed_by=sales_user,
        )
        assert refund.amount == sale.total

        sale.refresh_from_db()
        assert sale.status == Sale.Status.REFUNDED
        assert sale.amount_paid == Decimal("0.00")

        stock_after_refund = ProductStock.objects.get(store=store, product=product)
        assert stock_after_refund.quantity == 100
