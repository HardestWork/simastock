"""Access-control regressions for new tenant roles/capabilities."""
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from stores.models import StoreUser

User = get_user_model()


@pytest.mark.django_db
def test_sales_user_cannot_read_hrm_departments(sales_client):
    response = sales_client.get("/api/v1/hrm/departments/")
    assert response.status_code == 403


@pytest.mark.django_db
def test_manager_subscription_access_requires_capability(store, manager_user):
    client = APIClient()
    # Explicit capability list disables role-based fallback.
    store_user = StoreUser.objects.get(store=store, user=manager_user)
    store_user.capabilities = ["CAN_VIEW_REPORTS"]
    store_user.save(update_fields=["capabilities"])

    client.force_authenticate(user=manager_user)
    response = client.get("/api/v1/enterprise-subscriptions/")
    assert response.status_code == 403

    store_user.capabilities = ["CAN_VIEW_REPORTS", "CAN_MANAGE_SUBSCRIPTIONS"]
    store_user.save(update_fields=["capabilities"])
    response = client.get("/api/v1/enterprise-subscriptions/")
    assert response.status_code == 200


@pytest.mark.django_db
def test_commercial_role_can_access_commercial_pipeline(store):
    commercial_user = User.objects.create_user(
        email="commercial.role@test.com",
        password="TestPass123!",
        first_name="Commercial",
        last_name="Agent",
        role="COMMERCIAL",
    )
    StoreUser.objects.create(store=store, user=commercial_user, is_default=True)

    client = APIClient()
    client.force_authenticate(user=commercial_user)
    response = client.get("/api/v1/commercial/prospects/", {"store": str(store.id)})
    assert response.status_code == 200
