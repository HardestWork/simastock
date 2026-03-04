from decimal import Decimal

import pytest

from customers.models import Customer
from credits.services import record_credit_sale
from sales.models import Sale
from stores.models import StoreUser


@pytest.mark.django_db
def test_credit_payment_can_be_attached_to_invoice(
    client,
    manager_user,
    store,
    sales_user,
    customer_account,
):
    StoreUser.objects.create(store=store, user=manager_user, is_default=True)

    sale = Sale.objects.create(
        store=store,
        seller=sales_user,
        customer=customer_account.customer,
        status=Sale.Status.PAID,
        total=Decimal("25000.00"),
        amount_paid=Decimal("25000.00"),
        amount_due=Decimal("0.00"),
        is_credit_sale=True,
        invoice_number="FAC-BT-2026-000123",
    )
    record_credit_sale(
        account=customer_account,
        sale=sale,
        amount=Decimal("25000.00"),
        actor=sales_user,
    )

    client.force_login(manager_user)
    response = client.post(
        f"/api/v1/credit-accounts/{customer_account.pk}/pay/",
        {
            "amount": "5000.00",
            "sale_id": str(sale.pk),
        },
    )

    assert response.status_code == 200, response.json()
    payload = response.json()
    assert payload["payment_entry"]["sale"] == str(sale.pk)
    assert payload["payment_entry"]["sale_invoice_number"] == "FAC-BT-2026-000123"


@pytest.mark.django_db
def test_credit_payment_rejects_invoice_from_other_customer(
    client,
    manager_user,
    store,
    sales_user,
    customer_account,
):
    StoreUser.objects.create(store=store, user=manager_user, is_default=True)

    other_customer = Customer.objects.create(
        enterprise=store.enterprise,
        first_name="Autre",
        last_name="Client",
        phone="+237688888888",
        email="autre.client@test.com",
    )
    foreign_sale = Sale.objects.create(
        store=store,
        seller=sales_user,
        customer=other_customer,
        status=Sale.Status.PAID,
        total=Decimal("10000.00"),
        amount_paid=Decimal("10000.00"),
        amount_due=Decimal("0.00"),
        is_credit_sale=True,
        invoice_number="FAC-BT-2026-000124",
    )

    client.force_login(manager_user)
    response = client.post(
        f"/api/v1/credit-accounts/{customer_account.pk}/pay/",
        {
            "amount": "1000.00",
            "sale_id": str(foreign_sale.pk),
        },
    )

    assert response.status_code == 400
    assert "sale_id" in response.json()
