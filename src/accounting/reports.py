"""
This module provides functions to generate SYSCOHADA-compliant financial reports.

Reports:
1. General Balance (Balance generale)
2. General Ledger (Grand livre) - TODO
3. Centralizing Journal (Journal centralise) - TODO
4. Balance Sheet (Bilan) - TODO
5. Income Statement (Compte de resultat) - TODO
"""

from decimal import Decimal
from django.db.models import Sum

from accounting.models import Account, JournalEntry, JournalEntryLine

ZERO = Decimal("0.00")


def generate_general_balance(enterprise, fiscal_year):
    """
    Generate a general balance of accounts for a given enterprise and fiscal year.

    The balance includes for each account:
    - Total debit movements over the period.
    - Total credit movements over the period.
    - The final debit or credit balance.

    Returns:
        A tuple containing:
        - A list of dicts, each representing an account's balance line.
        - A dict with the total sums for validation.
    """
    balance_data = []

    # Get all entry lines for the fiscal year for posted entries, grouped by account
    # and aggregated.
    lines_aggregated = (
        JournalEntryLine.objects.filter(
            entry__fiscal_year=fiscal_year,
            entry__enterprise=enterprise,
            entry__status=JournalEntry.Status.POSTED,
        )
        .values("account__code", "account__name")
        .annotate(
            total_debit=Sum("debit"),
            total_credit=Sum("credit"),
        )
        .order_by("account__code")
    )

    total_debit_sum = ZERO
    total_credit_sum = ZERO
    final_balance_debit_sum = ZERO
    final_balance_credit_sum = ZERO

    for aggregate in lines_aggregated:
        total_debit = aggregate.get('total_debit') or ZERO
        total_credit = aggregate.get('total_credit') or ZERO

        # Calculate final balance
        final_balance = total_debit - total_credit
        final_balance_debit = final_balance if final_balance > 0 else ZERO
        final_balance_credit = -final_balance if final_balance < 0 else ZERO

        balance_data.append({
            "account_code": aggregate["account__code"],
            "account_name": aggregate["account__name"],
            "total_debit": total_debit,
            "total_credit": total_credit,
            "final_balance_debit": final_balance_debit,
            "final_balance_credit": final_balance_credit,
        })

        total_debit_sum += total_debit
        total_credit_sum += total_credit
        final_balance_debit_sum += final_balance_debit
        final_balance_credit_sum += final_balance_credit

    totals = {
        "total_debit_sum": total_debit_sum,
        "total_credit_sum": total_credit_sum,
        "final_balance_debit_sum": final_balance_debit_sum,
        "final_balance_credit_sum": final_balance_credit_sum,
    }

    return balance_data, totals
