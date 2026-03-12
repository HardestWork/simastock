"""Tests for SAV Phase 2 — PDF receipts and alerts."""
import pytest
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.utils import timezone

from alerts.models import Alert
from alerts.tasks import check_sav_overdue
from sav.models import (
    SAVDiagnosis,
    SAVRepairAction,
    SAVStatusHistory,
    SAVTicket,
)

BASE_URL = "/api/v1/sav/tickets/"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def admin_client(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    return api_client


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
def returned_ticket(store, admin_user):
    t = SAVTicket.objects.create(
        store=store,
        customer_name="Mamadou Keita",
        customer_phone="+22670000003",
        brand_name="iPhone",
        model_name="15 Pro",
        serial_number="IMEI999888",
        product_condition=SAVTicket.ProductCondition.SCRATCHED,
        warranty_status=SAVTicket.WarrantyStatus.UNDER,
        declared_issue="Batterie gonflee",
        received_by=admin_user,
        priority=SAVTicket.Priority.URGENT,
        status=SAVTicket.Status.RETURNED,
        returned_at=timezone.now(),
        returned_to="Mamadou Keita",
        return_notes="Appareil fonctionne parfaitement.",
    )
    SAVDiagnosis.objects.create(
        ticket=t,
        technician=admin_user,
        diagnosis="Batterie defectueuse",
        probable_cause="Usure normale",
        proposed_solution="Remplacement batterie",
        estimated_cost=Decimal("15000"),
        estimated_days=2,
        is_repairable=True,
    )
    SAVRepairAction.objects.create(
        ticket=t,
        technician=admin_user,
        description="Remplacement batterie iPhone 15 Pro",
        duration_minutes=45,
    )
    SAVStatusHistory.objects.create(
        ticket=t,
        from_status=SAVTicket.Status.RECEIVED,
        to_status=SAVTicket.Status.RETURNED,
        changed_by=admin_user,
        reason="Reparation terminee",
    )
    return t


# ---------------------------------------------------------------------------
# PDF Receipt Tests
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestSAVDepotReceipt:
    def test_depot_receipt_returns_pdf(self, admin_client, ticket):
        """GET /sav/tickets/{id}/depot-receipt/ returns a PDF."""
        resp = admin_client.get(f"{BASE_URL}{ticket.id}/depot-receipt/")
        assert resp.status_code == 200
        assert resp["Content-Type"] == "application/pdf"
        assert "SAV-DEPOT" in resp["Content-Disposition"]

    def test_depot_receipt_contains_reference(self, admin_client, ticket):
        """PDF filename contains SAV reference."""
        resp = admin_client.get(f"{BASE_URL}{ticket.id}/depot-receipt/")
        assert ticket.reference.replace("-", "-") in resp["Content-Disposition"]

    def test_depot_receipt_unauthenticated(self, api_client, ticket):
        """Unauthenticated users cannot access depot receipt."""
        resp = api_client.get(f"{BASE_URL}{ticket.id}/depot-receipt/")
        assert resp.status_code == 401


@pytest.mark.django_db
class TestSAVReturnReceipt:
    def test_return_receipt_returns_pdf(self, admin_client, returned_ticket):
        """GET /sav/tickets/{id}/return-receipt/ returns a PDF for returned tickets."""
        resp = admin_client.get(f"{BASE_URL}{returned_ticket.id}/return-receipt/")
        assert resp.status_code == 200
        assert resp["Content-Type"] == "application/pdf"
        assert "SAV-RESTITUTION" in resp["Content-Disposition"]

    def test_return_receipt_not_returned_yet(self, admin_client, ticket):
        """Return receipt should fail for tickets that haven't been returned."""
        resp = admin_client.get(f"{BASE_URL}{ticket.id}/return-receipt/")
        assert resp.status_code == 400
        assert "restitue" in resp.data["detail"].lower()

    def test_return_receipt_unauthenticated(self, api_client, returned_ticket):
        """Unauthenticated users cannot access return receipt."""
        resp = api_client.get(f"{BASE_URL}{returned_ticket.id}/return-receipt/")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Alert Model Tests
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestSAVAlertTypes:
    def test_sav_overdue_type_exists(self):
        """SAV_OVERDUE alert type is available."""
        assert "SAV_OVERDUE" in Alert.Type.values

    def test_sav_ready_type_exists(self):
        """SAV_READY alert type is available."""
        assert "SAV_READY" in Alert.Type.values

    def test_create_sav_overdue_alert(self, store):
        """Can create a SAV_OVERDUE alert."""
        alert = Alert.objects.create(
            store=store,
            alert_type=Alert.Type.SAV_OVERDUE,
            severity=Alert.Severity.WARNING,
            title="SAV en retard : SAV-2026-00001",
            message="Le dossier est en retard.",
            payload={"ticket_ref": "SAV-2026-00001"},
        )
        assert alert.alert_type == "SAV_OVERDUE"
        assert alert.pk is not None

    def test_create_sav_ready_alert(self, store):
        """Can create a SAV_READY alert."""
        alert = Alert.objects.create(
            store=store,
            alert_type=Alert.Type.SAV_READY,
            severity=Alert.Severity.INFO,
            title="SAV pret non recupere",
            message="L'appareil est pret depuis 7 jours.",
            payload={"ticket_ref": "SAV-2026-00002"},
        )
        assert alert.alert_type == "SAV_READY"


# ---------------------------------------------------------------------------
# Celery Task Tests
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestCheckSAVOverdueTask:
    def test_creates_overdue_alert_for_stale_ticket(self, store, admin_user):
        """Tickets stuck in active status for > SAV_OVERDUE_DAYS get an alert."""
        ticket = SAVTicket.objects.create(
            store=store,
            customer_name="Test Client",
            customer_phone="+22670000004",
            brand_name="Huawei",
            model_name="P30",
            declared_issue="Ne s'allume plus",
            received_by=admin_user,
            status=SAVTicket.Status.DIAGNOSING,
        )
        # Simulate ticket being stale for 5 days
        SAVTicket.objects.filter(pk=ticket.pk).update(
            updated_at=timezone.now() - timedelta(days=5)
        )

        with patch("alerts.tasks.send_push_for_alert_task"):
            result = check_sav_overdue()

        assert "1 alerts created" in result
        alert = Alert.objects.filter(
            alert_type=Alert.Type.SAV_OVERDUE,
            payload__ticket_ref=ticket.reference,
        ).first()
        assert alert is not None
        assert ticket.reference in alert.title
        assert alert.severity == Alert.Severity.WARNING

    def test_creates_critical_alert_after_7_days(self, store, admin_user):
        """Tickets stale > 7 days get a CRITICAL alert."""
        ticket = SAVTicket.objects.create(
            store=store,
            customer_name="Test Client 2",
            customer_phone="+22670000005",
            brand_name="Xiaomi",
            model_name="Redmi Note 12",
            declared_issue="Ecran noir",
            received_by=admin_user,
            status=SAVTicket.Status.IN_REPAIR,
        )
        SAVTicket.objects.filter(pk=ticket.pk).update(
            updated_at=timezone.now() - timedelta(days=10)
        )

        with patch("alerts.tasks.send_push_for_alert_task"):
            check_sav_overdue()

        alert = Alert.objects.filter(
            alert_type=Alert.Type.SAV_OVERDUE,
            payload__ticket_ref=ticket.reference,
        ).first()
        assert alert is not None
        assert alert.severity == Alert.Severity.CRITICAL

    def test_no_alert_for_recently_updated_ticket(self, store, admin_user):
        """Tickets updated recently should not trigger an alert."""
        SAVTicket.objects.create(
            store=store,
            customer_name="Test Client 3",
            customer_phone="+22670000006",
            brand_name="Oppo",
            model_name="Reno 8",
            declared_issue="Camera floue",
            received_by=admin_user,
            status=SAVTicket.Status.RECEIVED,
        )

        with patch("alerts.tasks.send_push_for_alert_task"):
            result = check_sav_overdue()

        assert "0 alerts created" in result

    def test_no_duplicate_alerts_same_day(self, store, admin_user):
        """Running the task twice on the same day should not create duplicates."""
        ticket = SAVTicket.objects.create(
            store=store,
            customer_name="Test Client 4",
            customer_phone="+22670000007",
            brand_name="Nokia",
            model_name="G60",
            declared_issue="Batterie ne charge plus",
            received_by=admin_user,
            status=SAVTicket.Status.AWAITING_PART,
        )
        SAVTicket.objects.filter(pk=ticket.pk).update(
            updated_at=timezone.now() - timedelta(days=4)
        )

        with patch("alerts.tasks.send_push_for_alert_task"):
            check_sav_overdue()
            check_sav_overdue()

        count = Alert.objects.filter(
            alert_type=Alert.Type.SAV_OVERDUE,
            payload__ticket_ref=ticket.reference,
        ).count()
        assert count == 1

    def test_creates_ready_alert_for_uncollected_ticket(self, store, admin_user):
        """Tickets in READY status for > SAV_READY_PICKUP_DAYS get an alert."""
        ticket = SAVTicket.objects.create(
            store=store,
            customer_name="Test Client 5",
            customer_phone="+22670000008",
            brand_name="LG",
            model_name="V60",
            declared_issue="Son coupe",
            received_by=admin_user,
            status=SAVTicket.Status.READY,
        )
        SAVTicket.objects.filter(pk=ticket.pk).update(
            updated_at=timezone.now() - timedelta(days=10)
        )

        with patch("alerts.tasks.send_push_for_alert_task"):
            result = check_sav_overdue()

        alert = Alert.objects.filter(
            alert_type=Alert.Type.SAV_READY,
            payload__ticket_ref=ticket.reference,
        ).first()
        assert alert is not None
        assert "pret" in alert.title.lower() or "recupere" in alert.title.lower()
        assert alert.severity == Alert.Severity.INFO

    def test_no_alert_for_closed_tickets(self, store, admin_user):
        """Closed/returned tickets should not trigger any alerts."""
        SAVTicket.objects.create(
            store=store,
            customer_name="Test Client 6",
            customer_phone="+22670000009",
            brand_name="Sony",
            model_name="Xperia 5",
            declared_issue="GPS defaillant",
            received_by=admin_user,
            status=SAVTicket.Status.CLOSED,
        )

        with patch("alerts.tasks.send_push_for_alert_task"):
            result = check_sav_overdue()

        assert "0 alerts created" in result


# ---------------------------------------------------------------------------
# PDF Generation Function Tests
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestSAVPDFGenerationFunctions:
    def test_generate_sav_depot_receipt_pdf(self, store, ticket):
        """generate_sav_depot_receipt_pdf returns a valid PDF response."""
        from core.pdf import generate_sav_depot_receipt_pdf

        response = generate_sav_depot_receipt_pdf(ticket, store)
        assert response.status_code == 200
        assert response["Content-Type"] == "application/pdf"
        content = b"".join(response.streaming_content) if hasattr(response, 'streaming_content') else response.content
        assert content[:4] == b"%PDF"

    def test_generate_sav_return_receipt_pdf(self, store, returned_ticket):
        """generate_sav_return_receipt_pdf returns a valid PDF response."""
        from core.pdf import generate_sav_return_receipt_pdf

        response = generate_sav_return_receipt_pdf(returned_ticket, store)
        assert response.status_code == 200
        assert response["Content-Type"] == "application/pdf"
        content = b"".join(response.streaming_content) if hasattr(response, 'streaming_content') else response.content
        assert content[:4] == b"%PDF"
