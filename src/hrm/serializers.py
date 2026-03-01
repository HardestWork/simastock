"""Serializers for the HRM module."""
from rest_framework import serializers

from hrm.models import (
    Attendance,
    AttendancePolicy,
    Contract,
    Department,
    DisciplinaryAction,
    Employee,
    EmployeeDocument,
    EmployeeSalaryComponent,
    EvaluationCriteria,
    EvaluationTemplate,
    Holiday,
    LeaveBalance,
    LeaveRequest,
    LeaveType,
    PayrollPeriod,
    PaySlip,
    PaySlipLine,
    PerformanceReview,
    PerformanceReviewScore,
    Position,
    SalaryComponent,
)


# ---------------------------------------------------------------------------
# Organisation
# ---------------------------------------------------------------------------

class DepartmentSerializer(serializers.ModelSerializer):
    parent_name = serializers.CharField(source="parent.name", read_only=True, default=None)
    head_name = serializers.CharField(source="head.full_name", read_only=True, default=None)
    employee_count = serializers.SerializerMethodField()

    class Meta:
        model = Department
        fields = [
            "id", "enterprise", "name", "code", "parent", "parent_name",
            "head", "head_name", "is_active", "employee_count",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "enterprise", "created_at", "updated_at"]

    def get_employee_count(self, obj):
        return getattr(obj, "_employee_count", obj.employees.count())


class PositionSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(
        source="department.name", read_only=True, default=None
    )

    class Meta:
        model = Position
        fields = [
            "id", "enterprise", "title", "code", "department", "department_name",
            "min_salary", "max_salary", "is_active",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "enterprise", "created_at", "updated_at"]


# ---------------------------------------------------------------------------
# Employee
# ---------------------------------------------------------------------------

class EmployeeListSerializer(serializers.ModelSerializer):
    """Serializer leger pour les listes."""
    department_name = serializers.CharField(
        source="department.name", read_only=True, default=None
    )
    position_title = serializers.CharField(
        source="position.title", read_only=True, default=None
    )
    store_name = serializers.CharField(
        source="store.name", read_only=True, default=None
    )
    full_name = serializers.CharField(read_only=True)

    class Meta:
        model = Employee
        fields = [
            "id", "employee_number", "first_name", "last_name", "full_name",
            "phone", "email", "department", "department_name",
            "position", "position_title", "store", "store_name",
            "status", "hire_date", "photo",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class EmployeeDetailSerializer(serializers.ModelSerializer):
    """Serializer complet pour le detail."""
    department_name = serializers.CharField(
        source="department.name", read_only=True, default=None
    )
    position_title = serializers.CharField(
        source="position.title", read_only=True, default=None
    )
    store_name = serializers.CharField(
        source="store.name", read_only=True, default=None
    )
    manager_name = serializers.CharField(
        source="manager.full_name", read_only=True, default=None
    )
    full_name = serializers.CharField(read_only=True)
    user_email = serializers.EmailField(
        source="user.email", read_only=True, default=None
    )

    class Meta:
        model = Employee
        fields = [
            "id", "enterprise", "user", "user_email",
            "employee_number", "first_name", "last_name", "full_name",
            "gender", "date_of_birth", "national_id",
            "phone", "email", "address", "photo",
            "department", "department_name",
            "position", "position_title",
            "manager", "manager_name",
            "store", "store_name",
            "hire_date", "termination_date", "status",
            "base_salary", "bank_name", "bank_account",
            "emergency_contact_name", "emergency_contact_phone",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "enterprise", "created_at", "updated_at"]


class EmployeeCreateSerializer(serializers.ModelSerializer):
    """Serializer pour la creation d'employe."""

    class Meta:
        model = Employee
        fields = [
            "id", "user", "employee_number",
            "first_name", "last_name", "gender", "date_of_birth", "national_id",
            "phone", "email", "address", "photo",
            "department", "position", "manager", "store",
            "hire_date", "status",
            "base_salary", "bank_name", "bank_account",
            "emergency_contact_name", "emergency_contact_phone",
        ]
        read_only_fields = ["id"]


# ---------------------------------------------------------------------------
# Contract
# ---------------------------------------------------------------------------

class ContractSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(
        source="employee.full_name", read_only=True, default=None
    )
    position_title = serializers.CharField(
        source="position.title", read_only=True, default=None
    )

    class Meta:
        model = Contract
        fields = [
            "id", "employee", "employee_name",
            "contract_type", "reference", "start_date", "end_date",
            "salary", "position", "position_title",
            "status", "notes", "document",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


# ---------------------------------------------------------------------------
# Attendance
# ---------------------------------------------------------------------------

class AttendancePolicySerializer(serializers.ModelSerializer):
    class Meta:
        model = AttendancePolicy
        fields = [
            "id", "enterprise", "name",
            "work_start", "work_end", "break_minutes",
            "late_tolerance_minutes", "is_default",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "enterprise", "created_at", "updated_at"]


class AttendanceSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(
        source="employee.full_name", read_only=True, default=None
    )

    class Meta:
        model = Attendance
        fields = [
            "id", "employee", "employee_name",
            "date", "check_in", "check_out",
            "status", "late_minutes", "overtime_minutes",
            "notes", "policy",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


# ---------------------------------------------------------------------------
# Leave
# ---------------------------------------------------------------------------

class LeaveTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = LeaveType
        fields = [
            "id", "enterprise", "name", "code",
            "default_days", "is_paid", "requires_document", "is_active",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "enterprise", "created_at", "updated_at"]


class LeaveBalanceSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(
        source="employee.full_name", read_only=True, default=None
    )
    leave_type_name = serializers.CharField(
        source="leave_type.name", read_only=True, default=None
    )
    remaining = serializers.DecimalField(
        max_digits=6, decimal_places=1, read_only=True
    )

    class Meta:
        model = LeaveBalance
        fields = [
            "id", "employee", "employee_name",
            "leave_type", "leave_type_name",
            "year", "allocated", "used", "carried_over", "remaining",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class LeaveRequestSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(
        source="employee.full_name", read_only=True, default=None
    )
    leave_type_name = serializers.CharField(
        source="leave_type.name", read_only=True, default=None
    )
    reviewer_name = serializers.CharField(
        source="reviewed_by.full_name", read_only=True, default=None
    )

    class Meta:
        model = LeaveRequest
        fields = [
            "id", "employee", "employee_name",
            "leave_type", "leave_type_name",
            "start_date", "end_date", "days_requested",
            "reason", "status",
            "reviewed_by", "reviewer_name", "reviewed_at", "review_comment",
            "document",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "reviewed_by", "reviewed_at", "created_at", "updated_at",
        ]


# ---------------------------------------------------------------------------
# Payroll
# ---------------------------------------------------------------------------

class PayrollPeriodSerializer(serializers.ModelSerializer):
    payslip_count = serializers.SerializerMethodField()

    class Meta:
        model = PayrollPeriod
        fields = [
            "id", "enterprise", "label",
            "start_date", "end_date", "status",
            "closed_at", "closed_by", "payslip_count",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "enterprise", "closed_at", "closed_by",
            "created_at", "updated_at",
        ]

    def get_payslip_count(self, obj):
        return getattr(obj, "_payslip_count", obj.payslips.count())


class PaySlipLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaySlipLine
        fields = ["id", "payslip", "line_type", "label", "amount", "sort_order"]
        read_only_fields = ["id"]


class PaySlipSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(
        source="employee.full_name", read_only=True, default=None
    )
    period_label = serializers.CharField(
        source="period.label", read_only=True, default=None
    )
    lines = PaySlipLineSerializer(many=True, read_only=True)

    class Meta:
        model = PaySlip
        fields = [
            "id", "period", "period_label",
            "employee", "employee_name",
            "base_salary", "gross_salary", "total_deductions", "net_salary",
            "status", "paid_at", "notes", "lines",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class SalaryComponentSerializer(serializers.ModelSerializer):
    class Meta:
        model = SalaryComponent
        fields = [
            "id", "enterprise", "name", "code",
            "component_type", "is_taxable", "is_fixed",
            "default_amount", "default_percentage", "is_active",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "enterprise", "created_at", "updated_at"]


class EmployeeSalaryComponentSerializer(serializers.ModelSerializer):
    component_name = serializers.CharField(
        source="component.name", read_only=True, default=None
    )
    component_type = serializers.CharField(
        source="component.component_type", read_only=True, default=None
    )

    class Meta:
        model = EmployeeSalaryComponent
        fields = [
            "id", "employee", "component", "component_name", "component_type",
            "amount", "percentage", "is_active",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


# ---------------------------------------------------------------------------
# Performance
# ---------------------------------------------------------------------------

class EvaluationCriteriaSerializer(serializers.ModelSerializer):
    class Meta:
        model = EvaluationCriteria
        fields = ["id", "template", "label", "weight", "sort_order"]
        read_only_fields = ["id"]


class EvaluationTemplateSerializer(serializers.ModelSerializer):
    criteria = EvaluationCriteriaSerializer(many=True, read_only=True)

    class Meta:
        model = EvaluationTemplate
        fields = [
            "id", "enterprise", "name", "description", "is_active",
            "criteria", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "enterprise", "created_at", "updated_at"]


class PerformanceReviewScoreSerializer(serializers.ModelSerializer):
    criteria_label = serializers.CharField(
        source="criteria.label", read_only=True, default=None
    )

    class Meta:
        model = PerformanceReviewScore
        fields = ["id", "review", "criteria", "criteria_label", "score", "comment"]
        read_only_fields = ["id"]


class PerformanceReviewSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(
        source="employee.full_name", read_only=True, default=None
    )
    reviewer_name = serializers.CharField(
        source="reviewer.full_name", read_only=True, default=None
    )
    scores = PerformanceReviewScoreSerializer(many=True, read_only=True)

    class Meta:
        model = PerformanceReview
        fields = [
            "id", "employee", "employee_name",
            "template", "reviewer", "reviewer_name",
            "period_label", "review_date", "overall_score",
            "status", "comments", "employee_comments",
            "scores",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


# ---------------------------------------------------------------------------
# Discipline
# ---------------------------------------------------------------------------

class DisciplinaryActionSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(
        source="employee.full_name", read_only=True, default=None
    )
    issued_by_name = serializers.CharField(
        source="issued_by.full_name", read_only=True, default=None
    )

    class Meta:
        model = DisciplinaryAction
        fields = [
            "id", "employee", "employee_name",
            "severity", "incident_date", "description", "action_taken",
            "status", "issued_by", "issued_by_name",
            "document", "resolved_at",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


# ---------------------------------------------------------------------------
# Documents
# ---------------------------------------------------------------------------

class EmployeeDocumentSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(
        source="employee.full_name", read_only=True, default=None
    )

    class Meta:
        model = EmployeeDocument
        fields = [
            "id", "employee", "employee_name",
            "doc_type", "title", "file", "expiry_date",
            "notes", "uploaded_by",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "uploaded_by", "created_at", "updated_at"]


# ---------------------------------------------------------------------------
# Holiday
# ---------------------------------------------------------------------------

class HolidaySerializer(serializers.ModelSerializer):
    class Meta:
        model = Holiday
        fields = [
            "id", "enterprise", "name", "date", "is_recurring",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "enterprise", "created_at", "updated_at"]
