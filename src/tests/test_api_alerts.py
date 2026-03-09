"""Tests for the Alerts module API endpoints."""
import pytest

from alerts.models import Alert


# ── Helpers ──────────────────────────────────────────────────────────────

def _enable_alerts_module(store):
    ent = store.enterprise
    flags = ent.analytics_feature_flags or {}
    flags["alerts_center"] = True
    ent.analytics_feature_flags = flags
    ent.save(update_fields=["analytics_feature_flags"])


URL_ALERTS = "/api/v1/alerts/"


# ── Fixtures ─────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def enable_alerts(store):
    _enable_alerts_module(store)


@pytest.fixture
def alert_low_stock(store):
    return Alert.objects.create(
        store=store,
        alert_type=Alert.Type.LOW_STOCK,
        severity=Alert.Severity.WARNING,
        title="Stock faible: Chargeur USB",
        message="Le stock de Chargeur USB est en dessous du seuil minimum (5/10).",
        payload={"product_id": "abc123", "current_qty": 5, "min_qty": 10},
    )


@pytest.fixture
def alert_cash_variance(store):
    return Alert.objects.create(
        store=store,
        alert_type=Alert.Type.CASH_VARIANCE,
        severity=Alert.Severity.CRITICAL,
        title="Ecart de caisse detecte",
        message="Un ecart de 5000 FCFA a ete detecte lors de la cloture.",
        payload={"variance": 5000},
    )


@pytest.fixture
def alert_credit_overdue(store):
    return Alert.objects.create(
        store=store,
        alert_type=Alert.Type.CREDIT_OVERDUE,
        severity=Alert.Severity.INFO,
        title="Credit en retard: Jean Dupont",
        message="Le paiement de 25000 FCFA est en retard de 10 jours.",
    )


# ── List & Filter ───────────────────────────────────────────────────────


@pytest.mark.django_db
class TestAlertList:
    def test_list_alerts(self, admin_client, alert_low_stock, alert_cash_variance):
        r = admin_client.get(URL_ALERTS)
        assert r.status_code == 200
        assert len(r.data["results"]) >= 2

    def test_filter_by_type(self, admin_client, alert_low_stock, alert_cash_variance):
        r = admin_client.get(URL_ALERTS, {"alert_type": "LOW_STOCK"})
        assert r.status_code == 200
        assert all(a["alert_type"] == "LOW_STOCK" for a in r.data["results"])

    def test_filter_by_severity(self, admin_client, alert_low_stock, alert_cash_variance):
        r = admin_client.get(URL_ALERTS, {"severity": "CRITICAL"})
        assert r.status_code == 200
        assert all(a["severity"] == "CRITICAL" for a in r.data["results"])

    def test_filter_by_read_status(self, admin_client, alert_low_stock, alert_cash_variance, admin_user):
        alert_low_stock.mark_as_read(admin_user)
        r = admin_client.get(URL_ALERTS, {"is_read": False})
        assert r.status_code == 200
        assert all(not a["is_read"] for a in r.data["results"])

    def test_retrieve_alert_detail(self, admin_client, alert_low_stock):
        r = admin_client.get(f"{URL_ALERTS}{alert_low_stock.pk}/")
        assert r.status_code == 200
        assert r.data["alert_type"] == "LOW_STOCK"
        assert r.data["title"] == "Stock faible: Chargeur USB"


# ── Mark Read ────────────────────────────────────────────────────────────


@pytest.mark.django_db
class TestAlertMarkRead:
    def test_mark_single_read(self, admin_client, alert_low_stock):
        assert alert_low_stock.is_read is False
        r = admin_client.post(f"{URL_ALERTS}{alert_low_stock.pk}/mark-read/")
        assert r.status_code == 200
        assert r.data["is_read"] is True
        alert_low_stock.refresh_from_db()
        assert alert_low_stock.is_read is True
        assert alert_low_stock.read_by is not None

    def test_mark_all_read(self, admin_client, alert_low_stock, alert_cash_variance, alert_credit_overdue):
        assert Alert.objects.filter(is_read=False).count() == 3
        r = admin_client.post(f"{URL_ALERTS}mark-all-read/")
        assert r.status_code == 200
        assert Alert.objects.filter(is_read=False).count() == 0

    def test_mark_read_idempotent(self, admin_client, alert_low_stock, admin_user):
        alert_low_stock.mark_as_read(admin_user)
        r = admin_client.post(f"{URL_ALERTS}{alert_low_stock.pk}/mark-read/")
        assert r.status_code == 200
        assert r.data["is_read"] is True


# ── Store Isolation ──────────────────────────────────────────────────────


@pytest.mark.django_db
class TestAlertStoreIsolation:
    def test_cannot_see_other_enterprise_alerts(self, admin_client):
        """Alerts from a different enterprise should not be visible."""
        from stores.models import Enterprise, Store
        other_ent = Enterprise.objects.create(name="Other Ent", code="OTHER-ENT", currency="FCFA")
        other_store = Store.objects.create(
            enterprise=other_ent, name="Other", code="OTHER-01",
        )
        _enable_alerts_module(other_store)
        Alert.objects.create(
            store=other_store,
            alert_type=Alert.Type.LOW_STOCK,
            severity=Alert.Severity.WARNING,
            title="Other enterprise alert",
            message="Should not be visible",
        )
        r = admin_client.get(URL_ALERTS)
        assert r.status_code == 200
        for a in r.data["results"]:
            assert a["title"] != "Other enterprise alert"


# ── Authorization ────────────────────────────────────────────────────────


@pytest.mark.django_db
class TestAlertAuthorization:
    def test_unauthenticated_rejected(self, api_client):
        r = api_client.get(URL_ALERTS)
        assert r.status_code in (401, 403)

    def test_module_disabled_rejected(self, admin_client, store):
        ent = store.enterprise
        flags = ent.analytics_feature_flags or {}
        flags["alerts_center"] = False
        ent.analytics_feature_flags = flags
        ent.save(update_fields=["analytics_feature_flags"])

        r = admin_client.get(URL_ALERTS)
        assert r.status_code == 403

    def test_cannot_create_alert_via_api(self, admin_client, store):
        """Alerts are system-generated only, no POST endpoint."""
        r = admin_client.post(URL_ALERTS, {
            "store": str(store.pk),
            "alert_type": "LOW_STOCK",
            "title": "Test",
            "message": "Should fail",
        }, format="json")
        assert r.status_code == 405  # Method Not Allowed

    def test_cannot_delete_alert(self, admin_client, alert_low_stock):
        """Alerts cannot be deleted via API."""
        r = admin_client.delete(f"{URL_ALERTS}{alert_low_stock.pk}/")
        assert r.status_code == 405
