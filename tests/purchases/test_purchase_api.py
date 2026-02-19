import pytest

from purchases.models import Supplier
from stores.models import Enterprise, Store, StoreUser


@pytest.mark.django_db
def test_supplier_create_is_scoped_to_user_enterprise(client, manager_user, store):
    StoreUser.objects.create(store=store, user=manager_user, is_default=True)
    client.force_login(manager_user)

    response = client.post(
        "/api/v1/suppliers/",
        {
            "name": "Fournisseur Scope",
            "contact_name": "Contact Scope",
            "phone": "+237611111111",
        },
    )

    assert response.status_code == 201, response.content
    supplier = Supplier.objects.get(pk=response.json()["id"])
    assert supplier.enterprise_id == store.enterprise_id


@pytest.mark.django_db
def test_purchase_order_create_rejects_supplier_from_other_enterprise(
    client,
    manager_user,
    store,
):
    StoreUser.objects.create(store=store, user=manager_user, is_default=True)
    other_enterprise = Enterprise.objects.create(
        name="Enterprise Externe",
        code="ENT-EXT",
        legal_name="Enterprise Externe SARL",
        currency="FCFA",
    )
    other_store = Store.objects.create(
        enterprise=other_enterprise,
        name="Boutique Externe",
        code="BT-EXT",
        address="Zone Externe",
    )
    foreign_supplier = Supplier.objects.create(
        enterprise=other_enterprise,
        name="Fournisseur Externe",
    )
    # Link user to external store as well to avoid accidental 404 from store scoping.
    StoreUser.objects.create(store=other_store, user=manager_user, is_default=False)

    client.force_login(manager_user)
    response = client.post(
        "/api/v1/purchase-orders/",
        {
            "store": str(store.pk),
            "supplier": str(foreign_supplier.pk),
            "po_number": "PO-SCOPE-0001",
            "notes": "Validation entreprise",
        },
    )

    assert response.status_code == 400
    assert "supplier" in response.json()
