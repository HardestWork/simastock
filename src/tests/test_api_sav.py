"""Tests for SAV (Service Apres-Vente) API."""
import pytest
from decimal import Decimal

from django.contrib.auth import get_user_model

from sav.models import (
    SAVDiagnosis,
    SAVDiagnosisPart,
    SAVPartUsed,
    SAVQuote,
    SAVQuoteLine,
    SAVRepairAction,
    SAVStatusHistory,
    SAVTicket,
)

User = get_user_model()

BASE_URL = "/api/v1/sav/tickets/"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def admin_client(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    return api_client


@pytest.fixture
def sales_client(api_client, sales_user):
    api_client.force_authenticate(user=sales_user)
    return api_client


@pytest.fixture
def ticket_data():
    return {
        "customer_name": "Amadou Diallo",
        "customer_phone": "+22670000001",
        "customer_email": "amadou@test.com",
        "brand_name": "TP-Link",
        "model_name": "Archer AX50",
        "serial_number": "SN123456789",
        "product_condition": "GOOD",
        "warranty_status": "UNDER",
        "declared_issue": "Le routeur redémarre tout seul toutes les 10 minutes",
        "accessories": "Chargeur, cable RJ45",
        "priority": "HIGH",
    }


@pytest.fixture
def ticket(store, admin_user):
    return SAVTicket.objects.create(
        store=store,
        customer_name="Fatou Traore",
        customer_phone="+22670000002",
        brand_name="Mikrotik",
        model_name="hAP ac2",
        serial_number="MT987654321",
        product_condition=SAVTicket.ProductCondition.GOOD,
        warranty_status=SAVTicket.WarrantyStatus.OUT,
        declared_issue="Plus de WiFi",
        accessories="Chargeur",
        received_by=admin_user,
        priority=SAVTicket.Priority.MEDIUM,
    )


# ---------------------------------------------------------------------------
# Model tests
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestSAVTicketModel:
    def test_auto_reference(self, ticket):
        """Reference SAV auto-generee au format SAV-YYYY-XXXXX."""
        assert ticket.reference.startswith("SAV-")
        parts = ticket.reference.split("-")
        assert len(parts) == 3
        assert len(parts[2]) == 5  # zero-padded

    def test_auto_return_code(self, ticket):
        """Code de restitution auto-genere (6 chiffres)."""
        assert len(ticket.return_code) == 6
        assert ticket.return_code.isdigit()

    def test_default_status(self, ticket):
        assert ticket.status == SAVTicket.Status.RECEIVED

    def test_str(self, ticket):
        assert ticket.brand_name in str(ticket)
        assert ticket.reference in str(ticket)

    def test_sequential_references(self, store, admin_user):
        """Deux tickets crees ont des references sequentielles."""
        t1 = SAVTicket.objects.create(
            store=store, customer_name="A", customer_phone="1",
            brand_name="X", model_name="Y", declared_issue="Z",
            received_by=admin_user,
        )
        t2 = SAVTicket.objects.create(
            store=store, customer_name="B", customer_phone="2",
            brand_name="X", model_name="Y", declared_issue="Z",
            received_by=admin_user,
        )
        seq1 = int(t1.reference.split("-")[-1])
        seq2 = int(t2.reference.split("-")[-1])
        assert seq2 == seq1 + 1


# ---------------------------------------------------------------------------
# API — CRUD
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestSAVTicketCRUD:
    def test_create_ticket(self, admin_client, ticket_data):
        resp = admin_client.post(BASE_URL, ticket_data, format="json")
        assert resp.status_code == 201
        data = resp.json()
        assert data["reference"].startswith("SAV-")
        assert data["customer_name"] == "Amadou Diallo"
        assert data["brand_name"] == "TP-Link"
        assert data["status"] == "RECEIVED"
        assert data["received_by_name"] is not None
        assert len(data["return_code"]) == 6

    def test_create_minimal(self, admin_client):
        """Creation avec champs minimaux obligatoires."""
        resp = admin_client.post(BASE_URL, {
            "customer_name": "Test",
            "customer_phone": "123",
            "brand_name": "Generic",
            "model_name": "Router",
            "declared_issue": "Ne marche pas",
        }, format="json")
        assert resp.status_code == 201

    def test_list_tickets(self, admin_client, ticket):
        resp = admin_client.get(BASE_URL)
        assert resp.status_code == 200
        assert resp.json()["count"] >= 1

    def test_retrieve_ticket(self, admin_client, ticket):
        resp = admin_client.get(f"{BASE_URL}{ticket.id}/")
        assert resp.status_code == 200
        assert resp.json()["reference"] == ticket.reference

    def test_update_ticket(self, admin_client, ticket):
        resp = admin_client.patch(f"{BASE_URL}{ticket.id}/", {
            "priority": "URGENT",
            "notes": "Client VIP",
        }, format="json")
        assert resp.status_code == 200
        assert resp.json()["priority"] == "URGENT"

    def test_delete_ticket(self, admin_client, ticket):
        resp = admin_client.delete(f"{BASE_URL}{ticket.id}/")
        assert resp.status_code == 204

    def test_search_by_reference(self, admin_client, ticket):
        resp = admin_client.get(BASE_URL, {"search": ticket.reference})
        assert resp.status_code == 200
        assert resp.json()["count"] == 1

    def test_search_by_client(self, admin_client, ticket):
        resp = admin_client.get(BASE_URL, {"search": "Fatou"})
        assert resp.status_code == 200
        assert resp.json()["count"] >= 1

    def test_filter_by_status(self, admin_client, ticket):
        resp = admin_client.get(BASE_URL, {"status": "RECEIVED"})
        assert resp.status_code == 200
        assert resp.json()["count"] >= 1

    def test_filter_by_priority(self, admin_client, ticket):
        resp = admin_client.get(BASE_URL, {"priority": "MEDIUM"})
        assert resp.status_code == 200
        assert resp.json()["count"] >= 1

    def test_unauthenticated(self, api_client, ticket):
        resp = api_client.get(BASE_URL)
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# API — Workflow
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestSAVWorkflow:
    def test_update_status(self, admin_client, ticket):
        resp = admin_client.post(f"{BASE_URL}{ticket.id}/update-status/", {
            "status": "DIAGNOSING",
            "reason": "Technicien disponible",
        }, format="json")
        assert resp.status_code == 200
        assert resp.json()["status"] == "DIAGNOSING"
        # Verify history entry
        assert SAVStatusHistory.objects.filter(
            ticket=ticket, to_status="DIAGNOSING"
        ).exists()

    def test_invalid_status(self, admin_client, ticket):
        resp = admin_client.post(f"{BASE_URL}{ticket.id}/update-status/", {
            "status": "INVALID_STATUS",
        }, format="json")
        assert resp.status_code == 400

    def test_assign_technician(self, admin_client, ticket, admin_user):
        resp = admin_client.post(f"{BASE_URL}{ticket.id}/assign-technician/", {
            "technician": str(admin_user.id),
        }, format="json")
        assert resp.status_code == 200
        data = resp.json()
        assert data["technician"] == str(admin_user.id)
        # Auto-transitions to DIAGNOSING if was RECEIVED
        assert data["status"] == "DIAGNOSING"

    def test_assign_technician_missing_id(self, admin_client, ticket):
        resp = admin_client.post(f"{BASE_URL}{ticket.id}/assign-technician/", {}, format="json")
        assert resp.status_code == 400

    def test_full_workflow(self, admin_client, ticket, admin_user):
        """RECEIVED → DIAGNOSING → IN_REPAIR → REPAIRED → READY → RETURNED → CLOSED."""
        url = f"{BASE_URL}{ticket.id}/update-status/"

        for new_status in ["DIAGNOSING", "IN_REPAIR", "REPAIRED", "READY"]:
            resp = admin_client.post(url, {"status": new_status}, format="json")
            assert resp.status_code == 200, f"Failed at {new_status}: {resp.json()}"
            assert resp.json()["status"] == new_status

        # Return with code
        resp = admin_client.post(f"{BASE_URL}{ticket.id}/confirm-return/", {
            "code": ticket.return_code,
            "returned_to": "Fatou Traore",
        }, format="json")
        assert resp.status_code == 200
        assert resp.json()["status"] == "RETURNED"
        assert resp.json()["returned_to"] == "Fatou Traore"

        # Close
        resp = admin_client.post(url, {"status": "CLOSED"}, format="json")
        assert resp.status_code == 200
        assert resp.json()["status"] == "CLOSED"

        # Verify full history
        history = SAVStatusHistory.objects.filter(ticket=ticket).order_by("created_at")
        statuses = [h.to_status for h in history]
        assert statuses == ["DIAGNOSING", "IN_REPAIR", "REPAIRED", "READY", "RETURNED", "CLOSED"]

    def test_confirm_return_wrong_code(self, admin_client, ticket):
        resp = admin_client.post(f"{BASE_URL}{ticket.id}/confirm-return/", {
            "code": "000000",
        }, format="json")
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# API — Diagnosis
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestSAVDiagnosis:
    def test_submit_diagnosis(self, admin_client, ticket):
        resp = admin_client.post(f"{BASE_URL}{ticket.id}/diagnose/", {
            "diagnosis": "Carte mere defectueuse",
            "probable_cause": "Surtension electrique",
            "proposed_solution": "Remplacement carte mere",
            "estimated_cost": 15000,
            "estimated_days": 3,
            "is_repairable": True,
        }, format="json")
        assert resp.status_code == 200
        data = resp.json()
        # Should transition to AWAITING_CLIENT (hors garantie + cost > 0)
        assert data["status"] == "AWAITING_CLIENT"
        assert data["diagnosis"] is not None
        assert data["diagnosis"]["diagnosis"] == "Carte mere defectueuse"
        assert data["is_paid_repair"] is True

    def test_diagnosis_under_warranty_free(self, admin_client, store, admin_user):
        """Sous garantie + cout 0 → direct IN_REPAIR."""
        t = SAVTicket.objects.create(
            store=store, customer_name="X", customer_phone="1",
            brand_name="B", model_name="M", declared_issue="P",
            received_by=admin_user, warranty_status=SAVTicket.WarrantyStatus.UNDER,
        )
        resp = admin_client.post(f"{BASE_URL}{t.id}/diagnose/", {
            "diagnosis": "Simple nettoyage",
            "estimated_cost": 0,
            "is_repairable": True,
        }, format="json")
        assert resp.status_code == 200
        assert resp.json()["status"] == "IN_REPAIR"

    def test_diagnosis_not_repairable(self, admin_client, ticket):
        resp = admin_client.post(f"{BASE_URL}{ticket.id}/diagnose/", {
            "diagnosis": "Carte mere brulee au-dela de toute reparation",
            "is_repairable": False,
        }, format="json")
        assert resp.status_code == 200
        assert resp.json()["status"] == "NOT_REPAIRABLE"

    def test_diagnosis_empty(self, admin_client, ticket):
        resp = admin_client.post(f"{BASE_URL}{ticket.id}/diagnose/", {
            "diagnosis": "",
        }, format="json")
        assert resp.status_code == 400

    def test_diagnosis_with_parts(self, admin_client, ticket):
        resp = admin_client.post(f"{BASE_URL}{ticket.id}/diagnose/", {
            "diagnosis": "Port charge HS",
            "estimated_cost": 5000,
            "is_repairable": True,
            "parts_needed": [
                {"description": "Port USB-C", "quantity": 1, "unit_cost": 3000, "in_stock": True},
                {"description": "Soudure", "quantity": 1, "unit_cost": 0, "in_stock": True},
            ],
        }, format="json")
        assert resp.status_code == 200
        diag = SAVDiagnosis.objects.get(ticket=ticket)
        assert diag.parts_needed.count() == 2


# ---------------------------------------------------------------------------
# API — Repair actions
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestSAVRepairActions:
    def test_add_repair_action(self, admin_client, ticket):
        # Set to IN_REPAIR first
        ticket.status = SAVTicket.Status.IN_REPAIR
        ticket.save()

        resp = admin_client.post(f"{BASE_URL}{ticket.id}/add-repair-action/", {
            "description": "Remplacement du port USB-C",
            "duration_minutes": 45,
            "notes": "Soudure propre effectuee",
        }, format="json")
        assert resp.status_code == 201
        assert SAVRepairAction.objects.filter(ticket=ticket).count() == 1

    def test_add_repair_action_empty(self, admin_client, ticket):
        resp = admin_client.post(f"{BASE_URL}{ticket.id}/add-repair-action/", {
            "description": "",
        }, format="json")
        assert resp.status_code == 400

    def test_repair_action_auto_status(self, admin_client, ticket):
        """Adding a repair action on a RECEIVED ticket auto-moves to IN_REPAIR."""
        assert ticket.status == SAVTicket.Status.RECEIVED
        resp = admin_client.post(f"{BASE_URL}{ticket.id}/add-repair-action/", {
            "description": "Test rapide",
        }, format="json")
        assert resp.status_code == 201
        ticket.refresh_from_db()
        assert ticket.status == SAVTicket.Status.IN_REPAIR


# ---------------------------------------------------------------------------
# API — Quotes
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestSAVQuotes:
    def test_create_and_accept_quote(self, admin_client, ticket):
        from django.utils import timezone
        import datetime

        quote = SAVQuote.objects.create(
            ticket=ticket,
            parts_total=10000,
            labor_cost=5000,
            total=15000,
            valid_until=timezone.localdate() + datetime.timedelta(days=7),
            created_by=ticket.received_by,
        )

        # Accept
        resp = admin_client.post(f"/api/v1/sav/quotes/{quote.id}/accept/")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ACCEPTED"

        ticket.refresh_from_db()
        assert ticket.status == SAVTicket.Status.IN_REPAIR
        assert ticket.total_cost == Decimal("15000")

    def test_refuse_quote(self, admin_client, ticket):
        from django.utils import timezone
        import datetime

        quote = SAVQuote.objects.create(
            ticket=ticket,
            total=15000,
            valid_until=timezone.localdate() + datetime.timedelta(days=7),
            created_by=ticket.received_by,
        )
        resp = admin_client.post(f"/api/v1/sav/quotes/{quote.id}/refuse/")
        assert resp.status_code == 200
        assert resp.json()["status"] == "REFUSED"

        ticket.refresh_from_db()
        assert ticket.status == SAVTicket.Status.REFUSED


# ---------------------------------------------------------------------------
# API — Dashboard
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestSAVDashboard:
    def test_dashboard(self, admin_client, ticket):
        resp = admin_client.get(f"{BASE_URL}dashboard/")
        assert resp.status_code == 200
        data = resp.json()
        assert "month_received" in data
        assert "total_active" in data
        assert "by_status" in data
        assert "repair_rate" in data
        assert "top_brands" in data
        assert data["total_active"] >= 1

    def test_dashboard_unauthenticated(self, api_client):
        resp = api_client.get(f"{BASE_URL}dashboard/")
        assert resp.status_code == 401
