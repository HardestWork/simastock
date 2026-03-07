"""Regression tests for HRM API security and workflow rules."""
from datetime import date, time
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from hrm.models import (
    Attendance,
    AttendancePolicy,
    Department,
    Employee,
    LeaveBalance,
    LeaveRequest,
    LeaveType,
    Position,
)
from stores.models import Enterprise, Store, StoreUser

User = get_user_model()


@pytest.mark.django_db
def test_bulk_checkin_requires_manager_or_admin(sales_client, sales_user, store):
    employee = Employee.objects.create(
        enterprise=store.enterprise,
        employee_number='EMP-SALES-001',
        first_name='Amina',
        last_name='Diallo',
    )

    response = sales_client.post(
        '/api/v1/hrm/attendances/bulk-checkin/',
        {
            'employee_ids': [str(employee.id)],
            'date': '2026-02-20',
            'check_in': '2026-02-20T08:00:00Z',
        },
        format='json',
    )

    assert response.status_code == 403


@pytest.mark.django_db
def test_bulk_checkin_rejects_foreign_employee_ids(manager_client, store):
    local_employee = Employee.objects.create(
        enterprise=store.enterprise,
        employee_number='EMP-LOCAL-001',
        first_name='Local',
        last_name='Worker',
    )

    foreign_enterprise = Enterprise.objects.create(name='Other Ent', code='OTHER-ENT', currency='FCFA')
    foreign_store = Store.objects.create(enterprise=foreign_enterprise, name='Other Store', code='OTHER-STORE')
    foreign_user = User.objects.create_user(
        email='other.manager@test.com',
        password='TestPass123!',
        first_name='Other',
        last_name='Manager',
        role='MANAGER',
    )
    StoreUser.objects.create(store=foreign_store, user=foreign_user, is_default=True)
    foreign_employee = Employee.objects.create(
        enterprise=foreign_enterprise,
        employee_number='EMP-FOREIGN-001',
        first_name='Foreign',
        last_name='Worker',
    )

    response = manager_client.post(
        '/api/v1/hrm/attendances/bulk-checkin/',
        {
            'employee_ids': [str(local_employee.id), str(foreign_employee.id)],
            'date': '2026-02-20',
            'check_in': '2026-02-20T08:00:00Z',
        },
        format='json',
    )

    assert response.status_code == 400
    assert 'employee_ids' in response.data
    assert Attendance.objects.filter(employee=local_employee, date='2026-02-20').count() == 0


@pytest.mark.django_db
def test_contract_create_rejects_foreign_position(manager_client, store):
    employee = Employee.objects.create(
        enterprise=store.enterprise,
        employee_number='EMP-CONTRACT-001',
        first_name='Fatou',
        last_name='Kane',
    )

    foreign_enterprise = Enterprise.objects.create(name='Foreign HR', code='FOREIGN-HR', currency='FCFA')
    foreign_position = Position.objects.create(
        enterprise=foreign_enterprise,
        title='Directeur Externe',
    )

    response = manager_client.post(
        '/api/v1/hrm/contracts/',
        {
            'employee': str(employee.id),
            'position': str(foreign_position.id),
            'contract_type': 'CDI',
            'start_date': '2026-02-01',
            'salary': '250000.00',
        },
        format='json',
    )

    assert response.status_code == 400
    assert 'position' in response.data


@pytest.mark.django_db
def test_leave_approve_rejects_when_balance_is_insufficient(manager_client, store):
    employee = Employee.objects.create(
        enterprise=store.enterprise,
        employee_number='EMP-LEAVE-001',
        first_name='Mariam',
        last_name='Sarr',
    )
    leave_type = LeaveType.objects.create(
        enterprise=store.enterprise,
        name='Conge annuel',
        default_days=10,
        is_active=True,
    )
    leave_request = LeaveRequest.objects.create(
        employee=employee,
        leave_type=leave_type,
        start_date='2026-02-10',
        end_date='2026-02-20',
        days_requested=Decimal('8.0'),
        status=LeaveRequest.Status.PENDING,
    )
    balance = LeaveBalance.objects.create(
        employee=employee,
        leave_type=leave_type,
        year=2026,
        allocated=Decimal('5.0'),
        used=Decimal('1.0'),
        carried_over=Decimal('0.0'),
    )

    response = manager_client.post(
        f'/api/v1/hrm/leave-requests/{leave_request.id}/approve/',
        {'comment': 'Validation manager'},
        format='json',
    )

    assert response.status_code == 400
    assert response.data['detail'] == 'Solde de conges insuffisant.'

    leave_request.refresh_from_db()
    balance.refresh_from_db()
    assert leave_request.status == LeaveRequest.Status.PENDING
    assert balance.used == Decimal('1.0')


# ---------------------------------------------------------------------------
# Daily summary
# ---------------------------------------------------------------------------

class TestDailySummary:
    """GET /api/v1/hrm/attendances/daily-summary/"""

    @pytest.fixture
    def employees(self, store):
        """Create 3 active employees for tests."""
        emps = []
        for i, (first, last) in enumerate([('Awa', 'Ba'), ('Ibra', 'Sy'), ('Kadi', 'Fall')]):
            emps.append(Employee.objects.create(
                enterprise=store.enterprise,
                employee_number=f'EMP-SUM-{i:03d}',
                first_name=first,
                last_name=last,
                status=Employee.Status.ACTIVE,
            ))
        return emps

    @pytest.mark.django_db
    def test_summary_returns_correct_counts(self, admin_client, store, employees):
        today = timezone.localdate().isoformat()
        # Employee 0: present on time
        Attendance.objects.create(
            employee=employees[0], date=today,
            check_in=timezone.now(), status=Attendance.Status.PRESENT,
        )
        # Employee 1: late
        Attendance.objects.create(
            employee=employees[1], date=today,
            check_in=timezone.now(), status=Attendance.Status.LATE,
            late_minutes=15,
        )
        # Employee 2: not present (absent)

        resp = admin_client.get('/api/v1/hrm/attendances/daily-summary/', {'date': today})

        assert resp.status_code == 200
        data = resp.data
        assert data['date'] == today
        assert data['total_employees'] == 3
        assert data['present'] == 2  # PRESENT + LATE both count as present
        assert data['late'] == 1
        assert data['absent'] == 1
        assert data['avg_late_minutes'] == 15.0

    @pytest.mark.django_db
    def test_summary_tracks_still_in_and_checked_out(self, admin_client, store, employees):
        today = timezone.localdate().isoformat()
        now = timezone.now()
        # Employee 0: checked in but NOT out (still on site)
        Attendance.objects.create(
            employee=employees[0], date=today,
            check_in=now, status=Attendance.Status.PRESENT,
        )
        # Employee 1: checked in AND out (gone)
        Attendance.objects.create(
            employee=employees[1], date=today,
            check_in=now, check_out=now, status=Attendance.Status.PRESENT,
        )

        resp = admin_client.get('/api/v1/hrm/attendances/daily-summary/', {'date': today})

        assert resp.status_code == 200
        assert resp.data['still_in'] == 1
        assert resp.data['checked_out'] == 1

    @pytest.mark.django_db
    def test_summary_on_leave_not_counted_as_absent(self, admin_client, store, employees):
        today = timezone.localdate().isoformat()
        Attendance.objects.create(
            employee=employees[0], date=today,
            status=Attendance.Status.ON_LEAVE,
        )

        resp = admin_client.get('/api/v1/hrm/attendances/daily-summary/', {'date': today})

        assert resp.status_code == 200
        assert resp.data['on_leave'] == 1
        assert resp.data['absent'] == 2  # 3 total - 0 present - 1 on_leave

    @pytest.mark.django_db
    def test_summary_returns_recent_activity(self, admin_client, store, employees):
        today = timezone.localdate().isoformat()
        Attendance.objects.create(
            employee=employees[0], date=today,
            check_in=timezone.now(), status=Attendance.Status.PRESENT,
            check_in_method='FACE',
        )

        resp = admin_client.get('/api/v1/hrm/attendances/daily-summary/', {'date': today})

        assert resp.status_code == 200
        assert len(resp.data['recent_activity']) == 1
        entry = resp.data['recent_activity'][0]
        assert entry['employee_name'] == 'Awa Ba'
        assert entry['check_in_method'] == 'FACE'

    @pytest.mark.django_db
    def test_summary_empty_date(self, admin_client, store, employees):
        resp = admin_client.get('/api/v1/hrm/attendances/daily-summary/', {'date': '2020-01-01'})

        assert resp.status_code == 200
        assert resp.data['present'] == 0
        assert resp.data['late'] == 0
        assert resp.data['recent_activity'] == []

    @pytest.mark.django_db
    def test_summary_scoped_to_enterprise(self, admin_client, store, employees):
        """Employees from another enterprise should not appear."""
        other_ent = Enterprise.objects.create(name='Other', code='OTHER', currency='FCFA')
        Employee.objects.create(
            enterprise=other_ent, employee_number='EMP-OTHER-001',
            first_name='Other', last_name='Person', status=Employee.Status.ACTIVE,
        )
        today = timezone.localdate().isoformat()

        resp = admin_client.get('/api/v1/hrm/attendances/daily-summary/', {'date': today})

        assert resp.status_code == 200
        assert resp.data['total_employees'] == 3  # only our 3 employees

    @pytest.mark.django_db
    def test_summary_unauthenticated(self, api_client):
        resp = api_client.get('/api/v1/hrm/attendances/daily-summary/')
        assert resp.status_code in (401, 403)


# ---------------------------------------------------------------------------
# AUTO check type (kiosk auto-detect)
# ---------------------------------------------------------------------------

class TestAutoCheckType:
    """POST /api/v1/hrm/attendance-check/check/ with check_type=AUTO"""

    @pytest.fixture
    def employee(self, store):
        return Employee.objects.create(
            enterprise=store.enterprise,
            employee_number='EMP-AUTO-001',
            first_name='Moussa',
            last_name='Ndiaye',
            status=Employee.Status.ACTIVE,
            pin_code='1234',
        )

    @pytest.mark.django_db
    def test_auto_does_checkin_when_no_record_exists(self, admin_client, employee):
        resp = admin_client.post(
            '/api/v1/hrm/attendance-check/check/',
            {
                'employee_id': str(employee.id),
                'check_type': 'AUTO',
                'method': 'FACE',
            },
            format='json',
        )

        assert resp.status_code == 200
        assert resp.data['status'] == 'checked_in'
        assert 'check_in' in resp.data
        assert resp.data['employee_name'] == 'Moussa Ndiaye'

    @pytest.mark.django_db
    def test_auto_does_checkout_when_already_checked_in(self, admin_client, employee):
        # Create existing check-in
        today = timezone.localdate()
        Attendance.objects.create(
            employee=employee, date=today,
            check_in=timezone.now(), status=Attendance.Status.PRESENT,
        )

        resp = admin_client.post(
            '/api/v1/hrm/attendance-check/check/',
            {
                'employee_id': str(employee.id),
                'check_type': 'AUTO',
                'method': 'FACE',
            },
            format='json',
        )

        assert resp.status_code == 200
        assert resp.data['status'] == 'checked_out'
        assert 'check_out' in resp.data

    @pytest.mark.django_db
    def test_auto_does_checkin_when_already_checked_out(self, admin_client, employee):
        """If already checked in AND out, AUTO should try CHECK_IN again."""
        today = timezone.localdate()
        now = timezone.now()
        Attendance.objects.create(
            employee=employee, date=today,
            check_in=now, check_out=now,
            status=Attendance.Status.PRESENT,
        )

        resp = admin_client.post(
            '/api/v1/hrm/attendance-check/check/',
            {
                'employee_id': str(employee.id),
                'check_type': 'AUTO',
                'method': 'FACE',
            },
            format='json',
        )

        assert resp.status_code == 200
        # Already checked in+out, AUTO resolves to CHECK_IN → already_checked_in
        assert resp.data['status'] == 'already_checked_in'

    @pytest.mark.django_db
    def test_auto_with_pin_method(self, admin_client, employee):
        resp = admin_client.post(
            '/api/v1/hrm/attendance-check/check/',
            {
                'employee_id': str(employee.id),
                'check_type': 'AUTO',
                'method': 'PIN',
                'pin_code': '1234',
            },
            format='json',
        )

        assert resp.status_code == 200
        assert resp.data['status'] == 'checked_in'
        assert resp.data['method'] == 'PIN'

    @pytest.mark.django_db
    def test_auto_with_wrong_pin_rejected(self, admin_client, employee):
        resp = admin_client.post(
            '/api/v1/hrm/attendance-check/check/',
            {
                'employee_id': str(employee.id),
                'check_type': 'AUTO',
                'method': 'PIN',
                'pin_code': '9999',
            },
            format='json',
        )

        assert resp.status_code == 400
        assert 'PIN incorrect' in resp.data.get('error', '')

    @pytest.mark.django_db
    def test_auto_rejects_inactive_employee(self, admin_client, store):
        inactive = Employee.objects.create(
            enterprise=store.enterprise,
            employee_number='EMP-INACTIVE-001',
            first_name='Inactif',
            last_name='Test',
            status=Employee.Status.TERMINATED,
        )

        resp = admin_client.post(
            '/api/v1/hrm/attendance-check/check/',
            {
                'employee_id': str(inactive.id),
                'check_type': 'AUTO',
                'method': 'FACE',
            },
            format='json',
        )

        assert resp.status_code == 404

    @pytest.mark.django_db
    def test_explicit_checkin_still_works(self, admin_client, employee):
        """Explicit CHECK_IN should still work as before."""
        resp = admin_client.post(
            '/api/v1/hrm/attendance-check/check/',
            {
                'employee_id': str(employee.id),
                'check_type': 'CHECK_IN',
                'method': 'FACE',
            },
            format='json',
        )

        assert resp.status_code == 200
        assert resp.data['status'] == 'checked_in'

    @pytest.mark.django_db
    def test_explicit_checkout_still_works(self, admin_client, employee):
        """Explicit CHECK_OUT should still work."""
        today = timezone.localdate()
        Attendance.objects.create(
            employee=employee, date=today,
            check_in=timezone.now(), status=Attendance.Status.PRESENT,
        )

        resp = admin_client.post(
            '/api/v1/hrm/attendance-check/check/',
            {
                'employee_id': str(employee.id),
                'check_type': 'CHECK_OUT',
                'method': 'FACE',
            },
            format='json',
        )

        assert resp.status_code == 200
        assert resp.data['status'] == 'checked_out'


# ---------------------------------------------------------------------------
# Attendance CRUD (update / delete)
# ---------------------------------------------------------------------------

class TestAttendanceCRUD:
    """PATCH/DELETE /api/v1/hrm/attendances/{id}/"""

    @pytest.fixture
    def employee(self, store):
        return Employee.objects.create(
            enterprise=store.enterprise,
            employee_number='EMP-CRUD-001',
            first_name='Ali',
            last_name='Toure',
            status=Employee.Status.ACTIVE,
        )

    @pytest.fixture
    def attendance(self, employee):
        return Attendance.objects.create(
            employee=employee, date=timezone.localdate(),
            check_in=timezone.now(), status=Attendance.Status.PRESENT,
        )

    @pytest.mark.django_db
    def test_update_attendance_times(self, admin_client, attendance):
        new_check_in = '2026-03-07T08:30:00Z'
        resp = admin_client.patch(
            f'/api/v1/hrm/attendances/{attendance.id}/',
            {'check_in': new_check_in, 'status': 'LATE'},
            format='json',
        )

        assert resp.status_code == 200
        assert resp.data['status'] == 'LATE'

    @pytest.mark.django_db
    def test_delete_attendance(self, admin_client, attendance):
        resp = admin_client.delete(f'/api/v1/hrm/attendances/{attendance.id}/')
        assert resp.status_code == 204
        assert not Attendance.objects.filter(id=attendance.id).exists()

    @pytest.mark.django_db
    def test_sales_cannot_delete_attendance(self, sales_client, attendance):
        resp = sales_client.delete(f'/api/v1/hrm/attendances/{attendance.id}/')
        assert resp.status_code == 403
        assert Attendance.objects.filter(id=attendance.id).exists()

    @pytest.mark.django_db
    def test_update_recomputes_late_minutes(self, admin_client, employee, store):
        """When updating check_in, late_minutes should be recomputed."""
        policy = AttendancePolicy.objects.create(
            enterprise=store.enterprise,
            name='Standard',
            work_start=time(8, 0),
            work_end=time(17, 0),
            late_tolerance_minutes=5,
            is_default=True,
        )
        att = Attendance.objects.create(
            employee=employee, date='2026-03-07',
            check_in='2026-03-07T08:00:00Z', status=Attendance.Status.PRESENT,
        )

        # Update to a late check-in (8:30, policy starts at 8:00 with 5min tolerance)
        resp = admin_client.patch(
            f'/api/v1/hrm/attendances/{att.id}/',
            {'check_in': '2026-03-07T08:30:00Z'},
            format='json',
        )

        assert resp.status_code == 200
        att.refresh_from_db()
        assert att.late_minutes >= 25  # 30min late - 5min tolerance


# ---------------------------------------------------------------------------
# Policy resolution logic
# ---------------------------------------------------------------------------

class TestPolicyResolution:
    """Tests for _resolve_attendance_policy priority logic."""

    @pytest.fixture
    def department(self, store):
        return Department.objects.create(
            enterprise=store.enterprise,
            name='Ventes',
        )

    @pytest.fixture
    def employee_with_dept(self, store, department):
        return Employee.objects.create(
            enterprise=store.enterprise,
            employee_number='EMP-POL-001',
            first_name='Samba',
            last_name='Diop',
            status=Employee.Status.ACTIVE,
            department=department,
        )

    @pytest.fixture
    def employee_no_dept(self, store):
        return Employee.objects.create(
            enterprise=store.enterprise,
            employee_number='EMP-POL-002',
            first_name='Fatou',
            last_name='Sow',
            status=Employee.Status.ACTIVE,
        )

    @pytest.mark.django_db
    def test_department_policy_takes_priority_over_default(
        self, admin_client, store, department, employee_with_dept,
    ):
        """Employee in a department should use department policy, not default."""
        default_policy = AttendancePolicy.objects.create(
            enterprise=store.enterprise, name='Default',
            work_start=time(8, 0), work_end=time(17, 0),
            late_tolerance_minutes=10, is_default=True,
        )
        dept_policy = AttendancePolicy.objects.create(
            enterprise=store.enterprise, name='Ventes Policy',
            work_start=time(9, 0), work_end=time(18, 0),
            late_tolerance_minutes=5, department=department,
        )

        # Check-in at 9:20 — late for dept policy (9:00 + 5min = 9:05) but NOT for default (8:00 + 10min = 8:10)
        resp = admin_client.post(
            '/api/v1/hrm/attendance-check/check/',
            {
                'employee_id': str(employee_with_dept.id),
                'check_type': 'CHECK_IN',
                'method': 'MANUAL',
            },
            format='json',
        )
        assert resp.status_code == 200

        att = Attendance.objects.get(employee=employee_with_dept)
        assert att.policy_id == dept_policy.id

    @pytest.mark.django_db
    def test_employee_without_dept_uses_default_policy(
        self, admin_client, store, department, employee_no_dept,
    ):
        """Employee without department should fall back to default policy."""
        default_policy = AttendancePolicy.objects.create(
            enterprise=store.enterprise, name='Default',
            work_start=time(8, 0), work_end=time(17, 0),
            late_tolerance_minutes=10, is_default=True,
        )
        AttendancePolicy.objects.create(
            enterprise=store.enterprise, name='Dept Policy',
            work_start=time(9, 0), work_end=time(18, 0),
            late_tolerance_minutes=5, department=department,
        )

        resp = admin_client.post(
            '/api/v1/hrm/attendance-check/check/',
            {
                'employee_id': str(employee_no_dept.id),
                'check_type': 'CHECK_IN',
                'method': 'MANUAL',
            },
            format='json',
        )
        assert resp.status_code == 200

        att = Attendance.objects.get(employee=employee_no_dept)
        assert att.policy_id == default_policy.id

    @pytest.mark.django_db
    def test_no_policy_means_no_late_computed(self, admin_client, store, employee_no_dept):
        """With no policy at all, late_minutes should stay 0."""
        resp = admin_client.post(
            '/api/v1/hrm/attendance-check/check/',
            {
                'employee_id': str(employee_no_dept.id),
                'check_type': 'CHECK_IN',
                'method': 'MANUAL',
            },
            format='json',
        )
        assert resp.status_code == 200

        att = Attendance.objects.get(employee=employee_no_dept)
        assert att.late_minutes == 0
        assert att.policy is None


# ---------------------------------------------------------------------------
# Late / Overtime computation
# ---------------------------------------------------------------------------

class TestLateOvertimeComputation:
    """Tests for _compute_late_minutes and _compute_overtime_minutes."""

    @pytest.fixture
    def employee(self, store):
        return Employee.objects.create(
            enterprise=store.enterprise,
            employee_number='EMP-COMP-001',
            first_name='Omar',
            last_name='Ba',
            status=Employee.Status.ACTIVE,
        )

    @pytest.fixture
    def policy(self, store):
        return AttendancePolicy.objects.create(
            enterprise=store.enterprise, name='Standard',
            work_start=time(8, 0), work_end=time(17, 0),
            late_tolerance_minutes=5, is_default=True,
        )

    @pytest.mark.django_db
    def test_on_time_no_late(self, admin_client, employee, policy):
        """Arriving within tolerance = 0 late minutes.

        Africa/Ouagadougou = UTC+0. 08:03 UTC = 08:03 local.
        Policy: work_start=08:00, tolerance=5min.
        """
        resp = admin_client.post(
            '/api/v1/hrm/attendances/',
            {
                'employee': str(employee.id),
                'date': '2026-03-07',
                'check_in': '2026-03-07T08:03:00Z',
                'status': 'PRESENT',
            },
            format='json',
        )
        assert resp.status_code == 201
        att = Attendance.objects.get(employee=employee, date='2026-03-07')
        assert att.late_minutes == 0

    @pytest.mark.django_db
    def test_late_arrival_computes_minutes(self, admin_client, employee, policy):
        """Arriving 20min after work_start = 20 late minutes."""
        resp = admin_client.post(
            '/api/v1/hrm/attendances/',
            {
                'employee': str(employee.id),
                'date': '2026-03-07',
                'check_in': '2026-03-07T08:20:00Z',
                'status': 'PRESENT',
            },
            format='json',
        )
        assert resp.status_code == 201
        att = Attendance.objects.get(employee=employee, date='2026-03-07')
        assert att.late_minutes == 20
        assert att.status == Attendance.Status.LATE

    @pytest.mark.django_db
    def test_overtime_computed_on_checkout(self, admin_client, employee, policy):
        """Leaving 30min after work_end = 30 overtime minutes."""
        att = Attendance.objects.create(
            employee=employee, date='2026-03-07',
            check_in='2026-03-07T08:00:00Z', status=Attendance.Status.PRESENT,
        )
        resp = admin_client.patch(
            f'/api/v1/hrm/attendances/{att.id}/',
            {'check_out': '2026-03-07T17:30:00Z'},
            format='json',
        )
        assert resp.status_code == 200
        att.refresh_from_db()
        assert att.overtime_minutes == 30

    @pytest.mark.django_db
    def test_no_overtime_when_leaving_early(self, admin_client, employee, policy):
        """Leaving before work_end = 0 overtime."""
        att = Attendance.objects.create(
            employee=employee, date='2026-03-07',
            check_in='2026-03-07T08:00:00Z', status=Attendance.Status.PRESENT,
        )
        resp = admin_client.patch(
            f'/api/v1/hrm/attendances/{att.id}/',
            {'check_out': '2026-03-07T16:30:00Z'},
            format='json',
        )
        assert resp.status_code == 200
        att.refresh_from_db()
        assert att.overtime_minutes == 0

    @pytest.mark.django_db
    def test_kiosk_checkin_computes_late(self, admin_client, employee, policy):
        """Late detection via the kiosk check endpoint. 08:45 = 45min late."""
        from unittest.mock import patch as mock_patch
        import datetime as dt_mod

        fake_now = timezone.make_aware(
            dt_mod.datetime(2026, 3, 7, 8, 45, 0),
            dt_mod.timezone.utc,
        )
        with mock_patch('api.v1.hrm_views.timezone.now', return_value=fake_now):
            with mock_patch('api.v1.hrm_views.timezone.localdate', return_value=dt_mod.date(2026, 3, 7)):
                resp = admin_client.post(
                    '/api/v1/hrm/attendance-check/check/',
                    {
                        'employee_id': str(employee.id),
                        'check_type': 'CHECK_IN',
                        'method': 'FACE',
                    },
                    format='json',
                )

        assert resp.status_code == 200
        assert resp.data['late_minutes'] == 45

    @pytest.mark.django_db
    def test_kiosk_checkout_computes_overtime(self, admin_client, employee, policy):
        """Overtime via kiosk. 18:15 - 17:00 = 75min overtime."""
        from unittest.mock import patch as mock_patch
        import datetime as dt_mod

        Attendance.objects.create(
            employee=employee, date='2026-03-07',
            check_in='2026-03-07T08:00:00Z', status=Attendance.Status.PRESENT,
        )

        fake_now = timezone.make_aware(
            dt_mod.datetime(2026, 3, 7, 18, 15, 0),
            dt_mod.timezone.utc,
        )
        with mock_patch('api.v1.hrm_views.timezone.now', return_value=fake_now):
            with mock_patch('api.v1.hrm_views.timezone.localdate', return_value=dt_mod.date(2026, 3, 7)):
                resp = admin_client.post(
                    '/api/v1/hrm/attendance-check/check/',
                    {
                        'employee_id': str(employee.id),
                        'check_type': 'CHECK_OUT',
                        'method': 'FACE',
                    },
                    format='json',
                )

        assert resp.status_code == 200
        assert resp.data['overtime_minutes'] == 75


# ---------------------------------------------------------------------------
# Attendance list filtering and search
# ---------------------------------------------------------------------------

class TestAttendanceListFiltering:
    """GET /api/v1/hrm/attendances/ — filtering, search, ordering."""

    @pytest.fixture
    def employees_and_records(self, store):
        emp_a = Employee.objects.create(
            enterprise=store.enterprise, employee_number='EMP-FILT-001',
            first_name='Amadou', last_name='Diallo', status=Employee.Status.ACTIVE,
        )
        emp_b = Employee.objects.create(
            enterprise=store.enterprise, employee_number='EMP-FILT-002',
            first_name='Binta', last_name='Kane', status=Employee.Status.ACTIVE,
        )
        now = timezone.now()
        att_a = Attendance.objects.create(
            employee=emp_a, date='2026-03-05',
            check_in=now, status=Attendance.Status.PRESENT,
        )
        att_b = Attendance.objects.create(
            employee=emp_b, date='2026-03-05',
            check_in=now, status=Attendance.Status.LATE, late_minutes=10,
        )
        att_a2 = Attendance.objects.create(
            employee=emp_a, date='2026-03-06',
            status=Attendance.Status.ABSENT,
        )
        return {'emp_a': emp_a, 'emp_b': emp_b, 'att_a': att_a, 'att_b': att_b, 'att_a2': att_a2}

    @pytest.mark.django_db
    def test_filter_by_date(self, admin_client, employees_and_records):
        resp = admin_client.get('/api/v1/hrm/attendances/', {'date': '2026-03-05'})
        assert resp.status_code == 200
        assert resp.data['count'] == 2

    @pytest.mark.django_db
    def test_filter_by_status(self, admin_client, employees_and_records):
        resp = admin_client.get('/api/v1/hrm/attendances/', {'status': 'LATE'})
        assert resp.status_code == 200
        assert resp.data['count'] == 1
        assert resp.data['results'][0]['status'] == 'LATE'

    @pytest.mark.django_db
    def test_filter_by_employee(self, admin_client, employees_and_records):
        emp_a_id = str(employees_and_records['emp_a'].id)
        resp = admin_client.get('/api/v1/hrm/attendances/', {'employee': emp_a_id})
        assert resp.status_code == 200
        assert resp.data['count'] == 2
        for r in resp.data['results']:
            assert str(r['employee']) == emp_a_id

    @pytest.mark.django_db
    def test_search_by_name(self, admin_client, employees_and_records):
        resp = admin_client.get('/api/v1/hrm/attendances/', {'search': 'Binta'})
        assert resp.status_code == 200
        assert resp.data['count'] == 1
        assert 'Binta' in resp.data['results'][0]['employee_name']

    @pytest.mark.django_db
    def test_search_by_last_name(self, admin_client, employees_and_records):
        resp = admin_client.get('/api/v1/hrm/attendances/', {'search': 'Diallo'})
        assert resp.status_code == 200
        assert resp.data['count'] == 2  # emp_a has 2 records

    @pytest.mark.django_db
    def test_ordering_by_date_desc(self, admin_client, employees_and_records):
        resp = admin_client.get('/api/v1/hrm/attendances/', {'ordering': '-date'})
        assert resp.status_code == 200
        dates = [r['date'] for r in resp.data['results']]
        assert dates == sorted(dates, reverse=True)

    @pytest.mark.django_db
    def test_enterprise_isolation(self, admin_client, employees_and_records):
        """Attendance from another enterprise must not be visible."""
        other_ent = Enterprise.objects.create(name='Other', code='OTHER-FILT', currency='FCFA')
        other_emp = Employee.objects.create(
            enterprise=other_ent, employee_number='EMP-OTHER-FILT',
            first_name='Etranger', last_name='Test', status=Employee.Status.ACTIVE,
        )
        Attendance.objects.create(
            employee=other_emp, date='2026-03-05',
            status=Attendance.Status.PRESENT,
        )

        resp = admin_client.get('/api/v1/hrm/attendances/')
        assert resp.status_code == 200
        # Should only see our 3 records, not the foreign one
        assert resp.data['count'] == 3


# ---------------------------------------------------------------------------
# Face profiles by_store (kiosk)
# ---------------------------------------------------------------------------

class TestFaceProfileByStore:
    """GET /api/v1/hrm/face-profiles/by-store/{store_id}/"""

    @pytest.fixture
    def setup_profiles(self, store):
        emp_in_store = Employee.objects.create(
            enterprise=store.enterprise, employee_number='EMP-FP-001',
            first_name='Ali', last_name='Niang', status=Employee.Status.ACTIVE,
            store=store,
        )
        emp_no_store = Employee.objects.create(
            enterprise=store.enterprise, employee_number='EMP-FP-002',
            first_name='Baye', last_name='Fall', status=Employee.Status.ACTIVE,
            store=None,
        )
        emp_other_store = Employee.objects.create(
            enterprise=store.enterprise, employee_number='EMP-FP-003',
            first_name='Coumba', last_name='Sy', status=Employee.Status.ACTIVE,
        )
        other_store = Store.objects.create(
            enterprise=store.enterprise, name='Other Store FP', code='OTHER-FP',
        )
        emp_other_store.store = other_store
        emp_other_store.save()

        from hrm.models import FaceProfile
        fp1 = FaceProfile.objects.create(employee=emp_in_store, embeddings=[[0.1] * 128])
        fp2 = FaceProfile.objects.create(employee=emp_no_store, embeddings=[[0.2] * 128])
        fp3 = FaceProfile.objects.create(employee=emp_other_store, embeddings=[[0.3] * 128])

        return {
            'store': store, 'other_store': other_store,
            'emp_in_store': emp_in_store, 'emp_no_store': emp_no_store,
            'emp_other_store': emp_other_store,
            'fp1': fp1, 'fp2': fp2, 'fp3': fp3,
        }

    @pytest.mark.django_db
    def test_returns_store_and_null_store_employees(self, admin_client, setup_profiles):
        store_id = setup_profiles['store'].id
        resp = admin_client.get(f'/api/v1/hrm/face-profiles/by-store/{store_id}/')

        assert resp.status_code == 200
        names = {p['employee_name'] for p in resp.data}
        assert 'Ali Niang' in names       # assigned to this store
        assert 'Baye Fall' in names        # no store (enterprise-level)
        assert 'Coumba Sy' not in names    # assigned to OTHER store

    @pytest.mark.django_db
    def test_excludes_inactive_profiles(self, admin_client, setup_profiles):
        # Deactivate a profile
        setup_profiles['fp1'].is_active = False
        setup_profiles['fp1'].save()

        store_id = setup_profiles['store'].id
        resp = admin_client.get(f'/api/v1/hrm/face-profiles/by-store/{store_id}/')

        assert resp.status_code == 200
        names = {p['employee_name'] for p in resp.data}
        assert 'Ali Niang' not in names  # deactivated profile

    @pytest.mark.django_db
    def test_excludes_terminated_employees(self, admin_client, setup_profiles):
        setup_profiles['emp_in_store'].status = Employee.Status.TERMINATED
        setup_profiles['emp_in_store'].save()

        store_id = setup_profiles['store'].id
        resp = admin_client.get(f'/api/v1/hrm/face-profiles/by-store/{store_id}/')

        assert resp.status_code == 200
        names = {p['employee_name'] for p in resp.data}
        assert 'Ali Niang' not in names  # terminated employee
