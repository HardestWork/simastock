import pytest

from stores.models import Store, StoreUser


def make_staff(user):
    user.is_staff = True
    user.save(update_fields=["is_staff"])
    return user


@pytest.mark.django_db
def test_store_create_denied_for_non_staff(client, admin_user):
    client.force_login(admin_user)

    response = client.get("/stores/create/")

    assert response.status_code == 302
    assert "/admin/login/" in response["Location"]


@pytest.mark.django_db
def test_store_create_form_renders_for_staff(client, admin_user):
    make_staff(admin_user)
    client.force_login(admin_user)

    response = client.get("/stores/create/")

    assert response.status_code == 200
    used_templates = [template.name for template in response.templates if template.name]
    assert "stores/store_form.html" in used_templates

    html = response.content.decode("utf-8")
    assert "Nouvelle boutique" in html
    assert 'name="name"' in html
    assert 'name="code"' in html
    assert 'name="currency"' in html
    assert 'name="logo"' in html
    assert 'name="invoice_template"' in html


@pytest.mark.django_db
def test_store_create_validation_error_keeps_posted_values(client, admin_user):
    make_staff(admin_user)
    client.force_login(admin_user)

    response = client.post(
        "/stores/create/",
        {
            "name": "Boutique Ouest",
            "code": "",
            "address": "Bonapriso",
            "phone": "+237677000000",
            "email": "ouest@test.com",
            "currency": "XAF",
        },
    )

    assert response.status_code == 200
    html = response.content.decode("utf-8")
    assert "Le nom et le code sont obligatoires." in html
    assert 'value="Boutique Ouest"' in html
    assert 'value="XAF"' in html


@pytest.mark.django_db
def test_store_create_success_creates_store_and_membership(client, admin_user):
    make_staff(admin_user)
    client.force_login(admin_user)

    response = client.post(
        "/stores/create/",
        {
            "name": "Boutique Nord",
            "code": "NORD-02",
            "address": "Maroua",
            "phone": "+237699000000",
            "email": "nord2@test.com",
            "website": "https://nord.test",
            "currency": "FCFA",
            "legal_name": "Boutique Nord SARL",
            "registration_number": "RC-12345",
            "tax_id": "NIF-12345",
            "bank_details": "BANQUE XYZ - IBAN 0000",
            "invoice_header": "FACTURE",
            "invoice_template": "MODERN",
            "invoice_primary_color": "#112233",
            "invoice_secondary_color": "#44AAFF",
            "offer_validity_days": "21",
            "invoice_terms": "Paiement sous 15 jours.",
            "invoice_footer": "Merci pour votre confiance.",
        },
    )

    assert response.status_code == 302
    assert response["Location"].endswith("/stores/")

    created_store = Store.objects.get(code="NORD-02")
    assert created_store.name == "Boutique Nord"
    assert created_store.website == "https://nord.test"
    assert created_store.legal_name == "Boutique Nord SARL"
    assert created_store.registration_number == "RC-12345"
    assert created_store.tax_id == "NIF-12345"
    assert created_store.invoice_template == "MODERN"
    assert created_store.invoice_primary_color == "#112233"
    assert created_store.invoice_secondary_color == "#44AAFF"
    assert created_store.offer_validity_days == 21
    assert created_store.invoice_terms == "Paiement sous 15 jours."
    assert created_store.invoice_footer == "Merci pour votre confiance."
    assert StoreUser.objects.filter(store=created_store, user=admin_user).exists()


@pytest.mark.django_db
def test_store_edit_form_renders_and_updates_store(client, admin_user, store):
    make_staff(admin_user)
    client.force_login(admin_user)

    response = client.get(f"/stores/{store.id}/edit/")
    assert response.status_code == 200

    html = response.content.decode("utf-8")
    assert "Modifier la boutique" in html
    assert f'value="{store.code}"' in html
    assert "readonly" in html

    post_response = client.post(
        f"/stores/{store.id}/edit/",
        {
            "name": "Boutique Test Modifiee",
            "code": "SHOULD-NOT-CHANGE",
            "address": "Nouvelle adresse",
            "phone": "+237655555555",
            "email": "maj@test.com",
            "website": "https://maj.test",
            "currency": "XAF",
            "legal_name": "Boutique Test SA",
            "registration_number": "RC-999",
            "tax_id": "NIF-999",
            "bank_details": "BANK 123",
            "invoice_header": "FACTURE PROFORMA",
            "invoice_template": "CLASSIC",
            "invoice_primary_color": "#001122",
            "invoice_secondary_color": "#33CCFF",
            "offer_validity_days": "10",
            "invoice_terms": "A regler avant livraison.",
            "invoice_footer": "Service client: +237600000000",
        },
    )

    assert post_response.status_code == 302
    assert post_response["Location"].endswith(f"/stores/{store.id}/")

    store.refresh_from_db()
    assert store.name == "Boutique Test Modifiee"
    assert store.code == "BT-001"
    assert store.address == "Nouvelle adresse"
    assert store.phone == "+237655555555"
    assert store.email == "maj@test.com"
    assert store.website == "https://maj.test"
    assert store.currency == "XAF"
    assert store.legal_name == "Boutique Test SA"
    assert store.registration_number == "RC-999"
    assert store.tax_id == "NIF-999"
    assert store.bank_details == "BANK 123"
    assert store.invoice_header == "FACTURE PROFORMA"
    assert store.invoice_template == "CLASSIC"
    assert store.invoice_primary_color == "#001122"
    assert store.invoice_secondary_color == "#33CCFF"
    assert store.offer_validity_days == 10
    assert store.invoice_terms == "A regler avant livraison."
    assert store.invoice_footer == "Service client: +237600000000"
    assert store.is_active is False
