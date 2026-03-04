from datetime import date
from decimal import Decimal

import pytest
from django.utils import timezone

from cashier.services import open_shift, process_payment
from objectives.engine import ObjectiveCalculationEngine
from objectives.models import ObjectiveRule, ObjectiveTier, SellerMonthlyStats
from sales.services import add_item_to_sale, create_refund, create_sale, recalculate_sale, submit_sale_to_cashier


@pytest.mark.django_db
def test_refund_updates_seller_objective_stats_immediately(
    store,
    sales_user,
    cashier_user,
    customer,
    product,
    product_stock,
):
    today = timezone.localdate()
    period = f"{today.year}-{today.month:02d}"

    rule = ObjectiveRule.objects.create(
        store=store,
        name="Regle test remboursements",
        is_active=True,
        valid_from=date(today.year, 1, 1),
        valid_until=None,
        version=1,
    )
    ObjectiveTier.objects.create(
        rule=rule,
        name="Bronze",
        rank=1,
        threshold=Decimal("0.00"),
        bonus_amount=Decimal("0.00"),
        bonus_rate=Decimal("0.00"),
        color="#6B7280",
        icon="",
    )

    sale = create_sale(store=store, seller=sales_user, customer=customer)
    add_item_to_sale(sale=sale, product=product, qty=2, actor=sales_user)
    recalculate_sale(sale)
    submit_sale_to_cashier(sale=sale, actor=sales_user)

    shift = open_shift(store=store, cashier=cashier_user, opening_float=Decimal("50000.00"))
    process_payment(
        sale=sale,
        payments_data=[{"method": "CASH", "amount": float(sale.total), "reference": ""}],
        cashier=cashier_user,
        shift=shift,
    )

    engine = ObjectiveCalculationEngine(store_id=str(store.id))
    baseline = engine.compute_for_seller(
        seller_id=str(sales_user.id),
        period=period,
        trigger="MANUAL",
    )
    assert baseline is not None
    assert baseline.refund_amount == Decimal("0.00")
    assert baseline.net_amount == Decimal("100000.00")

    create_refund(
        sale=sale,
        amount=Decimal("30000.00"),
        reason="Retour partiel",
        refund_method="CASH",
        approved_by=sales_user,
        processed_by=sales_user,
    )

    stats = SellerMonthlyStats.objects.get(
        store=store,
        seller=sales_user,
        period=period,
    )
    assert stats.gross_amount == Decimal("100000.00")
    assert stats.refund_amount == Decimal("30000.00")
    assert stats.net_amount == Decimal("70000.00")
