import pytest


@pytest.mark.django_db
def test_shift_list_page_renders_for_admin(client, admin_user, store_user_admin):
    client.force_login(admin_user)

    response = client.get("/cashier/shift-list/")

    assert response.status_code == 200
    used_templates = [template.name for template in response.templates if template.name]
    assert "cashier/shift_list.html" in used_templates
