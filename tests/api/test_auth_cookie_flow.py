import json

import pytest
from django.conf import settings
from django.test import Client


def _login_via_api(client, email: str, password: str):
    return client.post(
        "/api/v1/auth/token/",
        data=json.dumps({"email": email, "password": password}),
        content_type="application/json",
    )


@pytest.mark.django_db
def test_auth_csrf_endpoint_returns_token(client):
    response = client.get("/api/v1/auth/csrf/")

    assert response.status_code == 200
    payload = response.json()
    assert "csrfToken" in payload
    assert payload["csrfToken"]


@pytest.mark.django_db
def test_auth_login_sets_http_only_jwt_cookies(client, admin_user):
    response = _login_via_api(client, admin_user.email, "testpass123")

    assert response.status_code == 200
    payload = response.json()
    assert payload["user"]["email"] == admin_user.email
    assert "access" not in payload
    assert "refresh" not in payload

    access_cookie_name = settings.JWT_AUTH_COOKIE
    refresh_cookie_name = settings.JWT_AUTH_REFRESH_COOKIE
    assert access_cookie_name in response.cookies
    assert refresh_cookie_name in response.cookies
    assert response.cookies[access_cookie_name]["httponly"]
    assert response.cookies[refresh_cookie_name]["httponly"]


@pytest.mark.django_db
def test_cookie_authenticated_post_requires_csrf_header(admin_user):
    strict_client = Client(enforce_csrf_checks=True)
    login_response = _login_via_api(strict_client, admin_user.email, "testpass123")
    assert login_response.status_code == 200

    # Without CSRF header -> denied for cookie-authenticated unsafe method.
    response_no_csrf = strict_client.post(
        "/api/v1/auth/password/change/",
        data=json.dumps({"old_password": "testpass123", "new_password": "Newpass123!"}),
        content_type="application/json",
    )
    assert response_no_csrf.status_code == 403

    csrf_response = strict_client.get("/api/v1/auth/csrf/")
    csrf_token = csrf_response.json()["csrfToken"]

    response_with_csrf = strict_client.post(
        "/api/v1/auth/password/change/",
        data=json.dumps({"old_password": "testpass123", "new_password": "Newpass123!"}),
        content_type="application/json",
        HTTP_X_CSRFTOKEN=csrf_token,
    )
    assert response_with_csrf.status_code == 200


@pytest.mark.django_db
def test_refresh_uses_refresh_cookie_when_body_missing(client, admin_user):
    login_response = _login_via_api(client, admin_user.email, "testpass123")
    assert login_response.status_code == 200

    refresh_response = client.post(
        "/api/v1/auth/token/refresh/",
        data=json.dumps({}),
        content_type="application/json",
    )

    assert refresh_response.status_code == 200
    assert settings.JWT_AUTH_COOKIE in refresh_response.cookies
