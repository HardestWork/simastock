from decimal import Decimal

import pytest
from django.http import HttpResponse

from core import pdf as pdf_module
from sales.models import Sale


@pytest.mark.django_db
def test_receipt_modern_uses_invoice_pdf_layout(monkeypatch, store, admin_user):
    sale = Sale.objects.create(
        store=store,
        seller=admin_user,
        invoice_number="FAC-MODERN-001",
        status=Sale.Status.PAID,
        total=Decimal("10000.00"),
        amount_paid=Decimal("10000.00"),
        amount_due=Decimal("0.00"),
    )

    captured = {}

    def fake_generate_invoice_pdf(*, sale, store, document_kind="invoice"):
        captured["sale_id"] = str(sale.pk)
        captured["store_id"] = str(store.pk)
        captured["document_kind"] = document_kind
        response = HttpResponse(content_type="application/pdf")
        response["Content-Disposition"] = 'inline; filename="invoice.pdf"'
        return response

    monkeypatch.setattr(pdf_module, "generate_invoice_pdf", fake_generate_invoice_pdf)

    response = pdf_module.generate_receipt_pdf(
        sale=sale,
        store=store,
        template_code="modern",
        as_attachment=True,
    )

    assert captured == {
        "sale_id": str(sale.pk),
        "store_id": str(store.pk),
        "document_kind": "invoice",
    }
    assert response["Content-Disposition"] == 'attachment; filename="REC-FAC-MODERN-001.pdf"'


@pytest.mark.django_db
def test_receipt_ticket_keeps_ticket_template(monkeypatch, store, admin_user):
    sale = Sale.objects.create(
        store=store,
        seller=admin_user,
        invoice_number="FAC-TICKET-001",
        status=Sale.Status.PAID,
        total=Decimal("5000.00"),
        amount_paid=Decimal("5000.00"),
        amount_due=Decimal("0.00"),
    )

    captured = {}

    def fake_render_pdf(template_name, context, filename="document.pdf", disposition="inline"):
        captured["template_name"] = template_name
        captured["receipt_template_code"] = context.get("receipt_template_code")
        captured["filename"] = filename
        captured["disposition"] = disposition
        return HttpResponse(content_type="application/pdf")

    monkeypatch.setattr(pdf_module, "render_pdf", fake_render_pdf)
    monkeypatch.setattr(pdf_module, "_verification_context", lambda _obj: {})

    pdf_module.generate_receipt_pdf(
        sale=sale,
        store=store,
        template_code="ticket",
    )

    assert captured["template_name"] == "pdf/receipt_ticket.html"
    assert captured["receipt_template_code"] == "TICKET"
    assert captured["filename"] == "REC-FAC-TICKET-001.pdf"
    assert captured["disposition"] == "inline"
