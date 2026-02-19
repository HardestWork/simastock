from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from sales.models import Sale


@pytest.mark.django_db
def test_pending_sales_visible_and_sorted_newest_first_without_shift(
    client,
    admin_user,
    store_user_admin,
):
    client.force_login(admin_user)
    store = store_user_admin.store

    old_sale = Sale.objects.create(
        store=store,
        seller=admin_user,
        invoice_number="FAC-OLD",
        status=Sale.Status.PENDING_PAYMENT,
        total=Decimal("10000.00"),
        amount_due=Decimal("10000.00"),
        submitted_at=timezone.now() - timedelta(hours=2),
    )
    new_sale = Sale.objects.create(
        store=store,
        seller=admin_user,
        invoice_number="FAC-NEW",
        status=Sale.Status.PENDING_PAYMENT,
        total=Decimal("15000.00"),
        amount_due=Decimal("15000.00"),
        submitted_at=timezone.now() - timedelta(minutes=5),
    )
    Sale.objects.create(
        store=store,
        seller=admin_user,
        invoice_number="FAC-PAID",
        status=Sale.Status.PAID,
        total=Decimal("9000.00"),
        amount_due=Decimal("0.00"),
    )

    response = client.get("/cashier/pending-sales/")

    assert response.status_code == 200
    sales = list(response.context["sales"])
    assert [s.pk for s in sales[:2]] == [new_sale.pk, old_sale.pk]
    assert "FAC-NEW" in response.content.decode("utf-8")
    assert "FAC-OLD" in response.content.decode("utf-8")
    assert "FAC-PAID" not in response.content.decode("utf-8")


@pytest.mark.django_db
def test_pending_sales_supports_search_query(
    client,
    admin_user,
    store_user_admin,
):
    client.force_login(admin_user)
    store = store_user_admin.store

    sale_match = Sale.objects.create(
        store=store,
        seller=admin_user,
        invoice_number="FAC-Q-001",
        status=Sale.Status.PENDING_PAYMENT,
        total=Decimal("12000.00"),
        amount_due=Decimal("12000.00"),
    )
    Sale.objects.create(
        store=store,
        seller=admin_user,
        invoice_number="FAC-Q-002",
        status=Sale.Status.PENDING_PAYMENT,
        total=Decimal("15000.00"),
        amount_due=Decimal("15000.00"),
    )

    response = client.get("/cashier/pending-sales/?q=001")

    assert response.status_code == 200
    sales = list(response.context["sales"])
    assert len(sales) == 1
    assert sales[0].pk == sale_match.pk
