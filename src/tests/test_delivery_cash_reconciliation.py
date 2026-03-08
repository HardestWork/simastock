"""Tests for delivery cash reconciliation (payout_amount + auto-expense + CashShift)."""
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from cashier.models import CashShift
from delivery.models import Delivery, DeliveryAgent, DeliveryZone
from expenses.models import Expense, ExpenseCategory, Wallet
from stores.models import Store, StoreUser

User = get_user_model()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _enable_delivery(store):
    ent = store.enterprise
    flags = ent.analytics_feature_flags or {}
    flags["delivery_management"] = True
    ent.analytics_feature_flags = flags
    ent.save(update_fields=["analytics_feature_flags"])


def _make_cat(store):
    cat, _ = ExpenseCategory.objects.get_or_create(
        enterprise=store.enterprise,
        name="Frais de livraison",
        defaults={"type": "VARIABLE"},
    )
    return cat


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def delivery_store(store):
    _enable_delivery(store)
    return store


@pytest.fixture
def delivery_client(api_client, admin_user, delivery_store):
    api_client.force_authenticate(user=admin_user)
    return api_client


@pytest.fixture
def zone(delivery_store):
    return DeliveryZone.objects.create(
        store=delivery_store,
        name="Centre-ville",
        fee=Decimal("1500.00"),
        estimated_minutes=30,
    )


@pytest.fixture
def agent(delivery_store):
    return DeliveryAgent.objects.create(
        store=delivery_store,
        name="Moussa Traore",
        phone="+22670000001",
        vehicle_type="MOTO",
    )


@pytest.fixture
def cash_wallet(delivery_store):
    return Wallet.objects.create(
        store=delivery_store,
        name="Caisse principale",
        type=Wallet.WalletType.CASH,
        balance=Decimal("50000.00"),
        is_active=True,
    )


@pytest.fixture
def open_shift(delivery_store, admin_user):
    return CashShift.objects.create(
        store=delivery_store,
        cashier=admin_user,
        status=CashShift.Status.OPEN,
        opening_float=Decimal("10000.00"),
        expected_cash=Decimal("10000.00"),
        total_cash_payments=Decimal("0.00"),
    )


@pytest.fixture
def delivery(delivery_store, zone, agent):
    return Delivery.objects.create(
        store=delivery_store,
        zone=zone,
        agent=agent,
        delivery_address="123 Rue de la Paix",
        recipient_name="Aminata Diallo",
        recipient_phone="+22670000002",
        payout_amount=Decimal("1500.00"),
    )


# ---------------------------------------------------------------------------
# 1. payout_amount auto-populated from zone.fee
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_create_delivery_autofills_payout_from_zone(delivery_client, zone, agent):
    """payout_amount must be auto-set to zone.fee when not provided."""
    r = delivery_client.post(
        "/api/v1/delivery/deliveries/",
        {
            "zone": str(zone.id),
            "agent": str(agent.id),
            "delivery_address": "Av Kwame Nkrumah",
            "recipient_name": "Fatou Sow",
            "recipient_phone": "+22670000004",
        },
        format="json",
    )
    assert r.status_code == 201
    assert r.data["payout_amount"] == "1500.00"


@pytest.mark.django_db
def test_create_delivery_custom_payout_amount(delivery_client, zone, agent):
    """payout_amount provided by user must override zone.fee."""
    r = delivery_client.post(
        "/api/v1/delivery/deliveries/",
        {
            "zone": str(zone.id),
            "agent": str(agent.id),
            "delivery_address": "Av Kwame Nkrumah",
            "recipient_name": "Fatou Sow",
            "recipient_phone": "+22670000004",
            "payout_amount": "2000.00",
        },
        format="json",
    )
    assert r.status_code == 201
    assert r.data["payout_amount"] == "2000.00"


@pytest.mark.django_db
def test_create_delivery_no_zone_no_payout(delivery_client):
    """Without zone, payout_amount stays null."""
    r = delivery_client.post(
        "/api/v1/delivery/deliveries/",
        {
            "delivery_address": "Av Kwame Nkrumah",
            "recipient_name": "Fatou Sow",
            "recipient_phone": "+22670000004",
        },
        format="json",
    )
    assert r.status_code == 201
    assert r.data["payout_amount"] is None


# ---------------------------------------------------------------------------
# 2. Auto-expense on confirm_pickup (IN_TRANSIT)
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_in_transit_creates_expense(delivery_client, delivery, cash_wallet):
    """confirm_pickup must create a CASH expense and transition to IN_TRANSIT."""
    assert Expense.objects.count() == 0

    delivery.refresh_from_db()
    r = delivery_client.post(
        f"/api/v1/delivery/deliveries/{delivery.id}/confirm-pickup/",
        {"code": delivery.pickup_code},
        format="json",
    )
    assert r.status_code == 200

    expense = Expense.objects.filter(store=delivery.store).first()
    assert expense is not None
    assert expense.amount == Decimal("1500.00")
    assert expense.status == Expense.Status.POSTED
    assert expense.wallet.type == Wallet.WalletType.CASH

    delivery.refresh_from_db()
    assert delivery.expense_id == expense.id
    assert r.data["expense_number"] == expense.expense_number


@pytest.mark.django_db
def test_in_transit_expense_idempotent(delivery_client, delivery, cash_wallet, admin_user):
    """confirm_pickup when expense already exists must not create a second expense."""
    cat = _make_cat(delivery.store)
    existing_expense = Expense.objects.create(
        expense_number="EXP-TEST-001",
        store=delivery.store,
        category=cat,
        wallet=cash_wallet,
        amount=Decimal("1500.00"),
        description="Livraison test",
        expense_date=timezone.localdate(),
        created_by=admin_user,
        status=Expense.Status.POSTED,
    )
    delivery.expense = existing_expense
    delivery.save(update_fields=["expense"])

    delivery.refresh_from_db()
    r = delivery_client.post(
        f"/api/v1/delivery/deliveries/{delivery.id}/confirm-pickup/",
        {"code": delivery.pickup_code},
        format="json",
    )
    assert r.status_code == 200
    # Still only 1 expense
    assert Expense.objects.filter(store=delivery.store).count() == 1


@pytest.mark.django_db
def test_other_statuses_do_not_create_expense(delivery_client, delivery, cash_wallet):
    """PREPARING / READY do not auto-create a cash expense."""
    for status_val in ("PREPARING", "READY"):
        r = delivery_client.post(
            f"/api/v1/delivery/deliveries/{delivery.id}/update-status/",
            {"status": status_val},
            format="json",
        )
        assert r.status_code == 200
    assert Expense.objects.count() == 0


# ---------------------------------------------------------------------------
# 3. CashShift.expected_cash decremented in real time
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_in_transit_decrements_shift_expected_cash(delivery_client, delivery, cash_wallet, open_shift):
    """expected_cash of the open shift must decrease by payout_amount on confirm_pickup."""
    initial = open_shift.expected_cash  # 10000

    delivery.refresh_from_db()
    delivery_client.post(
        f"/api/v1/delivery/deliveries/{delivery.id}/confirm-pickup/",
        {"code": delivery.pickup_code},
        format="json",
    )

    open_shift.refresh_from_db()
    assert open_shift.expected_cash == initial - Decimal("1500.00")


@pytest.mark.django_db
def test_no_shift_does_not_crash(delivery_client, delivery, cash_wallet):
    """If no open shift exists, confirm_pickup must still succeed."""
    assert CashShift.objects.filter(status=CashShift.Status.OPEN).count() == 0

    delivery.refresh_from_db()
    r = delivery_client.post(
        f"/api/v1/delivery/deliveries/{delivery.id}/confirm-pickup/",
        {"code": delivery.pickup_code},
        format="json",
    )
    assert r.status_code == 200


# ---------------------------------------------------------------------------
# 4. calculate_expected_cash subtracts CASH expenses
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_calculate_expected_cash_subtracts_cash_expenses(delivery_store, admin_user, cash_wallet):
    """expected_cash = opening + cash_payments - cash_expenses during shift."""
    shift = CashShift.objects.create(
        store=delivery_store,
        cashier=admin_user,
        status=CashShift.Status.OPEN,
        opening_float=Decimal("5000.00"),
        total_cash_payments=Decimal("20000.00"),
        expected_cash=Decimal("25000.00"),
    )

    cat = _make_cat(delivery_store)
    Expense.objects.create(
        expense_number="EXP-TEST-002",
        store=delivery_store,
        category=cat,
        wallet=cash_wallet,
        amount=Decimal("1500.00"),
        description="Frais livraison test",
        expense_date=timezone.localdate(),
        created_by=admin_user,
        status=Expense.Status.POSTED,
    )

    result = shift.calculate_expected_cash()
    # 5000 + 20000 - 1500 = 23500
    assert result == Decimal("23500.00")
    assert shift.expected_cash == Decimal("23500.00")


@pytest.mark.django_db
def test_calculate_expected_cash_ignores_non_cash_expenses(delivery_store, admin_user):
    """BANK expenses must NOT be subtracted from expected_cash."""
    shift = CashShift.objects.create(
        store=delivery_store,
        cashier=admin_user,
        status=CashShift.Status.OPEN,
        opening_float=Decimal("5000.00"),
        total_cash_payments=Decimal("10000.00"),
        expected_cash=Decimal("15000.00"),
    )

    bank_wallet = Wallet.objects.create(
        store=delivery_store,
        name="Banque",
        type=Wallet.WalletType.BANK,
        balance=Decimal("100000.00"),
    )
    cat = _make_cat(delivery_store)
    Expense.objects.create(
        expense_number="EXP-TEST-003",
        store=delivery_store,
        category=cat,
        wallet=bank_wallet,
        amount=Decimal("3000.00"),
        description="Frais banque test",
        expense_date=timezone.localdate(),
        created_by=admin_user,
        status=Expense.Status.POSTED,
    )

    result = shift.calculate_expected_cash()
    # 5000 + 10000 - 0 (BANK not subtracted) = 15000
    assert result == Decimal("15000.00")


@pytest.mark.django_db
def test_calculate_expected_cash_no_expenses(delivery_store, admin_user):
    """When there are no expenses, expected_cash = opening + cash_payments."""
    shift = CashShift.objects.create(
        store=delivery_store,
        cashier=admin_user,
        status=CashShift.Status.OPEN,
        opening_float=Decimal("5000.00"),
        total_cash_payments=Decimal("12000.00"),
        expected_cash=Decimal("0.00"),
    )
    result = shift.calculate_expected_cash()
    assert result == Decimal("17000.00")
