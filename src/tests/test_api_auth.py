"""Tests for authentication API endpoints."""
import pytest
from django.contrib.auth import get_user_model

User = get_user_model()


class TestLogin:
    """POST /api/v1/auth/token/"""

    def test_login_success(self, api_client, admin_user):
        resp = api_client.post("/api/v1/auth/token/", {
            "email": "admin@test.com",
            "password": "TestPass123!",
        })
        assert resp.status_code == 200
        assert "user" in resp.data

    def test_login_wrong_password(self, api_client, admin_user):
        resp = api_client.post("/api/v1/auth/token/", {
            "email": "admin@test.com",
            "password": "WrongPass",
        })
        assert resp.status_code == 401

    def test_login_nonexistent_user(self, api_client, db):
        resp = api_client.post("/api/v1/auth/token/", {
            "email": "nobody@test.com",
            "password": "Pass123!",
        })
        assert resp.status_code == 401


class TestMeView:
    """GET/PATCH /api/v1/auth/me/"""

    def test_get_me(self, admin_client, admin_user):
        resp = admin_client.get("/api/v1/auth/me/")
        assert resp.status_code == 200
        assert resp.data["email"] == "admin@test.com"

    def test_unauthenticated(self, api_client):
        resp = api_client.get("/api/v1/auth/me/")
        assert resp.status_code in (401, 403)

    def test_patch_me(self, admin_client):
        resp = admin_client.patch("/api/v1/auth/me/", {"first_name": "Updated"})
        assert resp.status_code == 200
        assert resp.data["first_name"] == "Updated"


class TestChangePassword:
    """POST /api/v1/auth/password/change/"""

    def test_change_password_success(self, admin_client, admin_user):
        resp = admin_client.post("/api/v1/auth/password/change/", {
            "old_password": "TestPass123!",
            "new_password": "NewPass456!",
        })
        assert resp.status_code == 200
        admin_user.refresh_from_db()
        assert admin_user.check_password("NewPass456!")

    def test_change_password_wrong_old(self, admin_client):
        resp = admin_client.post("/api/v1/auth/password/change/", {
            "old_password": "WrongOldPass",
            "new_password": "NewPass456!",
        })
        assert resp.status_code == 400
