import pytest
from django.test import override_settings


GOOGLE_PROVIDER_SETTINGS = {
    "google": {
        "SCOPE": ["profile", "email"],
        "AUTH_PARAMS": {"access_type": "online"},
        "APPS": [
            {
                "client_id": "test-google-client-id",
                "secret": "test-google-client-secret",
                "key": "",
            }
        ],
    }
}


@pytest.mark.django_db
@override_settings(GOOGLE_OAUTH_ENABLED=False)
def test_login_page_hides_google_button_when_disabled(client):
    response = client.get("/accounts/login/")

    assert response.status_code == 200
    html = response.content.decode("utf-8")
    assert "Continuer avec Google" not in html


@pytest.mark.django_db
@override_settings(
    GOOGLE_OAUTH_ENABLED=True,
    SOCIALACCOUNT_PROVIDERS=GOOGLE_PROVIDER_SETTINGS,
)
def test_login_page_shows_google_button_when_enabled(client):
    response = client.get("/accounts/login/")

    assert response.status_code == 200
    html = response.content.decode("utf-8")
    assert "Continuer avec Google" in html
    assert "/accounts/google/login/" in html


@pytest.mark.django_db
@override_settings(
    GOOGLE_OAUTH_ENABLED=True,
    SOCIALACCOUNT_PROVIDERS=GOOGLE_PROVIDER_SETTINGS,
    SOCIALACCOUNT_LOGIN_ON_GET=True,
)
def test_google_login_endpoint_redirects_to_google_provider(client):
    response = client.get("/accounts/google/login/?process=login")

    assert response.status_code == 302
    assert "accounts.google.com" in response["Location"]
