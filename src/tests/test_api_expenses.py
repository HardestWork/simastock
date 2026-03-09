"""Tests for expense module API endpoints."""
from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from expenses.models import Budget, ExpenseCategory, RecurringExpense, Wallet
from expenses.services import create_expense


def _create_category(client, store):
    resp = client.post(
        "/api/v1/expense-categories/",
        {
            "store": str(store.id),
            "name": "Transport",
            "type": "VARIABLE",
        },
        format="json",
    )
    assert resp.status_code == 201, resp.data
    return resp.data


def _create_wallet(client, store, initial_balance="100000.00"):
    resp = client.post(
        "/api/v1/wallets/",
        {
            "store": str(store.id),
            "name": "Caisse Test",
            "type": "CASH",
            "initial_balance": initial_balance,
        },
        format="json",
    )
    assert resp.status_code == 201, resp.data
    return resp.data


@pytest.mark.django_db
def test_admin_can_create_expense_and_wallet_is_decremented(admin_client, store):
    category = _create_category(admin_client, store)
    wallet = _create_wallet(admin_client, store, "100000.00")

    create_resp = admin_client.post(
        "/api/v1/expenses/",
        {
            "store": str(store.id),
            "category": category["id"],
            "wallet": wallet["id"],
            "amount": "15000.00",
            "description": "Taxi livraison",
            "expense_date": timezone.now().date().isoformat(),
        },
        format="json",
    )
    assert create_resp.status_code == 201, create_resp.data
    assert create_resp.data["status"] == "POSTED"
    assert create_resp.data["expense_number"].startswith("EXP-")

    wallet_obj = Wallet.objects.get(pk=wallet["id"])
    assert wallet_obj.balance == Decimal("85000.00")


@pytest.mark.django_db
def test_sales_user_cannot_create_expense(sales_client, store):
    category = ExpenseCategory.objects.create(
        enterprise=store.enterprise,
        store=store,
        name="Non autorisee",
        type=ExpenseCategory.CategoryType.VARIABLE,
    )
    wallet = Wallet.objects.create(
        store=store,
        name="Caisse Vente",
        type=Wallet.WalletType.CASH,
        balance=Decimal("50000.00"),
    )

    resp = sales_client.post(
        "/api/v1/expenses/",
        {
            "store": str(store.id),
            "category": str(category.id),
            "wallet": str(wallet.id),
            "amount": "5000.00",
            "description": "Tentative non autorisee",
            "expense_date": timezone.now().date().isoformat(),
        },
        format="json",
    )
    assert resp.status_code == 403


@pytest.mark.django_db
def test_void_expense_restores_wallet_balance(admin_client, store):
    category = _create_category(admin_client, store)
    wallet = _create_wallet(admin_client, store, "80000.00")

    create_resp = admin_client.post(
        "/api/v1/expenses/",
        {
            "store": str(store.id),
            "category": category["id"],
            "wallet": wallet["id"],
            "amount": "30000.00",
            "description": "Achat fournitures",
            "expense_date": timezone.now().date().isoformat(),
        },
        format="json",
    )
    assert create_resp.status_code == 201
    expense_id = create_resp.data["id"]

    wallet_obj = Wallet.objects.get(pk=wallet["id"])
    assert wallet_obj.balance == Decimal("50000.00")

    void_resp = admin_client.post(
        f"/api/v1/expenses/{expense_id}/void/",
        {"reason": "Saisie en double"},
        format="json",
    )
    assert void_resp.status_code == 200, void_resp.data
    assert void_resp.data["status"] == "VOIDED"

    wallet_obj.refresh_from_db()
    assert wallet_obj.balance == Decimal("80000.00")


@pytest.mark.django_db
def test_manager_cannot_void_expense_older_than_24h(manager_client, admin_user, store):
    category = ExpenseCategory.objects.create(
        enterprise=store.enterprise,
        store=store,
        name="Maintenance IT",
        type=ExpenseCategory.CategoryType.VARIABLE,
    )
    wallet = Wallet.objects.create(
        store=store,
        name="Banque principale",
        type=Wallet.WalletType.BANK,
        balance=Decimal("120000.00"),
    )
    expense = create_expense(
        store=store,
        category=category,
        wallet=wallet,
        amount=Decimal("10000.00"),
        description="Frais divers",
        expense_date=timezone.now().date(),
        created_by=admin_user,
    )
    old_dt = timezone.now() - timedelta(hours=25)
    expense.created_at = old_dt
    expense.save(update_fields=["created_at", "updated_at"])

    resp = manager_client.post(
        f"/api/v1/expenses/{expense.id}/void/",
        {"reason": "Test verrou"},
        format="json",
    )
    assert resp.status_code == 400
    assert "24h" in str(resp.data)


# ---------------------------------------------------------------------------
# TestExpenseCategoryCRUD
# ---------------------------------------------------------------------------
class TestExpenseCategoryCRUD:
    """CRUD and filtering tests for ExpenseCategoryViewSet."""

    @pytest.mark.django_db
    def test_create_category_as_admin(self, admin_client, store):
        resp = admin_client.post(
            "/api/v1/expense-categories/",
            {
                "store": str(store.id),
                "name": "Fournitures",
                "type": "FIXED",
            },
            format="json",
        )
        assert resp.status_code == 201, resp.data
        assert resp.data["name"] == "Fournitures"
        assert resp.data["type"] == "FIXED"
        assert resp.data["is_active"] is True

    @pytest.mark.django_db
    def test_create_global_category_without_store(self, admin_client, store):
        """Category scoped at enterprise level (store=null)."""
        resp = admin_client.post(
            "/api/v1/expense-categories/",
            {
                "name": "Frais generaux",
                "type": "VARIABLE",
            },
            format="json",
        )
        assert resp.status_code == 201, resp.data
        assert resp.data["store"] is None

    @pytest.mark.django_db
    def test_list_categories(self, admin_client, store):
        # Create two categories
        for name in ("Loyer", "Electricite"):
            admin_client.post(
                "/api/v1/expense-categories/",
                {"store": str(store.id), "name": name, "type": "FIXED"},
                format="json",
            )
        resp = admin_client.get("/api/v1/expense-categories/")
        assert resp.status_code == 200
        results = resp.data.get("results", resp.data)
        assert len(results) >= 2

    @pytest.mark.django_db
    def test_filter_categories_by_type(self, admin_client, store):
        admin_client.post(
            "/api/v1/expense-categories/",
            {"store": str(store.id), "name": "Stock Materiel", "type": "STOCK"},
            format="json",
        )
        admin_client.post(
            "/api/v1/expense-categories/",
            {"store": str(store.id), "name": "Taxi", "type": "VARIABLE"},
            format="json",
        )
        resp = admin_client.get("/api/v1/expense-categories/", {"type": "STOCK"})
        assert resp.status_code == 200
        results = resp.data.get("results", resp.data)
        assert all(c["type"] == "STOCK" for c in results)

    @pytest.mark.django_db
    def test_sales_user_cannot_manage_categories(self, sales_client, store):
        resp = sales_client.post(
            "/api/v1/expense-categories/",
            {"store": str(store.id), "name": "Interdit", "type": "VARIABLE"},
            format="json",
        )
        assert resp.status_code == 403

    @pytest.mark.django_db
    def test_soft_delete_category(self, admin_client, store):
        create_resp = admin_client.post(
            "/api/v1/expense-categories/",
            {"store": str(store.id), "name": "A supprimer", "type": "VARIABLE"},
            format="json",
        )
        assert create_resp.status_code == 201
        cat_id = create_resp.data["id"]
        del_resp = admin_client.delete(f"/api/v1/expense-categories/{cat_id}/")
        assert del_resp.status_code == 204
        cat = ExpenseCategory.objects.get(pk=cat_id)
        assert cat.is_active is False

    @pytest.mark.django_db
    def test_duplicate_category_name_rejected(self, admin_client, store):
        from django.db.utils import IntegrityError as DjIntegrityError
        payload = {"store": str(store.id), "name": "Unique Cat", "type": "VARIABLE"}
        resp1 = admin_client.post("/api/v1/expense-categories/", payload, format="json")
        assert resp1.status_code == 201
        with pytest.raises(DjIntegrityError):
            admin_client.post("/api/v1/expense-categories/", payload, format="json")


# ---------------------------------------------------------------------------
# TestWalletCRUD
# ---------------------------------------------------------------------------
class TestWalletCRUD:
    """CRUD tests for WalletViewSet."""

    @pytest.mark.django_db
    def test_create_wallet_cash(self, admin_client, store):
        resp = admin_client.post(
            "/api/v1/wallets/",
            {
                "store": str(store.id),
                "name": "Caisse Principale",
                "type": "CASH",
                "initial_balance": "50000.00",
            },
            format="json",
        )
        assert resp.status_code == 201, resp.data
        assert resp.data["balance"] == "50000.00"
        assert resp.data["type"] == "CASH"

    @pytest.mark.django_db
    def test_create_wallet_bank(self, admin_client, store):
        resp = admin_client.post(
            "/api/v1/wallets/",
            {
                "store": str(store.id),
                "name": "Banque SGBCI",
                "type": "BANK",
                "initial_balance": "200000.00",
            },
            format="json",
        )
        assert resp.status_code == 201
        assert resp.data["type"] == "BANK"

    @pytest.mark.django_db
    def test_create_wallet_mobile_money(self, admin_client, store):
        resp = admin_client.post(
            "/api/v1/wallets/",
            {
                "store": str(store.id),
                "name": "Orange Money",
                "type": "MOBILE_MONEY",
                "initial_balance": "25000.00",
            },
            format="json",
        )
        assert resp.status_code == 201
        assert resp.data["type"] == "MOBILE_MONEY"

    @pytest.mark.django_db
    def test_list_wallets(self, admin_client, store):
        for name in ("Caisse A", "Caisse B"):
            admin_client.post(
                "/api/v1/wallets/",
                {"store": str(store.id), "name": name, "type": "CASH", "initial_balance": "10000.00"},
                format="json",
            )
        resp = admin_client.get("/api/v1/wallets/")
        assert resp.status_code == 200
        results = resp.data.get("results", resp.data)
        assert len(results) >= 2

    @pytest.mark.django_db
    def test_sales_user_cannot_manage_wallets(self, sales_client, store):
        resp = sales_client.post(
            "/api/v1/wallets/",
            {"store": str(store.id), "name": "Non autorise", "type": "CASH", "initial_balance": "0"},
            format="json",
        )
        assert resp.status_code == 403

    @pytest.mark.django_db
    def test_soft_delete_wallet(self, admin_client, store):
        create_resp = admin_client.post(
            "/api/v1/wallets/",
            {"store": str(store.id), "name": "A supprimer", "type": "CASH", "initial_balance": "0"},
            format="json",
        )
        assert create_resp.status_code == 201
        wallet_id = create_resp.data["id"]
        del_resp = admin_client.delete(f"/api/v1/wallets/{wallet_id}/")
        assert del_resp.status_code == 204
        w = Wallet.objects.get(pk=wallet_id)
        assert w.is_active is False

    @pytest.mark.django_db
    def test_update_wallet_balance_via_new_balance(self, admin_client, store):
        create_resp = admin_client.post(
            "/api/v1/wallets/",
            {"store": str(store.id), "name": "Ajustable", "type": "CASH", "initial_balance": "10000.00"},
            format="json",
        )
        assert create_resp.status_code == 201
        wallet_id = create_resp.data["id"]

        patch_resp = admin_client.patch(
            f"/api/v1/wallets/{wallet_id}/",
            {"new_balance": "75000.00"},
            format="json",
        )
        assert patch_resp.status_code == 200
        assert patch_resp.data["balance"] == "75000.00"

    @pytest.mark.django_db
    def test_duplicate_wallet_name_same_store_rejected(self, admin_client, store):
        payload = {"store": str(store.id), "name": "Doublon", "type": "CASH", "initial_balance": "0"}
        resp1 = admin_client.post("/api/v1/wallets/", payload, format="json")
        assert resp1.status_code == 201
        resp2 = admin_client.post("/api/v1/wallets/", payload, format="json")
        assert resp2.status_code == 400


# ---------------------------------------------------------------------------
# TestBudgetCRUD
# ---------------------------------------------------------------------------
class TestBudgetCRUD:
    """CRUD tests for BudgetViewSet."""

    @pytest.mark.django_db
    def test_create_global_budget(self, admin_client, store):
        resp = admin_client.post(
            "/api/v1/expense-budgets/",
            {
                "store": str(store.id),
                "period": "2026-03",
                "limit_amount": "500000.00",
                "alert_threshold_percent": 80,
            },
            format="json",
        )
        assert resp.status_code == 201, resp.data
        assert resp.data["period"] == "2026-03"
        assert resp.data["limit_amount"] == "500000.00"
        assert resp.data["category"] is None

    @pytest.mark.django_db
    def test_create_category_budget(self, admin_client, store):
        cat = _create_category(admin_client, store)
        resp = admin_client.post(
            "/api/v1/expense-budgets/",
            {
                "store": str(store.id),
                "category": cat["id"],
                "period": "2026-04",
                "limit_amount": "150000.00",
                "alert_threshold_percent": 70,
            },
            format="json",
        )
        assert resp.status_code == 201, resp.data
        assert str(resp.data["category"]) == str(cat["id"])

    @pytest.mark.django_db
    def test_list_budgets(self, admin_client, store):
        admin_client.post(
            "/api/v1/expense-budgets/",
            {"store": str(store.id), "period": "2026-01", "limit_amount": "100000.00"},
            format="json",
        )
        admin_client.post(
            "/api/v1/expense-budgets/",
            {"store": str(store.id), "period": "2026-02", "limit_amount": "200000.00"},
            format="json",
        )
        resp = admin_client.get("/api/v1/expense-budgets/")
        assert resp.status_code == 200
        results = resp.data.get("results", resp.data)
        assert len(results) >= 2

    @pytest.mark.django_db
    def test_filter_budgets_by_period(self, admin_client, store):
        admin_client.post(
            "/api/v1/expense-budgets/",
            {"store": str(store.id), "period": "2026-05", "limit_amount": "300000.00"},
            format="json",
        )
        admin_client.post(
            "/api/v1/expense-budgets/",
            {"store": str(store.id), "period": "2026-06", "limit_amount": "400000.00"},
            format="json",
        )
        resp = admin_client.get("/api/v1/expense-budgets/", {"period": "2026-05"})
        assert resp.status_code == 200
        results = resp.data.get("results", resp.data)
        assert all(b["period"] == "2026-05" for b in results)

    @pytest.mark.django_db
    def test_sales_user_cannot_manage_budgets(self, sales_client, store):
        resp = sales_client.post(
            "/api/v1/expense-budgets/",
            {"store": str(store.id), "period": "2026-03", "limit_amount": "100000.00"},
            format="json",
        )
        assert resp.status_code == 403

    @pytest.mark.django_db
    def test_invalid_period_format_rejected(self, admin_client, store):
        resp = admin_client.post(
            "/api/v1/expense-budgets/",
            {"store": str(store.id), "period": "2026/03", "limit_amount": "100000.00"},
            format="json",
        )
        assert resp.status_code == 400

    @pytest.mark.django_db
    def test_update_budget_limit(self, admin_client, store):
        create_resp = admin_client.post(
            "/api/v1/expense-budgets/",
            {"store": str(store.id), "period": "2026-07", "limit_amount": "100000.00"},
            format="json",
        )
        assert create_resp.status_code == 201
        budget_id = create_resp.data["id"]

        patch_resp = admin_client.patch(
            f"/api/v1/expense-budgets/{budget_id}/",
            {"limit_amount": "250000.00"},
            format="json",
        )
        assert patch_resp.status_code == 200
        assert patch_resp.data["limit_amount"] == "250000.00"


# ---------------------------------------------------------------------------
# TestRecurringExpense
# ---------------------------------------------------------------------------
class TestRecurringExpense:
    """CRUD and run_due tests for RecurringExpenseViewSet."""

    @pytest.mark.django_db
    def test_create_recurring_expense(self, admin_client, store):
        category = _create_category(admin_client, store)
        wallet = _create_wallet(admin_client, store, "200000.00")

        resp = admin_client.post(
            "/api/v1/recurring-expenses/",
            {
                "store": str(store.id),
                "category": category["id"],
                "wallet": wallet["id"],
                "amount": "25000.00",
                "description": "Loyer mensuel",
                "frequency": "MONTHLY",
                "next_run_date": "2026-04-01",
            },
            format="json",
        )
        assert resp.status_code == 201, resp.data
        assert resp.data["frequency"] == "MONTHLY"
        assert resp.data["next_run_date"] == "2026-04-01"
        assert resp.data["is_active"] is True

    @pytest.mark.django_db
    def test_create_weekly_recurring_expense(self, admin_client, store):
        category = _create_category(admin_client, store)
        wallet = _create_wallet(admin_client, store, "100000.00")

        resp = admin_client.post(
            "/api/v1/recurring-expenses/",
            {
                "store": str(store.id),
                "category": category["id"],
                "wallet": wallet["id"],
                "amount": "5000.00",
                "description": "Nettoyage hebdomadaire",
                "frequency": "WEEKLY",
                "next_run_date": "2026-03-16",
            },
            format="json",
        )
        assert resp.status_code == 201
        assert resp.data["frequency"] == "WEEKLY"

    @pytest.mark.django_db
    def test_list_recurring_expenses(self, admin_client, store):
        category = _create_category(admin_client, store)
        wallet = _create_wallet(admin_client, store, "500000.00")

        for desc in ("Loyer", "Internet"):
            admin_client.post(
                "/api/v1/recurring-expenses/",
                {
                    "store": str(store.id),
                    "category": category["id"],
                    "wallet": wallet["id"],
                    "amount": "10000.00",
                    "description": desc,
                    "frequency": "MONTHLY",
                    "next_run_date": "2026-04-01",
                },
                format="json",
            )
        resp = admin_client.get("/api/v1/recurring-expenses/")
        assert resp.status_code == 200
        results = resp.data.get("results", resp.data)
        assert len(results) >= 2

    @pytest.mark.django_db
    def test_run_due_generates_expenses(self, admin_client, admin_user, store):
        """run_due action should create expenses for templates whose next_run_date <= today."""
        category = ExpenseCategory.objects.create(
            enterprise=store.enterprise,
            store=store,
            name="Abonnement",
            type=ExpenseCategory.CategoryType.FIXED,
        )
        wallet = Wallet.objects.create(
            store=store,
            name="Caisse Run Due",
            type=Wallet.WalletType.CASH,
            balance=Decimal("300000.00"),
        )
        today = timezone.now().date()
        RecurringExpense.objects.create(
            store=store,
            category=category,
            wallet=wallet,
            amount=Decimal("15000.00"),
            description="Abonnement Internet",
            frequency=RecurringExpense.Frequency.MONTHLY,
            next_run_date=today,
            is_active=True,
            created_by=admin_user,
        )
        resp = admin_client.post(
            "/api/v1/recurring-expenses/run_due/",
            {"store": str(store.id), "run_date": today.isoformat()},
            format="json",
        )
        assert resp.status_code == 200, resp.data
        assert resp.data["generated_count"] >= 1
        assert len(resp.data["generated_ids"]) >= 1

    @pytest.mark.django_db
    def test_run_due_skips_future_templates(self, admin_client, admin_user, store):
        """Templates with next_run_date in the future should not be executed."""
        category = ExpenseCategory.objects.create(
            enterprise=store.enterprise,
            store=store,
            name="Futur",
            type=ExpenseCategory.CategoryType.VARIABLE,
        )
        wallet = Wallet.objects.create(
            store=store,
            name="Caisse Futur",
            type=Wallet.WalletType.CASH,
            balance=Decimal("100000.00"),
        )
        future_date = timezone.now().date() + timedelta(days=30)
        RecurringExpense.objects.create(
            store=store,
            category=category,
            wallet=wallet,
            amount=Decimal("10000.00"),
            description="Pas encore du",
            frequency=RecurringExpense.Frequency.MONTHLY,
            next_run_date=future_date,
            is_active=True,
            created_by=admin_user,
        )
        today = timezone.now().date()
        resp = admin_client.post(
            "/api/v1/recurring-expenses/run_due/",
            {"store": str(store.id), "run_date": today.isoformat()},
            format="json",
        )
        assert resp.status_code == 200
        assert resp.data["generated_count"] == 0

    @pytest.mark.django_db
    def test_sales_user_cannot_create_recurring_expense(self, sales_client, store):
        category = ExpenseCategory.objects.create(
            enterprise=store.enterprise,
            store=store,
            name="Blocked",
            type=ExpenseCategory.CategoryType.VARIABLE,
        )
        wallet = Wallet.objects.create(
            store=store,
            name="Caisse Sales",
            type=Wallet.WalletType.CASH,
            balance=Decimal("50000.00"),
        )
        resp = sales_client.post(
            "/api/v1/recurring-expenses/",
            {
                "store": str(store.id),
                "category": str(category.id),
                "wallet": str(wallet.id),
                "amount": "5000.00",
                "description": "Non autorise",
                "frequency": "MONTHLY",
                "next_run_date": "2026-04-01",
            },
            format="json",
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# TestExpenseExportCSV
# ---------------------------------------------------------------------------
class TestExpenseExportCSV:
    """Tests for the export-csv action on ExpenseViewSet."""

    @pytest.mark.django_db
    def test_export_csv_returns_csv_content_type(self, admin_client, store):
        category = _create_category(admin_client, store)
        wallet = _create_wallet(admin_client, store, "100000.00")

        admin_client.post(
            "/api/v1/expenses/",
            {
                "store": str(store.id),
                "category": category["id"],
                "wallet": wallet["id"],
                "amount": "12000.00",
                "description": "Export test",
                "expense_date": timezone.now().date().isoformat(),
            },
            format="json",
        )
        resp = admin_client.get("/api/v1/expenses/export-csv/")
        assert resp.status_code == 200
        content_type = resp.get("Content-Type", "")
        assert "text/csv" in content_type

    @pytest.mark.django_db
    def test_export_csv_contains_expense_data(self, admin_client, store):
        category = _create_category(admin_client, store)
        wallet = _create_wallet(admin_client, store, "100000.00")

        admin_client.post(
            "/api/v1/expenses/",
            {
                "store": str(store.id),
                "category": category["id"],
                "wallet": wallet["id"],
                "amount": "7500.00",
                "description": "Achat papeterie",
                "expense_date": timezone.now().date().isoformat(),
            },
            format="json",
        )
        resp = admin_client.get("/api/v1/expenses/export-csv/")
        assert resp.status_code == 200
        content = resp.content.decode("utf-8")
        assert "Numero" in content
        assert "Achat papeterie" in content

    @pytest.mark.django_db
    def test_export_csv_empty_when_no_expenses(self, admin_client, store):
        resp = admin_client.get("/api/v1/expenses/export-csv/")
        assert resp.status_code == 200
        content = resp.content.decode("utf-8")
        # Header row should still be present
        assert "Numero" in content
        # Count lines: header + possibly BOM, but no data rows
        lines = [line for line in content.strip().splitlines() if line.strip()]
        assert len(lines) <= 2  # header row (possibly with BOM prefix)

    @pytest.mark.django_db
    def test_sales_user_cannot_export_csv(self, sales_client, store):
        resp = sales_client.get("/api/v1/expenses/export-csv/")
        assert resp.status_code == 403
