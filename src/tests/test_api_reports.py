"""Tests for reports API filters and PDF export."""
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.http import HttpResponse

from cashier.models import CashShift, Payment
from catalog.models import Product
from customers.models import Customer
from sales.models import Sale, SaleItem
from stores.models import StoreUser

User = get_user_model()


@pytest.mark.django_db
def test_sales_report_applies_customer_cashier_product_filters(
    admin_client,
    store,
    enterprise,
):
    product_a = Product.objects.create(
        enterprise=enterprise,
        name="Produit A",
        sku="PROD-A",
        selling_price=Decimal("10000.00"),
        cost_price=Decimal("7000.00"),
    )
    cashier_a = User.objects.create_user(
        email="cashier.a@test.com",
        password="TestPass123!",
        first_name="Cashier",
        last_name="A",
        role="CASHIER",
    )
    cashier_b = User.objects.create_user(
        email="cashier.b@test.com",
        password="TestPass123!",
        first_name="Cashier",
        last_name="B",
        role="CASHIER",
    )
    StoreUser.objects.create(store=store, user=cashier_a, is_default=False)
    StoreUser.objects.create(store=store, user=cashier_b, is_default=False)

    customer_a = Customer.objects.create(
        enterprise=enterprise,
        first_name="Client",
        last_name="A",
        phone="+237600000001",
    )
    customer_b = Customer.objects.create(
        enterprise=enterprise,
        first_name="Client",
        last_name="B",
        phone="+237600000002",
    )

    product_b = Product.objects.create(
        enterprise=enterprise,
        name="Produit B",
        sku="PROD-B",
        selling_price=Decimal("5000.00"),
        cost_price=Decimal("2000.00"),
    )

    sale_a = Sale.objects.create(
        store=store,
        seller=cashier_a,
        customer=customer_a,
        status=Sale.Status.PAID,
        invoice_number="FAC-REP-001",
        subtotal=Decimal("10000.00"),
        total=Decimal("10000.00"),
        amount_paid=Decimal("10000.00"),
        amount_due=Decimal("0.00"),
    )
    sale_b = Sale.objects.create(
        store=store,
        seller=cashier_b,
        customer=customer_b,
        status=Sale.Status.PAID,
        invoice_number="FAC-REP-002",
        subtotal=Decimal("5000.00"),
        total=Decimal("5000.00"),
        amount_paid=Decimal("5000.00"),
        amount_due=Decimal("0.00"),
    )

    SaleItem.objects.create(
        sale=sale_a,
        product=product_a,
        product_name=product_a.name,
        unit_price=Decimal("10000.00"),
        cost_price=Decimal("7000.00"),
        quantity=1,
    )
    SaleItem.objects.create(
        sale=sale_b,
        product=product_b,
        product_name=product_b.name,
        unit_price=Decimal("5000.00"),
        cost_price=Decimal("2000.00"),
        quantity=1,
    )

    shift_a = CashShift.objects.create(
        store=store,
        cashier=cashier_a,
        status=CashShift.Status.CLOSED,
        opening_float=Decimal("0.00"),
        expected_cash=Decimal("10000.00"),
        closing_cash=Decimal("10000.00"),
        variance=Decimal("0.00"),
        total_sales=Decimal("10000.00"),
        total_cash_payments=Decimal("10000.00"),
    )
    shift_b = CashShift.objects.create(
        store=store,
        cashier=cashier_b,
        status=CashShift.Status.CLOSED,
        opening_float=Decimal("0.00"),
        expected_cash=Decimal("5000.00"),
        closing_cash=Decimal("5000.00"),
        variance=Decimal("0.00"),
        total_sales=Decimal("5000.00"),
        total_cash_payments=Decimal("5000.00"),
    )

    Payment.objects.create(
        sale=sale_a,
        store=store,
        cashier=cashier_a,
        shift=shift_a,
        method=Payment.Method.CASH,
        amount=Decimal("10000.00"),
    )
    Payment.objects.create(
        sale=sale_b,
        store=store,
        cashier=cashier_b,
        shift=shift_b,
        method=Payment.Method.CASH,
        amount=Decimal("5000.00"),
    )

    response = admin_client.get(
        "/api/v1/reports/sales/",
        {
            "store": str(store.id),
            "customer": str(customer_a.id),
            "cashier": str(cashier_a.id),
            "product": str(product_a.id),
        },
    )

    assert response.status_code == 200, response.data
    assert response.data["summary"]["total_orders"] == 1
    assert Decimal(response.data["summary"]["total_revenue"]) == Decimal("10000.00")
    assert len(response.data["by_seller"]) == 1
    assert response.data["by_seller"][0]["seller"].endswith("A")


@pytest.mark.django_db
def test_cashier_operations_pdf_export_returns_pdf(
    admin_client,
    store,
    admin_user,
    enterprise,
    monkeypatch,
):
    customer = Customer.objects.create(
        enterprise=enterprise,
        first_name="Pdf",
        last_name="Client",
        phone="+237611111111",
    )
    sale = Sale.objects.create(
        store=store,
        seller=admin_user,
        customer=customer,
        status=Sale.Status.PAID,
        invoice_number="FAC-PDF-001",
        subtotal=Decimal("9000.00"),
        total=Decimal("9000.00"),
        amount_paid=Decimal("9000.00"),
        amount_due=Decimal("0.00"),
    )
    shift = CashShift.objects.create(
        store=store,
        cashier=admin_user,
        status=CashShift.Status.CLOSED,
        opening_float=Decimal("0.00"),
        expected_cash=Decimal("9000.00"),
        closing_cash=Decimal("9000.00"),
        variance=Decimal("0.00"),
        total_sales=Decimal("9000.00"),
        total_cash_payments=Decimal("9000.00"),
    )
    Payment.objects.create(
        sale=sale,
        store=store,
        cashier=admin_user,
        shift=shift,
        method=Payment.Method.CASH,
        amount=Decimal("9000.00"),
    )

    def _fake_pdf_export(**kwargs):
        response = HttpResponse(b"%PDF-1.4\n%fake\n", content_type="application/pdf")
        response["Content-Disposition"] = 'inline; filename="fake.pdf"'
        return response

    monkeypatch.setattr(
        "api.v1.views.generate_cashier_operations_report_pdf",
        _fake_pdf_export,
    )

    response = admin_client.get(
        "/api/v1/reports/cashier-operations/pdf/",
        {"store": str(store.id)},
    )

    assert response.status_code == 200
    assert response["Content-Type"].startswith("application/pdf")
    assert response.content[:4] == b"%PDF"
