"""Tests for Planning & Scheduling API (HRM extension)."""
import datetime

import pytest
from django.contrib.auth import get_user_model

from hrm.models import Employee, Replacement, ScheduleEntry, ScheduleTemplate, ScheduleTemplateLine, Shift
from stores.models import Enterprise, Store, StoreUser

User = get_user_model()


def _enable_planning_module(store):
    ent = store.enterprise
    flags = ent.analytics_feature_flags or {}
    flags["hrm_management"] = True
    flags["planning_management"] = True
    ent.analytics_feature_flags = flags
    ent.save(update_fields=["analytics_feature_flags"])


@pytest.fixture
def planning_store(store):
    _enable_planning_module(store)
    return store


@pytest.fixture
def planning_admin_client(api_client, admin_user, planning_store):
    api_client.force_authenticate(user=admin_user)
    api_client.login(email="admin@test.com", password="TestPass123!")
    return api_client


@pytest.fixture
def shift(planning_store):
    return Shift.objects.create(
        store=planning_store,
        name="Matin",
        start_time=datetime.time(8, 0),
        end_time=datetime.time(16, 0),
        color="#22C55E",
    )


@pytest.fixture
def employee(planning_store):
    return Employee.objects.create(
        enterprise=planning_store.enterprise,
        employee_number="EMP-PLAN-001",
        first_name="Ousmane",
        last_name="Konate",
        store=planning_store,
    )


@pytest.fixture
def schedule_entry(planning_store, employee, shift):
    return ScheduleEntry.objects.create(
        store=planning_store,
        employee=employee,
        shift=shift,
        date=datetime.date(2026, 3, 9),  # Monday
    )


@pytest.fixture
def schedule_template(planning_store, shift):
    tpl = ScheduleTemplate.objects.create(
        store=planning_store,
        name="Semaine standard",
    )
    for day in range(5):  # Lundi-Vendredi
        ScheduleTemplateLine.objects.create(
            template=tpl,
            day_of_week=day,
            shift=shift,
        )
    return tpl


# ── Shift CRUD ─────────────────────────────────────────────────────

@pytest.mark.django_db
def test_create_shift(planning_admin_client):
    r = planning_admin_client.post(
        "/api/v1/hrm/shifts/",
        {"name": "Soir", "start_time": "16:00", "end_time": "00:00", "color": "#3B82F6"},
        format="json",
    )
    assert r.status_code == 201
    assert r.data["name"] == "Soir"


@pytest.mark.django_db
def test_list_shifts(planning_admin_client, shift):
    r = planning_admin_client.get("/api/v1/hrm/shifts/")
    assert r.status_code == 200
    assert r.data["count"] >= 1


@pytest.mark.django_db
def test_update_shift(planning_admin_client, shift):
    r = planning_admin_client.patch(
        f"/api/v1/hrm/shifts/{shift.id}/",
        {"name": "Matin modifie"},
        format="json",
    )
    assert r.status_code == 200
    assert r.data["name"] == "Matin modifie"


@pytest.mark.django_db
def test_delete_shift(planning_admin_client, shift):
    r = planning_admin_client.delete(f"/api/v1/hrm/shifts/{shift.id}/")
    assert r.status_code == 204


# ── Schedule Entry CRUD ───────────────────────────────────────────

@pytest.mark.django_db
def test_create_schedule_entry(planning_admin_client, employee, shift):
    r = planning_admin_client.post(
        "/api/v1/hrm/schedule-entries/",
        {
            "employee": str(employee.id),
            "shift": str(shift.id),
            "date": "2026-03-10",
        },
        format="json",
    )
    assert r.status_code == 201
    assert r.data["status"] == "SCHEDULED"


@pytest.mark.django_db
def test_unique_employee_date(planning_admin_client, employee, shift, schedule_entry):
    """An employee can only have one entry per date."""
    r = planning_admin_client.post(
        "/api/v1/hrm/schedule-entries/",
        {
            "employee": str(employee.id),
            "shift": str(shift.id),
            "date": "2026-03-09",  # Same date as schedule_entry
        },
        format="json",
    )
    assert r.status_code == 400


@pytest.mark.django_db
def test_list_schedule_entries(planning_admin_client, schedule_entry):
    r = planning_admin_client.get("/api/v1/hrm/schedule-entries/")
    assert r.status_code == 200
    assert r.data["count"] >= 1


# ── Weekly View ───────────────────────────────────────────────────

@pytest.mark.django_db
def test_weekly_view(planning_admin_client, schedule_entry):
    r = planning_admin_client.get(
        "/api/v1/hrm/schedule-entries/weekly_view/",
        {"week_start": "2026-03-09"},
    )
    assert r.status_code == 200
    assert len(r.data) >= 1
    assert r.data[0]["employee_name"] == "Ousmane Konate"


@pytest.mark.django_db
def test_weekly_view_missing_param(planning_admin_client):
    r = planning_admin_client.get("/api/v1/hrm/schedule-entries/weekly_view/")
    assert r.status_code == 400


# ── Apply Template ────────────────────────────────────────────────

@pytest.mark.django_db
def test_apply_template(planning_admin_client, schedule_template, employee):
    r = planning_admin_client.post(
        "/api/v1/hrm/schedule-entries/apply_template/",
        {
            "template_id": str(schedule_template.id),
            "week_start": "2026-03-16",
            "employee_ids": [str(employee.id)],
        },
        format="json",
    )
    assert r.status_code == 200
    assert r.data["created"] == 5  # Mon-Fri


@pytest.mark.django_db
def test_apply_template_idempotent(planning_admin_client, schedule_template, employee):
    """Applying the same template twice should not create duplicates."""
    payload = {
        "template_id": str(schedule_template.id),
        "week_start": "2026-03-23",
        "employee_ids": [str(employee.id)],
    }
    r1 = planning_admin_client.post(
        "/api/v1/hrm/schedule-entries/apply_template/",
        payload,
        format="json",
    )
    r2 = planning_admin_client.post(
        "/api/v1/hrm/schedule-entries/apply_template/",
        payload,
        format="json",
    )
    assert r1.data["created"] == 5
    assert r2.data["created"] == 0


# ── Copy Week ─────────────────────────────────────────────────────

@pytest.mark.django_db
def test_copy_week(planning_admin_client, schedule_entry):
    r = planning_admin_client.post(
        "/api/v1/hrm/schedule-entries/copy_week/",
        {
            "source_week_start": "2026-03-09",
            "target_week_start": "2026-03-16",
        },
        format="json",
    )
    assert r.status_code == 200
    assert r.data["created"] >= 1


# ── Schedule Template CRUD ────────────────────────────────────────

@pytest.mark.django_db
def test_create_template(planning_admin_client):
    r = planning_admin_client.post(
        "/api/v1/hrm/schedule-templates/",
        {"name": "Roulement 3x8"},
        format="json",
    )
    assert r.status_code == 201
    assert r.data["name"] == "Roulement 3x8"


@pytest.mark.django_db
def test_list_templates_with_lines(planning_admin_client, schedule_template):
    r = planning_admin_client.get("/api/v1/hrm/schedule-templates/")
    assert r.status_code == 200
    assert r.data["count"] >= 1
    tpl = r.data["results"][0]
    assert len(tpl["lines"]) == 5


# ── Replacement ───────────────────────────────────────────────────

@pytest.mark.django_db
def test_create_replacement(planning_admin_client, schedule_entry, planning_store):
    sub = Employee.objects.create(
        enterprise=planning_store.enterprise,
        employee_number="EMP-PLAN-002",
        first_name="Adama",
        last_name="Sanogo",
        store=planning_store,
    )
    r = planning_admin_client.post(
        "/api/v1/hrm/replacements/",
        {
            "original_entry": str(schedule_entry.id),
            "replacement_employee": str(sub.id),
            "reason": "Maladie",
        },
        format="json",
    )
    assert r.status_code == 201
    assert r.data["replacement_employee_name"] == "Adama Sanogo"


@pytest.mark.django_db
def test_list_replacements(planning_admin_client, schedule_entry, planning_store):
    sub = Employee.objects.create(
        enterprise=planning_store.enterprise,
        employee_number="EMP-PLAN-003",
        first_name="Bintou",
        last_name="Coulibaly",
        store=planning_store,
    )
    Replacement.objects.create(
        original_entry=schedule_entry,
        replacement_employee=sub,
        reason="Conge",
    )
    r = planning_admin_client.get("/api/v1/hrm/replacements/")
    assert r.status_code == 200
    assert r.data["count"] >= 1


# ── Module permission ─────────────────────────────────────────────

@pytest.mark.django_db
def test_planning_requires_module(api_client, admin_user, store):
    """Without planning module, API returns 403."""
    # Enable HRM but not planning
    ent = store.enterprise
    flags = ent.analytics_feature_flags or {}
    flags["hrm_management"] = True
    # planning_management stays False (default)
    ent.analytics_feature_flags = flags
    ent.save(update_fields=["analytics_feature_flags"])
    api_client.force_authenticate(user=admin_user)
    r = api_client.get("/api/v1/hrm/shifts/")
    assert r.status_code == 403
