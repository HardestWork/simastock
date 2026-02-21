"""Tests for expense module API endpoints."""
from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from expenses.models import ExpenseCategory, Wallet
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
