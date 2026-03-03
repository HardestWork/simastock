"""PDF generation utilities using WeasyPrint."""
import logging
import re
from datetime import timedelta
from pathlib import Path
from io import BytesIO
from django.conf import settings
from django.http import HttpResponse
from django.template.loader import render_to_string

logger = logging.getLogger("boutique")
HEX_COLOR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")


def _normalize_hex_color(value: str, fallback: str) -> str:
    candidate = (value or "").strip()
    if not candidate.startswith("#"):
        candidate = f"#{candidate}"
    if HEX_COLOR_RE.match(candidate):
        return candidate.upper()
    return fallback


def _safe_pdf_filename(stem: str, fallback: str = "document") -> str:
    """Build a safe PDF filename from a human-readable stem."""
    safe = re.sub(r'[\\/:*?"<>|]+', "-", (stem or "").strip())
    safe = safe.strip(" .")
    if not safe:
        safe = fallback
    return f"{safe}.pdf"


def render_pdf(template_name, context, filename="document.pdf", disposition="inline"):
    """Render a Django template to PDF and return an HttpResponse."""
    try:
        from weasyprint import HTML
    except Exception as exc:
        logger.exception("WeasyPrint is unavailable for PDF rendering.")
        raise RuntimeError("PDF rendering backend unavailable") from exc

    html_string = render_to_string(template_name, context)
    pdf_file = BytesIO()
    HTML(string=html_string, base_url=str(settings.BASE_DIR)).write_pdf(pdf_file)
    pdf_file.seek(0)

    safe_disposition = "attachment" if (disposition or "").strip().lower() == "attachment" else "inline"
    response = HttpResponse(pdf_file, content_type="application/pdf")
    response["Content-Disposition"] = f'{safe_disposition}; filename="{filename}"'
    return response


_RECEIPT_TEMPLATE_CODE_TO_PATH = {
    "TICKET": "pdf/receipt_ticket.html",
    "COMPACT": "pdf/receipt_compact.html",
    "MODERN": "pdf/receipt_modern.html",
}

_RECEIPT_TEMPLATE_ALIASES = {
    # Receipt-first names
    "TICKET": "TICKET",
    "COMPACT": "COMPACT",
    "MODERN": "MODERN",
    # Invoice template aliases for easier reuse of existing settings
    "CLASSIC": "TICKET",
    "SIMPLE": "COMPACT",
    "CORPORATE": "MODERN",
    "BORDERED": "MODERN",
    "PRESTIGE": "MODERN",
}


def _normalize_receipt_template(value: str, fallback: str = "TICKET") -> str:
    candidate = (value or "").strip().upper()
    normalized_fallback = (fallback or "TICKET").strip().upper()
    default_code = _RECEIPT_TEMPLATE_ALIASES.get(normalized_fallback, "TICKET")
    return _RECEIPT_TEMPLATE_ALIASES.get(candidate, default_code)


def _build_invoice_config(store):
    """Prepare invoice/receipt display settings from store data."""
    logo_uri = ""
    if getattr(store, "logo", None):
        try:
            logo_path = Path(store.logo.path)
            if logo_path.exists():
                logo_uri = logo_path.as_uri()
        except Exception:
            logo_uri = ""

    vat_enabled = False
    vat_rate = 0
    try:
        vat_feature = bool(getattr(store, "is_feature_enabled")("vat"))
    except Exception:
        vat_feature = False
    try:
        vat_enabled = vat_feature and bool(getattr(store, "effective_vat_enabled", False))
        vat_rate = getattr(store, "effective_vat_rate", 0) or 0
    except Exception:
        vat_enabled = False
        vat_rate = 0

    # Enterprise-level legal identity (with fallback to store-level)
    enterprise = getattr(store, "enterprise", None)
    ent_legal_name = getattr(enterprise, "legal_name", "") if enterprise else ""
    ent_legal_form = getattr(enterprise, "legal_form", "") if enterprise else ""
    ent_share_capital = getattr(enterprise, "share_capital", "") if enterprise else ""
    ent_rccm = getattr(enterprise, "registration_number", "") if enterprise else ""
    ent_nif = getattr(enterprise, "tax_id", "") if enterprise else ""
    ent_address = getattr(enterprise, "address", "") if enterprise else ""
    ent_phone = getattr(enterprise, "phone", "") if enterprise else ""
    ent_email = getattr(enterprise, "email", "") if enterprise else ""

    return {
        "business_name": ent_legal_name or store.legal_name or store.name,
        "legal_form": ent_legal_form or getattr(store, "legal_form", ""),
        "share_capital": ent_share_capital or getattr(store, "share_capital", ""),
        "address": ent_address or store.address,
        "phone": ent_phone or store.phone,
        "email": ent_email or store.email,
        "document_title": (
            getattr(enterprise, "invoice_header", "") or store.invoice_header or "FACTURE"
        ),
        "template": (
            getattr(enterprise, "invoice_template", "") or
            getattr(store, "invoice_template", "")
        ) or "CLASSIC",
        "registration_number": ent_rccm or store.registration_number,
        "tax_id": ent_nif or store.tax_id,
        "website": store.website,
        "logo_uri": logo_uri,
        "primary_color": _normalize_hex_color(
            getattr(enterprise, "invoice_primary_color", "") or getattr(store, "invoice_primary_color", ""),
            "#0F4C9A",
        ),
        "secondary_color": _normalize_hex_color(
            getattr(enterprise, "invoice_secondary_color", "") or getattr(store, "invoice_secondary_color", ""),
            "#21A8F6",
        ),
        "offer_validity_days": (
            getattr(enterprise, "offer_validity_days", None) or
            getattr(store, "offer_validity_days", 15) or 15
        ),
        "vat_enabled": bool(vat_enabled),
        "vat_rate": vat_rate,
        "bank_details": getattr(enterprise, "bank_details", "") or store.bank_details,
        "terms": getattr(enterprise, "invoice_terms", "") or store.invoice_terms,
        "footer": getattr(enterprise, "invoice_footer", "") or store.invoice_footer,
    }


def _build_document_meta(sale, invoice_config, document_kind, now):
    kind = (document_kind or "invoice").strip().lower()
    if kind not in {"invoice", "proforma", "quote"}:
        kind = "invoice"

    base_number = sale.invoice_number or str(sale.pk).split("-")[0].upper()
    if kind == "proforma":
        number = f"PF-{base_number}"
        title = "FACTURE PROFORMA"
        valid_until = now + timedelta(days=invoice_config.get("offer_validity_days", 15))
    elif kind == "quote":
        number = f"DEV-{base_number}"
        title = "DEVIS"
        valid_until = now + timedelta(days=invoice_config.get("offer_validity_days", 15))
    else:
        number = sale.invoice_number or f"FAC-{base_number}"
        title = invoice_config.get("document_title") or "FACTURE DEFINITIVE"
        valid_until = None

    return {
        "kind": kind,
        "number": number,
        "title": title,
        "valid_until": valid_until,
    }


def _verification_context(obj):
    """Build verification context (QR data URI, hash, URL) for a model instance."""
    from core.verification import build_verify_url, generate_qr_data_uri
    token = getattr(obj, "verification_token", None)
    vhash = getattr(obj, "verification_hash", "")
    if not token:
        return {}
    url = build_verify_url(token)
    return {
        "verify_url": url,
        "verify_hash": vhash,
        "qr_data_uri": generate_qr_data_uri(url),
    }


def generate_invoice_pdf(sale, store, document_kind="invoice"):
    """Generate A4 invoice PDF for a sale."""
    from django.utils import timezone
    now = timezone.now()
    invoice_config = _build_invoice_config(store)
    document = _build_document_meta(sale, invoice_config, document_kind, now)
    template_mode = invoice_config.get("template")
    if template_mode == "MODERN":
        template_name = "pdf/invoice_a4_modern.html"
    elif template_mode == "SIMPLE":
        template_name = "pdf/invoice_a4_simple.html"
    elif template_mode == "CORPORATE":
        template_name = "pdf/invoice_a4_corporate.html"
    elif template_mode == "BORDERED":
        template_name = "pdf/invoice_a4_bordered.html"
    elif template_mode == "PRESTIGE":
        template_name = "pdf/invoice_a4_prestige.html"
    else:
        template_name = "pdf/invoice_a4.html"
    context = {
        "sale": sale,
        "store": store,
        "invoice_config": invoice_config,
        "document": document,
        "now": now,
        **_verification_context(sale),
    }
    filename = _safe_pdf_filename(
        document.get("number") or sale.invoice_number or f"FACTURE-{sale.id}",
        fallback="facture",
    )
    return render_pdf(template_name, context, filename)


def generate_receipt_pdf(
    sale,
    store,
    payments=None,
    change=0,
    cashier_name="",
    template_code="",
    as_attachment=False,
):
    """Generate receipt/ticket PDF for a sale."""
    from django.utils import timezone
    invoice_config = _build_invoice_config(store)
    default_template_code = _normalize_receipt_template(invoice_config.get("template"))
    receipt_template_code = _normalize_receipt_template(template_code, fallback=default_template_code)
    template_name = _RECEIPT_TEMPLATE_CODE_TO_PATH.get(
        receipt_template_code,
        _RECEIPT_TEMPLATE_CODE_TO_PATH["TICKET"],
    )
    context = {
        "sale": sale,
        "store": store,
        "invoice_config": invoice_config,
        "receipt_template_code": receipt_template_code,
        "payments": payments or sale.payments.all(),
        "change": change,
        "cashier_name": cashier_name,
        "now": timezone.now(),
        **_verification_context(sale),
    }
    sale_ref = sale.invoice_number or str(sale.id).split("-")[0].upper()
    filename = _safe_pdf_filename(f"REC-{sale_ref}", fallback="recu")
    return render_pdf(
        template_name,
        context,
        filename,
        disposition="attachment" if as_attachment else "inline",
    )


def generate_shift_report_pdf(shift, store):
    """Generate shift report PDF."""
    from django.utils import timezone
    from cashier.models import Payment
    from django.db.models import Count, Sum

    payments = Payment.objects.filter(shift=shift)
    payment_by_method = payments.values("method").annotate(
        count=Count("id"),
        total=Sum("amount"),
    ).order_by("method")

    method_display_map = dict(Payment.METHODS)
    for item in payment_by_method:
        item["method_display"] = method_display_map.get(item["method"], item["method"])

    context = {
        "shift": shift,
        "store": store,
        "payment_count": payments.count(),
        "payment_by_method": payment_by_method,
        "now": timezone.now(),
    }
    filename = f"shift_{shift.id}.pdf"
    return render_pdf("pdf/shift_report.html", context, filename)


def generate_credit_payment_receipt_pdf(account, entry, store):
    """Generate PDF receipt/facture for a credit reimbursement."""
    from django.utils import timezone

    payment_amount = abs(entry.amount)
    balance_before = entry.balance_after + payment_amount
    history_entries = (
        account.ledger_entries
        .filter(entry_type=entry.EntryType.CREDIT_PAYMENT)
        .select_related("created_by")
        .order_by("-created_at")[:20]
    )
    reimbursement_history = [
        {
            "entry": item,
            "amount_paid": abs(item.amount),
            "is_current": item.pk == entry.pk,
        }
        for item in history_entries
    ]

    context = {
        "account": account,
        "entry": entry,
        "payment_amount": payment_amount,
        "balance_before": balance_before,
        "reimbursement_history": reimbursement_history,
        "store": store,
        "invoice_config": _build_invoice_config(store),
        "now": timezone.now(),
        **_verification_context(entry),
    }
    entry_ref = str(entry.pk).split("-")[0].upper()
    filename = _safe_pdf_filename(f"RCR-{entry_ref}", fallback="remboursement-credit")
    return render_pdf("pdf/credit_payment_receipt.html", context, filename)


def generate_quote_pdf(quote, store):
    """Generate A4 PDF for a quote (devis) or proforma."""
    from django.utils import timezone
    now = timezone.now()
    invoice_config = _build_invoice_config(store)

    # Dynamic title based on document_type
    doc_type = getattr(quote, "document_type", "DEVIS")
    if doc_type == "PROFORMA":
        document_title = "FACTURE PROFORMA"
        fallback_prefix = "PRO"
    else:
        document_title = "DEVIS"
        fallback_prefix = "DEV"

    template_mode = invoice_config.get("template", "CLASSIC")
    template_map = {
        "CORPORATE": "pdf/quote_a4_corporate.html",
        "BORDERED":  "pdf/quote_a4_bordered.html",
        "PRESTIGE":  "pdf/quote_a4_prestige.html",
    }
    template_name = template_map.get(template_mode, "pdf/quote_a4.html")

    doc_number = quote.quote_number or f"{fallback_prefix}-{str(quote.id).split('-')[0].upper()}"
    document = {
        "kind": "quote",
        "number": doc_number,
        "title": document_title,
        "valid_until": getattr(quote, "valid_until", None),
    }

    context = {
        "quote": quote,
        "store": store,
        "invoice_config": invoice_config,
        "document_title": document_title,
        "document": document,
        "now": now,
        **_verification_context(quote),
    }
    filename = _safe_pdf_filename(doc_number, fallback="devis")
    return render_pdf(template_name, context, filename)


def generate_cashier_operations_report_pdf(
    *,
    store,
    date_from,
    date_to,
    summary,
    by_cashier,
    by_method,
    operations,
    operations_truncated=False,
    generated_at=None,
):
    """Generate a cashier operations report PDF for a date range."""
    from django.utils import timezone

    generated_on = generated_at or timezone.now()
    context = {
        "store": store,
        "date_from": date_from,
        "date_to": date_to,
        "summary": summary,
        "by_cashier": by_cashier,
        "by_method": by_method,
        "operations": operations,
        "operations_truncated": operations_truncated,
        "generated_at": generated_on,
    }
    filename = _safe_pdf_filename(
        (
            f"operations-caissiers-{store.code or 'store'}-"
            f"{date_from:%Y%m%d}-{date_to:%Y%m%d}"
        ),
        fallback="operations-caissiers",
    )
    return render_pdf("pdf/cashier_operations_report.html", context, filename)
