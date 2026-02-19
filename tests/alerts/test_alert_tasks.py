from datetime import timedelta, date
from decimal import Decimal

import pytest
from django.utils import timezone

from alerts.models import Alert
from alerts.services import sync_low_stock_alerts_for_store
from alerts.tasks import check_pending_payments
from sales.models import Sale


@pytest.mark.django_db
def test_check_pending_payments_is_idempotent_per_day(store, sales_user):
    Sale.objects.create(
        store=store,
        seller=sales_user,
        status=Sale.Status.PENDING_PAYMENT,
        invoice_number="FAC-ALERT-0001",
        total=Decimal("15000.00"),
        amount_due=Decimal("15000.00"),
        submitted_at=timezone.now() - timedelta(hours=5),
    )

    check_pending_payments()
    check_pending_payments()

    assert Alert.objects.filter(
        store=store,
        alert_type=Alert.Type.PENDING_PAYMENT_TIMEOUT,
        created_at__date=date.today(),
    ).count() == 1


@pytest.mark.django_db
def test_sync_low_stock_alerts_for_store_is_idempotent(store, product, product_stock):
    product_stock.quantity = 2
    product_stock.reserved_qty = 0
    product_stock.min_qty = 3
    product_stock.save(update_fields=["quantity", "reserved_qty", "min_qty", "updated_at"])

    first_created = sync_low_stock_alerts_for_store(store)
    second_created = sync_low_stock_alerts_for_store(store)

    assert first_created == 1
    assert second_created == 0
    assert Alert.objects.filter(
        store=store,
        alert_type=Alert.Type.LOW_STOCK,
        payload__product_id=str(product.pk),
        created_at__date=date.today(),
    ).count() == 1
