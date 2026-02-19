"""Business logic / service functions for the credits app.

All balance-modifying operations use ``select_for_update()`` to prevent
race conditions when multiple requests touch the same account concurrently.
"""
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from .models import CreditLedgerEntry, CustomerAccount, PaymentSchedule


# ---------------------------------------------------------------------------
# get_or_create_account
# ---------------------------------------------------------------------------

def get_or_create_account(store, customer) -> CustomerAccount:
    """Return the credit account for the given store/customer, creating one
    if it does not yet exist.

    The new account is created with a zero credit limit and zero balance.
    """
    account, _created = CustomerAccount.objects.get_or_create(
        store=store,
        customer=customer,
        defaults={
            "credit_limit": Decimal("0.00"),
            "balance": Decimal("0.00"),
            "is_active": True,
        },
    )
    return account


# ---------------------------------------------------------------------------
# record_credit_sale
# ---------------------------------------------------------------------------

@transaction.atomic
def record_credit_sale(account, sale, amount, actor) -> CreditLedgerEntry:
    """Record a sale on credit: increases the customer's outstanding balance.

    Parameters
    ----------
    account : CustomerAccount
        The credit account to debit.
    sale : sales.Sale
        The related sale object.
    amount : Decimal
        The amount sold on credit (positive value).
    actor : User
        The user recording this transaction.

    Returns
    -------
    CreditLedgerEntry
        The newly created ledger entry.
    """
    if amount <= 0:
        raise ValueError("Le montant de la vente a credit doit etre positif.")

    # Lock the account row to prevent concurrent modifications
    locked_account = (
        CustomerAccount.objects
        .select_for_update()
        .get(pk=account.pk)
    )

    locked_account.balance += amount
    locked_account.save(update_fields=["balance", "updated_at"])

    entry = CreditLedgerEntry.objects.create(
        account=locked_account,
        entry_type=CreditLedgerEntry.EntryType.SALE_ON_CREDIT,
        amount=amount,
        balance_after=locked_account.balance,
        reference=f"Vente {sale.invoice_number}" if sale.invoice_number else f"Vente {str(sale.pk)[:8]}",
        sale=sale,
        created_by=actor,
    )
    return entry


# ---------------------------------------------------------------------------
# record_credit_payment
# ---------------------------------------------------------------------------

@transaction.atomic
def record_credit_payment(
    account,
    amount,
    reference,
    actor,
    sale=None,
) -> CreditLedgerEntry:
    """Record a payment against the customer's credit balance.

    Parameters
    ----------
    account : CustomerAccount
        The credit account to credit.
    amount : Decimal
        The payment amount (positive value; will be stored as negative in
        the ledger to reduce the balance).
    reference : str
        An optional reference string for the payment.
    actor : User
        The user recording this transaction.
    sale : sales.Sale, optional
        An optional related sale.

    Returns
    -------
    CreditLedgerEntry
        The newly created ledger entry.
    """
    if amount <= 0:
        raise ValueError("Le montant du paiement doit etre positif.")

    # Lock the account row
    locked_account = (
        CustomerAccount.objects
        .select_for_update()
        .get(pk=account.pk)
    )

    if amount > locked_account.balance:
        raise ValueError(
            "Le montant rembourse ne peut pas depasser le solde du credit."
        )

    locked_account.balance -= amount
    locked_account.save(update_fields=["balance", "updated_at"])

    entry = CreditLedgerEntry.objects.create(
        account=locked_account,
        entry_type=CreditLedgerEntry.EntryType.CREDIT_PAYMENT,
        amount=-amount,  # negative = decreases balance
        balance_after=locked_account.balance,
        reference=reference or "",
        sale=sale,
        created_by=actor,
    )
    return entry


# ---------------------------------------------------------------------------
# create_payment_schedule
# ---------------------------------------------------------------------------

@transaction.atomic
def create_payment_schedule(account, sale, installments) -> list:
    """Create a series of payment schedule entries for a credit account.

    Parameters
    ----------
    account : CustomerAccount
        The credit account.
    sale : sales.Sale or None
        The related sale (can be None for manual schedules).
    installments : list[dict]
        A list of dicts, each with ``"due_date"`` (date) and ``"amount"``
        (Decimal).

    Returns
    -------
    list[PaymentSchedule]
        The created payment schedule objects.
    """
    schedules = []
    for inst in installments:
        schedule = PaymentSchedule.objects.create(
            account=account,
            sale=sale,
            due_date=inst["due_date"],
            amount_due=inst["amount"],
            amount_paid=Decimal("0.00"),
            status=PaymentSchedule.Status.PENDING,
        )
        schedules.append(schedule)
    return schedules


# ---------------------------------------------------------------------------
# check_credit_availability
# ---------------------------------------------------------------------------

def check_credit_availability(account, amount) -> bool:
    """Return True if the account has enough available credit for the given
    amount.

    Parameters
    ----------
    account : CustomerAccount
        The credit account to check.
    amount : Decimal
        The amount to check against available credit.

    Returns
    -------
    bool
        True if ``available_credit >= amount``, False otherwise.
    """
    return account.available_credit >= amount


# ---------------------------------------------------------------------------
# get_overdue_accounts
# ---------------------------------------------------------------------------

def get_overdue_accounts(store):
    """Return all credit accounts in the store that have at least one overdue
    payment schedule.

    Parameters
    ----------
    store : stores.Store
        The store to filter by.

    Returns
    -------
    QuerySet[CustomerAccount]
        Accounts with overdue schedules.
    """
    today = timezone.now().date()
    overdue_account_ids = (
        PaymentSchedule.objects
        .filter(
            account__store=store,
            due_date__lt=today,
            status__in=[
                PaymentSchedule.Status.PENDING,
                PaymentSchedule.Status.PARTIAL,
                PaymentSchedule.Status.OVERDUE,
            ],
        )
        .values_list("account_id", flat=True)
        .distinct()
    )
    return (
        CustomerAccount.objects
        .filter(pk__in=overdue_account_ids)
        .select_related("customer", "store")
    )


# ---------------------------------------------------------------------------
# update_overdue_statuses
# ---------------------------------------------------------------------------

def update_overdue_statuses() -> int:
    """Update all payment schedules whose due date has passed to OVERDUE status.

    Only updates schedules that are currently PENDING or PARTIAL.

    Returns
    -------
    int
        The number of schedules updated.
    """
    today = timezone.now().date()
    updated = PaymentSchedule.objects.filter(
        due_date__lt=today,
        status__in=[
            PaymentSchedule.Status.PENDING,
            PaymentSchedule.Status.PARTIAL,
        ],
    ).update(status=PaymentSchedule.Status.OVERDUE)
    return updated
