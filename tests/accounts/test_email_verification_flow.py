import re

import pytest
from django.core import mail
from smtplib import SMTPAuthenticationError
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

from accounts.models import User


def _extract_verification_url(body):
    match = re.search(r"(https?://[^\s]+/accounts/verify-email/[^\s]+)", body)
    return match.group(1) if match else ""


@pytest.mark.django_db
def test_verify_email_link_activates_account(client):
    response = client.post(
        "/accounts/signup/",
        {
            "email": "verify.me@test.com",
            "password1": "StrongPass123!",
            "password2": "StrongPass123!",
        },
    )
    assert response.status_code == 302
    assert len(mail.outbox) == 1

    verification_url = _extract_verification_url(mail.outbox[0].body)
    assert verification_url

    verify_response = client.get(verification_url)
    assert verify_response.status_code == 302
    assert verify_response["Location"].endswith("/accounts/login/")

    user = User.objects.get(email="verify.me@test.com")
    assert user.is_active is True


@pytest.mark.django_db
def test_verify_email_with_invalid_token_keeps_account_inactive(client):
    user = User.objects.create_user(
        email="inactive.verify@test.com",
        password="StrongPass123!",
        first_name="Inactive",
        last_name="Verify",
        role=User.Role.SALES,
        is_active=False,
    )
    uidb64 = urlsafe_base64_encode(force_bytes(user.pk))

    response = client.get(f"/accounts/verify-email/{uidb64}/invalid-token/")

    assert response.status_code == 302
    assert response["Location"].endswith("/accounts/login/")
    user.refresh_from_db()
    assert user.is_active is False


@pytest.mark.django_db
def test_resend_verification_email_for_inactive_user(client):
    User.objects.create_user(
        email="inactive.resend@test.com",
        password="StrongPass123!",
        first_name="Inactive",
        last_name="Resend",
        role=User.Role.SALES,
        is_active=False,
    )

    response = client.post(
        "/accounts/verify-email/resend/",
        {"email": "inactive.resend@test.com"},
    )

    assert response.status_code == 302
    assert response["Location"].endswith("/accounts/login/")
    assert len(mail.outbox) == 1
    assert mail.outbox[0].to == ["inactive.resend@test.com"]


@pytest.mark.django_db
def test_resend_verification_email_does_not_send_for_active_user(client, sales_user):
    response = client.post(
        "/accounts/verify-email/resend/",
        {"email": sales_user.email},
    )

    assert response.status_code == 302
    assert response["Location"].endswith("/accounts/login/")
    assert len(mail.outbox) == 0


@pytest.mark.django_db
def test_resend_verification_email_handles_smtp_error(client, monkeypatch):
    User.objects.create_user(
        email="inactive.smtp@test.com",
        password="StrongPass123!",
        first_name="Inactive",
        last_name="SMTP",
        role=User.Role.SALES,
        is_active=False,
    )

    def fail_send(*args, **kwargs):
        raise SMTPAuthenticationError(535, b"BadCredentials")

    monkeypatch.setattr("accounts.views.send_verification_email", fail_send)

    response = client.post(
        "/accounts/verify-email/resend/",
        {"email": "inactive.smtp@test.com"},
        follow=True,
    )

    assert response.status_code == 200
    html = response.content.decode("utf-8")
    assert "Envoi impossible pour le moment (SMTP)." in html
