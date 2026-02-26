"""Tests for Enterprise API endpoints."""
from datetime import date, timedelta

import pytest
from django.contrib.auth import get_user_model
from stores.models import Enterprise, EnterpriseSubscription, StoreUser

User = get_user_model()


class TestEnterpriseList:
    """GET /api/v1/enterprises/"""

    def test_superuser_sees_all(self, super_client, enterprise):
        Enterprise.objects.create(name="Other", code="OTHER")
        resp = super_client.get("/api/v1/enterprises/")
        assert resp.status_code == 200
        assert resp.data["count"] >= 2

    def test_admin_sees_own_only(self, admin_client, enterprise):
        Enterprise.objects.create(name="Other", code="OTHER")
        resp = admin_client.get("/api/v1/enterprises/")
        assert resp.status_code == 200
        assert resp.data["count"] == 1

    def test_unauthenticated(self, api_client):
        resp = api_client.get("/api/v1/enterprises/")
        assert resp.status_code in (401, 403)


class TestEnterpriseSetup:
    """POST /api/v1/enterprises/setup/"""

    def test_setup_creates_enterprise_store_user(self, super_client):
        resp = super_client.post("/api/v1/enterprises/setup/", {
            "enterprise_name": "New Corp",
            "enterprise_code": "NEW-CORP",
            "enterprise_currency": "FCFA",
            "store_name": "Main Store",
            "store_code": "NEW-STORE",
            "user_email": "newadmin@corp.com",
            "user_first_name": "New",
            "user_last_name": "Admin",
        })
        assert resp.status_code in (200, 201)
        assert Enterprise.objects.filter(code="NEW-CORP").exists()
        assert User.objects.filter(email="newadmin@corp.com").exists()

    def test_setup_requires_superuser(self, admin_client):
        resp = admin_client.post("/api/v1/enterprises/setup/", {
            "enterprise_name": "Corp",
            "enterprise_code": "CORP",
            "enterprise_currency": "FCFA",
            "store_name": "Store",
            "store_code": "STORE-1",
            "user_email": "admin@corp.com",
            "user_first_name": "A",
            "user_last_name": "B",
        })
        assert resp.status_code == 403


class TestEnterpriseDelete:
    """DELETE /api/v1/enterprises/{id}/"""

    def test_delete_cascades_users(self, super_client):
        # Setup via API
        resp = super_client.post("/api/v1/enterprises/setup/", {
            "enterprise_name": "To Delete",
            "enterprise_code": "DEL-ENT",
            "enterprise_currency": "FCFA",
            "store_name": "Del Store",
            "store_code": "DEL-STORE",
            "user_email": "del@test.com",
            "user_first_name": "Del",
            "user_last_name": "User",
        })
        assert resp.status_code in (200, 201)
        ent_id = resp.data["enterprise"]["id"]

        # Delete
        resp = super_client.delete(f"/api/v1/enterprises/{ent_id}/")
        assert resp.status_code == 204

        # Enterprise and user should be gone
        assert not Enterprise.objects.filter(pk=ent_id).exists()
        assert not User.objects.filter(email="del@test.com").exists()

    def test_delete_does_not_remove_superuser(self, super_client, superuser):
        resp = super_client.post("/api/v1/enterprises/setup/", {
            "enterprise_name": "Corp2",
            "enterprise_code": "CORP2",
            "enterprise_currency": "FCFA",
            "store_name": "Store2",
            "store_code": "STORE2",
            "user_email": "admin2@test.com",
            "user_first_name": "A",
            "user_last_name": "B",
        })
        ent_id = resp.data["enterprise"]["id"]
        # Also link superuser to this enterprise's store
        from stores.models import Store
        store = Store.objects.get(code="STORE2")
        StoreUser.objects.create(store=store, user=superuser)

        super_client.delete(f"/api/v1/enterprises/{ent_id}/")
        # Superuser must survive
        assert User.objects.filter(pk=superuser.pk).exists()


class TestEnterpriseReset:
    """Tests for /api/v1/enterprises/{id}/reset/ endpoint."""

    @pytest.mark.django_db
    def test_reset_requires_superuser(self, admin_client, enterprise):
        resp = admin_client.post(
            f"/api/v1/enterprises/{enterprise.id}/reset/",
            {"mode": "transactions"},
            format="json",
        )
        assert resp.status_code == 403

    @pytest.mark.django_db
    def test_superuser_can_reset_transactions(self, super_client, enterprise):
        resp = super_client.post(
            f"/api/v1/enterprises/{enterprise.id}/reset/",
            {"mode": "transactions"},
            format="json",
        )
        assert resp.status_code == 200
        assert resp.data["mode"] == "transactions"
        assert "Entreprise" in resp.data["detail"]


class TestEnterpriseSubscriptionAPI:
    """Tests for /api/v1/enterprise-subscriptions/ endpoints."""

    def test_admin_create_is_scoped_to_own_enterprise(self, admin_client, enterprise):
        resp = admin_client.post(
            "/api/v1/enterprise-subscriptions/",
            {
                "plan_code": "PRO",
                "plan_name": "Plan Pro",
                "billing_cycle": "MONTHLY",
                "amount": "25000.00",
                "currency": "FCFA",
                "starts_on": date.today().isoformat(),
                "status": "ACTIVE",
                "auto_renew": True,
            },
            format="json",
        )
        assert resp.status_code == 201
        assert resp.data["plan_code"] == "PRO"
        assert str(resp.data["enterprise"]) == str(enterprise.pk)
        assert EnterpriseSubscription.objects.filter(enterprise=enterprise, plan_code="PRO").exists()

    def test_admin_cannot_create_for_other_enterprise(self, admin_client):
        other = Enterprise.objects.create(name="Other Ent", code="ENT-OTHER")
        resp = admin_client.post(
            "/api/v1/enterprise-subscriptions/",
            {
                "enterprise": str(other.pk),
                "plan_code": "HACK",
                "plan_name": "Plan Hack",
                "billing_cycle": "MONTHLY",
                "amount": "1000.00",
                "currency": "FCFA",
                "starts_on": date.today().isoformat(),
                "status": "ACTIVE",
            },
            format="json",
        )
        assert resp.status_code == 400
        assert "enterprise" in resp.data

    def test_admin_list_is_limited_to_own_enterprise(self, admin_client, enterprise):
        EnterpriseSubscription.objects.create(
            enterprise=enterprise,
            plan_code="OWN",
            plan_name="Own Plan",
            billing_cycle=EnterpriseSubscription.BillingCycle.MONTHLY,
            amount="10000.00",
            starts_on=date.today() - timedelta(days=2),
            status=EnterpriseSubscription.Status.ACTIVE,
        )
        other = Enterprise.objects.create(name="Other Ent 2", code="ENT-OTHER-2")
        EnterpriseSubscription.objects.create(
            enterprise=other,
            plan_code="OTHER",
            plan_name="Other Plan",
            billing_cycle=EnterpriseSubscription.BillingCycle.MONTHLY,
            amount="20000.00",
            starts_on=date.today() - timedelta(days=2),
            status=EnterpriseSubscription.Status.ACTIVE,
        )

        resp = admin_client.get("/api/v1/enterprise-subscriptions/")
        assert resp.status_code == 200
        assert resp.data["count"] == 1
        assert resp.data["results"][0]["plan_code"] == "OWN"

    def test_superuser_can_create_for_any_enterprise(self, super_client):
        other = Enterprise.objects.create(name="Platform Customer", code="ENT-PLATFORM")
        resp = super_client.post(
            "/api/v1/enterprise-subscriptions/",
            {
                "enterprise": str(other.pk),
                "plan_code": "ENTERPRISE",
                "plan_name": "Plan Enterprise",
                "billing_cycle": "YEARLY",
                "amount": "300000.00",
                "currency": "FCFA",
                "starts_on": date.today().isoformat(),
                "status": "ACTIVE",
                "auto_renew": False,
            },
            format="json",
        )
        assert resp.status_code == 201
        assert str(resp.data["enterprise"]) == str(other.pk)
