"""Business services for expense posting, voiding, and recurring generation."""
from __future__ import annotations

import calendar
import logging
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.db.models import F
from django.utils import timezone

from expenses.models import Expense, ExpenseSequence, RecurringExpense, Wallet

logger = logging.getLogger("boutique")


@dataclass
class RecurringRunResult:
    """Result payload for recurring expense generation."""

    generated_count: int
    generated_ids: list[str]
    failed_count: int
    failures: list[dict]


def _is_admin_like(user) -> bool:
    return bool(getattr(user, "is_superuser", False) or getattr(user, "role", None) == "ADMIN")


def _assert_edit_allowed(expense: Expense, actor):
    if _is_admin_like(actor):
        return
    if expense.created_at <= timezone.now() - timedelta(hours=24):
        raise ValueError("Modification verrouillee apres 24h (reservee aux admins).")


def _validate_wallet_and_category(*, store, category, wallet):
    if wallet.store_id != store.id:
        raise ValueError("Le wallet ne correspond pas a la boutique selectionnee.")

    if category.enterprise_id != store.enterprise_id:
        raise ValueError("La categorie ne correspond pas a l'entreprise de la boutique.")

    if category.store_id and category.store_id != store.id:
        raise ValueError("La categorie n'est pas disponible pour cette boutique.")

    if not category.is_active:
        raise ValueError("La categorie selectionnee est inactive.")

    if not wallet.is_active:
        raise ValueError("Le wallet selectionne est inactif.")


def generate_expense_number(store, expense_date: date | None = None) -> str:
    """Generate the next monthly expense number `EXP-YYYY-MM-XXXX`."""
    target_date = expense_date or timezone.now().date()
    period = target_date.strftime("%Y-%m")

    for _attempt in range(3):
        try:
            with transaction.atomic():
                sequence, _created = ExpenseSequence.objects.select_for_update().get_or_create(
                    store=store,
                    period=period,
                    defaults={"next_number": 1},
                )
                current = sequence.next_number
                sequence.next_number = F("next_number") + 1
                sequence.save(update_fields=["next_number", "updated_at"])
                sequence.refresh_from_db(fields=["next_number"])
            return f"EXP-{period}-{int(current):04d}"
        except IntegrityError:
            # Rare race when sequence row is being created concurrently.
            continue

    raise ValueError("Impossible de generer le numero de depense. Reessayez.")


@transaction.atomic
def create_expense(
    *,
    store,
    category,
    wallet,
    amount: Decimal,
    description: str,
    created_by,
    expense_date: date | None = None,
    supplier_name: str = "",
) -> Expense:
    """Create a posted expense and decrement wallet balance atomically."""
    amount = Decimal(str(amount or "0"))
    if amount <= Decimal("0"):
        raise ValueError("Le montant doit etre strictement superieur a 0.")

    _validate_wallet_and_category(store=store, category=category, wallet=wallet)
    wallet_locked = Wallet.objects.select_for_update().get(pk=wallet.pk)
    if wallet_locked.balance < amount:
        raise ValueError("Solde wallet insuffisant pour enregistrer cette depense.")

    wallet_locked.balance -= amount
    wallet_locked.save(update_fields=["balance", "updated_at"])

    expense = Expense.objects.create(
        expense_number=generate_expense_number(store=store, expense_date=expense_date),
        store=store,
        category=category,
        wallet=wallet_locked,
        amount=amount,
        description=(description or "").strip(),
        supplier_name=(supplier_name or "").strip(),
        expense_date=expense_date or timezone.now().date(),
        created_by=created_by,
        status=Expense.Status.POSTED,
        posted_at=timezone.now(),
    )

    logger.info(
        "Expense posted: %s amount=%s wallet=%s by=%s",
        expense.expense_number,
        expense.amount,
        wallet_locked.pk,
        created_by,
    )
    return expense


@transaction.atomic
def update_expense(expense: Expense, *, actor, **changes) -> Expense:
    """Update a posted expense; wallet deltas are reconciled atomically."""
    locked_expense = Expense.objects.select_for_update().select_related("wallet", "store").get(pk=expense.pk)
    if locked_expense.status != Expense.Status.POSTED:
        raise ValueError("Seules les depenses validees peuvent etre modifiees.")

    _assert_edit_allowed(locked_expense, actor)

    if "store" in changes and changes["store"] and changes["store"].id != locked_expense.store_id:
        raise ValueError("Le changement de boutique n'est pas autorise.")

    next_category = changes.get("category", locked_expense.category)
    next_wallet = changes.get("wallet", locked_expense.wallet)
    next_amount = Decimal(str(changes.get("amount", locked_expense.amount)))

    if next_amount <= Decimal("0"):
        raise ValueError("Le montant doit etre strictement superieur a 0.")

    _validate_wallet_and_category(
        store=locked_expense.store,
        category=next_category,
        wallet=next_wallet,
    )

    # Lock involved wallets in deterministic order to avoid deadlocks.
    wallet_ids = sorted({str(locked_expense.wallet_id), str(next_wallet.id)})
    wallets = {
        str(w.pk): w
        for w in Wallet.objects.select_for_update().filter(pk__in=wallet_ids)
    }
    old_wallet = wallets[str(locked_expense.wallet_id)]
    new_wallet = wallets[str(next_wallet.id)]

    # Revert old posting first, then apply new one.
    old_wallet.balance += locked_expense.amount
    if new_wallet.balance < next_amount:
        raise ValueError("Solde wallet insuffisant apres mise a jour.")
    new_wallet.balance -= next_amount
    old_wallet.save(update_fields=["balance", "updated_at"])
    if old_wallet.pk != new_wallet.pk:
        new_wallet.save(update_fields=["balance", "updated_at"])

    locked_expense.category = next_category
    locked_expense.wallet = new_wallet
    locked_expense.amount = next_amount

    if "description" in changes:
        locked_expense.description = (changes.get("description") or "").strip()
    if "supplier_name" in changes:
        locked_expense.supplier_name = (changes.get("supplier_name") or "").strip()
    if "expense_date" in changes and changes.get("expense_date"):
        locked_expense.expense_date = changes["expense_date"]

    locked_expense.save(
        update_fields=[
            "category",
            "wallet",
            "amount",
            "description",
            "supplier_name",
            "expense_date",
            "updated_at",
        ]
    )

    logger.info("Expense updated: %s by %s", locked_expense.expense_number, actor)
    return locked_expense


@transaction.atomic
def void_expense(expense: Expense, *, actor, reason: str = "") -> Expense:
    """Void an expense and restore wallet balance atomically."""
    locked_expense = Expense.objects.select_for_update().select_related("wallet").get(pk=expense.pk)
    if locked_expense.status == Expense.Status.VOIDED:
        raise ValueError("Cette depense est deja annulee.")

    _assert_edit_allowed(locked_expense, actor)

    wallet_locked = Wallet.objects.select_for_update().get(pk=locked_expense.wallet_id)
    wallet_locked.balance += locked_expense.amount
    wallet_locked.save(update_fields=["balance", "updated_at"])

    locked_expense.status = Expense.Status.VOIDED
    locked_expense.voided_at = timezone.now()
    locked_expense.voided_by = actor
    locked_expense.void_reason = (reason or "").strip()
    locked_expense.save(
        update_fields=[
            "status",
            "voided_at",
            "voided_by",
            "void_reason",
            "updated_at",
        ]
    )

    logger.info("Expense voided: %s by %s", locked_expense.expense_number, actor)
    return locked_expense


def _add_month(target: date) -> date:
    year = target.year + (1 if target.month == 12 else 0)
    month = 1 if target.month == 12 else target.month + 1
    day = min(target.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


@transaction.atomic
def _run_single_recurring(recurring: RecurringExpense, actor):
    created = create_expense(
        store=recurring.store,
        category=recurring.category,
        wallet=recurring.wallet,
        amount=recurring.amount,
        description=recurring.description,
        supplier_name=recurring.supplier_name,
        expense_date=recurring.next_run_date,
        created_by=actor,
    )
    recurring.last_run_at = timezone.now()
    if recurring.frequency == RecurringExpense.Frequency.WEEKLY:
        recurring.next_run_date = recurring.next_run_date + timedelta(days=7)
    else:
        recurring.next_run_date = _add_month(recurring.next_run_date)
    recurring.save(update_fields=["last_run_at", "next_run_date", "updated_at"])
    return created


def generate_due_recurring_expenses(*, run_date: date | None = None, actor=None, store_id=None) -> RecurringRunResult:
    """Generate all due recurring expenses up to run_date."""
    effective_date = run_date or timezone.now().date()
    qs = (
        RecurringExpense.objects
        .select_related("store", "category", "wallet", "created_by")
        .filter(is_active=True, next_run_date__lte=effective_date)
        .order_by("next_run_date", "created_at")
    )
    if store_id:
        qs = qs.filter(store_id=store_id)

    generated_ids: list[str] = []
    failures: list[dict] = []
    for recurring in qs:
        run_actor = actor or recurring.created_by
        try:
            generated = _run_single_recurring(recurring, run_actor)
            generated_ids.append(str(generated.id))
        except Exception as exc:  # pragma: no cover - defensive log path
            failures.append(
                {
                    "recurring_id": str(recurring.id),
                    "store_id": str(recurring.store_id),
                    "error": str(exc),
                }
            )
            logger.exception("Recurring expense generation failed: %s", recurring.id)

    return RecurringRunResult(
        generated_count=len(generated_ids),
        generated_ids=generated_ids,
        failed_count=len(failures),
        failures=failures,
    )
