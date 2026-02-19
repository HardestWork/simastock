import pytest
from django.core import mail
from smtplib import SMTPAuthenticationError

from accounts.models import User


@pytest.mark.django_db
def test_signup_page_renders_for_anonymous_user(client):
    response = client.get("/accounts/signup/")

    assert response.status_code == 200
    used_templates = [t.name for t in response.templates if t.name]
    assert "accounts/signup.html" in used_templates
    html = response.content.decode("utf-8")
    assert 'name="email"' in html
    assert 'name="password1"' in html
    assert 'name="password2"' in html


@pytest.mark.django_db
def test_signup_redirects_authenticated_user(client, admin_user):
    client.force_login(admin_user)

    response = client.get("/accounts/signup/")

    assert response.status_code == 302
    assert response["Location"].endswith("/dashboard/")


@pytest.mark.django_db
def test_signup_creates_inactive_user_and_sends_verification_email(client):
    response = client.post(
        "/accounts/signup/",
        {
            "email": "public.user@test.com",
            "password1": "StrongPass123!",
            "password2": "StrongPass123!",
        },
    )

    assert response.status_code == 302
    assert "/accounts/signup/pending/" in response["Location"]

    user = User.objects.get(email="public.user@test.com")
    assert user.role == User.Role.SALES
    assert user.is_staff is False
    assert user.is_active is False
    assert user.first_name == "public.user"
    assert user.last_name == "Utilisateur"
    assert user.check_password("StrongPass123!")

    assert client.session.get("_auth_user_id") is None
    assert len(mail.outbox) == 1
    assert mail.outbox[0].to == ["public.user@test.com"]
    assert "/accounts/verify-email/" in mail.outbox[0].body


@pytest.mark.django_db
def test_signup_rejects_existing_email_case_insensitive(client, sales_user):
    response = client.post(
        "/accounts/signup/",
        {
            "email": sales_user.email.upper(),
            "password1": "StrongPass123!",
            "password2": "StrongPass123!",
        },
    )

    assert response.status_code == 200
    html = response.content.decode("utf-8")
    assert "Un compte existe deja avec cette adresse e-mail." in html


@pytest.mark.django_db
def test_signup_rejects_password_mismatch(client):
    response = client.post(
        "/accounts/signup/",
        {
            "email": "mismatch@test.com",
            "password1": "StrongPass123!",
            "password2": "DifferentPass123!",
        },
    )

    assert response.status_code == 200
    html = response.content.decode("utf-8")
    assert "Les deux mots de passe ne correspondent pas." in html
    assert not User.objects.filter(email="mismatch@test.com").exists()


@pytest.mark.django_db
def test_signup_does_not_crash_if_email_send_fails(client, monkeypatch):
    def fail_send(*args, **kwargs):
        raise SMTPAuthenticationError(535, b"BadCredentials")

    monkeypatch.setattr("accounts.views.send_verification_email", fail_send)

    response = client.post(
        "/accounts/signup/",
        {
            "email": "smtp.fail@test.com",
            "password1": "StrongPass123!",
            "password2": "StrongPass123!",
        },
        follow=True,
    )

    assert response.status_code == 200
    assert User.objects.filter(email="smtp.fail@test.com").exists()
    user = User.objects.get(email="smtp.fail@test.com")
    assert user.is_active is False
    html = response.content.decode("utf-8")
    assert "Compte cree, mais" in html
    assert "(SMTP)" in html
