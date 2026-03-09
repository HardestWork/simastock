"""Tests for the Push Notification API endpoints."""
import pytest
from unittest.mock import patch, MagicMock

from alerts.models import Alert, PushSubscription


# ── Helpers ──────────────────────────────────────────────────────────────

URL_VAPID = "/api/v1/push/vapid-key/"
URL_SUBSCRIBE = "/api/v1/push/subscribe/"
URL_UNSUBSCRIBE = "/api/v1/push/unsubscribe/"
URL_UNREAD = "/api/v1/alerts/unread-count/"


def _enable_alerts_module(store):
    ent = store.enterprise
    flags = ent.analytics_feature_flags or {}
    flags["alerts_center"] = True
    ent.analytics_feature_flags = flags
    ent.save(update_fields=["analytics_feature_flags"])


FAKE_SUBSCRIPTION = {
    "endpoint": "https://fcm.googleapis.com/fcm/send/fake-endpoint-123",
    "expirationTime": None,
    "keys": {
        "p256dh": "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQ",
        "auth": "tBHItJI5svbpC7gB_Q",
    },
}


# ── VAPID Key ────────────────────────────────────────────────────────────


@pytest.mark.django_db
class TestVapidPublicKey:
    def test_get_vapid_key(self, admin_client):
        r = admin_client.get(URL_VAPID)
        assert r.status_code == 200
        assert "vapid_public_key" in r.data

    def test_unauthenticated_rejected(self, api_client):
        r = api_client.get(URL_VAPID)
        assert r.status_code in (401, 403)


# ── Subscribe ────────────────────────────────────────────────────────────


@pytest.mark.django_db
class TestPushSubscribe:
    def test_subscribe_success(self, admin_client, admin_user):
        r = admin_client.post(URL_SUBSCRIBE, FAKE_SUBSCRIPTION, format="json")
        assert r.status_code == 201
        assert r.data["created"] is True

        sub = PushSubscription.objects.get(user=admin_user)
        assert sub.endpoint == FAKE_SUBSCRIPTION["endpoint"]
        assert sub.is_active is True

    def test_subscribe_idempotent(self, admin_client, admin_user):
        """Second subscribe with same endpoint updates, doesn't duplicate."""
        admin_client.post(URL_SUBSCRIBE, FAKE_SUBSCRIPTION, format="json")
        r2 = admin_client.post(URL_SUBSCRIBE, FAKE_SUBSCRIPTION, format="json")
        assert r2.status_code == 200
        assert r2.data["created"] is False
        assert PushSubscription.objects.filter(user=admin_user).count() == 1

    def test_subscribe_missing_keys_rejected(self, admin_client):
        r = admin_client.post(
            URL_SUBSCRIBE,
            {"endpoint": "https://example.com/push"},
            format="json",
        )
        assert r.status_code == 400

    def test_subscribe_missing_endpoint_rejected(self, admin_client):
        r = admin_client.post(
            URL_SUBSCRIBE,
            {"keys": {"p256dh": "abc", "auth": "def"}},
            format="json",
        )
        assert r.status_code == 400

    def test_unauthenticated_rejected(self, api_client):
        r = api_client.post(URL_SUBSCRIBE, FAKE_SUBSCRIPTION, format="json")
        assert r.status_code in (401, 403)


# ── Unsubscribe ──────────────────────────────────────────────────────────


@pytest.mark.django_db
class TestPushUnsubscribe:
    def test_unsubscribe_deactivates(self, admin_client, admin_user):
        PushSubscription.objects.create(
            user=admin_user,
            endpoint=FAKE_SUBSCRIPTION["endpoint"],
            subscription_info=FAKE_SUBSCRIPTION,
            is_active=True,
        )
        r = admin_client.post(
            URL_UNSUBSCRIBE,
            {"endpoint": FAKE_SUBSCRIPTION["endpoint"]},
            format="json",
        )
        assert r.status_code == 200
        sub = PushSubscription.objects.get(user=admin_user)
        assert sub.is_active is False

    def test_unsubscribe_nonexistent_endpoint(self, admin_client):
        r = admin_client.post(
            URL_UNSUBSCRIBE,
            {"endpoint": "https://example.com/not-found"},
            format="json",
        )
        assert r.status_code == 200  # no-op, 0 updated


# ── Unread Count ─────────────────────────────────────────────────────────


@pytest.mark.django_db
class TestUnreadAlertCount:
    def test_unread_count_zero(self, admin_client):
        r = admin_client.get(URL_UNREAD)
        assert r.status_code == 200
        assert r.data["unread_count"] == 0

    def test_unread_count_reflects_alerts(self, admin_client, store):
        _enable_alerts_module(store)
        Alert.objects.create(
            store=store,
            alert_type=Alert.Type.LOW_STOCK,
            severity=Alert.Severity.WARNING,
            title="Test 1",
            message="msg",
        )
        Alert.objects.create(
            store=store,
            alert_type=Alert.Type.LOW_STOCK,
            severity=Alert.Severity.WARNING,
            title="Test 2",
            message="msg",
        )
        r = admin_client.get(URL_UNREAD)
        assert r.status_code == 200
        assert r.data["unread_count"] == 2

    def test_unread_count_excludes_read(self, admin_client, store, admin_user):
        _enable_alerts_module(store)
        a = Alert.objects.create(
            store=store,
            alert_type=Alert.Type.LOW_STOCK,
            severity=Alert.Severity.INFO,
            title="Read",
            message="msg",
        )
        a.mark_as_read(admin_user)
        Alert.objects.create(
            store=store,
            alert_type=Alert.Type.LOW_STOCK,
            severity=Alert.Severity.INFO,
            title="Unread",
            message="msg",
        )
        r = admin_client.get(URL_UNREAD)
        assert r.data["unread_count"] == 1

    def test_unauthenticated_rejected(self, api_client):
        r = api_client.get(URL_UNREAD)
        assert r.status_code in (401, 403)


# ── Push Service (unit tests) ────────────────────────────────────────────


@pytest.mark.django_db
class TestPushService:
    def test_send_push_for_alert_no_subscriptions(self, store):
        _enable_alerts_module(store)
        alert = Alert.objects.create(
            store=store,
            alert_type=Alert.Type.LOW_STOCK,
            severity=Alert.Severity.WARNING,
            title="Test",
            message="msg",
        )
        from alerts.services import send_push_for_alert
        count = send_push_for_alert(alert)
        assert count == 0

    @patch("alerts.services.send_push_to_subscription")
    def test_send_push_for_alert_with_subscription(
        self, mock_send, store, admin_user
    ):
        _enable_alerts_module(store)
        mock_send.return_value = True
        PushSubscription.objects.create(
            user=admin_user,
            endpoint="https://push.example.com/test",
            subscription_info=FAKE_SUBSCRIPTION,
            is_active=True,
        )
        alert = Alert.objects.create(
            store=store,
            alert_type=Alert.Type.CASH_VARIANCE,
            severity=Alert.Severity.CRITICAL,
            title="Ecart",
            message="5000 FCFA",
        )
        from alerts.services import send_push_for_alert
        count = send_push_for_alert(alert)
        assert count == 1
        mock_send.assert_called_once()

    @patch("alerts.services.send_push_to_subscription")
    def test_send_push_skips_inactive_subscriptions(
        self, mock_send, store, admin_user
    ):
        _enable_alerts_module(store)
        PushSubscription.objects.create(
            user=admin_user,
            endpoint="https://push.example.com/inactive",
            subscription_info=FAKE_SUBSCRIPTION,
            is_active=False,
        )
        alert = Alert.objects.create(
            store=store,
            alert_type=Alert.Type.LOW_STOCK,
            severity=Alert.Severity.INFO,
            title="Test",
            message="msg",
        )
        from alerts.services import send_push_for_alert
        count = send_push_for_alert(alert)
        assert count == 0
        mock_send.assert_not_called()

    @patch("alerts.tasks.send_push_for_alert_task")
    def test_create_alert_dispatches_push_task(self, mock_task, store):
        """create_alert() triggers the push task."""
        _enable_alerts_module(store)
        from alerts.services import create_alert
        alert = create_alert(
            store=store,
            alert_type=Alert.Type.LOW_STOCK,
            severity=Alert.Severity.WARNING,
            title="Push test",
            message="Should dispatch task",
        )
        mock_task.delay.assert_called_once_with(str(alert.id))
