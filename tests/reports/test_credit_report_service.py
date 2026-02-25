from decimal import Decimal

import pytest

from cashier.services import open_shift, process_payment
from reports.services import get_credit_report
from sales.services import (
    add_item_to_sale,
    create_sale,
    recalculate_sale,
    submit_sale_to_cashier,
)


@pytest.mark.django_db
def test_credit_report_uses_account_balance_for_outstanding(
    store,
    sales_user,
    cashier_user,
    customer,
    customer_account,
    product,
    product_stock,
):
    sale = create_sale(store=store, seller=sales_user, customer=customer)
    add_item_to_sale(sale=sale, product=product, qty=2, actor=sales_user)
    recalculate_sale(sale)
    submit_sale_to_cashier(sale=sale, actor=sales_user)

    shift = open_shift(store=store, cashier=cashier_user, opening_float=Decimal("50000"))
    process_payment(
        sale=sale,
        payments_data=[{"method": "CREDIT", "amount": float(sale.total), "reference": ""}],
        cashier=cashier_user,
        shift=shift,
    )

    report = get_credit_report(store)

    assert report["total_outstanding"] == sale.total
    assert len(report["by_customer"]) == 1
    assert report["by_customer"][0]["outstanding"] == sale.total
    assert report["by_customer"][0]["nb_sales"] == 1
