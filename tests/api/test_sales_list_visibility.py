import pytest

from accounts.models import User
from sales.services import create_sale
from stores.models import StoreUser


@pytest.mark.django_db
def test_sales_role_sees_only_own_sales_in_sales_list(
    client,
    store,
    sales_user,
    store_user_sales,
):
    other_sales_user = User.objects.create_user(
        email="other-sales@test.com",
        password="testpass123",
        first_name="Other",
        last_name="Sales",
        role=User.Role.SALES,
    )
    StoreUser.objects.create(store=store, user=other_sales_user, is_default=False)

    own_sale = create_sale(store=store, seller=sales_user)
    other_sale = create_sale(store=store, seller=other_sales_user)

    client.force_login(sales_user)
    response = client.get(f"/api/v1/sales/?store={store.pk}")

    assert response.status_code == 200
    payload = response.json()
    returned_ids = {entry["id"] for entry in payload["results"]}
    assert str(own_sale.pk) in returned_ids
    assert str(other_sale.pk) not in returned_ids


@pytest.mark.django_db
def test_manager_still_sees_all_store_sales_in_sales_list(
    client,
    store,
    manager_user,
    sales_user,
    store_user_sales,
):
    StoreUser.objects.create(store=store, user=manager_user, is_default=True)

    other_sales_user = User.objects.create_user(
        email="other-sales-2@test.com",
        password="testpass123",
        first_name="Other2",
        last_name="Sales",
        role=User.Role.SALES,
    )
    StoreUser.objects.create(store=store, user=other_sales_user, is_default=False)

    sale_a = create_sale(store=store, seller=sales_user)
    sale_b = create_sale(store=store, seller=other_sales_user)

    client.force_login(manager_user)
    response = client.get(f"/api/v1/sales/?store={store.pk}")

    assert response.status_code == 200
    payload = response.json()
    returned_ids = {entry["id"] for entry in payload["results"]}
    assert str(sale_a.pk) in returned_ids
    assert str(sale_b.pk) in returned_ids
