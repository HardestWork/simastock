"""Tests for SAV Phases 3-5 — Tracking view and enhanced dashboard."""
import pytest
from decimal import Decimal

from django.utils import timezone

from sav.models import SAVStatusHistory, SAVTicket

BASE_URL = "/api/v1/sav/tickets/"
TRACK_URL = "/api/v1/sav/track/"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def ticket(store, admin_user):
    return SAVTicket.objects.create(
        store=store,
        customer_name="Fatou Traore",
        customer_phone="+22670000002",
        brand_name="Samsung",
        model_name="Galaxy A54",
        serial_number="IMEI123456",
        product_condition=SAVTicket.ProductCondition.GOOD,
        warranty_status=SAVTicket.WarrantyStatus.OUT,
        declared_issue="Ecran casse",
        accessories="Chargeur, coque",
        received_by=admin_user,
        priority=SAVTicket.Priority.HIGH,
    )


@pytest.fixture
def ticket_with_timeline(store, admin_user):
    """Ticket with status history entries for timeline testing."""
    t = SAVTicket.objects.create(
        store=store,
        customer_name="Amadou Diallo",
        customer_phone="+22670000010",
        brand_name="iPhone",
        model_name="14 Pro",
        declared_issue="Batterie gonflee",
        received_by=admin_user,
        status=SAVTicket.Status.IN_REPAIR,
        warranty_status=SAVTicket.WarrantyStatus.UNDER,
    )
    SAVStatusHistory.objects.create(
        ticket=t,
        from_status=SAVTicket.Status.RECEIVED,
        to_status=SAVTicket.Status.DIAGNOSING,
        changed_by=admin_user,
        reason="Technicien assigne",
    )
    SAVStatusHistory.objects.create(
        ticket=t,
        from_status=SAVTicket.Status.DIAGNOSING,
        to_status=SAVTicket.Status.IN_REPAIR,
        changed_by=admin_user,
        reason="Diagnostic termine",
    )
    return t


@pytest.fixture
def paid_ticket(store, admin_user):
    """A paid SAV ticket with total_cost set."""
    return SAVTicket.objects.create(
        store=store,
        customer_name="Moussa Keita",
        customer_phone="+22670000011",
        brand_name="Huawei",
        model_name="P40",
        declared_issue="Ecran fissure",
        received_by=admin_user,
        warranty_status=SAVTicket.WarrantyStatus.OUT,
        is_paid_repair=True,
        total_cost=Decimal("50000"),
        status=SAVTicket.Status.CLOSED,
        closed_at=timezone.now(),
    )


# ---------------------------------------------------------------------------
# Phase 4 — SAV Tracking View (public)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestSAVTrackView:
    def test_track_by_reference_ok(self, api_client, ticket_with_timeline):
        """GET /sav/track/{reference}/ returns ticket info with timeline."""
        ref = ticket_with_timeline.reference
        resp = api_client.get(f"{TRACK_URL}{ref}/")

        assert resp.status_code == 200
        data = resp.data
        assert data["reference"] == ref
        assert data["status"] == ticket_with_timeline.status
        assert data["brand_name"] == "iPhone"
        assert data["model_name"] == "14 Pro"
        assert data["customer_name"] == "Amadou Diallo"
        assert isinstance(data["timeline"], list)
        assert len(data["timeline"]) == 2

    def test_track_not_found(self, api_client):
        """GET with an invalid reference returns 404."""
        resp = api_client.get(f"{TRACK_URL}SAV-0000-99999/")
        assert resp.status_code == 404

    def test_track_no_auth_required(self, ticket):
        """The track endpoint works without any authentication headers."""
        from rest_framework.test import APIClient

        anon_client = APIClient()  # no force_authenticate
        resp = anon_client.get(f"{TRACK_URL}{ticket.reference}/")
        assert resp.status_code == 200
        assert resp.data["reference"] == ticket.reference


# ---------------------------------------------------------------------------
# Phase 5 — Enhanced Dashboard
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestSAVDashboardEnhanced:
    def test_dashboard_returns_monthly_trend(self, admin_client, ticket):
        """Dashboard response includes monthly_trend list."""
        resp = admin_client.get(f"{BASE_URL}dashboard/")
        assert resp.status_code == 200
        data = resp.data
        assert "monthly_trend" in data
        assert isinstance(data["monthly_trend"], list)
        assert len(data["monthly_trend"]) > 0
        entry = data["monthly_trend"][0]
        assert "month" in entry
        assert "received" in entry
        assert "closed" in entry

    def test_dashboard_returns_warranty_breakdown(self, admin_client, ticket):
        """Dashboard response includes warranty_breakdown."""
        resp = admin_client.get(f"{BASE_URL}dashboard/")
        assert resp.status_code == 200
        data = resp.data
        assert "warranty_breakdown" in data
        wb = data["warranty_breakdown"]
        assert "under" in wb
        assert "out" in wb
        assert "unknown" in wb

    def test_dashboard_returns_revenue(self, admin_client, ticket):
        """Dashboard response includes revenue_month and revenue_total."""
        resp = admin_client.get(f"{BASE_URL}dashboard/")
        assert resp.status_code == 200
        data = resp.data
        assert "revenue_month" in data
        assert "revenue_total" in data
        assert isinstance(data["revenue_month"], (int, float))
        assert isinstance(data["revenue_total"], (int, float))

    def test_dashboard_revenue_correct(self, admin_client, paid_ticket):
        """Revenue total reflects the total_cost of paid tickets."""
        resp = admin_client.get(f"{BASE_URL}dashboard/")
        assert resp.status_code == 200
        assert resp.data["revenue_total"] >= 50000
