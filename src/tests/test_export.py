"""Tests for CSV export utility and endpoints."""
import pytest
from django.http import HttpResponse

from core.export import queryset_to_csv_response
from stores.models import Enterprise


class TestCsvExportUtil:
    def test_basic_export(self, enterprise):
        qs = Enterprise.objects.filter(pk=enterprise.pk)
        columns = [
            ("name", "Nom"),
            ("code", "Code"),
            ("currency", "Devise"),
        ]
        resp = queryset_to_csv_response(qs, columns, "test")
        assert isinstance(resp, HttpResponse)
        assert resp["Content-Type"] == "text/csv; charset=utf-8"
        assert "test.csv" in resp["Content-Disposition"]
        content = resp.content.decode("utf-8-sig")
        assert "Nom,Code,Devise" in content
        assert "Test Enterprise" in content

    def test_callable_column(self, enterprise):
        qs = Enterprise.objects.filter(pk=enterprise.pk)
        columns = [
            (lambda o: o.name.upper(), "NOM MAJUSCULE"),
        ]
        resp = queryset_to_csv_response(qs, columns, "test2")
        content = resp.content.decode("utf-8-sig")
        assert "TEST ENTERPRISE" in content

    def test_empty_queryset(self, db):
        qs = Enterprise.objects.none()
        columns = [("name", "Nom")]
        resp = queryset_to_csv_response(qs, columns, "empty")
        content = resp.content.decode("utf-8-sig")
        lines = content.strip().split("\n")
        assert len(lines) == 1  # header only


class TestExportEndpoints:
    """Test CSV export API endpoints return valid CSV."""

    def test_customer_export(self, admin_client, enterprise):
        from customers.models import Customer
        Customer.objects.create(
            enterprise=enterprise,
            first_name="Jean",
            last_name="Dupont",
            phone="691234567",
        )
        resp = admin_client.get("/api/v1/customers/export-csv/")
        assert resp.status_code == 200
        assert "text/csv" in resp["Content-Type"]
        content = resp.content.decode("utf-8-sig")
        assert "Jean" in content or "Dupont" in content
