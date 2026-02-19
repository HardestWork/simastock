import pytest


def make_staff(user):
    user.is_staff = True
    user.save(update_fields=["is_staff"])
    return user


@pytest.mark.django_db
def test_store_detail_denied_for_non_staff(client, admin_user, store):
    client.force_login(admin_user)

    response = client.get(f"/stores/{store.id}/")

    assert response.status_code == 302
    assert "/admin/login/" in response["Location"]


@pytest.mark.django_db
def test_store_detail_renders_preview_for_staff(client, admin_user, store):
    make_staff(admin_user)
    store.legal_name = "Boutique Test SARL"
    store.invoice_header = "FACTURE PROFORMA"
    store.invoice_terms = "Paiement avant livraison."
    store.invoice_footer = "Merci pour votre confiance."
    store.save(
        update_fields=["legal_name", "invoice_header", "invoice_terms", "invoice_footer"]
    )

    client.force_login(admin_user)
    response = client.get(f"/stores/{store.id}/")

    assert response.status_code == 200
    used_templates = [template.name for template in response.templates if template.name]
    assert "stores/store_detail.html" in used_templates

    html = response.content.decode("utf-8")
    assert "Apercu facture" in html
    assert "Apercu recu (ticket)" in html
    assert "FACTURE PROFORMA" in html
    assert "FAC-PREVIEW-0001" in html
