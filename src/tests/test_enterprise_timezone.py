"""Tests for per-enterprise timezone support."""
import zoneinfo

import pytest
from django.test import RequestFactory, override_settings
from django.utils import timezone
from rest_framework.test import APIClient, force_authenticate

from stores.middleware import CurrentStoreMiddleware
from stores.models import Enterprise, Store, StoreUser


pytestmark = pytest.mark.django_db


class TestEnterpriseTimezoneField:
    """Test the timezone field on Enterprise model."""

    def test_default_timezone_is_ouagadougou(self, enterprise):
        assert enterprise.timezone == "Africa/Ouagadougou"

    def test_custom_timezone_persists(self, db):
        ent = Enterprise.objects.create(
            name="Paris Corp",
            code="PARIS-1",
            timezone="Europe/Paris",
        )
        ent.refresh_from_db()
        assert ent.timezone == "Europe/Paris"

    def test_timezone_update(self, enterprise):
        enterprise.timezone = "America/New_York"
        enterprise.save()
        enterprise.refresh_from_db()
        assert enterprise.timezone == "America/New_York"


class TestTimezoneMiddlewareActivation:
    """Test that CurrentStoreMiddleware activates the enterprise timezone."""

    def _make_middleware(self):
        def fake_response(request):
            # Capture the active timezone during the request
            request._active_tz = timezone.get_current_timezone_name()
            return request
        return CurrentStoreMiddleware(fake_response)

    def test_middleware_activates_enterprise_timezone(self, admin_user, enterprise, store):
        enterprise.timezone = "Europe/Paris"
        enterprise.save()

        middleware = self._make_middleware()
        factory = RequestFactory()
        request = factory.get("/api/v1/test/")
        request.user = admin_user
        request.session = {"store_id": str(store.pk)}

        result = middleware(request)
        assert result._active_tz == "Europe/Paris"

    def test_middleware_activates_ouagadougou_by_default(self, admin_user, enterprise, store):
        middleware = self._make_middleware()
        factory = RequestFactory()
        request = factory.get("/api/v1/test/")
        request.user = admin_user
        request.session = {"store_id": str(store.pk)}

        result = middleware(request)
        assert result._active_tz == "Africa/Ouagadougou"

    def test_middleware_deactivates_for_anonymous(self):
        from django.contrib.auth.models import AnonymousUser

        middleware = self._make_middleware()
        factory = RequestFactory()
        request = factory.get("/api/v1/test/")
        request.user = AnonymousUser()
        request.session = {}

        result = middleware(request)
        # Should fall back to Django default (settings.TIME_ZONE)
        assert result._active_tz is not None


class TestEnterpriseSerializerTimezone:
    """Test that timezone is exposed in EnterpriseSerializer."""

    def test_enterprise_serializer_includes_timezone(self, admin_client, enterprise):
        resp = admin_client.get(f"/api/v1/enterprises/{enterprise.pk}/")
        assert resp.status_code == 200
        assert "timezone" in resp.data
        assert resp.data["timezone"] == "Africa/Ouagadougou"

    def test_enterprise_timezone_updatable(self, admin_client, enterprise):
        resp = admin_client.patch(
            f"/api/v1/enterprises/{enterprise.pk}/",
            {"timezone": "Europe/Paris"},
            format="json",
        )
        assert resp.status_code == 200
        enterprise.refresh_from_db()
        assert enterprise.timezone == "Europe/Paris"


class TestMeSerializerTimezone:
    """Test that MeSerializer includes enterprise_timezone."""

    def test_me_includes_enterprise_timezone(self, admin_client, enterprise):
        resp = admin_client.get("/api/v1/auth/me/")
        assert resp.status_code == 200
        assert "enterprise_timezone" in resp.data
        assert resp.data["enterprise_timezone"] == "Africa/Ouagadougou"

    def test_me_reflects_custom_timezone(self, admin_client, enterprise):
        enterprise.timezone = "Asia/Tokyo"
        enterprise.save()
        resp = admin_client.get("/api/v1/auth/me/")
        assert resp.status_code == 200
        assert resp.data["enterprise_timezone"] == "Asia/Tokyo"

    def test_jwt_login_includes_enterprise_timezone(self, api_client, admin_user, enterprise):
        resp = api_client.post(
            "/api/v1/auth/token/",
            {"email": "admin@test.com", "password": "TestPass123!"},
            format="json",
        )
        assert resp.status_code == 200
        assert resp.data["user"]["enterprise_timezone"] == "Africa/Ouagadougou"
