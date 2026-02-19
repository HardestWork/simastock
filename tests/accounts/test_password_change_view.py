import pytest


@pytest.mark.django_db
def test_password_change_requires_login(client):
    response = client.get("/accounts/password/change/")

    assert response.status_code == 302
    assert "/accounts/login/" in response["Location"]


@pytest.mark.django_db
def test_password_change_page_renders_for_authenticated_user(client, admin_user):
    client.force_login(admin_user)

    response = client.get("/accounts/password/change/")

    assert response.status_code == 200
    used_templates = [template.name for template in response.templates if template.name]
    assert "accounts/password_change.html" in used_templates
    html = response.content.decode("utf-8")
    assert "Changer mon mot de passe" in html
    assert 'name="current_password"' in html
    assert 'name="new_password1"' in html
    assert 'name="new_password2"' in html


@pytest.mark.django_db
def test_password_change_rejects_incorrect_current_password(client, admin_user):
    original_hash = admin_user.password
    client.force_login(admin_user)

    response = client.post(
        "/accounts/password/change/",
        {
            "current_password": "wrong-current-password",
            "new_password1": "V3ry$trongPass2026",
            "new_password2": "V3ry$trongPass2026",
        },
    )

    assert response.status_code == 200
    admin_user.refresh_from_db()
    assert admin_user.password == original_hash
    html = response.content.decode("utf-8")
    assert "Le mot de passe actuel est incorrect." in html


@pytest.mark.django_db
def test_password_change_success_updates_password_and_keeps_session(client, admin_user):
    client.force_login(admin_user)

    response = client.post(
        "/accounts/password/change/",
        {
            "current_password": "testpass123",
            "new_password1": "V3ry$trongPass2026",
            "new_password2": "V3ry$trongPass2026",
        },
    )

    assert response.status_code == 302
    assert response["Location"].endswith("/dashboard/")

    admin_user.refresh_from_db()
    assert admin_user.check_password("V3ry$trongPass2026")

    # Session is still valid after password change.
    follow_up = client.get("/accounts/password/change/")
    assert follow_up.status_code == 200
