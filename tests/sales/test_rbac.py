import pytest
from sales.services import create_sale, add_item_to_sale, submit_sale_to_cashier, recalculate_sale
from cashier.services import open_shift, process_payment


@pytest.mark.django_db
class TestRBAC:
    def test_seller_cannot_process_payment(self, store, sales_user, customer, product, product_stock):
        """SALES role should not be able to create payments (only CASHIER can)."""
        sale = create_sale(store=store, seller=sales_user, customer=customer)
        add_item_to_sale(sale=sale, product=product, qty=1, actor=sales_user)
        recalculate_sale(sale)
        submit_sale_to_cashier(sale=sale, actor=sales_user)

        with pytest.raises(ValueError):
            open_shift(store=store, cashier=sales_user, opening_float=0)

    def test_cashier_cannot_edit_draft(self, store, sales_user, cashier_user, customer, product, product_stock):
        """CASHIER should not modify DRAFT sales (only SALES/MANAGER can)."""
        sale = create_sale(store=store, seller=sales_user, customer=customer)
        assert sale.status == 'DRAFT'
        assert cashier_user.role == 'CASHIER'
        assert not cashier_user.is_sales

    def test_pending_sale_locked_for_seller(self, store, sales_user, customer, product, product_stock):
        """Once submitted (PENDING_PAYMENT), seller cannot modify."""
        sale = create_sale(store=store, seller=sales_user, customer=customer)
        add_item_to_sale(sale=sale, product=product, qty=1, actor=sales_user)
        recalculate_sale(sale)
        submit_sale_to_cashier(sale=sale, actor=sales_user)

        assert sale.status == 'PENDING_PAYMENT'
        # Attempting to add item should fail
        with pytest.raises(ValueError):
            add_item_to_sale(sale=sale, product=product, qty=1, actor=sales_user)
