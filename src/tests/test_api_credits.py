"""Tests for the Credit Management module API endpoints."""
import uuid
from decimal import Decimal

import pytest

from credits.models import CustomerAccount, CreditLedgerEntry, PaymentSchedule
from customers.models import Customer


# ── Helpers ──────────────────────────────────────────────────────────────

def _enable_credit_module(store):
    ent = store.enterprise
    flags = ent.analytics_feature_flags or {}
    flags["credit_management"] = True
    ent.analytics_feature_flags = flags
    ent.save(update_fields=["analytics_feature_flags"])


URL_ACCOUNTS = "/api/v1/credit-accounts/"
URL_LEDGER = "/api/v1/credit-ledger/"
URL_SCHEDULES = "/api/v1/payment-schedules/"


# ── Fixtures ─────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def enable_credit(store):
    _enable_credit_module(store)


@pytest.fixture
def customer(enterprise):
    return Customer.objects.create(
        enterprise=enterprise,
        first_name="Jean",
        last_name="Dupont",
        phone="+237600000002",
    )


@pytest.fixture
def customer_b(enterprise):
    return Customer.objects.create(
        enterprise=enterprise,
        first_name="Marie",
        last_name="Kamga",
        phone="+237600000003",
    )


@pytest.fixture
def credit_account(store, customer):
    return CustomerAccount.objects.create(
        store=store,
        customer=customer,
        credit_limit=Decimal("100000.00"),
        balance=Decimal("0.00"),
    )


@pytest.fixture
def credit_account_with_balance(store, customer):
    return CustomerAccount.objects.create(
        store=store,
        customer=customer,
        credit_limit=Decimal("100000.00"),
        balance=Decimal("50000.00"),
    )


# ── CustomerAccount CRUD ────────────────────────────────────────────────


@pytest.mark.django_db
class TestCustomerAccountCRUD:
    def test_create_credit_account(self, admin_client, store, customer):
        r = admin_client.post(URL_ACCOUNTS, {
            "store": str(store.pk),
            "customer": str(customer.pk),
            "credit_limit": "200000.00",
        }, format="json")
        assert r.status_code == 201
        assert r.data["credit_limit"] == "200000.00"
        assert r.data["balance"] == "0.00"

    def test_list_credit_accounts(self, admin_client, credit_account):
        r = admin_client.get(URL_ACCOUNTS)
        assert r.status_code == 200
        assert len(r.data["results"]) >= 1

    def test_filter_by_customer(self, admin_client, credit_account, customer):
        r = admin_client.get(URL_ACCOUNTS, {"customer": str(customer.pk)})
        assert r.status_code == 200
        assert len(r.data["results"]) >= 1

    def test_retrieve_account_detail(self, admin_client, credit_account):
        r = admin_client.get(f"{URL_ACCOUNTS}{credit_account.pk}/")
        assert r.status_code == 200
        assert r.data["id"] == str(credit_account.pk)
        assert "available_credit" in r.data

    def test_available_credit_computed(self, admin_client, credit_account_with_balance):
        r = admin_client.get(f"{URL_ACCOUNTS}{credit_account_with_balance.pk}/")
        assert r.status_code == 200
        assert Decimal(r.data["available_credit"]) == Decimal("50000.00")

    def test_update_credit_limit(self, admin_client, credit_account):
        r = admin_client.patch(f"{URL_ACCOUNTS}{credit_account.pk}/", {
            "credit_limit": "150000.00",
        }, format="json")
        assert r.status_code == 200
        credit_account.refresh_from_db()
        assert credit_account.credit_limit == Decimal("150000.00")

    def test_deactivate_account(self, admin_client, credit_account):
        r = admin_client.patch(f"{URL_ACCOUNTS}{credit_account.pk}/", {
            "is_active": False,
        }, format="json")
        assert r.status_code == 200
        credit_account.refresh_from_db()
        assert credit_account.is_active is False


# ── Credit Payments ──────────────────────────────────────────────────────


@pytest.mark.django_db
class TestCreditPayments:
    def test_pay_reduces_balance(self, admin_client, credit_account_with_balance):
        acct = credit_account_with_balance
        r = admin_client.post(f"{URL_ACCOUNTS}{acct.pk}/pay/", {
            "amount": "20000.00",
            "notes": "Paiement partiel",
        }, format="json")
        assert r.status_code in (200, 201)
        acct.refresh_from_db()
        assert acct.balance == Decimal("30000.00")

    def test_pay_creates_ledger_entry(self, admin_client, credit_account_with_balance):
        acct = credit_account_with_balance
        admin_client.post(f"{URL_ACCOUNTS}{acct.pk}/pay/", {
            "amount": "10000.00",
        }, format="json")
        entries = CreditLedgerEntry.objects.filter(account=acct)
        assert entries.count() >= 1
        payment = entries.filter(entry_type="CREDIT_PAYMENT").first()
        assert payment is not None

    def test_overpayment_rejected(self, admin_client, credit_account):
        """Cannot pay more than balance."""
        r = admin_client.post(f"{URL_ACCOUNTS}{credit_account.pk}/pay/", {
            "amount": "50000.00",  # balance is 0
        }, format="json")
        assert r.status_code == 400


# ── Credit Ledger ────────────────────────────────────────────────────────


@pytest.mark.django_db
class TestCreditLedger:
    def test_list_ledger_entries(self, admin_client, credit_account_with_balance, admin_user):
        CreditLedgerEntry.objects.create(
            account=credit_account_with_balance,
            entry_type="SALE_ON_CREDIT",
            amount=Decimal("50000.00"),
            balance_after=Decimal("50000.00"),
            reference="INV-001",
            created_by=admin_user,
        )
        r = admin_client.get(URL_LEDGER)
        assert r.status_code == 200
        assert len(r.data["results"]) >= 1

    def test_filter_by_account(self, admin_client, credit_account_with_balance, admin_user):
        CreditLedgerEntry.objects.create(
            account=credit_account_with_balance,
            entry_type="SALE_ON_CREDIT",
            amount=Decimal("10000.00"),
            balance_after=Decimal("60000.00"),
            created_by=admin_user,
        )
        r = admin_client.get(URL_LEDGER, {"account": str(credit_account_with_balance.pk)})
        assert r.status_code == 200
        assert len(r.data["results"]) >= 1


# ── Payment Schedules ───────────────────────────────────────────────────


@pytest.mark.django_db
class TestPaymentSchedules:
    def test_list_schedules(self, admin_client, credit_account):
        from datetime import date, timedelta
        PaymentSchedule.objects.create(
            account=credit_account,
            due_date=date.today() + timedelta(days=30),
            amount_due=Decimal("25000.00"),
        )
        r = admin_client.get(URL_SCHEDULES)
        assert r.status_code == 200
        assert len(r.data["results"]) >= 1

    def test_filter_by_status(self, admin_client, credit_account):
        from datetime import date, timedelta
        PaymentSchedule.objects.create(
            account=credit_account,
            due_date=date.today() + timedelta(days=30),
            amount_due=Decimal("25000.00"),
            status="PENDING",
        )
        PaymentSchedule.objects.create(
            account=credit_account,
            due_date=date.today() - timedelta(days=10),
            amount_due=Decimal("15000.00"),
            status="OVERDUE",
        )
        r = admin_client.get(URL_SCHEDULES, {"status": "PENDING"})
        assert r.status_code == 200
        assert all(s["status"] == "PENDING" for s in r.data["results"])

    def test_update_schedule(self, admin_client, credit_account):
        from datetime import date, timedelta
        sched = PaymentSchedule.objects.create(
            account=credit_account,
            due_date=date.today() + timedelta(days=30),
            amount_due=Decimal("25000.00"),
        )
        new_date = date.today() + timedelta(days=60)
        r = admin_client.patch(f"{URL_SCHEDULES}{sched.pk}/", {
            "due_date": str(new_date),
        }, format="json")
        assert r.status_code == 200
        sched.refresh_from_db()
        assert sched.due_date == new_date


# ── Authorization ────────────────────────────────────────────────────────


@pytest.mark.django_db
class TestCreditAuthorization:
    def test_sales_user_cannot_create_account(self, sales_client, store, customer):
        r = sales_client.post(URL_ACCOUNTS, {
            "store": str(store.pk),
            "customer": str(customer.pk),
            "credit_limit": "50000.00",
        }, format="json")
        assert r.status_code == 403

    def test_unauthenticated_rejected(self, api_client):
        r = api_client.get(URL_ACCOUNTS)
        assert r.status_code in (401, 403)

    def test_module_disabled_rejected(self, admin_client, store):
        ent = store.enterprise
        flags = ent.analytics_feature_flags or {}
        flags["credit_management"] = False
        ent.analytics_feature_flags = flags
        ent.save(update_fields=["analytics_feature_flags"])

        r = admin_client.get(URL_ACCOUNTS)
        assert r.status_code == 403
