"""Tests for Delivery & Logistics API."""
import pytest
from django.contrib.auth import get_user_model

from delivery.models import Delivery, DeliveryAgent, DeliveryZone

User = get_user_model()


def _enable_delivery_module(store):
    """Enable delivery module via enterprise feature flags."""
    ent = store.enterprise
    flags = ent.analytics_feature_flags or {}
    flags["delivery_management"] = True
    ent.analytics_feature_flags = flags
    ent.save(update_fields=["analytics_feature_flags"])


@pytest.fixture
def delivery_store(store):
    _enable_delivery_module(store)
    return store


@pytest.fixture
def delivery_admin_client(api_client, admin_user, delivery_store):
    api_client.force_authenticate(user=admin_user)
    api_client.login(email="admin@test.com", password="TestPass123!")
    return api_client


@pytest.fixture
def zone(delivery_store):
    return DeliveryZone.objects.create(
        store=delivery_store,
        name="Centre-ville",
        description="Zone centre",
        fee=1500,
        estimated_minutes=30,
    )


@pytest.fixture
def agent(delivery_store):
    return DeliveryAgent.objects.create(
        store=delivery_store,
        name="Moussa Traore",
        phone="+22670000001",
        vehicle_type="MOTO",
    )


@pytest.fixture
def delivery(delivery_store, zone, agent):
    return Delivery.objects.create(
        store=delivery_store,
        zone=zone,
        agent=agent,
        delivery_address="123 Rue de la Paix",
        recipient_name="Aminata Diallo",
        recipient_phone="+22670000002",
    )


# ── Zone CRUD ──────────────────────────────────────────────────────

@pytest.mark.django_db
def test_create_zone(delivery_admin_client, delivery_store):
    r = delivery_admin_client.post(
        "/api/v1/delivery/zones/",
        {"name": "Banlieue", "fee": "2000.00", "estimated_minutes": 45},
        format="json",
    )
    assert r.status_code == 201
    assert r.data["name"] == "Banlieue"
    assert str(r.data["store"]) == str(delivery_store.id)


@pytest.mark.django_db
def test_list_zones(delivery_admin_client, zone):
    r = delivery_admin_client.get("/api/v1/delivery/zones/")
    assert r.status_code == 200
    assert r.data["count"] >= 1


@pytest.mark.django_db
def test_update_zone(delivery_admin_client, zone):
    r = delivery_admin_client.patch(
        f"/api/v1/delivery/zones/{zone.id}/",
        {"name": "Centre mis a jour"},
        format="json",
    )
    assert r.status_code == 200
    assert r.data["name"] == "Centre mis a jour"


@pytest.mark.django_db
def test_delete_zone(delivery_admin_client, zone):
    r = delivery_admin_client.delete(f"/api/v1/delivery/zones/{zone.id}/")
    assert r.status_code == 204


# ── Agent CRUD ─────────────────────────────────────────────────────

@pytest.mark.django_db
def test_create_agent(delivery_admin_client):
    r = delivery_admin_client.post(
        "/api/v1/delivery/agents/",
        {"name": "Ibrahima", "phone": "+22670000003", "vehicle_type": "VELO"},
        format="json",
    )
    assert r.status_code == 201
    assert r.data["vehicle_type"] == "VELO"


@pytest.mark.django_db
def test_list_agents(delivery_admin_client, agent):
    r = delivery_admin_client.get("/api/v1/delivery/agents/")
    assert r.status_code == 200
    assert r.data["count"] >= 1


# ── Delivery CRUD ──────────────────────────────────────────────────

@pytest.mark.django_db
def test_create_delivery(delivery_admin_client, zone, agent):
    r = delivery_admin_client.post(
        "/api/v1/delivery/deliveries/",
        {
            "zone": str(zone.id),
            "agent": str(agent.id),
            "delivery_address": "456 Av Kwame Nkrumah",
            "recipient_name": "Fatou Sow",
            "recipient_phone": "+22670000004",
        },
        format="json",
    )
    assert r.status_code == 201
    assert r.data["status"] == "PENDING"
    assert len(r.data["confirmation_code"]) == 6


@pytest.mark.django_db
def test_list_deliveries(delivery_admin_client, delivery):
    r = delivery_admin_client.get("/api/v1/delivery/deliveries/")
    assert r.status_code == 200
    assert r.data["count"] >= 1


@pytest.mark.django_db
def test_delivery_detail(delivery_admin_client, delivery):
    r = delivery_admin_client.get(f"/api/v1/delivery/deliveries/{delivery.id}/")
    assert r.status_code == 200
    assert r.data["recipient_name"] == "Aminata Diallo"


# ── Status transitions ────────────────────────────────────────────

@pytest.mark.django_db
def test_update_status_valid(delivery_admin_client, delivery):
    r = delivery_admin_client.post(
        f"/api/v1/delivery/deliveries/{delivery.id}/update-status/",
        {"status": "PREPARING"},
        format="json",
    )
    assert r.status_code == 200
    assert r.data["status"] == "PREPARING"
    delivery.refresh_from_db()
    assert delivery.status == "PREPARING"
    assert delivery.status_history.count() == 1


@pytest.mark.django_db
def test_update_status_invalid_value(delivery_admin_client, delivery):
    r = delivery_admin_client.post(
        f"/api/v1/delivery/deliveries/{delivery.id}/update-status/",
        {"status": "NONEXISTENT"},
        format="json",
    )
    assert r.status_code == 400


@pytest.mark.django_db
def test_confirm_delivery(delivery_admin_client, delivery):
    delivery.status = Delivery.Status.IN_TRANSIT
    delivery.save(update_fields=["status"])

    r = delivery_admin_client.post(
        f"/api/v1/delivery/deliveries/{delivery.id}/confirm-delivery/",
        {"code": delivery.confirmation_code},
        format="json",
    )
    assert r.status_code == 200
    assert r.data["status"] == "DELIVERED"


@pytest.mark.django_db
def test_confirm_delivery_wrong_code(delivery_admin_client, delivery):
    delivery.status = Delivery.Status.IN_TRANSIT
    delivery.save(update_fields=["status"])

    r = delivery_admin_client.post(
        f"/api/v1/delivery/deliveries/{delivery.id}/confirm-delivery/",
        {"code": "000000"},
        format="json",
    )
    assert r.status_code == 400


# ── Dashboard ──────────────────────────────────────────────────────

@pytest.mark.django_db
def test_dashboard(delivery_admin_client, delivery):
    r = delivery_admin_client.get("/api/v1/delivery/deliveries/dashboard/")
    assert r.status_code == 200
    assert "total" in r.data
    assert "pending" in r.data


# ── Module permission ─────────────────────────────────────────────

@pytest.mark.django_db
def test_delivery_requires_module(api_client, admin_user, store):
    """Without delivery module enabled, API returns 403."""
    api_client.force_authenticate(user=admin_user)
    r = api_client.get("/api/v1/delivery/zones/")
    assert r.status_code == 403
