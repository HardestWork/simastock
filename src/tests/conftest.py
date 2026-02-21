"""Shared fixtures for all tests."""
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from stores.models import Enterprise, Store, StoreUser

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def enterprise(db):
    return Enterprise.objects.create(
        name="Test Enterprise",
        code="TEST-ENT",
        currency="FCFA",
    )


@pytest.fixture
def store(enterprise):
    return Store.objects.create(
        enterprise=enterprise,
        name="Test Store",
        code="TEST-STORE",
    )


@pytest.fixture
def admin_user(db, store):
    user = User.objects.create_user(
        email="admin@test.com",
        password="TestPass123!",
        first_name="Admin",
        last_name="User",
        role="ADMIN",
    )
    StoreUser.objects.create(store=store, user=user, is_default=True)
    return user


@pytest.fixture
def superuser(db, store):
    user = User.objects.create_superuser(
        email="super@test.com",
        password="TestPass123!",
        first_name="Super",
        last_name="Admin",
    )
    StoreUser.objects.create(store=store, user=user, is_default=True)
    return user


@pytest.fixture
def sales_user(db, store):
    user = User.objects.create_user(
        email="sales@test.com",
        password="TestPass123!",
        first_name="Sales",
        last_name="User",
        role="SALES",
    )
    StoreUser.objects.create(store=store, user=user, is_default=True)
    return user


@pytest.fixture
def manager_user(db, store):
    user = User.objects.create_user(
        email="manager@test.com",
        password="TestPass123!",
        first_name="Manager",
        last_name="User",
        role="MANAGER",
    )
    StoreUser.objects.create(store=store, user=user, is_default=True)
    return user


@pytest.fixture
def admin_client(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    return api_client


@pytest.fixture
def super_client(api_client, superuser):
    api_client.force_authenticate(user=superuser)
    return api_client


@pytest.fixture
def sales_client(api_client, sales_user):
    api_client.force_authenticate(user=sales_user)
    return api_client


@pytest.fixture
def manager_client(api_client, manager_user):
    api_client.force_authenticate(user=manager_user)
    return api_client
