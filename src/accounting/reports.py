"""
This module provides functions to generate SYSCOHADA-compliant financial reports.

Reports:
1. General Balance (Balance generale)
2. General Ledger (Grand livre) - implemented in views.py (JournalEntryViewSet.grand_livre)
3. Centralizing Journal (Journal centralise) - TODO
4. Balance Sheet (Bilan)
5. Income Statement (Compte de resultat)
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


def generate_bilan(enterprise_id, fiscal_year):
    """
    Generate SYSCOHADA Balance Sheet (Bilan).

    Classifies POSTED journal entry lines by account type and code prefix:
    - ACTIF: ASSET accounts (classes 2, 3, 4-asset, 5-asset)
    - PASSIF: LIABILITY + EQUITY accounts (classes 1, 4-liability, 5-liability)

    Returns a dict with keys: 'actif', 'passif', 'totals'.
    """
    qs = (
        JournalEntryLine.objects.filter(
            entry__enterprise_id=enterprise_id,
            entry__fiscal_year=fiscal_year,
            entry__status=JournalEntry.Status.POSTED,
        )
        .values("account__code", "account__name", "account__account_type")
        .annotate(total_debit=Sum("debit"), total_credit=Sum("credit"))
        .order_by("account__code")
    )

    actif_immo_lines = []
    amort_total = ZERO
    actif_circ_lines = []
    tresos_actif_lines = []
    capitaux_lines = []
    dettes_fin_lines = []
    passif_circ_lines = []
    tresos_passif_lines = []

    for row in qs:
        code = row["account__code"]
        name = row["account__name"]
        atype = row["account__account_type"]
        total_debit = row["total_debit"] or ZERO
        total_credit = row["total_credit"] or ZERO

        if atype == Account.AccountType.ASSET:
            net = total_debit - total_credit
            if code.startswith("2"):
                if code.startswith("28"):
                    # Contra-asset: credit balance = accumulated amortissement
                    amort_total += max(total_credit - total_debit, ZERO)
                elif net > ZERO:
                    actif_immo_lines.append({
                        "account_code": code,
                        "account_name": name,
                        "brut": net,
                        "amortissement": ZERO,
                        "net": net,
                    })
            elif (code.startswith("3") or code.startswith("4")) and net > ZERO:
                actif_circ_lines.append({
                    "account_code": code,
                    "account_name": name,
                    "net": net,
                })
            elif code.startswith("5") and net > ZERO:
                tresos_actif_lines.append({
                    "account_code": code,
                    "account_name": name,
                    "net": net,
                })

        elif atype in (Account.AccountType.LIABILITY, Account.AccountType.EQUITY):
            credit_balance = total_credit - total_debit
            if credit_balance <= ZERO:
                continue
            if atype == Account.AccountType.EQUITY:
                capitaux_lines.append({"account_code": code, "account_name": name, "montant": credit_balance})
            elif code.startswith("1"):
                dettes_fin_lines.append({"account_code": code, "account_name": name, "montant": credit_balance})
            elif code.startswith("4"):
                passif_circ_lines.append({"account_code": code, "account_name": name, "montant": credit_balance})
            elif code.startswith("5"):
                tresos_passif_lines.append({"account_code": code, "account_name": name, "montant": credit_balance})

    # Distribute amortissements proportionally across immobilise lines
    if amort_total > ZERO and actif_immo_lines:
        remaining = amort_total
        for line in actif_immo_lines:
            deduction = min(line["brut"], remaining)
            line["amortissement"] = deduction
            line["net"] = line["brut"] - deduction
            remaining -= deduction
            if remaining <= ZERO:
                break

    actif_immo_brut = sum(l["brut"] for l in actif_immo_lines)
    actif_immo_amort = sum(l["amortissement"] for l in actif_immo_lines)
    actif_immo_net = sum(l["net"] for l in actif_immo_lines)
    actif_circ_total = sum(l["net"] for l in actif_circ_lines)
    tresos_actif_total = sum(l["net"] for l in tresos_actif_lines)
    total_actif_net = actif_immo_net + actif_circ_total + tresos_actif_total

    capitaux_total = sum(l["montant"] for l in capitaux_lines)
    dettes_fin_total = sum(l["montant"] for l in dettes_fin_lines)
    passif_circ_total = sum(l["montant"] for l in passif_circ_lines)
    tresos_passif_total = sum(l["montant"] for l in tresos_passif_lines)
    total_passif = capitaux_total + dettes_fin_total + passif_circ_total + tresos_passif_total

    return {
        "actif": [
            {
                "section": "ACTIF IMMOBILISE",
                "lines": actif_immo_lines,
                "subtotal_brut": actif_immo_brut,
                "subtotal_amortissement": actif_immo_amort,
                "subtotal_net": actif_immo_net,
            },
            {
                "section": "ACTIF CIRCULANT",
                "lines": actif_circ_lines,
                "subtotal_net": actif_circ_total,
            },
            {
                "section": "TRESORERIE ACTIF",
                "lines": tresos_actif_lines,
                "subtotal_net": tresos_actif_total,
            },
        ],
        "passif": [
            {
                "section": "CAPITAUX PROPRES",
                "lines": capitaux_lines,
                "subtotal": capitaux_total,
            },
            {
                "section": "DETTES FINANCIERES",
                "lines": dettes_fin_lines,
                "subtotal": dettes_fin_total,
            },
            {
                "section": "PASSIF CIRCULANT",
                "lines": passif_circ_lines,
                "subtotal": passif_circ_total,
            },
            {
                "section": "TRESORERIE PASSIF",
                "lines": tresos_passif_lines,
                "subtotal": tresos_passif_total,
            },
        ],
        "totals": {
            "total_actif_brut": actif_immo_brut + actif_circ_total + tresos_actif_total,
            "total_actif_amortissement": actif_immo_amort,
            "total_actif_net": total_actif_net,
            "total_passif": total_passif,
        },
    }


# Mapping of 2-digit prefix → section label for Charges (Class 6)
_CHARGES_SECTIONS = {
    "60": "Achats",
    "61": "Transports",
    "62": "Services exterieurs A",
    "63": "Services exterieurs B",
    "64": "Impots et taxes",
    "65": "Autres charges",
    "66": "Charges de personnel",
    "67": "Frais financiers",
    "68": "Dotations aux amortissements",
    "69": "Charges exceptionnelles",
}

# Mapping of 2-digit prefix → section label for Produits (Class 7)
_PRODUITS_SECTIONS = {
    "70": "Ventes de marchandises",
    "71": "Produits bruts activites",
    "72": "Travaux et services vendus",
    "73": "Variations de stocks",
    "74": "Subventions d exploitation",
    "75": "Autres produits",
    "77": "Revenus financiers",
    "78": "Reprises d amortissements",
    "79": "Produits divers",
}


def generate_compte_resultat(enterprise_id, fiscal_year):
    """
    Generate SYSCOHADA Income Statement (Compte de resultat).

    - Charges (Class 6, EXPENSE accounts): debit-normal → montant = total_debit - total_credit
    - Produits (Class 7, INCOME accounts): credit-normal → montant = total_credit - total_debit
    - Resultat net = total_produits - total_charges (positive = benefice, negative = perte)

    Returns a dict with keys: 'charges', 'produits', 'totals'.
    """
    qs = (
        JournalEntryLine.objects.filter(
            entry__enterprise_id=enterprise_id,
            entry__fiscal_year=fiscal_year,
            entry__status=JournalEntry.Status.POSTED,
            account__account_type__in=[
                Account.AccountType.EXPENSE,
                Account.AccountType.INCOME,
            ],
        )
        .values("account__code", "account__name", "account__account_type")
        .annotate(total_debit=Sum("debit"), total_credit=Sum("credit"))
        .order_by("account__code")
    )

    charges_by_section = {}
    produits_by_section = {}

    for row in qs:
        code = row["account__code"]
        name = row["account__name"]
        atype = row["account__account_type"]
        total_debit = row["total_debit"] or ZERO
        total_credit = row["total_credit"] or ZERO
        prefix = code[:2]

        if atype == Account.AccountType.EXPENSE:
            montant = total_debit - total_credit
            if montant <= ZERO:
                continue
            label = _CHARGES_SECTIONS.get(prefix, f"Autres charges ({prefix}x)")
            if label not in charges_by_section:
                charges_by_section[label] = {"section": label, "lines": [], "subtotal": ZERO}
            charges_by_section[label]["lines"].append({"account_code": code, "account_name": name, "montant": montant})
            charges_by_section[label]["subtotal"] += montant

        elif atype == Account.AccountType.INCOME:
            montant = total_credit - total_debit
            if montant <= ZERO:
                continue
            label = _PRODUITS_SECTIONS.get(prefix, f"Autres produits ({prefix}x)")
            if label not in produits_by_section:
                produits_by_section[label] = {"section": label, "lines": [], "subtotal": ZERO}
            produits_by_section[label]["lines"].append({"account_code": code, "account_name": name, "montant": montant})
            produits_by_section[label]["subtotal"] += montant

    charges_list = list(charges_by_section.values())
    produits_list = list(produits_by_section.values())
    total_charges = sum(s["subtotal"] for s in charges_list)
    total_produits = sum(s["subtotal"] for s in produits_list)
    resultat_net = total_produits - total_charges

    return {
        "charges": charges_list,
        "produits": produits_list,
        "totals": {
            "total_charges": total_charges,
            "total_produits": total_produits,
            "resultat_net": resultat_net,
            "is_benefice": bool(resultat_net >= ZERO),
        },
    }
