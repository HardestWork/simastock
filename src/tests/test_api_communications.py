"""Tests for Communication Client API."""
import pytest
from django.contrib.auth import get_user_model

from communications.models import Campaign, MessageLog, MessageTemplate
from communications.services import render_template, resolve_segment
from customers.models import Customer
from stores.models import Enterprise, Store, StoreUser

User = get_user_model()


def _enable_communication_module(store):
    ent = store.enterprise
    flags = ent.analytics_feature_flags or {}
    flags["communication_management"] = True
    ent.analytics_feature_flags = flags
    ent.save(update_fields=["analytics_feature_flags"])


@pytest.fixture
def comm_store(store):
    _enable_communication_module(store)
    return store


@pytest.fixture
def comm_admin_client(api_client, admin_user, comm_store):
    api_client.force_authenticate(user=admin_user)
    api_client.login(email="admin@test.com", password="TestPass123!")
    return api_client


@pytest.fixture
def enterprise_for_comm(comm_store):
    return comm_store.enterprise


@pytest.fixture
def template(enterprise_for_comm):
    return MessageTemplate.objects.create(
        enterprise=enterprise_for_comm,
        name="Bienvenue",
        channel="SMS",
        body="Bonjour {{client_name}}, merci pour votre achat!",
        trigger_event="MANUAL",
    )


@pytest.fixture
def campaign(enterprise_for_comm, template):
    return Campaign.objects.create(
        enterprise=enterprise_for_comm,
        name="Campagne test",
        channel="SMS",
        template=template,
        segment_filter={"min_purchases": 1},
    )


# ── Template CRUD ─────────────────────────────────────────────────

@pytest.mark.django_db
def test_create_template(comm_admin_client, enterprise_for_comm):
    r = comm_admin_client.post(
        "/api/v1/communications/templates/",
        {
            "name": "Promo SMS",
            "channel": "SMS",
            "body": "Promo: -20% sur tout! {{client_name}}",
            "trigger_event": "MANUAL",
        },
        format="json",
    )
    assert r.status_code == 201
    assert r.data["name"] == "Promo SMS"
    assert str(r.data["enterprise"]) == str(enterprise_for_comm.id)


@pytest.mark.django_db
def test_list_templates(comm_admin_client, template):
    r = comm_admin_client.get("/api/v1/communications/templates/")
    assert r.status_code == 200
    assert r.data["count"] >= 1


@pytest.mark.django_db
def test_update_template(comm_admin_client, template):
    r = comm_admin_client.patch(
        f"/api/v1/communications/templates/{template.id}/",
        {"name": "Bienvenue V2"},
        format="json",
    )
    assert r.status_code == 200
    assert r.data["name"] == "Bienvenue V2"


@pytest.mark.django_db
def test_delete_template(comm_admin_client, template):
    r = comm_admin_client.delete(f"/api/v1/communications/templates/{template.id}/")
    assert r.status_code == 204


# ── Message Logs (read-only) ──────────────────────────────────────

@pytest.mark.django_db
def test_list_logs(comm_admin_client, comm_store):
    MessageLog.objects.create(
        store=comm_store,
        channel="SMS",
        recipient_contact="+22670000001",
        body_rendered="Test message",
        status="SENT",
    )
    r = comm_admin_client.get("/api/v1/communications/logs/")
    assert r.status_code == 200
    assert r.data["count"] >= 1


@pytest.mark.django_db
def test_logs_are_read_only(comm_admin_client):
    r = comm_admin_client.post(
        "/api/v1/communications/logs/",
        {"channel": "SMS", "body_rendered": "Hack"},
        format="json",
    )
    assert r.status_code == 405  # Method not allowed


# ── Campaign CRUD + Actions ───────────────────────────────────────

@pytest.mark.django_db
def test_create_campaign(comm_admin_client, template):
    r = comm_admin_client.post(
        "/api/v1/communications/campaigns/",
        {
            "name": "Noel 2026",
            "channel": "SMS",
            "template": str(template.id),
            "segment_filter": {"min_purchases": 3},
        },
        format="json",
    )
    assert r.status_code == 201
    assert r.data["status"] == "DRAFT"


@pytest.mark.django_db
def test_launch_campaign(comm_admin_client, campaign):
    r = comm_admin_client.post(f"/api/v1/communications/campaigns/{campaign.id}/launch/")
    assert r.status_code == 200
    assert r.data["status"] == "SENDING"


@pytest.mark.django_db
def test_launch_non_draft_fails(comm_admin_client, campaign):
    campaign.status = Campaign.Status.COMPLETED
    campaign.save(update_fields=["status"])
    r = comm_admin_client.post(f"/api/v1/communications/campaigns/{campaign.id}/launch/")
    assert r.status_code == 400


@pytest.mark.django_db
def test_cancel_campaign(comm_admin_client, campaign):
    r = comm_admin_client.post(f"/api/v1/communications/campaigns/{campaign.id}/cancel/")
    assert r.status_code == 200
    assert r.data["status"] == "CANCELLED"


@pytest.mark.django_db
def test_cancel_completed_fails(comm_admin_client, campaign):
    campaign.status = Campaign.Status.COMPLETED
    campaign.save(update_fields=["status"])
    r = comm_admin_client.post(f"/api/v1/communications/campaigns/{campaign.id}/cancel/")
    assert r.status_code == 400


@pytest.mark.django_db
def test_preview_campaign(comm_admin_client, campaign, enterprise_for_comm):
    Customer.objects.create(
        enterprise=enterprise_for_comm,
        first_name="Fatou",
        last_name="Diallo",
        phone="+22670000001",
    )
    r = comm_admin_client.get(f"/api/v1/communications/campaigns/{campaign.id}/preview/")
    assert r.status_code == 200
    assert "recipient_count" in r.data


# ── Services ──────────────────────────────────────────────────────

@pytest.mark.django_db
def test_render_template_service():
    body = "Bonjour {{client_name}}, votre commande {{order_id}} est prete."
    result = render_template(body, {"client_name": "Aminata", "order_id": "CMD-001"})
    assert result == "Bonjour Aminata, votre commande CMD-001 est prete."


@pytest.mark.django_db
def test_render_template_missing_placeholder():
    body = "Bonjour {{client_name}}, tel: {{phone}}"
    result = render_template(body, {"client_name": "Moussa"})
    assert "Moussa" in result
    assert "{{phone}}" in result  # missing placeholders kept as-is


@pytest.mark.django_db
def test_resolve_segment_min_purchases(enterprise):
    c1 = Customer.objects.create(enterprise=enterprise, first_name="A", last_name="B", phone="+1")
    c2 = Customer.objects.create(enterprise=enterprise, first_name="C", last_name="D", phone="+2")
    # No purchases, so min_purchases=1 should exclude both
    qs = resolve_segment(enterprise, {"min_purchases": 1})
    assert c1 not in qs
    assert c2 not in qs


@pytest.mark.django_db
def test_resolve_segment_has_phone(enterprise):
    Customer.objects.create(enterprise=enterprise, first_name="A", last_name="B", phone="+1")
    Customer.objects.create(enterprise=enterprise, first_name="C", last_name="D", phone="")
    qs = resolve_segment(enterprise, {"has_phone": True})
    assert qs.count() == 1


@pytest.mark.django_db
def test_resolve_segment_has_email(enterprise):
    Customer.objects.create(enterprise=enterprise, first_name="A", last_name="B", email="a@b.com")
    Customer.objects.create(enterprise=enterprise, first_name="C", last_name="D", email="")
    qs = resolve_segment(enterprise, {"has_email": True})
    assert qs.count() == 1


# ── Module permission ─────────────────────────────────────────────

@pytest.mark.django_db
def test_communication_requires_module(api_client, admin_user, store):
    """Without communication module, API returns 403."""
    api_client.force_authenticate(user=admin_user)
    r = api_client.get("/api/v1/communications/templates/")
    assert r.status_code == 403
