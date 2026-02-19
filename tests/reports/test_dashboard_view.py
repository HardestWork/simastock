import pytest


@pytest.mark.django_db
def test_dashboard_page_renders_for_logged_in_user(client, admin_user, store_user_admin):
    client.force_login(admin_user)

    response = client.get("/dashboard/")

    assert response.status_code == 200
    used_templates = [template.name for template in response.templates if template.name]
    assert "dashboard/dashboard.html" in used_templates


@pytest.mark.django_db
def test_reports_index_renders_without_missing_date_context(
    client,
    admin_user,
    store_user_admin,
):
    client.force_login(admin_user)

    response = client.get("/reports/")

    assert response.status_code == 200
    used_templates = [template.name for template in response.templates if template.name]
    assert "reports/reports_index.html" in used_templates


@pytest.mark.django_db
def test_report_detail_pages_render_for_logged_in_user(
    client,
    admin_user,
    store_user_admin,
):
    client.force_login(admin_user)

    sales_response = client.get("/reports/sales/")
    assert sales_response.status_code == 200
    assert "reports/sales_report.html" in [t.name for t in sales_response.templates if t.name]

    stock_response = client.get("/reports/stock/")
    assert stock_response.status_code == 200
    assert "reports/stock_report.html" in [t.name for t in stock_response.templates if t.name]

    cashier_response = client.get("/reports/cashier/")
    assert cashier_response.status_code == 200
    assert "reports/cashier_report.html" in [t.name for t in cashier_response.templates if t.name]

    credit_response = client.get("/reports/credit/")
    assert credit_response.status_code == 200
    assert "reports/credit_report.html" in [t.name for t in credit_response.templates if t.name]
