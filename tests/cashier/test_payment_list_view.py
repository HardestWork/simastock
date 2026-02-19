import pytest
from decimal import Decimal

from cashier.models import CashShift, Payment
from sales.models import Sale


@pytest.mark.django_db
def test_payment_list_page_renders_for_admin(client, admin_user, store_user_admin):
    client.force_login(admin_user)

    response = client.get("/cashier/payment-list/")

    assert response.status_code == 200
    used_templates = [template.name for template in response.templates if template.name]
    assert "cashier/payment_list.html" in used_templates


@pytest.mark.django_db
def test_payment_list_shows_totals_and_reprint_links(
    client,
    store,
    admin_user,
    cashier_user,
    store_user_admin,
    store_user_cashier,
):
    shift = CashShift.objects.create(
        store=store,
        cashier=cashier_user,
        opening_float=Decimal("10000.00"),
    )
    sale = Sale.objects.create(
        store=store,
        seller=admin_user,
        invoice_number="FAC-100",
        status=Sale.Status.PAID,
        total=Decimal("5000.00"),
        amount_paid=Decimal("5000.00"),
        amount_due=Decimal("0.00"),
    )
    Payment.objects.create(
        sale=sale,
        store=store,
        cashier=cashier_user,
        shift=shift,
        method=Payment.Method.CASH,
        amount=Decimal("5000.00"),
    )

    client.force_login(admin_user)
    response = client.get("/cashier/payment-list/")

    assert response.status_code == 200
    assert response.context["total_amount"] == Decimal("5000.00")
    assert response.context["payments_count"] == 1
    assert response.context["average_amount"] == Decimal("5000.00")
    assert any(
        row["code"] == Payment.Method.CASH and row["total"] == Decimal("5000.00")
        for row in response.context["totals_by_method"]
    )

    html = response.content.decode("utf-8")
    assert f"/pos/{sale.pk}/receipt/" in html
    assert f"/pos/{sale.pk}/invoice/" in html


@pytest.mark.django_db
def test_payment_list_filters_with_search_query(
    client,
    store,
    admin_user,
    cashier_user,
    store_user_admin,
    store_user_cashier,
):
    shift = CashShift.objects.create(
        store=store,
        cashier=cashier_user,
        opening_float=Decimal("10000.00"),
    )
    sale_match = Sale.objects.create(
        store=store,
        seller=admin_user,
        invoice_number="FAC-SEARCH-OK",
        status=Sale.Status.PAID,
        total=Decimal("7000.00"),
        amount_paid=Decimal("7000.00"),
        amount_due=Decimal("0.00"),
    )
    sale_other = Sale.objects.create(
        store=store,
        seller=admin_user,
        invoice_number="FAC-SEARCH-KO",
        status=Sale.Status.PAID,
        total=Decimal("5000.00"),
        amount_paid=Decimal("5000.00"),
        amount_due=Decimal("0.00"),
    )
    Payment.objects.create(
        sale=sale_match,
        store=store,
        cashier=cashier_user,
        shift=shift,
        method=Payment.Method.CASH,
        amount=Decimal("7000.00"),
        reference="TX-ALPHA",
    )
    Payment.objects.create(
        sale=sale_other,
        store=store,
        cashier=cashier_user,
        shift=shift,
        method=Payment.Method.CASH,
        amount=Decimal("5000.00"),
        reference="TX-BETA",
    )

    client.force_login(admin_user)
    response = client.get("/cashier/payment-list/?q=ALPHA")

    assert response.status_code == 200
    payments = list(response.context["payments"])
    assert len(payments) == 1
    assert payments[0].reference == "TX-ALPHA"
