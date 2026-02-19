import pytest


@pytest.mark.django_db
def test_cashier_dashboard_renders_for_admin(client, admin_user, store_user_admin):
    client.force_login(admin_user)

    response = client.get("/cashier/")

    assert response.status_code == 200
    used_templates = [template.name for template in response.templates if template.name]
    assert "cashier/dashboard.html" in used_templates
