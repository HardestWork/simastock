import pytest
from django.contrib.messages import get_messages
from django.urls import reverse

from stores.models import StoreUser


@pytest.mark.django_db
def test_store_generic_feature_flags_inheritance(store):
    store.enterprise.analytics_feature_flags = {
        "sales_pos": False,
        "cashier_operations": True,
    }
    store.enterprise.save(update_fields=["analytics_feature_flags", "updated_at"])
    store.refresh_from_db()

    assert store.is_feature_enabled("sales_pos") is False
    assert store.is_feature_enabled("cashier_operations") is True

    store.analytics_feature_overrides = {"sales_pos": True}
    store.save(update_fields=["analytics_feature_overrides", "updated_at"])
    store.refresh_from_db()

    assert store.is_feature_enabled("sales_pos") is True


@pytest.mark.django_db
def test_sales_module_disabled_blocks_pos_routes(client, store, sales_user):
    StoreUser.objects.get_or_create(store=store, user=sales_user, defaults={"is_default": True})
    store.analytics_feature_overrides = {"sales_pos": False}
    store.save(update_fields=["analytics_feature_overrides", "updated_at"])

    client.force_login(sales_user)
    session = client.session
    session["store_id"] = str(store.id)
    session.save()

    response = client.get(reverse("sales:sale-create"), follow=True)
    assert response.status_code == 200
    assert response.redirect_chain
    assert response.request["PATH_INFO"] == reverse("dashboard:index")

    messages = [str(m) for m in get_messages(response.wsgi_request)]
    assert any("vente POS est desactive" in message for message in messages)


@pytest.mark.django_db
def test_analytics_api_disabled_returns_403(client, store, manager_user):
    StoreUser.objects.get_or_create(store=store, user=manager_user, defaults={"is_default": True})
    store.analytics_feature_overrides = {"enabled": False}
    store.save(update_fields=["analytics_feature_overrides", "updated_at"])

    client.force_login(manager_user)
    session = client.session
    session["store_id"] = str(store.id)
    session.save()

    response = client.get(reverse("api:analytics-abc"))
    assert response.status_code == 403
    payload = response.json()
    assert payload["feature_flag"] == "enabled"
