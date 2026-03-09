"""Tests for the Accounting (SYSCOHADA) module API endpoints."""
import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest

from accounting.models import (
    Account,
    AccountingPeriod,
    AccountingSettings,
    FiscalYear,
    Journal,
    JournalEntry,
    JournalEntryLine,
    TaxRate,
)


# ── Helpers ──────────────────────────────────────────────────────────────

def _enable_accounting(store):
    ent = store.enterprise
    flags = ent.analytics_feature_flags or {}
    flags["accounting"] = True
    ent.analytics_feature_flags = flags
    ent.save(update_fields=["analytics_feature_flags"])


URL_ACCOUNTS = "/api/v1/accounting/accounts/"
URL_JOURNALS = "/api/v1/accounting/journals/"
URL_FISCAL_YEARS = "/api/v1/accounting/fiscal-years/"
URL_PERIODS = "/api/v1/accounting/periods/"
URL_ENTRIES = "/api/v1/accounting/entries/"
URL_TAX_RATES = "/api/v1/accounting/tax-rates/"
URL_SETTINGS = "/api/v1/accounting/settings/"


# ── Fixtures ─────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def enable_accounting_module(store):
    _enable_accounting(store)


@pytest.fixture
def account_701(enterprise):
    return Account.objects.create(
        enterprise=enterprise,
        code="701",
        name="Ventes de marchandises",
        account_type=Account.AccountType.INCOME,
    )


@pytest.fixture
def account_601(enterprise):
    return Account.objects.create(
        enterprise=enterprise,
        code="601",
        name="Achats de marchandises",
        account_type=Account.AccountType.EXPENSE,
    )


@pytest.fixture
def account_411(enterprise):
    return Account.objects.create(
        enterprise=enterprise,
        code="411",
        name="Clients",
        account_type=Account.AccountType.ASSET,
    )


@pytest.fixture
def account_571(enterprise):
    return Account.objects.create(
        enterprise=enterprise,
        code="571",
        name="Caisse",
        account_type=Account.AccountType.ASSET,
    )


@pytest.fixture
def journal_ventes(enterprise, account_411, account_701):
    return Journal.objects.create(
        enterprise=enterprise,
        code="VE",
        name="Journal des ventes",
        journal_type=Journal.JournalType.VE,
        default_debit_account=account_411,
        default_credit_account=account_701,
    )


@pytest.fixture
def journal_caisse(enterprise, account_571, account_701):
    return Journal.objects.create(
        enterprise=enterprise,
        code="CA",
        name="Journal de caisse",
        journal_type=Journal.JournalType.CA,
        default_debit_account=account_571,
        default_credit_account=account_701,
    )


@pytest.fixture
def fiscal_year(enterprise):
    return FiscalYear.objects.create(
        enterprise=enterprise,
        name="Exercice 2026",
        start_date=date(2026, 1, 1),
        end_date=date(2026, 12, 31),
    )


@pytest.fixture
def period_jan(fiscal_year):
    return AccountingPeriod.objects.create(
        fiscal_year=fiscal_year,
        period_number=1,
        start_date=date(2026, 1, 1),
        end_date=date(2026, 1, 31),
    )


# ── Account CRUD ─────────────────────────────────────────────────────────


@pytest.mark.django_db
class TestAccountCRUD:
    def test_create_account(self, admin_client, enterprise):
        r = admin_client.post(URL_ACCOUNTS, {
            "code": "411",
            "name": "Clients",
            "account_type": "ASSET",
        }, format="json")
        assert r.status_code == 201
        assert r.data["code"] == "411"
        assert r.data["account_type"] == "ASSET"

    def test_list_accounts(self, admin_client, account_701, account_601):
        r = admin_client.get(URL_ACCOUNTS)
        assert r.status_code == 200
        codes = [a["code"] for a in r.data["results"]]
        assert "701" in codes
        assert "601" in codes

    def test_filter_by_type(self, admin_client, account_701, account_601):
        r = admin_client.get(URL_ACCOUNTS, {"account_type": "INCOME"})
        assert r.status_code == 200
        assert all(a["account_type"] == "INCOME" for a in r.data["results"])

    def test_cannot_delete_system_account(self, admin_client, enterprise):
        acct = Account.objects.create(
            enterprise=enterprise, code="100", name="Capital",
            account_type=Account.AccountType.EQUITY, is_system=True,
        )
        r = admin_client.delete(f"{URL_ACCOUNTS}{acct.pk}/")
        assert r.status_code == 400

    def test_delete_non_system_account(self, admin_client, enterprise):
        acct = Account.objects.create(
            enterprise=enterprise, code="999", name="Temp",
            account_type=Account.AccountType.EXPENSE, is_system=False,
        )
        r = admin_client.delete(f"{URL_ACCOUNTS}{acct.pk}/")
        assert r.status_code == 204

    def test_sales_user_rejected(self, sales_client):
        r = sales_client.get(URL_ACCOUNTS)
        assert r.status_code == 403


# ── Journal CRUD ─────────────────────────────────────────────────────────


@pytest.mark.django_db
class TestJournalCRUD:
    def test_create_journal(self, admin_client, account_571, account_701):
        r = admin_client.post(URL_JOURNALS, {
            "code": "BQ",
            "name": "Journal banque",
            "journal_type": "BQ",
            "default_debit_account": str(account_571.pk),
            "default_credit_account": str(account_701.pk),
        }, format="json")
        assert r.status_code == 201
        assert r.data["journal_type"] == "BQ"

    def test_list_journals(self, admin_client, journal_ventes):
        r = admin_client.get(URL_JOURNALS)
        assert r.status_code == 200
        assert len(r.data["results"]) >= 1

    def test_filter_by_type(self, admin_client, journal_ventes, journal_caisse):
        r = admin_client.get(URL_JOURNALS, {"journal_type": "VE"})
        assert r.status_code == 200
        assert all(j["journal_type"] == "VE" for j in r.data["results"])


# ── Fiscal Year ──────────────────────────────────────────────────────────


@pytest.mark.django_db
class TestFiscalYear:
    def test_create_fiscal_year(self, admin_client):
        r = admin_client.post(URL_FISCAL_YEARS, {
            "name": "Exercice 2027",
            "start_date": "2027-01-01",
            "end_date": "2027-12-31",
        }, format="json")
        assert r.status_code == 201
        assert r.data["status"] == "OPEN"

    def test_create_periods_action(self, admin_client, fiscal_year):
        """Auto-create 14 periods for a fiscal year with no existing periods."""
        r = admin_client.post(f"{URL_FISCAL_YEARS}{fiscal_year.pk}/create_periods/")
        assert r.status_code == 201
        periods = AccountingPeriod.objects.filter(fiscal_year=fiscal_year)
        assert periods.count() == 14

    def test_create_periods_rejects_duplicate(self, admin_client, fiscal_year, period_jan):
        """Cannot create periods if they already exist."""
        r = admin_client.post(f"{URL_FISCAL_YEARS}{fiscal_year.pk}/create_periods/")
        assert r.status_code == 400

    def test_list_fiscal_years(self, admin_client, fiscal_year):
        r = admin_client.get(URL_FISCAL_YEARS)
        assert r.status_code == 200
        assert len(r.data["results"]) >= 1


# ── Accounting Periods ───────────────────────────────────────────────────


@pytest.mark.django_db
class TestAccountingPeriods:
    def test_list_periods(self, admin_client, period_jan):
        r = admin_client.get(URL_PERIODS)
        assert r.status_code == 200
        assert len(r.data["results"]) >= 1

    def test_filter_by_fiscal_year(self, admin_client, fiscal_year, period_jan):
        r = admin_client.get(URL_PERIODS, {"fiscal_year": str(fiscal_year.pk)})
        assert r.status_code == 200
        assert len(r.data["results"]) >= 1


# ── Journal Entries ──────────────────────────────────────────────────────


@pytest.mark.django_db
class TestJournalEntries:
    def test_create_balanced_entry(
        self, admin_client, journal_ventes, fiscal_year, period_jan,
        account_411, account_701, store,
    ):
        r = admin_client.post(URL_ENTRIES, {
            "journal_code": "VE",
            "entry_date": "2026-01-15",
            "label": "Vente comptoir",
            "store": str(store.pk),
            "lines": [
                {"account_id": str(account_411.pk), "debit": "10000", "credit": "0", "label": "Client"},
                {"account_id": str(account_701.pk), "debit": "0", "credit": "10000", "label": "Vente"},
            ],
        }, format="json")
        assert r.status_code == 201, r.data
        assert r.data["is_balanced"] is True
        assert r.data["status"] == "DRAFT"

    def test_reject_unbalanced_entry(
        self, admin_client, journal_ventes, fiscal_year, period_jan,
        account_411, account_701, store,
    ):
        r = admin_client.post(URL_ENTRIES, {
            "journal_code": "VE",
            "entry_date": "2026-01-15",
            "label": "Unbalanced",
            "store": str(store.pk),
            "lines": [
                {"account_id": str(account_411.pk), "debit": "10000", "credit": "0", "label": "Debit"},
                {"account_id": str(account_701.pk), "debit": "0", "credit": "5000", "label": "Credit"},
            ],
        }, format="json")
        assert r.status_code == 400

    def test_reject_empty_lines(self, admin_client, journal_ventes, fiscal_year, period_jan, store):
        r = admin_client.post(URL_ENTRIES, {
            "journal_code": "VE",
            "entry_date": "2026-01-15",
            "label": "No lines",
            "store": str(store.pk),
            "lines": [],
        }, format="json")
        assert r.status_code == 400

    def test_validate_entry(
        self, admin_client, journal_ventes, fiscal_year, period_jan,
        account_411, account_701, admin_user, store,
    ):
        entry = JournalEntry.objects.create(
            enterprise=fiscal_year.enterprise,
            journal=journal_ventes,
            fiscal_year=fiscal_year,
            period=period_jan,
            store=store,
            sequence_number=1,
            entry_date=date(2026, 1, 15),
            label="Test validate",
            created_by=admin_user,
        )
        JournalEntryLine.objects.create(entry=entry, account=account_411, debit=Decimal("5000"), credit=Decimal("0"))
        JournalEntryLine.objects.create(entry=entry, account=account_701, debit=Decimal("0"), credit=Decimal("5000"))

        r = admin_client.post(f"{URL_ENTRIES}{entry.pk}/validate_entry/")
        assert r.status_code == 200
        assert r.data["status"] == "VALIDATED"

    def test_post_entry(
        self, admin_client, journal_ventes, fiscal_year, period_jan,
        account_411, account_701, admin_user, store,
    ):
        entry = JournalEntry.objects.create(
            enterprise=fiscal_year.enterprise,
            journal=journal_ventes,
            fiscal_year=fiscal_year,
            period=period_jan,
            store=store,
            sequence_number=1,
            entry_date=date(2026, 1, 15),
            label="Test post",
            created_by=admin_user,
        )
        JournalEntryLine.objects.create(entry=entry, account=account_411, debit=Decimal("5000"), credit=Decimal("0"))
        JournalEntryLine.objects.create(entry=entry, account=account_701, debit=Decimal("0"), credit=Decimal("5000"))

        r = admin_client.post(f"{URL_ENTRIES}{entry.pk}/post_entry/")
        assert r.status_code == 200
        assert r.data["status"] == "POSTED"

    def test_cannot_post_unbalanced(
        self, admin_client, journal_ventes, fiscal_year, period_jan,
        account_411, admin_user, store,
    ):
        entry = JournalEntry.objects.create(
            enterprise=fiscal_year.enterprise,
            journal=journal_ventes,
            fiscal_year=fiscal_year,
            period=period_jan,
            store=store,
            sequence_number=1,
            entry_date=date(2026, 1, 15),
            label="Unbalanced post",
            created_by=admin_user,
        )
        JournalEntryLine.objects.create(entry=entry, account=account_411, debit=Decimal("5000"), credit=Decimal("0"))

        r = admin_client.post(f"{URL_ENTRIES}{entry.pk}/post_entry/")
        assert r.status_code == 400

    def test_list_entries(
        self, admin_client, journal_ventes, fiscal_year, period_jan,
        account_411, account_701, admin_user, store,
    ):
        entry = JournalEntry.objects.create(
            enterprise=fiscal_year.enterprise,
            journal=journal_ventes,
            fiscal_year=fiscal_year,
            period=period_jan,
            store=store,
            sequence_number=1,
            entry_date=date(2026, 1, 15),
            label="Test list",
            created_by=admin_user,
        )
        JournalEntryLine.objects.create(entry=entry, account=account_411, debit=Decimal("5000"), credit=Decimal("0"))
        JournalEntryLine.objects.create(entry=entry, account=account_701, debit=Decimal("0"), credit=Decimal("5000"))

        r = admin_client.get(URL_ENTRIES)
        assert r.status_code == 200
        assert len(r.data["results"]) >= 1


# ── Financial Reports ────────────────────────────────────────────────────


@pytest.mark.django_db
class TestFinancialReports:
    @pytest.fixture(autouse=True)
    def posted_entry(
        self, admin_user, enterprise, journal_ventes, fiscal_year,
        period_jan, account_411, account_701, store,
    ):
        entry = JournalEntry.objects.create(
            enterprise=enterprise,
            journal=journal_ventes,
            fiscal_year=fiscal_year,
            period=period_jan,
            store=store,
            sequence_number=1,
            entry_date=date(2026, 1, 15),
            label="Vente test",
            status=JournalEntry.Status.POSTED,
            created_by=admin_user,
        )
        JournalEntryLine.objects.create(entry=entry, account=account_411, debit=Decimal("10000"), credit=Decimal("0"))
        JournalEntryLine.objects.create(entry=entry, account=account_701, debit=Decimal("0"), credit=Decimal("10000"))
        return entry

    def test_balance_generale(self, admin_client, fiscal_year):
        r = admin_client.get(
            "/api/v1/accounting/reports/balance-generale/",
            {"fiscal_year": str(fiscal_year.pk)},
        )
        assert r.status_code == 200
        assert isinstance(r.data, list)
        assert len(r.data) >= 2

    def test_grand_livre(self, admin_client, fiscal_year, account_411):
        r = admin_client.get(
            "/api/v1/accounting/reports/grand-livre/",
            {"fiscal_year": str(fiscal_year.pk), "account": str(account_411.pk)},
        )
        assert r.status_code == 200

    def test_bilan(self, admin_client, fiscal_year):
        r = admin_client.get(
            "/api/v1/accounting/reports/bilan/",
            {"fiscal_year": str(fiscal_year.pk)},
        )
        assert r.status_code == 200

    def test_compte_resultat(self, admin_client, fiscal_year):
        r = admin_client.get(
            "/api/v1/accounting/reports/compte-resultat/",
            {"fiscal_year": str(fiscal_year.pk)},
        )
        assert r.status_code == 200


# ── Tax Rates ────────────────────────────────────────────────────────────


@pytest.mark.django_db
class TestTaxRates:
    def test_create_tax_rate(self, admin_client):
        r = admin_client.post(URL_TAX_RATES, {
            "name": "TVA 19.25%",
            "rate": "19.25",
            "is_exempt": False,
        }, format="json")
        assert r.status_code == 201
        assert r.data["rate"] == "19.25"

    def test_list_tax_rates(self, admin_client, enterprise):
        TaxRate.objects.create(enterprise=enterprise, name="TVA", rate=Decimal("19.25"))
        r = admin_client.get(URL_TAX_RATES)
        assert r.status_code == 200
        assert len(r.data["results"]) >= 1

    def test_filter_active(self, admin_client, enterprise):
        TaxRate.objects.create(enterprise=enterprise, name="Active", rate=Decimal("10"), is_active=True)
        TaxRate.objects.create(enterprise=enterprise, name="Inactive", rate=Decimal("5"), is_active=False)
        r = admin_client.get(URL_TAX_RATES, {"is_active": True})
        assert r.status_code == 200
        assert all(t["is_active"] for t in r.data["results"])


# ── Settings ─────────────────────────────────────────────────────────────


@pytest.mark.django_db
class TestAccountingSettings:
    def test_get_or_create_settings(self, admin_client):
        r = admin_client.get(URL_SETTINGS)
        assert r.status_code == 200

    def test_update_settings(self, admin_client, account_701):
        # First get (auto-creates)
        admin_client.get(URL_SETTINGS)
        settings = AccountingSettings.objects.first()
        r = admin_client.patch(f"{URL_SETTINGS}{settings.pk}/", {
            "default_sales_account": str(account_701.pk),
            "auto_post_entries": True,
        }, format="json")
        assert r.status_code == 200


# ── Authorization ────────────────────────────────────────────────────────


@pytest.mark.django_db
class TestAccountingAuthorization:
    def test_sales_user_cannot_access_accounts(self, sales_client):
        r = sales_client.get(URL_ACCOUNTS)
        assert r.status_code == 403

    def test_sales_user_cannot_access_entries(self, sales_client):
        r = sales_client.get(URL_ENTRIES)
        assert r.status_code == 403

    def test_unauthenticated_rejected(self, api_client):
        r = api_client.get(URL_ACCOUNTS)
        assert r.status_code in (401, 403)

    def test_disabled_module_rejected(self, admin_client, store):
        ent = store.enterprise
        flags = ent.analytics_feature_flags or {}
        flags["accounting"] = False
        ent.analytics_feature_flags = flags
        ent.save(update_fields=["analytics_feature_flags"])

        r = admin_client.get(URL_ACCOUNTS)
        assert r.status_code == 403
