"""Regression tests for HRM API security and workflow rules."""
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model

from hrm.models import Attendance, Employee, LeaveBalance, LeaveRequest, LeaveType, Position
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
