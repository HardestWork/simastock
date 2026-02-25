"""Tests for sales API workflow filters."""
from decimal import Decimal

import pytest

from sales.models import Sale


@pytest.mark.django_db
def test_sales_list_supports_multi_status_filter(admin_client, store, admin_user):
    pending_sale = Sale.objects.create(
        store=store,
        seller=admin_user,
        invoice_number="FAC-WF-001",
        status=Sale.Status.PENDING_PAYMENT,
        total=Decimal("10000.00"),
        amount_due=Decimal("10000.00"),
    )
    partial_sale = Sale.objects.create(
        store=store,
        seller=admin_user,
        invoice_number="FAC-WF-002",
        status=Sale.Status.PARTIALLY_PAID,
        total=Decimal("12000.00"),
        amount_paid=Decimal("4000.00"),
        amount_due=Decimal("8000.00"),
    )
    Sale.objects.create(
        store=store,
        seller=admin_user,
        invoice_number="FAC-WF-003",
        status=Sale.Status.PAID,
        total=Decimal("9000.00"),
        amount_paid=Decimal("9000.00"),
        amount_due=Decimal("0.00"),
    )

    response = admin_client.get(
        "/api/v1/sales/",
        {
            "store": str(store.pk),
            "status_in": "PENDING_PAYMENT,PARTIALLY_PAID",
        },
    )

    assert response.status_code == 200
    assert "submitted_at" in response.data["results"][0]
    invoices = {row["invoice_number"] for row in response.data["results"]}
    assert pending_sale.invoice_number in invoices
    assert partial_sale.invoice_number in invoices
    assert "FAC-WF-003" not in invoices


@pytest.mark.django_db
def test_sales_list_multi_status_ignores_invalid_values(admin_client, store, admin_user):
    Sale.objects.create(
        store=store,
        seller=admin_user,
        invoice_number="FAC-WF-010",
        status=Sale.Status.PENDING_PAYMENT,
        total=Decimal("15000.00"),
        amount_due=Decimal("15000.00"),
    )

    response = admin_client.get(
        "/api/v1/sales/",
        {
            "store": str(store.pk),
            "status_in": "NOT_A_STATUS",
        },
    )

    assert response.status_code == 200
    assert response.data["count"] == 0
    assert response.data["results"] == []
