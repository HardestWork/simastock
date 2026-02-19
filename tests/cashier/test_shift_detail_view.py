import pytest

from cashier.models import CashShift


@pytest.mark.django_db
def test_shift_detail_page_renders_for_admin(client, admin_user, store_user_admin):
    client.force_login(admin_user)
    store = store_user_admin.store
    shift = CashShift.objects.create(
        store=store,
        cashier=admin_user,
        status=CashShift.Status.OPEN,
    )

    response = client.get(f"/cashier/shift-detail/{shift.pk}/")

    assert response.status_code == 200
    used_templates = [template.name for template in response.templates if template.name]
    assert "cashier/shift_detail.html" in used_templates
