from decimal import Decimal

import pytest

from cashier.models import CashShift
from cashier.services import open_shift, process_payment
from sales.services import add_item_to_sale, create_sale, recalculate_sale, submit_sale_to_cashier


@pytest.mark.django_db
def test_process_payment_uses_fresh_locked_shift_totals(
    store,
    sales_user,
    cashier_user,
    customer,
    product,
    product_stock,
):
    sale = create_sale(store=store, seller=sales_user, customer=customer)
    add_item_to_sale(sale=sale, product=product, qty=1, actor=sales_user)
    recalculate_sale(sale)
    submit_sale_to_cashier(sale=sale, actor=sales_user)

    shift = open_shift(store=store, cashier=cashier_user, opening_float=Decimal("10000.00"))

    # Simulate stale in-memory shift object vs updated DB row.
    CashShift.objects.filter(pk=shift.pk).update(
        total_sales=Decimal("20000.00"),
        total_cash_payments=Decimal("20000.00"),
        expected_cash=Decimal("30000.00"),
    )

    process_payment(
        sale=sale,
        payments_data=[{"method": "CASH", "amount": str(sale.amount_due), "reference": ""}],
        cashier=cashier_user,
        shift=shift,
    )

    shift.refresh_from_db()
    assert shift.total_sales == Decimal("70000.00")
    assert shift.total_cash_payments == Decimal("70000.00")
    assert shift.expected_cash == Decimal("80000.00")
