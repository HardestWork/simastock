"""Tests for public invoice download endpoint (WhatsApp sharing)."""
from decimal import Decimal

import pytest
from django.http import HttpResponse

from api.v1 import views as v1_views
from sales.models import Sale


pytestmark = pytest.mark.django_db


@pytest.fixture
def sale(store, admin_user):
    return Sale.objects.create(
        store=store,
        seller=admin_user,
        invoice_number="FAC-DL-001",
        status=Sale.Status.PAID,
        total=Decimal("15000"),
        amount_paid=Decimal("15000"),
        amount_due=Decimal("0"),
    )


@pytest.fixture
def _mock_pdf(monkeypatch):
    """Mock PDF generation to avoid WeasyPrint dependency."""
    def fake_generate(*, sale, store, document_kind="invoice"):
        resp = HttpResponse(b"%PDF-fake", content_type="application/pdf")
        resp["Content-Disposition"] = f'inline; filename="{sale.invoice_number}.pdf"'
        return resp
    monkeypatch.setattr(v1_views, "generate_invoice_pdf", fake_generate)


class TestInvoiceDownloadPublicEndpoint:
    """Tests for GET /api/v1/invoices/dl/<token>/."""

    def test_valid_token_returns_pdf(self, api_client, sale, _mock_pdf):
        resp = api_client.get(f"/api/v1/invoices/dl/{sale.verification_token}/")
        assert resp.status_code == 200
        assert resp["Content-Type"] == "application/pdf"

    def test_invalid_token_returns_404(self, api_client):
        resp = api_client.get("/api/v1/invoices/dl/nonexistent_token_12345678/")
        assert resp.status_code == 404

    def test_no_auth_required(self, client, sale, _mock_pdf):
        """Unauthenticated Django test client can download."""
        resp = client.get(f"/api/v1/invoices/dl/{sale.verification_token}/")
        assert resp.status_code == 200
        assert resp["Content-Type"] == "application/pdf"

    def test_token_auto_generated_on_sale_create(self, sale):
        assert sale.verification_token is not None
        assert len(sale.verification_token) == 32

    def test_different_sales_have_unique_tokens(self, store, admin_user):
        s1 = Sale.objects.create(
            store=store, seller=admin_user,
            invoice_number="FAC-U-001", status=Sale.Status.PAID,
            total=Decimal("1000"), amount_paid=Decimal("1000"),
            amount_due=Decimal("0"),
        )
        s2 = Sale.objects.create(
            store=store, seller=admin_user,
            invoice_number="FAC-U-002", status=Sale.Status.PAID,
            total=Decimal("2000"), amount_paid=Decimal("2000"),
            amount_due=Decimal("0"),
        )
        assert s1.verification_token != s2.verification_token
