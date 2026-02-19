import pytest

from accounts.models import User


@pytest.mark.django_db
def test_user_create_form_renders_for_admin(client, admin_user, store_user_admin):
    client.force_login(admin_user)

    response = client.get("/accounts/users/create/")

    assert response.status_code == 200
    used_templates = [t.name for t in response.templates if t.name]
    assert "accounts/user_form.html" in used_templates

    html = response.content.decode("utf-8")
    assert "Creer un utilisateur" in html
    assert 'name="password1"' in html
    assert 'name="password2"' in html


@pytest.mark.django_db
def test_user_create_form_denied_for_non_admin(client, sales_user, store_user_sales):
    client.force_login(sales_user)

    response = client.get("/accounts/users/create/")

    assert response.status_code == 302
    assert response["Location"].endswith("/dashboard/")


@pytest.mark.django_db
def test_user_create_success(client, admin_user, store_user_admin):
    client.force_login(admin_user)

    response = client.post(
        "/accounts/users/create/",
        {
            "email": "new.manager@test.com",
            "first_name": "New",
            "last_name": "Manager",
            "phone": "+237688000000",
            "role": User.Role.MANAGER,
            "is_active": "on",
            "password1": "StrongPass123!",
            "password2": "StrongPass123!",
        },
    )

    assert response.status_code == 302
    assert response["Location"].endswith("/accounts/users/")

    user = User.objects.get(email="new.manager@test.com")
    assert user.first_name == "New"
    assert user.role == User.Role.MANAGER
    assert user.is_active is True
    assert user.is_staff is False
    assert user.check_password("StrongPass123!")


@pytest.mark.django_db
def test_user_create_admin_role_sets_staff_flag(client, admin_user, store_user_admin):
    client.force_login(admin_user)

    response = client.post(
        "/accounts/users/create/",
        {
            "email": "new.admin@test.com",
            "first_name": "New",
            "last_name": "Admin",
            "phone": "+237688000001",
            "role": User.Role.ADMIN,
            "is_active": "on",
            "password1": "StrongPass123!",
            "password2": "StrongPass123!",
        },
    )

    assert response.status_code == 302

    user = User.objects.get(email="new.admin@test.com")
    assert user.role == User.Role.ADMIN
    assert user.is_staff is True


@pytest.mark.django_db
def test_user_update_form_renders_without_password_fields(
    client,
    admin_user,
    manager_user,
    store_user_admin,
):
    client.force_login(admin_user)

    response = client.get(f"/accounts/users/{manager_user.id}/edit/")

    assert response.status_code == 200
    assert response.context["page_title"] == "Modifier l'utilisateur"
    html = response.content.decode("utf-8")
    assert 'name="password1"' not in html
    assert 'name="password2"' not in html


@pytest.mark.django_db
def test_user_update_success_syncs_staff_flag(
    client,
    admin_user,
    manager_user,
    store_user_admin,
):
    client.force_login(admin_user)

    response = client.post(
        f"/accounts/users/{manager_user.id}/edit/",
        {
            "email": manager_user.email,
            "first_name": "Manager",
            "last_name": "Updated",
            "phone": "+237677777777",
            "role": User.Role.ADMIN,
            "is_active": "on",
        },
    )

    assert response.status_code == 302
    assert response["Location"].endswith("/accounts/users/")

    manager_user.refresh_from_db()
    assert manager_user.last_name == "Updated"
    assert manager_user.role == User.Role.ADMIN
    assert manager_user.is_staff is True
