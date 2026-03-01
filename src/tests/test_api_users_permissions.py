"""Security tests for user creation/update role boundaries."""
import pytest

from accounts.models import CustomRole
from stores.models import Enterprise


@pytest.mark.django_db
def test_admin_cannot_create_admin_via_custom_role(admin_client, enterprise):
    admin_like_role = CustomRole.objects.create(
        enterprise=enterprise,
        name="Admin commercial",
        base_role="ADMIN",
        is_active=True,
    )

    resp = admin_client.post(
        "/api/v1/users/",
        {
            "email": "newadminlike@test.com",
            "first_name": "New",
            "last_name": "AdminLike",
            "phone": "",
            "role": "SALES",
            "custom_role": str(admin_like_role.id),
            "is_active": True,
            "password": "StrongPass123!",
            "password_confirm": "StrongPass123!",
        },
        format="json",
    )

    assert resp.status_code == 400
    assert "superadmins" in str(resp.data).lower()


@pytest.mark.django_db
def test_admin_cannot_promote_existing_user_to_admin_via_custom_role(admin_client, sales_user, enterprise):
    admin_like_role = CustomRole.objects.create(
        enterprise=enterprise,
        name="Admin promo",
        base_role="ADMIN",
        is_active=True,
    )

    resp = admin_client.patch(
        f"/api/v1/users/{sales_user.id}/",
        {
            "custom_role": str(admin_like_role.id),
        },
        format="json",
    )

    assert resp.status_code == 400
    assert "superadmins" in str(resp.data).lower()


@pytest.mark.django_db
def test_admin_cannot_assign_custom_role_from_other_enterprise(admin_client):
    other_enterprise = Enterprise.objects.create(name="Other", code="OTHER-ENT")
    foreign_role = CustomRole.objects.create(
        enterprise=other_enterprise,
        name="Foreign role",
        base_role="SALES",
        is_active=True,
    )

    resp = admin_client.post(
        "/api/v1/users/",
        {
            "email": "foreign-role@test.com",
            "first_name": "Foreign",
            "last_name": "Role",
            "phone": "",
            "role": "SALES",
            "custom_role": str(foreign_role.id),
            "is_active": True,
            "password": "StrongPass123!",
            "password_confirm": "StrongPass123!",
        },
        format="json",
    )

    assert resp.status_code == 400
    assert "custom_role" in resp.data


@pytest.mark.django_db
def test_superuser_can_create_admin_via_custom_role(super_client, enterprise):
    admin_like_role = CustomRole.objects.create(
        enterprise=enterprise,
        name="Super admin managed",
        base_role="ADMIN",
        is_active=True,
    )

    resp = super_client.post(
        "/api/v1/users/",
        {
            "email": "created-by-super@test.com",
            "first_name": "Created",
            "last_name": "BySuper",
            "phone": "",
            "role": "SALES",
            "custom_role": str(admin_like_role.id),
            "is_active": True,
            "password": "StrongPass123!",
            "password_confirm": "StrongPass123!",
        },
        format="json",
    )

    assert resp.status_code == 201
    assert resp.data["role"] == "ADMIN"
