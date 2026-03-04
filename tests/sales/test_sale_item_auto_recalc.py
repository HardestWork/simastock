from decimal import Decimal

import pytest

from sales.services import add_item_to_sale, create_sale


@pytest.mark.django_db
def test_sale_totals_auto_recalculate_on_direct_item_quantity_and_price_edit(
    store,
    sales_user,
    customer,
    product,
    product_stock,
):
    sale = create_sale(store=store, seller=sales_user, customer=customer)
    item = add_item_to_sale(sale=sale, product=product, qty=1, actor=sales_user)

    sale.refresh_from_db()
    assert sale.total == Decimal("50000.00")

    item.quantity = 2
    item.save(update_fields=["quantity"])
    sale.refresh_from_db()
    assert sale.subtotal == Decimal("100000.00")
    assert sale.total == Decimal("100000.00")
    assert sale.amount_due == Decimal("100000.00")

    item.unit_price = Decimal("60000.00")
    item.save(update_fields=["unit_price"])
    sale.refresh_from_db()
    assert sale.subtotal == Decimal("120000.00")
    assert sale.total == Decimal("120000.00")
    assert sale.amount_due == Decimal("120000.00")


@pytest.mark.django_db
def test_sale_totals_auto_recalculate_on_direct_item_delete(
    store,
    sales_user,
    customer,
    product,
    product_stock,
):
    sale = create_sale(store=store, seller=sales_user, customer=customer)
    item = add_item_to_sale(sale=sale, product=product, qty=2, actor=sales_user)

    sale.refresh_from_db()
    assert sale.total == Decimal("100000.00")

    item.delete()
    sale.refresh_from_db()
    assert sale.subtotal == Decimal("0.00")
    assert sale.discount_amount == Decimal("0.00")
    assert sale.tax_amount == Decimal("0.00")
    assert sale.total == Decimal("0.00")
    assert sale.amount_due == Decimal("0.00")
