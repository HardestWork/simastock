import pytest

from api.v1.permissions import FeatureSalesPOSEnabled, IsStoreMember
from stores.models import Store, StoreUser


class DummyView:
    def __init__(self, kwargs=None):
        self.kwargs = kwargs or {}


class DummyRequest:
    def __init__(self, user, method="GET", query_params=None, data=None):
        self.user = user
        self.method = method
        self.query_params = query_params or {}
        self.data = data or {}


class DummyObject:
    def __init__(self, store_id):
        self.store_id = store_id


@pytest.mark.django_db
def test_is_store_member_denies_write_without_explicit_store(
    manager_user,
    store,
):
    StoreUser.objects.create(store=store, user=manager_user, is_default=True)
    permission = IsStoreMember()
    request = DummyRequest(user=manager_user, method="POST", data={})
    assert permission.has_permission(request, DummyView()) is False


@pytest.mark.django_db
def test_is_store_member_allows_write_with_store_membership(
    manager_user,
    store,
):
    StoreUser.objects.create(store=store, user=manager_user, is_default=True)
    permission = IsStoreMember()
    request = DummyRequest(user=manager_user, method="POST", data={"store": str(store.pk)})
    assert permission.has_permission(request, DummyView()) is True


@pytest.mark.django_db
def test_is_store_member_checks_object_store_on_detail_routes(
    manager_user,
    store,
):
    other_store = Store.objects.create(
        enterprise=store.enterprise,
        name="Autre Boutique",
        code="BT-002",
        address="456 Rue Test",
    )
    StoreUser.objects.create(store=store, user=manager_user, is_default=True)
    permission = IsStoreMember()

    request = DummyRequest(user=manager_user, method="PATCH", data={})
    view = DummyView(kwargs={"pk": "abc"})

    # Permission can pass at route level for detail updates without `store` in body,
    # then object-level check enforces tenant boundary.
    assert permission.has_permission(request, view) is True
    assert permission.has_object_permission(request, view, DummyObject(store_id=store.pk)) is True
    assert permission.has_object_permission(request, view, DummyObject(store_id=other_store.pk)) is False


@pytest.mark.django_db
def test_feature_sales_pos_denies_when_disabled_for_store(
    manager_user,
    store,
):
    StoreUser.objects.create(store=store, user=manager_user, is_default=True)
    store.analytics_feature_overrides = {"sales_pos": False}
    store.save(update_fields=["analytics_feature_overrides", "updated_at"])

    permission = FeatureSalesPOSEnabled()
    request = DummyRequest(
        user=manager_user,
        method="GET",
        query_params={"store": str(store.pk)},
    )
    assert permission.has_permission(request, DummyView()) is False
    assert "desactive" in permission.message.lower()


@pytest.mark.django_db
def test_feature_sales_pos_allows_when_enabled_for_store(
    manager_user,
    store,
):
    StoreUser.objects.create(store=store, user=manager_user, is_default=True)
    store.analytics_feature_overrides = {"sales_pos": True}
    store.save(update_fields=["analytics_feature_overrides", "updated_at"])

    permission = FeatureSalesPOSEnabled()
    request = DummyRequest(
        user=manager_user,
        method="GET",
        query_params={"store": str(store.pk)},
    )
    assert permission.has_permission(request, DummyView()) is True
