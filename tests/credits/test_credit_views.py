from datetime import timedelta
from decimal import Decimal

import pytest
from django.http import HttpResponse
from django.utils import timezone

from credits.models import CreditLedgerEntry, PaymentSchedule
from credits.services import record_credit_sale
from sales.models import Sale
from stores.models import Store


@pytest.mark.django_db
def test_account_views_render(client, admin_user, store_user_admin, customer_account):
    client.force_login(admin_user)

    list_response = client.get('/credits/')
    assert list_response.status_code == 200
    assert 'credits/account_list.html' in [t.name for t in list_response.templates if t.name]

    detail_response = client.get(f'/credits/accounts/{customer_account.pk}/')
    assert detail_response.status_code == 200
    assert 'credits/account_detail.html' in [t.name for t in detail_response.templates if t.name]

    ledger_response = client.get(f'/credits/accounts/{customer_account.pk}/ledger/')
    assert ledger_response.status_code == 200
    assert 'credits/ledger.html' in [t.name for t in ledger_response.templates if t.name]


@pytest.mark.django_db
def test_schedule_and_overdue_views_render(
    client,
    admin_user,
    store_user_admin,
    customer_account,
):
    client.force_login(admin_user)

    PaymentSchedule.objects.create(
        account=customer_account,
        due_date=timezone.now().date() - timedelta(days=3),
        amount_due=Decimal('12000.00'),
        amount_paid=Decimal('0.00'),
        status=PaymentSchedule.Status.OVERDUE,
    )

    schedule_list_response = client.get(f'/credits/accounts/{customer_account.pk}/schedules/')
    assert schedule_list_response.status_code == 200
    assert 'credits/schedule_list.html' in [t.name for t in schedule_list_response.templates if t.name]

    schedule_create_response = client.get(f'/credits/accounts/{customer_account.pk}/schedules/create/')
    assert schedule_create_response.status_code == 200
    assert 'credits/schedule_form.html' in [t.name for t in schedule_create_response.templates if t.name]

    overdue_response = client.get('/credits/overdue/')
    assert overdue_response.status_code == 200
    assert 'credits/overdue_list.html' in [t.name for t in overdue_response.templates if t.name]


@pytest.mark.django_db
def test_credit_repayment_redirects_to_receipt_when_requested(
    client,
    admin_user,
    store,
    store_user_admin,
    customer,
    customer_account,
):
    customer_account.balance = Decimal("90000.00")
    customer_account.save(update_fields=["balance", "updated_at"])

    client.force_login(admin_user)

    response = client.post(
        f"/credits/accounts/{customer_account.pk}/payment/",
        data={
            "amount": "25000.00",
            "reference": "REM-001",
            "notes": "Paiement comptoir",
            "print_receipt": "on",
        },
    )

    assert response.status_code == 302
    entry = (
        CreditLedgerEntry.objects
        .filter(account=customer_account, entry_type=CreditLedgerEntry.EntryType.CREDIT_PAYMENT)
        .latest("created_at")
    )
    assert f"/credits/accounts/{customer_account.pk}/payments/{entry.pk}/receipt/" in response["Location"]


@pytest.mark.django_db
def test_credit_receipt_view_renders_pdf_response(
    client,
    admin_user,
    sales_user,
    store,
    store_user_admin,
    customer,
    customer_account,
    monkeypatch,
):
    from sales.services import create_sale

    sale = create_sale(store=store, seller=sales_user, customer=customer)
    record_credit_sale(
        account=customer_account,
        sale=sale,
        amount=Decimal("50000.00"),
        actor=sales_user,
    )
    repayment_entry = CreditLedgerEntry.objects.create(
        account=customer_account,
        entry_type=CreditLedgerEntry.EntryType.CREDIT_PAYMENT,
        amount=Decimal("-10000.00"),
        balance_after=Decimal("40000.00"),
        reference="REM-002",
        sale=sale,
        created_by=admin_user,
    )

    def fake_pdf(**kwargs):
        return HttpResponse(b"%PDF-1.4 test", content_type="application/pdf")

    monkeypatch.setattr("credits.views.generate_credit_payment_receipt_pdf", fake_pdf)

    client.force_login(admin_user)
    response = client.get(
        f"/credits/accounts/{customer_account.pk}/payments/{repayment_entry.pk}/receipt/"
    )

    assert response.status_code == 200
    assert response["Content-Type"] == "application/pdf"


@pytest.mark.django_db
def test_credit_repay_all_one_click_uses_full_balance(
    client,
    admin_user,
    store,
    store_user_admin,
    customer_account,
):
    customer_account.balance = Decimal("32000.00")
    customer_account.save(update_fields=["balance", "updated_at"])

    client.force_login(admin_user)

    response = client.post(
        f"/credits/accounts/{customer_account.pk}/repay-all/",
        data={"print_receipt": "on"},
    )

    assert response.status_code == 302
    customer_account.refresh_from_db()
    assert customer_account.balance == Decimal("0.00")

    entry = (
        CreditLedgerEntry.objects
        .filter(account=customer_account, entry_type=CreditLedgerEntry.EntryType.CREDIT_PAYMENT)
        .latest("created_at")
    )
    assert entry.amount == Decimal("-32000.00")
    assert f"/credits/accounts/{customer_account.pk}/payments/{entry.pk}/receipt/" in response["Location"]


@pytest.mark.django_db
def test_schedule_create_does_not_link_sale_from_another_store(
    client,
    admin_user,
    store,
    store_user_admin,
    customer_account,
):
    other_store = Store.objects.create(
        enterprise=store.enterprise,
        name="Boutique Externe",
        code="EXT-100",
        address="Adresse",
        phone="+237600001100",
        email="ext100@test.com",
    )
    foreign_sale = Sale.objects.create(
        store=other_store,
        seller=admin_user,
        status=Sale.Status.DRAFT,
        total=Decimal("10000.00"),
        amount_due=Decimal("10000.00"),
    )

    client.force_login(admin_user)
    response = client.post(
        f"/credits/accounts/{customer_account.pk}/schedules/create/",
        data={
            "due_date": (timezone.now().date() + timedelta(days=15)).isoformat(),
            "amount_due": "25000.00",
            "sale": str(foreign_sale.pk),
        },
    )

    assert response.status_code == 302
    schedule = PaymentSchedule.objects.latest("created_at")
    assert schedule.account_id == customer_account.pk
    assert schedule.sale is None
