import pytest


@pytest.mark.django_db
def test_customer_create_page_renders(client, admin_user, store_user_admin):
    client.force_login(admin_user)

    response = client.get('/customers/create/')

    assert response.status_code == 200
    used_templates = [template.name for template in response.templates if template.name]
    assert 'customers/customer_form.html' in used_templates


@pytest.mark.django_db
def test_customer_detail_page_renders(client, admin_user, store_user_admin, customer):
    client.force_login(admin_user)

    response = client.get(f'/customers/{customer.pk}/')

    assert response.status_code == 200
    used_templates = [template.name for template in response.templates if template.name]
    assert 'customers/customer_detail.html' in used_templates
