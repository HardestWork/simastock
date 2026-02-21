"""Tests for core model behavior."""
import pytest
from datetime import date, timedelta
from django.contrib.auth import get_user_model

from stores.models import Enterprise, Store, StoreUser, Sequence

User = get_user_model()


# ---------------------------------------------------------------------------
# Enterprise
# ---------------------------------------------------------------------------


class TestEnterprise:
    def test_str(self, enterprise):
        assert "TEST-ENT" in str(enterprise)

    def test_subscription_status_active(self, enterprise):
        assert enterprise.subscription_status == "active"
        assert not enterprise.is_expired

    def test_subscription_status_expired(self, enterprise):
        enterprise.subscription_end = date.today() - timedelta(days=1)
        enterprise.save()
        assert enterprise.is_expired
        assert enterprise.subscription_status == "expired"

    def test_subscription_status_scheduled(self, enterprise):
        enterprise.subscription_start = date.today() + timedelta(days=10)
        enterprise.save()
        assert enterprise.subscription_status == "scheduled"

    def test_subscription_status_inactive(self, enterprise):
        enterprise.is_active = False
        enterprise.save()
        assert enterprise.subscription_status == "inactive"

    def test_feature_flags_defaults(self, enterprise):
        flags = enterprise.effective_feature_flags
        assert flags["sales_pos"] is True
        assert flags["vat"] is False


# ---------------------------------------------------------------------------
# Store
# ---------------------------------------------------------------------------


class TestStore:
    def test_str(self, store):
        assert "TEST-STORE" in str(store)

    def test_effective_currency_inherits(self, store):
        assert store.effective_currency == "FCFA"

    def test_effective_vat_inherits(self, store, enterprise):
        enterprise.vat_enabled = True
        enterprise.save()
        store.refresh_from_db()
        assert store.effective_vat_enabled is True


# ---------------------------------------------------------------------------
# Sequence
# ---------------------------------------------------------------------------


class TestSequence:
    def test_generate_next(self, store):
        seq = Sequence.objects.create(store=store, prefix="FA", year=2026)
        first = seq.generate_next()
        assert first == "FA-TESTSTORE-2026-000001"
        second = seq.generate_next()
        assert second == "FA-TESTSTORE-2026-000002"


# ---------------------------------------------------------------------------
# User
# ---------------------------------------------------------------------------


class TestUser:
    def test_create_user(self, db):
        user = User.objects.create_user(
            email="test@example.com",
            password="StrongPass123!",
            first_name="Test",
            last_name="User",
        )
        assert user.email == "test@example.com"
        assert user.check_password("StrongPass123!")
        assert user.role == "SALES"  # default role
        assert not user.is_superuser

    def test_role_helpers(self, admin_user, sales_user):
        assert admin_user.is_admin
        assert not admin_user.is_sales
        assert sales_user.is_sales
        assert not sales_user.is_admin

    def test_full_name(self, admin_user):
        assert admin_user.get_full_name() == "Admin User"
