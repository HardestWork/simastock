from decimal import Decimal

import pytest

from sales.models import Refund, Sale


@pytest.mark.django_db
def test_sale_cancel_page_renders_and_cancels(client, admin_user, store, store_user_admin):
    client.force_login(admin_user)

    sale = Sale.objects.create(
        store=store,
        seller=admin_user,
        status=Sale.Status.DRAFT,
        total=Decimal("10000.00"),
        amount_due=Decimal("10000.00"),
    )

    response = client.get(f"/pos/{sale.pk}/cancel/")
    assert response.status_code == 200
    used_templates = [template.name for template in response.templates if template.name]
    assert "sales/sale_cancel.html" in used_templates

    post_response = client.post(
        f"/pos/{sale.pk}/cancel/",
        {"reason": "Erreur de saisie"},
    )
    assert post_response.status_code == 302

    sale.refresh_from_db()
    assert sale.status == Sale.Status.CANCELLED
    assert sale.cancellation_reason == "Erreur de saisie"


@pytest.mark.django_db
def test_refund_create_page_renders_and_submits(client, admin_user, store, store_user_admin):
    client.force_login(admin_user)

    sale = Sale.objects.create(
        store=store,
        seller=admin_user,
        status=Sale.Status.PAID,
        total=Decimal("20000.00"),
        amount_paid=Decimal("20000.00"),
        amount_due=Decimal("0.00"),
        invoice_number="FAC-0001",
    )

    response = client.get(f"/pos/{sale.pk}/refund/")
    assert response.status_code == 200
    used_templates = [template.name for template in response.templates if template.name]
    assert "sales/refund_create.html" in used_templates

    post_response = client.post(
        f"/pos/{sale.pk}/refund/",
        {
            "amount": "5000.00",
            "reason": "Retour client",
            "refund_method": "CASH",
        },
    )
    assert post_response.status_code == 302

    sale.refresh_from_db()
    assert sale.status == Sale.Status.REFUNDED
    assert Refund.objects.filter(sale=sale, amount=Decimal("5000.00")).exists()
