import pytest

from accounts.models import User


@pytest.mark.django_db
def test_user_list_renders_for_admin(client, admin_user, store_user_admin):
    client.force_login(admin_user)

    response = client.get("/accounts/users/")

    assert response.status_code == 200
    used_templates = [t.name for t in response.templates if t.name]
    assert "accounts/user_list.html" in used_templates
    html = response.content.decode("utf-8")
    assert "Utilisateurs" in html


@pytest.mark.django_db
def test_user_list_filters_by_search_role_and_status(
    client,
    admin_user,
    manager_user,
    sales_user,
    store_user_admin,
):
    User.objects.create_user(
        email="inactive.cashier@test.com",
        password="testpass123",
        first_name="Inactive",
        last_name="Cashier",
        role=User.Role.CASHIER,
        is_active=False,
    )

    client.force_login(admin_user)

    response = client.get("/accounts/users/?q=manager&role=MANAGER&status=active")
    assert response.status_code == 200

    users = list(response.context["users"])
    assert len(users) == 1
    assert users[0].email == manager_user.email


@pytest.mark.django_db
def test_user_list_denied_for_non_admin(client, sales_user, store_user_sales):
    client.force_login(sales_user)

    response = client.get("/accounts/users/")

    assert response.status_code == 302
    assert response["Location"].endswith("/dashboard/")
