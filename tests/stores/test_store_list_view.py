import uuid

import pytest

from stores.models import Store, StoreUser


@pytest.mark.django_db
def test_store_list_requires_login(client):
    response = client.get("/stores/")

    assert response.status_code == 302
    assert "/accounts/login/" in response["Location"]


@pytest.mark.django_db
def test_store_list_renders_user_stores_and_applies_search(
    client,
    admin_user,
    manager_user,
    store,
    store_user_admin,
):
    second_store = Store.objects.create(
        enterprise=store.enterprise,
        name="Alpha Market",
        code="ALPHA-01",
        address="Yaounde",
        phone="+237611111111",
        email="alpha@test.com",
    )
    StoreUser.objects.create(store=second_store, user=admin_user, is_default=False)

    foreign_store = Store.objects.create(
        enterprise=store.enterprise,
        name="Magasin Externe",
        code="EXT-01",
        address="Douala",
        phone="+237622222222",
        email="ext@test.com",
    )
    StoreUser.objects.create(store=foreign_store, user=manager_user, is_default=True)

    client.force_login(admin_user)

    response = client.get("/stores/")
    assert response.status_code == 200
    used_templates = [template.name for template in response.templates if template.name]
    assert "stores/store_list.html" in used_templates

    stores = list(response.context["stores"])
    assert store in stores
    assert second_store in stores
    assert foreign_store not in stores
    assert store.id in response.context["default_store_ids"]
    assert second_store.id not in response.context["default_store_ids"]

    filtered = client.get("/stores/?q=alpha")
    filtered_stores = list(filtered.context["stores"])
    assert filtered_stores == [second_store]
    assert filtered.context["search_query"] == "alpha"


@pytest.mark.django_db
def test_store_switch_updates_active_store_in_session(
    client,
    admin_user,
    store_user_admin,
):
    second_store = Store.objects.create(
        enterprise=store_user_admin.store.enterprise,
        name="Boutique Nord",
        code="NORD-01",
        address="Bafoussam",
        phone="+237633333333",
        email="nord@test.com",
    )
    StoreUser.objects.create(store=second_store, user=admin_user, is_default=False)

    client.force_login(admin_user)
    response = client.post(
        "/stores/switch/",
        {"store_id": str(second_store.id), "next": "/stores/"},
        follow=True,
    )

    assert response.status_code == 200
    assert client.session.get("store_id") == str(second_store.id)
    html = response.content.decode("utf-8")
    assert "Boutique active" in html


@pytest.mark.django_db
def test_store_switch_rejects_unknown_store_id(client, admin_user, store_user_admin):
    client.force_login(admin_user)
    expected_store_id = str(store_user_admin.store_id)

    response = client.post(
        "/stores/switch/",
        {"store_id": str(uuid.uuid4()), "next": "/stores/"},
        follow=True,
    )

    assert response.status_code == 200
    assert client.session.get("store_id") == expected_store_id
    html = response.content.decode("utf-8")
    assert "Boutique introuvable ou acces refuse." in html
