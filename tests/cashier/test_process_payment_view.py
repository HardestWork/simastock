import json
from decimal import Decimal

import pytest

from cashier.models import Payment
from cashier.services import open_shift
from sales.services import add_item_to_sale, create_sale, recalculate_sale, submit_sale_to_cashier


@pytest.mark.django_db
def test_process_payment_view_amount_input_supports_locale_decimal_values(
    client,
    store,
    sales_user,
    cashier_user,
    store_user_cashier,
    customer,
):
    sale = create_sale(store=store, seller=sales_user, customer=customer)
    sale.status = "PENDING_PAYMENT"
    sale.total = Decimal("1043438.00")
    sale.amount_paid = Decimal("0.50")
    sale.amount_due = Decimal("1043437.50")
    sale.save(update_fields=["status", "total", "amount_paid", "amount_due", "updated_at"])

    open_shift(store=store, cashier=cashier_user, opening_float=Decimal("10000"))
    client.force_login(cashier_user)

    response = client.get(f"/cashier/process-payment/{sale.pk}/")

    assert response.status_code == 200
    html = response.content.decode("utf-8")
    assert 'inputmode="decimal"' in html
    assert 'type="text"' in html
    assert "1043437.5" in html


@pytest.mark.django_db
def test_process_payment_view_accepts_payment_data_json(
    client,
    store,
    sales_user,
    cashier_user,
    store_user_cashier,
    customer,
    product,
    product_stock,
):
    sale = create_sale(store=store, seller=sales_user, customer=customer)
    add_item_to_sale(sale=sale, product=product, qty=1, actor=sales_user)
    recalculate_sale(sale)
    submit_sale_to_cashier(sale=sale, actor=sales_user)

    open_shift(store=store, cashier=cashier_user, opening_float=Decimal("10000"))
    client.force_login(cashier_user)

    response = client.post(
        f"/cashier/process-payment/{sale.pk}/",
        {
            "payment_data": json.dumps(
                [
                    {
                        "method": "CASH",
                        "amount": float(sale.amount_due),
                        "reference": "",
                    }
                ]
            ),
        },
    )

    assert response.status_code == 302
    assert response["Location"].endswith("/cashier/pending-sales/")

    sale.refresh_from_db()
    assert sale.status == "PAID"
    assert sale.amount_due == Decimal("0.00")
    assert Payment.objects.filter(sale=sale).count() == 1


@pytest.mark.django_db
def test_process_payment_view_with_invoice_print_option(
    client,
    store,
    sales_user,
    cashier_user,
    store_user_cashier,
    customer,
    product,
    product_stock,
):
    sale = create_sale(store=store, seller=sales_user, customer=customer)
    add_item_to_sale(sale=sale, product=product, qty=1, actor=sales_user)
    recalculate_sale(sale)
    submit_sale_to_cashier(sale=sale, actor=sales_user)

    open_shift(store=store, cashier=cashier_user, opening_float=Decimal("10000"))
    client.force_login(cashier_user)

    response = client.post(
        f"/cashier/process-payment/{sale.pk}/",
        {
            "payment_data": json.dumps(
                [
                    {
                        "method": "CASH",
                        "amount": float(sale.amount_due),
                        "reference": "",
                    }
                ]
            ),
            "print_document": "invoice",
        },
    )

    assert response.status_code == 302
    assert response["Location"].endswith(f"/cashier/pending-sales/?print_sale={sale.pk}&print_document=invoice")


@pytest.mark.django_db
def test_process_payment_view_with_proforma_print_option(
    client,
    store,
    sales_user,
    cashier_user,
    store_user_cashier,
    customer,
    product,
    product_stock,
):
    sale = create_sale(store=store, seller=sales_user, customer=customer)
    add_item_to_sale(sale=sale, product=product, qty=1, actor=sales_user)
    recalculate_sale(sale)
    submit_sale_to_cashier(sale=sale, actor=sales_user)

    open_shift(store=store, cashier=cashier_user, opening_float=Decimal("10000"))
    client.force_login(cashier_user)

    response = client.post(
        f"/cashier/process-payment/{sale.pk}/",
        {
            "payment_data": json.dumps(
                [
                    {
                        "method": "CASH",
                        "amount": float(sale.amount_due),
                        "reference": "",
                    }
                ]
            ),
            "print_document": "proforma",
        },
    )

    assert response.status_code == 302
    assert response["Location"].endswith(f"/cashier/pending-sales/?print_sale={sale.pk}&print_document=proforma")


@pytest.mark.django_db
def test_process_payment_view_accepts_method_aliases_and_mode_key(
    client,
    store,
    sales_user,
    cashier_user,
    store_user_cashier,
    customer,
    product,
    product_stock,
):
    sale = create_sale(store=store, seller=sales_user, customer=customer)
    add_item_to_sale(sale=sale, product=product, qty=1, actor=sales_user)
    recalculate_sale(sale)
    submit_sale_to_cashier(sale=sale, actor=sales_user)

    open_shift(store=store, cashier=cashier_user, opening_float=Decimal("10000"))
    client.force_login(cashier_user)

    response = client.post(
        f"/cashier/process-payment/{sale.pk}/",
        {
            "payment_data": json.dumps(
                [
                    {
                        "mode": "cash",
                        "amount": float(sale.amount_due),
                        "reference": "",
                    }
                ]
            ),
        },
    )

    assert response.status_code == 302
    assert response["Location"].endswith("/cashier/pending-sales/")

    sale.refresh_from_db()
    assert sale.status == "PAID"
    payment = Payment.objects.get(sale=sale)
    assert payment.method == Payment.Method.CASH


@pytest.mark.django_db
def test_process_payment_view_accepts_cash_overpayment_and_returns_change(
    client,
    store,
    sales_user,
    cashier_user,
    store_user_cashier,
    customer,
    product,
    product_stock,
):
    sale = create_sale(store=store, seller=sales_user, customer=customer)
    add_item_to_sale(sale=sale, product=product, qty=1, actor=sales_user)
    recalculate_sale(sale)
    submit_sale_to_cashier(sale=sale, actor=sales_user)

    open_shift(store=store, cashier=cashier_user, opening_float=Decimal("10000"))
    client.force_login(cashier_user)

    overpaid_amount = sale.amount_due + Decimal("500.00")
    response = client.post(
        f"/cashier/process-payment/{sale.pk}/",
        {
            "payment_data": json.dumps(
                [
                    {
                        "method": "CASH",
                        "amount": float(overpaid_amount),
                        "reference": "",
                    }
                ]
            ),
        },
    )

    assert response.status_code == 302
    assert response["Location"].endswith("/cashier/pending-sales/")

    sale.refresh_from_db()
    assert sale.status == "PAID"
    assert sale.amount_due == Decimal("0.00")

    payment = Payment.objects.get(sale=sale)
    # Accounting keeps only the amount effectively applied to the sale.
    assert payment.amount == sale.total


@pytest.mark.django_db
def test_process_payment_view_returns_json_success_for_single_page_mode(
    client,
    store,
    sales_user,
    cashier_user,
    store_user_cashier,
    customer,
    product,
    product_stock,
):
    sale = create_sale(store=store, seller=sales_user, customer=customer)
    add_item_to_sale(sale=sale, product=product, qty=1, actor=sales_user)
    recalculate_sale(sale)
    submit_sale_to_cashier(sale=sale, actor=sales_user)

    open_shift(store=store, cashier=cashier_user, opening_float=Decimal("10000"))
    client.force_login(cashier_user)

    response = client.post(
        f"/cashier/process-payment/{sale.pk}/",
        {
            "payment_data": json.dumps(
                [
                    {
                        "method": "CASH",
                        "amount": float(sale.amount_due),
                    }
                ]
            ),
            "print_document": "receipt",
        },
        HTTP_ACCEPT="application/json",
        HTTP_X_REQUESTED_WITH="XMLHttpRequest",
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["payments_count"] == 1
    assert payload["sale_status"] == "PAID"
    assert payload["redirect_url"].endswith(f"/cashier/pending-sales/?print_sale={sale.pk}&print_document=receipt")
    assert payload["print_document_url"].endswith(f"/pos/{sale.pk}/receipt/")


@pytest.mark.django_db
def test_process_payment_view_returns_json_error_without_open_shift(
    client,
    store,
    sales_user,
    cashier_user,
    store_user_cashier,
    customer,
    product,
    product_stock,
):
    sale = create_sale(store=store, seller=sales_user, customer=customer)
    add_item_to_sale(sale=sale, product=product, qty=1, actor=sales_user)
    recalculate_sale(sale)
    submit_sale_to_cashier(sale=sale, actor=sales_user)

    client.force_login(cashier_user)
    response = client.post(
        f"/cashier/process-payment/{sale.pk}/",
        {
            "payment_data": json.dumps(
                [
                    {
                        "method": "CASH",
                        "amount": float(sale.amount_due),
                    }
                ]
            )
        },
        HTTP_ACCEPT="application/json",
        HTTP_X_REQUESTED_WITH="XMLHttpRequest",
    )

    assert response.status_code == 400
    payload = response.json()
    assert "Aucune session de caisse" in payload["error"]
    assert payload["redirect_url"] == "/cashier/shift-open/"
