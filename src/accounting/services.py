"""
Business logic for SYSCOHADA-compliant automatic accounting entries.

Every business event (sale, payment, refund, purchase, expense, credit payment)
is translated into balanced journal entries following the PCGO chart of accounts.
"""

import logging
from datetime import date
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from accounting.models import (
    Account,
    AccountingPeriod,
    AccountingSettings,
    FiscalYear,
    Journal,
    JournalEntry,
    JournalEntryLine,
)

logger = logging.getLogger(__name__)

ZERO = Decimal("0.00")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_settings(enterprise):
    """Return AccountingSettings for the enterprise or None."""
    try:
        return enterprise.accounting_settings
    except AccountingSettings.DoesNotExist:
        logger.warning("Paramètres comptables non trouvés pour %s", enterprise)
        return None


def _get_active_period(enterprise, entry_date: date):
    """Find the open accounting period covering *entry_date*."""
    fy = FiscalYear.objects.filter(
        enterprise=enterprise,
        status=FiscalYear.Status.OPEN,
        start_date__lte=entry_date,
        end_date__gte=entry_date,
    ).first()
    if not fy:
        return None, None

    period = AccountingPeriod.objects.filter(
        fiscal_year=fy,
        status=AccountingPeriod.Status.OPEN,
        start_date__lte=entry_date,
        end_date__gte=entry_date,
    ).first()
    return fy, period


def _next_sequence(journal, fiscal_year):
    """Return the next continuous sequence number for a journal in a fiscal year.

    Uses select_for_update() to prevent duplicate sequence numbers under
    concurrent load. Must be called inside a transaction.atomic() block.
    """
    last = (
        JournalEntry.objects
        .select_for_update()
        .filter(journal=journal, fiscal_year=fiscal_year)
        .order_by("-sequence_number")
        .only("sequence_number")
        .first()
    )
    return (last.sequence_number if last else 0) + 1


def _get_journal(enterprise, journal_code):
    """Return the journal with the given code for this enterprise."""
    return Journal.objects.filter(
        enterprise=enterprise,
        code=journal_code,
        is_active=True,
    ).first()


def _payment_method_to_journal_code(method):
    """Map a payment method string to a journal code."""
    mapping = {
        "CASH": "CA",
        "MOBILE_MONEY": "MM",
        "BANK_TRANSFER": "BQ",
        "CHEQUE": "BQ",
    }
    return mapping.get(method, "CA")


def _payment_method_to_account(settings, method):
    """Return the treasury account for a payment method."""
    mapping = {
        "CASH": settings.default_cash_account,
        "MOBILE_MONEY": settings.default_mobile_money_account,
        "BANK_TRANSFER": settings.default_bank_account,
        "CHEQUE": settings.default_bank_account,
    }
    return mapping.get(method, settings.default_cash_account)


def _already_posted(source_type, source_id):
    """Check if an accounting entry already exists for this source."""
    return JournalEntry.objects.filter(
        source_type=source_type,
        source_id=source_id,
        is_reversal=False,
    ).exists()


# ---------------------------------------------------------------------------
# Core entry creation
# ---------------------------------------------------------------------------

@transaction.atomic
def create_journal_entry(
    *,
    enterprise,
    store,
    journal_code,
    lines_data,
    label,
    reference="",
    source_type="",
    source_id=None,
    entry_date=None,
    created_by=None,
    auto_post=True,
):
    """
    Create a balanced journal entry with lines.

    Parameters
    ----------
    lines_data : list[dict]
        Each dict: {"account": Account, "debit": Decimal, "credit": Decimal,
                     "label": str, "partner_type": str, "partner_id": UUID}
    """
    if entry_date is None:
        entry_date = date.today()

    journal = _get_journal(enterprise, journal_code)
    if not journal:
        logger.warning("Journal '%s' introuvable pour %s.", journal_code, enterprise)
        return None

    fy, period = _get_active_period(enterprise, entry_date)
    if not fy or not period:
        logger.warning("Pas de période comptable ouverte pour %s à la date du %s.", enterprise, entry_date)
        return None

    # Validate balance
    total_debit = sum(l.get("debit", ZERO) for l in lines_data)
    total_credit = sum(l.get("credit", ZERO) for l in lines_data)
    if total_debit != total_credit:
        logger.error(
            "Ecriture déséquilibrée: D=%s C=%s (label=%s)",
            total_debit, total_credit, label,
        )
        return None

    seq = _next_sequence(journal, fy)
    status = JournalEntry.Status.POSTED if auto_post else JournalEntry.Status.DRAFT

    validated_at = None
    validated_by = None
    if status in [JournalEntry.Status.POSTED, JournalEntry.Status.VALIDATED]:
        validated_at = timezone.now()
        validated_by = created_by

    entry = JournalEntry.objects.create(
        enterprise=enterprise,
        journal=journal,
        fiscal_year=fy,
        period=period,
        store=store,
        sequence_number=seq,
        entry_date=entry_date,
        label=label,
        reference=reference,
        status=status,
        source_type=source_type,
        source_id=source_id,
        created_by=created_by,
        validated_by=validated_by,
        validated_at=validated_at,
        is_reversal=False,
    )

    for line_data in lines_data:
        JournalEntryLine.objects.create(
            entry=entry,
            account=line_data["account"],
            debit=line_data.get("debit", ZERO),
            credit=line_data.get("credit", ZERO),
            label=line_data.get("label", ""),
            partner_type=line_data.get("partner_type", ""),
            partner_id=line_data.get("partner_id"),
        )

    logger.info(
        "Ecriture %s-%06d créée: %s (source=%s/%s)",
        journal.code, seq, label, source_type, source_id,
    )
    return entry


# ---------------------------------------------------------------------------
# Sale entry — Journal VE (Ventes)
# ---------------------------------------------------------------------------

def post_sale_entry(sale):
    """
    Generate a VE journal entry when a sale is PAID.

    D: 411 Clients                                          = total TTC
    C: 701 Ventes                                           = subtotal - discount
    C: 4431 TVA collectee                                   = tax_amount
    D: 673 Escomptes accordes                               = discount_amount (if any)
    """
    enterprise = sale.store.enterprise
    settings = _get_settings(enterprise)
    if not settings:
        return None

    if _already_posted("sale", sale.pk):
        return None

    lines = []
    net_sales = sale.subtotal - sale.discount_amount
    total = sale.total

    # Credit: Ventes (net)
    if net_sales > ZERO:
        lines.append({
            "account": settings.default_sales_account,
            "debit": ZERO,
            "credit": net_sales,
            "label": f"Vente {sale.invoice_number or ''}".strip(),
            "partner_id": None, "partner_type": "",
        })

    # Credit: TVA collectee
    if sale.tax_amount > ZERO:
        lines.append({
            "account": settings.default_vat_collected_account,
            "debit": ZERO,
            "credit": sale.tax_amount,
            "label": "TVA collectee",
            "partner_id": None, "partner_type": "",
        })

    # Debit: Escomptes accordes (if discount)
    if sale.discount_amount > ZERO:
        lines.append({
            "account": settings.default_discount_account,
            "debit": sale.discount_amount,
            "credit": ZERO,
            "label": "Remise accordee",
            "partner_id": None, "partner_type": "",
        })

    # Debit: This entry always debits the customer account.
    # For direct (non-credit) sales, a subsequent `post_payment_entry` call
    # will credit the customer account and debit the treasury account,
    # effectively balancing the customer's account to zero.
    lines.append({
        "account": settings.default_customer_account,
        "debit": total,
        "credit": ZERO,
        "label": f"Client — {sale.invoice_number or ''}".strip(),
        "partner_type": "customer",
        "partner_id": sale.customer_id,
    })

    actor = getattr(sale, "seller", None)
    return create_journal_entry(
        enterprise=enterprise,
        store=sale.store,
        journal_code="VE",
        lines_data=lines,
        label=f"Vente {sale.invoice_number or sale.pk}",
        reference=sale.invoice_number or "",
        source_type="sale",
        source_id=sale.pk,
        entry_date=sale.created_at.date() if sale.created_at else None,
        created_by=actor,
        auto_post=settings.auto_post_entries,
    )


# ---------------------------------------------------------------------------
# Payment entry — Journal CA/BQ/MM
# ---------------------------------------------------------------------------

def post_payment_entry(payment):
    """
    Generate a CA/BQ/MM entry when a payment is recorded.

    D: 571/585/521 (treasury account per method)
    C: 411 Clients
    """
    sale = payment.sale
    enterprise = sale.store.enterprise
    settings = _get_settings(enterprise)
    if not settings:
        return None

    if _already_posted("payment", payment.pk):
        return None

    # Skip CREDIT method payments (no cash movement)
    method = payment.method
    if method == "CREDIT":
        return None

    journal_code = _payment_method_to_journal_code(method)
    treasury_account = _payment_method_to_account(settings, method)
    if not treasury_account:
        logger.warning("Pas de compte de trésorerie pour la méthode de paiement '%s'", method)
        return None

    lines = [
        {
            "account": treasury_account,
            "debit": payment.amount,
            "credit": ZERO,
            "label": f"Encaissement {sale.invoice_number or ''}".strip(),
            "partner_id": None, "partner_type": "",
        },
        {
            "account": settings.default_customer_account,
            "debit": ZERO,
            "credit": payment.amount,
            "label": f"Règlement client — {sale.invoice_number or ''}".strip(),
            "partner_type": "customer",
            "partner_id": sale.customer_id,
        },
    ]

    actor = getattr(payment, "cashier", None)
    return create_journal_entry(
        enterprise=enterprise,
        store=sale.store,
        journal_code=journal_code,
        lines_data=lines,
        label=f"Paiement {sale.invoice_number or sale.pk} ({method})",
        reference=payment.reference or "",
        source_type="payment",
        source_id=payment.pk,
        entry_date=payment.created_at.date() if payment.created_at else None,
        created_by=actor,
        auto_post=settings.auto_post_entries,
    )


# ---------------------------------------------------------------------------
# Refund entry — Journal VE + CA/BQ/MM (contre-passation)
# ---------------------------------------------------------------------------

def post_refund_entry(refund):
    """
    Generate reversal entries for a refund.

    1) VE entry (reversal of sale portion):
       D: 709 RRR accordes   = refund amount (HT portion)
       D: 4431 TVA collectee  = estimated TVA
       C: 411 Clients         = refund.amount

    2) CA/BQ/MM entry (cash outflow):
       D: 411 Clients
       C: 571/585/521
    """
    sale = refund.sale
    enterprise = sale.store.enterprise
    settings = _get_settings(enterprise)
    if not settings:
        return None

    if _already_posted("refund", refund.pk):
        return None

    # Estimate TVA proportion from the original sale
    if sale.total > ZERO:
        vat_ratio = sale.tax_amount / sale.total
    else:
        vat_ratio = ZERO

    refund_vat = (refund.amount * vat_ratio).quantize(Decimal("0.01"))
    refund_ht = refund.amount - refund_vat

    # 1) VE reversal entry
    ve_lines = [
        {
            "account": settings.default_refund_account,
            "debit": refund_ht,
            "credit": ZERO,
            "label": "RRR accorde — remboursement",
            "partner_id": None, "partner_type": "",
        },
    ]
    if refund_vat > ZERO:
        ve_lines.append({
            "account": settings.default_vat_collected_account,
            "debit": refund_vat,
            "credit": ZERO,
            "label": "TVA collectee — remboursement",
            "partner_id": None, "partner_type": "",
        })
    ve_lines.append({
        "account": settings.default_customer_account,
        "debit": ZERO,
        "credit": refund.amount,
        "label": f"Remboursement client — {sale.invoice_number or ''}".strip(),
        "partner_type": "customer",
        "partner_id": sale.customer_id,
    })

    actor = refund.approved_by
    create_journal_entry(
        enterprise=enterprise,
        store=refund.store,
        journal_code="VE",
        lines_data=ve_lines,
        label=f"Remboursement {sale.invoice_number or sale.pk}",
        reference=sale.invoice_number or "",
        source_type="refund",
        source_id=refund.pk,
        entry_date=refund.created_at.date() if refund.created_at else None,
        created_by=actor,
        auto_post=settings.auto_post_entries,
    )

    # 2) Treasury entry (unless refund is to credit account)
    method = refund.refund_method
    if method == "CREDIT":
        return  # No cash outflow

    journal_code = _payment_method_to_journal_code(method)
    treasury_account = _payment_method_to_account(settings, method)
    if not treasury_account:
        return

    treasury_lines = [
        {
            "account": settings.default_customer_account,
            "debit": refund.amount,
            "credit": ZERO,
            "label": f"Remboursement — {sale.invoice_number or ''}".strip(),
            "partner_type": "customer",
            "partner_id": sale.customer_id,
        },
        {
            "account": treasury_account,
            "debit": ZERO,
            "credit": refund.amount,
            "label": "Sortie tresorerie — remboursement",
            "partner_id": None, "partner_type": "",
        },
    ]

    create_journal_entry(
        enterprise=enterprise,
        store=refund.store,
        journal_code=journal_code,
        lines_data=treasury_lines,
        label=f"Remboursement tresorerie {sale.invoice_number or sale.pk}",
        reference=sale.invoice_number or "",
        source_type="refund_treasury",
        source_id=refund.pk,
        entry_date=refund.created_at.date() if refund.created_at else None,
        created_by=actor,
        auto_post=settings.auto_post_entries,
    )


# ---------------------------------------------------------------------------
# Purchase entry — Journal AC (Achats)
# ---------------------------------------------------------------------------

def post_purchase_entry(goods_receipt):
    """
    Generate an AC journal entry when goods are received.

    D: 601 Achats marchandises  = PO subtotal
    D: 4451 TVA deductible      = estimated TVA (if applicable)
    C: 401 Fournisseurs         = total
    """
    po = goods_receipt.purchase_order
    enterprise = po.store.enterprise
    settings = _get_settings(enterprise)
    if not settings:
        return None

    if _already_posted("purchase", goods_receipt.pk):
        return None

    subtotal = po.subtotal or ZERO
    if subtotal <= ZERO:
        return None

    # NOTE: Tax is estimated based on the enterprise's default tax rate,
    # as the PurchaseOrder model does not currently store tax information.
    # This might lead to inaccuracies if purchase-specific tax differs from the default.
    vat_amount = ZERO
    if settings.default_tax_rate and not settings.default_tax_rate.is_exempt:
        vat_amount = (subtotal * settings.default_tax_rate.rate / 100).quantize(Decimal("0.01"))

    total = subtotal + vat_amount

    lines = [
        {
            "account": settings.default_purchase_account,
            "debit": subtotal,
            "credit": ZERO,
            "label": f"Achat {po.po_number or ''}".strip(),
            "partner_id": None, "partner_type": "",
        },
    ]
    if vat_amount > ZERO:
        lines.append({
            "account": settings.default_vat_deductible_account,
            "debit": vat_amount,
            "credit": ZERO,
            "label": "TVA deductible sur achats",
            "partner_id": None, "partner_type": "",
        })
    lines.append({
        "account": settings.default_supplier_account,
        "debit": ZERO,
        "credit": total,
        "label": f"Fournisseur — {po.supplier.name if po.supplier else ''}".strip(),
        "partner_type": "supplier",
        "partner_id": po.supplier_id,
    })

    actor = goods_receipt.received_by
    return create_journal_entry(
        enterprise=enterprise,
        store=po.store,
        journal_code="AC",
        lines_data=lines,
        label=f"Reception {po.po_number or po.pk}",
        reference=po.po_number or "",
        source_type="purchase",
        source_id=goods_receipt.pk,
        entry_date=goods_receipt.created_at.date() if goods_receipt.created_at else None,
        created_by=actor,
        auto_post=settings.auto_post_entries,
    )


# ---------------------------------------------------------------------------
# Expense entry — Journal CA/BQ/MM
# ---------------------------------------------------------------------------

def post_expense_entry(expense):
    """
    Generate a CA/BQ/MM entry for a validated expense.

    D: 6xx (expense account per category mapping, or default 605)
    C: 571/585/521 (treasury via wallet type)
    """
    enterprise = expense.store.enterprise
    settings = _get_settings(enterprise)
    if not settings:
        return None

    if _already_posted("expense", expense.pk):
        return None

    # Map wallet type to journal and account
    wallet_type = expense.wallet.type if expense.wallet else "CASH"
    journal_code = _payment_method_to_journal_code(wallet_type)
    treasury_account = _payment_method_to_account(settings, wallet_type)
    if not treasury_account:
        return None

    # Map expense category to an account (default to 605 Autres achats)
    expense_account = _map_expense_category_to_account(expense.category, enterprise)

    lines = [
        {
            "account": expense_account,
            "debit": expense.amount,
            "credit": ZERO,
            "label": expense.description[:255] if expense.description else "",
            "partner_id": None, "partner_type": "",
        },
        {
            "account": treasury_account,
            "debit": ZERO,
            "credit": expense.amount,
            "label": f"Depense {expense.expense_number}",
            "partner_id": None, "partner_type": "",
        },
    ]

    return create_journal_entry(
        enterprise=enterprise,
        store=expense.store,
        journal_code=journal_code,
        lines_data=lines,
        label=f"Depense {expense.expense_number}",
        reference=expense.expense_number,
        source_type="expense",
        source_id=expense.pk,
        entry_date=expense.expense_date,
        created_by=expense.created_by,
        auto_post=settings.auto_post_entries,
    )


def post_expense_void_entry(expense):
    """Generate a contra-entry (contre-passation) for a voided expense."""
    enterprise = expense.store.enterprise
    settings = _get_settings(enterprise)
    if not settings:
        return None

    if _already_posted("expense_void", expense.pk):
        return None

    wallet_type = expense.wallet.type if expense.wallet else "CASH"
    journal_code = _payment_method_to_journal_code(wallet_type)
    treasury_account = _payment_method_to_account(settings, wallet_type)
    if not treasury_account:
        return None

    expense_account = _map_expense_category_to_account(expense.category, enterprise)

    # Reverse: credit expense, debit treasury
    lines = [
        {
            "account": treasury_account,
            "debit": expense.amount,
            "credit": ZERO,
            "label": f"Annulation depense {expense.expense_number}",
            "partner_id": None, "partner_type": "",
        },
        {
            "account": expense_account,
            "debit": ZERO,
            "credit": expense.amount,
            "label": f"Contre-passation {expense.expense_number}",
            "partner_id": None, "partner_type": "",
        },
    ]

    # Find original entry to link
    original = JournalEntry.objects.filter(
        source_type="expense", source_id=expense.pk, is_reversal=False,
    ).first()

    entry = create_journal_entry(
        enterprise=enterprise,
        store=expense.store,
        journal_code=journal_code,
        lines_data=lines,
        label=f"Annulation depense {expense.expense_number}",
        reference=expense.expense_number,
        source_type="expense_void",
        source_id=expense.pk,
        entry_date=expense.voided_at.date() if expense.voided_at else None,
        created_by=expense.voided_by,
        auto_post=settings.auto_post_entries,
    )
    if entry and original:
        entry.is_reversal = True
        entry.reversed_entry = original
        entry.save(update_fields=["is_reversal", "reversed_entry"])
    return entry


def _map_expense_category_to_account(category, enterprise):
    """Map an ExpenseCategory to an accounting Account.

    Uses a simple name-based heuristic. Falls back to 605 (Autres achats).
    """
    if not category:
        return Account.objects.filter(enterprise=enterprise, code="605").first()

    name_lower = category.name.lower()
    mapping = {
        "transport": "613",
        "loyer": "622",
        "location": "622",
        "entretien": "624",
        "maintenance": "624",
        "reparation": "624",
        "assurance": "625",
        "telecom": "628",
        "telephone": "628",
        "internet": "628",
        "banque": "631",
        "frais bancaire": "631",
        "honoraire": "632",
        "formation": "633",
        "salaire": "661",
        "remuneration": "661",
        "charge sociale": "664",
        "fourniture": "604",
        "electricite": "605",
        "eau": "605",
    }

    for keyword, code in mapping.items():
        if keyword in name_lower:
            acct = Account.objects.filter(enterprise=enterprise, code=code).first()
            if acct:
                return acct

    # Fallback to 605 (Autres achats)
    return Account.objects.filter(enterprise=enterprise, code="605").first()


# ---------------------------------------------------------------------------
# Credit payment entry — Journal CA/BQ/MM
# ---------------------------------------------------------------------------

def post_credit_payment_entry(ledger_entry):
    """
    Generate a CA/BQ/MM entry when a credit payment is recorded.

    D: 571/585/521 (treasury)
    C: 411 Clients
    """
    enterprise = None
    store = None
    customer_id = None

    # Navigate to enterprise via CustomerAccount → Customer → enterprise
    account = ledger_entry.account
    if account and account.customer:
        customer = account.customer
        enterprise = customer.enterprise
        customer_id = customer.pk

    if not enterprise:
        return None

    settings = _get_settings(enterprise)
    if not settings:
        return None

    if _already_posted("credit_payment", ledger_entry.pk):
        return None

    # Amount is negative in ledger (reduces debt), we need the absolute value
    amount = abs(ledger_entry.amount)
    if amount <= ZERO:
        return None

    # Default to cash — credit payments don't track method natively
    journal_code = "CA"
    treasury_account = settings.default_cash_account

    lines = [
        {
            "account": treasury_account,
            "debit": amount,
            "credit": ZERO,
            "label": f"Paiement credit — {ledger_entry.reference or ''}".strip(),
            "partner_id": None, "partner_type": "",
        },
        {
            "account": settings.default_customer_account,
            "debit": ZERO,
            "credit": amount,
            "label": "Reglement credit client",
            "partner_type": "customer",
            "partner_id": customer_id,
        },
    ]

    return create_journal_entry(
        enterprise=enterprise,
        store=store,
        journal_code=journal_code,
        lines_data=lines,
        label=f"Paiement credit {ledger_entry.reference or ledger_entry.pk}",
        reference=ledger_entry.reference or "",
        source_type="credit_payment",
        source_id=ledger_entry.pk,
        entry_date=ledger_entry.created_at.date() if ledger_entry.created_at else None,
        created_by=ledger_entry.created_by,
        auto_post=settings.auto_post_entries,
    )
