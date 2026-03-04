from decimal import Decimal

import pytest

from cashier.services import open_shift, process_payment
from sales.services import add_item_to_sale, create_sale, recalculate_sale, submit_sale_to_cashier
from stock.models import ProductStock, StockLot
from stock.services import adjust_stock


@pytest.mark.django_db
def test_full_payment_assigns_fifo_cost_to_sale_item(
    store,
    sales_user,
    cashier_user,
    customer,
    product,
    product_stock,
):
    product_stock.quantity = 0
    product_stock.reserved_qty = 0
    product_stock.save(update_fields=["quantity", "reserved_qty", "updated_at"])

    adjust_stock(
        store=store,
        product=product,
        qty_delta=3,
        movement_type="IN",
        reason="Lot 1",
        actor=sales_user,
        reference="FIFO-LOT-1",
        unit_cost=Decimal("100.00"),
    )
    adjust_stock(
        store=store,
        product=product,
        qty_delta=3,
        movement_type="IN",
        reason="Lot 2",
        actor=sales_user,
        reference="FIFO-LOT-2",
        unit_cost=Decimal("200.00"),
    )

    sale = create_sale(store=store, seller=sales_user, customer=customer)
    item = add_item_to_sale(sale=sale, product=product, qty=4, actor=sales_user)
    recalculate_sale(sale)
    submit_sale_to_cashier(sale=sale, actor=sales_user)

    shift = open_shift(store=store, cashier=cashier_user, opening_float=Decimal("50000"))
    process_payment(
        sale=sale,
        payments_data=[{"method": "CASH", "amount": float(sale.total), "reference": ""}],
        cashier=cashier_user,
        shift=shift,
    )

    item.refresh_from_db()
    assert item.cost_price == Decimal("125.00")

    lots = list(
        StockLot.objects.filter(store=store, product=product).order_by("received_at", "created_at")
    )
    assert len(lots) == 2
    assert lots[0].quantity_remaining == 0
    assert lots[1].quantity_remaining == 2

    stock = ProductStock.objects.get(store=store, product=product)
    assert stock.quantity == 2
