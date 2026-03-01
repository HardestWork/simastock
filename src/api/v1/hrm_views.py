"""ViewSets for the HRM module."""
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from api.v1.pagination import StandardResultsSetPagination
from api.v1.permissions import (
    CanManageHRM,
    CanViewHRM,
    FeatureHRMManagementEnabled,
    ModuleHRMEnabled,
)
from api.v1.views import (
    _filter_queryset_by_enterprise,
    _require_user_enterprise_id,
    _user_enterprise_id,
)

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
from hrm.serializers import (
    AttendancePolicySerializer,
    AttendanceSerializer,
    ContractSerializer,
    DepartmentSerializer,
    DisciplinaryActionSerializer,
    EmployeeCreateSerializer,
    EmployeeDetailSerializer,
    EmployeeDocumentSerializer,
    EmployeeListSerializer,
    EmployeeSalaryComponentSerializer,
    EvaluationCriteriaSerializer,
    EvaluationTemplateSerializer,
    HolidaySerializer,
    LeaveBalanceSerializer,
    LeaveRequestSerializer,
    LeaveTypeSerializer,
    PayrollPeriodSerializer,
    PaySlipLineSerializer,
    PaySlipSerializer,
    PerformanceReviewScoreSerializer,
    PerformanceReviewSerializer,
    PositionSerializer,
    SalaryComponentSerializer,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _hrm_enterprise_qs(viewset, qs, field="enterprise_id"):
    """Filter enterprise-scoped queryset to the user's enterprise."""
    return _filter_queryset_by_enterprise(qs, viewset.request.user, field_name=field)


def _hrm_employee_qs(viewset, qs):
    """Filter employee-scoped queryset (via employee__enterprise_id)."""
    return _filter_queryset_by_enterprise(
        qs, viewset.request.user, field_name="employee__enterprise_id"
    )


def _resolve_attr_path(obj, attr_path):
    """Resolve dotted attribute path on a model instance."""
    value = obj
    for attr in attr_path.split("."):
        value = getattr(value, attr, None)
        if value is None:
            break
    return value


def _validate_related_enterprise(user, validated_data, relations):
    """Ensure related FK objects belong to the current user's enterprise."""
    enterprise_id = _require_user_enterprise_id(user)
    errors = {}
    for field, attr_path in relations.items():
        related_obj = validated_data.get(field)
        if related_obj is None:
            continue
        related_enterprise_id = _resolve_attr_path(related_obj, attr_path)
        if related_enterprise_id != enterprise_id:
            errors[field] = "Cet element n'appartient pas a votre entreprise."
    if errors:
        raise ValidationError(errors)


def _require_manager_or_admin(request, view):
    """Hard guard for privileged actions."""
    if not CanManageHRM().has_permission(request, view):
        raise PermissionDenied("Vous n'avez pas la permission d'effectuer cette action.")


# ---------------------------------------------------------------------------
# Organisation
# ---------------------------------------------------------------------------

class DepartmentViewSet(viewsets.ModelViewSet):
    """CRUD pour les departements."""

    serializer_class = DepartmentSerializer
    queryset = Department.objects.select_related("parent", "head")
    pagination_class = StandardResultsSetPagination
    filterset_fields = ["is_active", "parent"]
    search_fields = ["name", "code"]
    ordering_fields = ["name", "created_at"]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAuthenticated(), ModuleHRMEnabled(), FeatureHRMManagementEnabled(), CanManageHRM()]
        return [IsAuthenticated(), ModuleHRMEnabled(), FeatureHRMManagementEnabled(), CanViewHRM()]

    def get_queryset(self):
        return _hrm_enterprise_qs(self, super().get_queryset())

    def perform_create(self, serializer):
        enterprise_id = _require_user_enterprise_id(self.request.user)
        _validate_related_enterprise(
            self.request.user,
            serializer.validated_data,
            {"parent": "enterprise_id", "head": "enterprise_id"},
        )
        serializer.save(enterprise_id=enterprise_id)

    def perform_update(self, serializer):
        _validate_related_enterprise(
            self.request.user,
            serializer.validated_data,
            {"parent": "enterprise_id", "head": "enterprise_id"},
        )
        serializer.save()


class PositionViewSet(viewsets.ModelViewSet):
    """CRUD pour les postes."""

    serializer_class = PositionSerializer
    queryset = Position.objects.select_related("department")
    pagination_class = StandardResultsSetPagination
    filterset_fields = ["is_active", "department"]
    search_fields = ["title", "code"]
    ordering_fields = ["title", "created_at"]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy", "bulk_checkin", "bulk-checkin"):
            return [IsAuthenticated(), ModuleHRMEnabled(), FeatureHRMManagementEnabled(), CanManageHRM()]
        return [IsAuthenticated(), ModuleHRMEnabled(), FeatureHRMManagementEnabled(), CanViewHRM()]

    def get_queryset(self):
        return _hrm_enterprise_qs(self, super().get_queryset())

    def perform_create(self, serializer):
        enterprise_id = _require_user_enterprise_id(self.request.user)
        _validate_related_enterprise(
            self.request.user,
            serializer.validated_data,
            {"department": "enterprise_id"},
        )
        serializer.save(enterprise_id=enterprise_id)

    def perform_update(self, serializer):
        _validate_related_enterprise(
            self.request.user,
            serializer.validated_data,
            {"department": "enterprise_id"},
        )
        serializer.save()


# ---------------------------------------------------------------------------
# Employee
# ---------------------------------------------------------------------------

class EmployeeViewSet(viewsets.ModelViewSet):
    """CRUD pour les employes."""

    queryset = Employee.objects.select_related(
        "department", "position", "store", "manager", "user"
    )
    pagination_class = StandardResultsSetPagination
    filterset_fields = ["status", "department", "position", "store"]
    search_fields = ["first_name", "last_name", "employee_number", "phone", "email"]
    ordering_fields = ["last_name", "first_name", "hire_date", "created_at"]

    def get_serializer_class(self):
        if self.action == "create":
            return EmployeeCreateSerializer
        if self.action == "list":
            return EmployeeListSerializer
        return EmployeeDetailSerializer

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAuthenticated(), ModuleHRMEnabled(), FeatureHRMManagementEnabled(), CanManageHRM()]
        return [IsAuthenticated(), ModuleHRMEnabled(), FeatureHRMManagementEnabled(), CanViewHRM()]

    def get_queryset(self):
        return _hrm_enterprise_qs(self, super().get_queryset())

    def perform_create(self, serializer):
        enterprise_id = _require_user_enterprise_id(self.request.user)
        _validate_related_enterprise(
            self.request.user,
            serializer.validated_data,
            {
                "department": "enterprise_id",
                "position": "enterprise_id",
                "manager": "enterprise_id",
                "store": "enterprise_id",
            },
        )
        serializer.save(enterprise_id=enterprise_id)

    def perform_update(self, serializer):
        _validate_related_enterprise(
            self.request.user,
            serializer.validated_data,
            {
                "department": "enterprise_id",
                "position": "enterprise_id",
                "manager": "enterprise_id",
                "store": "enterprise_id",
            },
        )
        serializer.save()


# ---------------------------------------------------------------------------
# Contract
# ---------------------------------------------------------------------------

class ContractViewSet(viewsets.ModelViewSet):
    """CRUD pour les contrats de travail."""

    serializer_class = ContractSerializer
    queryset = Contract.objects.select_related("employee", "position")
    pagination_class = StandardResultsSetPagination
    filterset_fields = ["status", "contract_type", "employee"]
    search_fields = ["reference", "employee__first_name", "employee__last_name"]
    ordering_fields = ["start_date", "end_date", "created_at"]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAuthenticated(), ModuleHRMEnabled(), FeatureHRMManagementEnabled(), CanManageHRM()]
        return [IsAuthenticated(), ModuleHRMEnabled(), FeatureHRMManagementEnabled(), CanViewHRM()]

    def get_queryset(self):
        return _hrm_employee_qs(self, super().get_queryset())

    def perform_create(self, serializer):
        _validate_related_enterprise(
            self.request.user,
            serializer.validated_data,
            {"employee": "enterprise_id", "position": "enterprise_id"},
        )
        serializer.save()

    def perform_update(self, serializer):
        _validate_related_enterprise(
            self.request.user,
            serializer.validated_data,
            {"employee": "enterprise_id", "position": "enterprise_id"},
        )
        serializer.save()


# ---------------------------------------------------------------------------
# Attendance
# ---------------------------------------------------------------------------

class AttendancePolicyViewSet(viewsets.ModelViewSet):
    """CRUD pour les politiques de presence."""

    serializer_class = AttendancePolicySerializer
    queryset = AttendancePolicy.objects.all()
    pagination_class = StandardResultsSetPagination
    filterset_fields = ["is_default"]
    search_fields = ["name"]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAuthenticated(), ModuleHRMEnabled(), FeatureHRMManagementEnabled(), CanManageHRM()]
        return [IsAuthenticated(), ModuleHRMEnabled(), FeatureHRMManagementEnabled(), CanViewHRM()]

    def get_queryset(self):
        return _hrm_enterprise_qs(self, super().get_queryset())

    def perform_create(self, serializer):
        enterprise_id = _require_user_enterprise_id(self.request.user)
        serializer.save(enterprise_id=enterprise_id)

    def perform_update(self, serializer):
        serializer.save()


class AttendanceViewSet(viewsets.ModelViewSet):
    """CRUD pour les pointages."""

    serializer_class = AttendanceSerializer
    queryset = Attendance.objects.select_related("employee", "policy")
    pagination_class = StandardResultsSetPagination
    filterset_fields = ["status", "employee", "date"]
    search_fields = ["employee__first_name", "employee__last_name"]
    ordering_fields = ["date", "check_in", "created_at"]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAuthenticated(), ModuleHRMEnabled(), FeatureHRMManagementEnabled(), CanManageHRM()]
        return [IsAuthenticated(), ModuleHRMEnabled(), FeatureHRMManagementEnabled(), CanViewHRM()]

    def get_queryset(self):
        return _hrm_employee_qs(self, super().get_queryset())

    def perform_create(self, serializer):
        _validate_related_enterprise(
            self.request.user,
            serializer.validated_data,
            {"employee": "enterprise_id", "policy": "enterprise_id"},
        )
        serializer.save()

    def perform_update(self, serializer):
        _validate_related_enterprise(
            self.request.user,
            serializer.validated_data,
            {"employee": "enterprise_id", "policy": "enterprise_id"},
        )
        serializer.save()

    @action(
        detail=False,
        methods=["post"],
        url_path="bulk-checkin",
        permission_classes=[CanManageHRM],
    )
    def bulk_checkin(self, request):
        """Pointage d'entree en masse pour une date donnee."""
        _require_manager_or_admin(request, self)
        employee_ids = request.data.get("employee_ids", [])
        date = request.data.get("date")
        check_in = request.data.get("check_in")

        if not employee_ids or not date:
            raise ValidationError({"detail": "employee_ids et date sont requis."})

        enterprise_id = _require_user_enterprise_id(request.user)
        allowed_ids = set(
            str(emp_id)
            for emp_id in Employee.objects.filter(
                enterprise_id=enterprise_id,
                id__in=employee_ids,
            ).values_list("id", flat=True)
        )
        requested_ids = [str(eid) for eid in employee_ids]
        invalid_ids = [eid for eid in requested_ids if eid not in allowed_ids]
        if invalid_ids:
            raise ValidationError(
                {"employee_ids": "Un ou plusieurs employes sont invalides pour votre entreprise."}
            )

        created = []
        for eid in requested_ids:
            obj, was_created = Attendance.objects.get_or_create(
                employee_id=eid, date=date,
                defaults={"check_in": check_in, "status": Attendance.Status.PRESENT},
            )
            if was_created:
                created.append(str(obj.id))

        return Response({"created": len(created)}, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# Leave
# ---------------------------------------------------------------------------

class LeaveTypeViewSet(viewsets.ModelViewSet):
    """CRUD pour les types de conges."""

    serializer_class = LeaveTypeSerializer
    queryset = LeaveType.objects.all()
    pagination_class = StandardResultsSetPagination
    filterset_fields = ["is_active", "is_paid"]
    search_fields = ["name", "code"]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAuthenticated(), ModuleHRMEnabled(), FeatureHRMManagementEnabled(), CanManageHRM()]
        return [IsAuthenticated(), ModuleHRMEnabled(), FeatureHRMManagementEnabled(), CanViewHRM()]

    def get_queryset(self):
        return _hrm_enterprise_qs(self, super().get_queryset())

    def perform_create(self, serializer):
        enterprise_id = _require_user_enterprise_id(self.request.user)
        serializer.save(enterprise_id=enterprise_id)

    def perform_update(self, serializer):
        serializer.save()


class LeaveBalanceViewSet(viewsets.ModelViewSet):
    """CRUD pour les soldes de conges."""

    serializer_class = LeaveBalanceSerializer
    queryset = LeaveBalance.objects.select_related("employee", "leave_type")
    pagination_class = StandardResultsSetPagination
    filterset_fields = ["employee", "leave_type", "year"]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAuthenticated(), ModuleHRMEnabled(), FeatureHRMManagementEnabled(), CanManageHRM()]
        return [IsAuthenticated(), ModuleHRMEnabled(), FeatureHRMManagementEnabled(), CanViewHRM()]

    def get_queryset(self):
        return _hrm_employee_qs(self, super().get_queryset())

    def perform_create(self, serializer):
        _validate_related_enterprise(
            self.request.user,
            serializer.validated_data,
            {"employee": "enterprise_id", "leave_type": "enterprise_id"},
        )
        serializer.save()

    def perform_update(self, serializer):
        _validate_related_enterprise(
            self.request.user,
            serializer.validated_data,
            {"employee": "enterprise_id", "leave_type": "enterprise_id"},
        )
        serializer.save()


class LeaveRequestViewSet(viewsets.ModelViewSet):
    """CRUD pour les demandes de conge."""

    serializer_class = LeaveRequestSerializer
    queryset = LeaveRequest.objects.select_related("employee", "leave_type", "reviewed_by")
    pagination_class = StandardResultsSetPagination
    filterset_fields = ["status", "employee", "leave_type"]
    search_fields = ["employee__first_name", "employee__last_name"]
    ordering_fields = ["start_date", "created_at"]

    def get_permissions(self):
        if self.action in ("destroy", "approve", "reject"):
            return [IsAuthenticated(), ModuleHRMEnabled(), FeatureHRMManagementEnabled(), CanManageHRM()]
        return [IsAuthenticated(), ModuleHRMEnabled(), FeatureHRMManagementEnabled(), CanViewHRM()]

    def get_queryset(self):
        return _hrm_employee_qs(self, super().get_queryset())

    def perform_create(self, serializer):
        _validate_related_enterprise(
            self.request.user,
            serializer.validated_data,
            {"employee": "enterprise_id", "leave_type": "enterprise_id"},
        )
        serializer.save()

    def perform_update(self, serializer):
        _validate_related_enterprise(
            self.request.user,
            serializer.validated_data,
            {"employee": "enterprise_id", "leave_type": "enterprise_id"},
        )
        serializer.save()

    @action(detail=True, methods=["post"], permission_classes=[CanManageHRM])
    def approve(self, request, pk=None):
        """Approuver une demande de conge."""
        _require_manager_or_admin(request, self)
        with transaction.atomic():
            leave = (
                LeaveRequest.objects
                .select_for_update()
                .select_related("employee", "leave_type")
                .get(pk=self.get_object().pk)
            )
            if leave.status != LeaveRequest.Status.PENDING:
                raise ValidationError({"detail": "Cette demande n'est plus en attente."})

            reviewer_employee = Employee.objects.filter(
                user=request.user,
                enterprise_id=_user_enterprise_id(request.user),
            ).first()

            balance, _ = LeaveBalance.objects.get_or_create(
                employee=leave.employee,
                leave_type=leave.leave_type,
                year=leave.start_date.year,
                defaults={"allocated": leave.leave_type.default_days},
            )

            if balance.remaining < leave.days_requested:
                raise ValidationError({"detail": "Solde de conges insuffisant."})

            leave.status = LeaveRequest.Status.APPROVED
            leave.reviewed_by = reviewer_employee
            leave.reviewed_at = timezone.now()
            leave.review_comment = request.data.get("comment", "")
            leave.save(update_fields=["status", "reviewed_by", "reviewed_at", "review_comment"])

            balance.used += leave.days_requested
            balance.save(update_fields=["used", "updated_at"])

        return Response(LeaveRequestSerializer(leave).data)

    @action(detail=True, methods=["post"], permission_classes=[CanManageHRM])
    def reject(self, request, pk=None):
        """Rejeter une demande de conge."""
        _require_manager_or_admin(request, self)
        leave = self.get_object()
        if leave.status != LeaveRequest.Status.PENDING:
            raise ValidationError({"detail": "Cette demande n'est plus en attente."})

        reviewer_employee = Employee.objects.filter(
            user=request.user,
            enterprise_id=_user_enterprise_id(request.user),
        ).first()

        leave.status = LeaveRequest.Status.REJECTED
        leave.reviewed_by = reviewer_employee
        leave.reviewed_at = timezone.now()
        leave.review_comment = request.data.get("comment", "")
        leave.save()

        return Response(LeaveRequestSerializer(leave).data)


# ---------------------------------------------------------------------------
# Payroll
# ---------------------------------------------------------------------------

class PayrollPeriodViewSet(viewsets.ModelViewSet):
    """CRUD pour les periodes de paie."""

    serializer_class = PayrollPeriodSerializer
    queryset = PayrollPeriod.objects.all()
    pagination_class = StandardResultsSetPagination
    filterset_fields = ["status"]
    ordering_fields = ["start_date", "created_at"]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy", "close", "generate_payslips", "generate-payslips"):
            return [IsAuthenticated(), ModuleHRMEnabled(), FeatureHRMManagementEnabled(), CanManageHRM()]
        return [IsAuthenticated(), ModuleHRMEnabled(), FeatureHRMManagementEnabled(), CanViewHRM()]

    def get_queryset(self):
        return _hrm_enterprise_qs(self, super().get_queryset())

    def perform_create(self, serializer):
        enterprise_id = _require_user_enterprise_id(self.request.user)
        serializer.save(enterprise_id=enterprise_id)

    def perform_update(self, serializer):
        serializer.save()

    @action(detail=True, methods=["post"], permission_classes=[CanManageHRM])
    def close(self, request, pk=None):
        """Cloturer une periode de paie."""
        _require_manager_or_admin(request, self)
        period = self.get_object()
        if period.status == PayrollPeriod.Status.CLOSED:
            raise ValidationError({"detail": "Cette periode est deja cloturee."})

        period.status = PayrollPeriod.Status.CLOSED
        period.closed_at = timezone.now()
        period.closed_by = request.user
        period.save()

        return Response(PayrollPeriodSerializer(period).data)

    @action(detail=True, methods=["post"], url_path="generate-payslips",
            permission_classes=[CanManageHRM])
    def generate_payslips(self, request, pk=None):
        """Generer les bulletins de paie pour tous les employes actifs."""
        _require_manager_or_admin(request, self)
        period = self.get_object()
        if period.status == PayrollPeriod.Status.CLOSED:
            raise ValidationError({"detail": "Impossible de generer des bulletins pour une periode cloturee."})

        enterprise_id = _require_user_enterprise_id(request.user)
        employees = Employee.objects.filter(
            enterprise_id=enterprise_id,
            status=Employee.Status.ACTIVE,
        )

        created_count = 0
        with transaction.atomic():
            for emp in employees:
                _, was_created = PaySlip.objects.get_or_create(
                    period=period,
                    employee=emp,
                    defaults={
                        "base_salary": emp.base_salary,
                        "gross_salary": emp.base_salary,
                        "net_salary": emp.base_salary,
                    },
                )
                if was_created:
                    created_count += 1

        return Response({
            "detail": f"{created_count} bulletin(s) genere(s).",
            "created": created_count,
        })


class PaySlipViewSet(viewsets.ModelViewSet):
    """CRUD pour les bulletins de paie."""

    serializer_class = PaySlipSerializer
    queryset = PaySlip.objects.select_related("employee", "period").prefetch_related("lines")
    pagination_class = StandardResultsSetPagination
    filterset_fields = ["status", "period", "employee"]
    search_fields = ["employee__first_name", "employee__last_name"]
    ordering_fields = ["created_at"]

    def get_permissions(self):
        if self.action in (
            "create",
            "update",
            "partial_update",
            "destroy",
            "validate_slip",
            "mark_paid",
            "mark-paid",
            "compute",
        ):
            return [IsAuthenticated(), ModuleHRMEnabled(), FeatureHRMManagementEnabled(), CanManageHRM()]
        return [IsAuthenticated(), ModuleHRMEnabled(), FeatureHRMManagementEnabled(), CanViewHRM()]

    def get_queryset(self):
        return _hrm_employee_qs(self, super().get_queryset())

    def perform_create(self, serializer):
        _validate_related_enterprise(
            self.request.user,
            serializer.validated_data,
            {"period": "enterprise_id", "employee": "enterprise_id"},
        )
        serializer.save()

    def perform_update(self, serializer):
        _validate_related_enterprise(
            self.request.user,
            serializer.validated_data,
            {"period": "enterprise_id", "employee": "enterprise_id"},
        )
        serializer.save()

    @action(detail=True, methods=["post"], permission_classes=[CanManageHRM])
    def validate_slip(self, request, pk=None):
        """Valider un bulletin de paie."""
        _require_manager_or_admin(request, self)
        slip = self.get_object()
        if slip.status != PaySlip.Status.DRAFT:
            raise ValidationError({"detail": "Ce bulletin n'est pas en brouillon."})
        slip.status = PaySlip.Status.VALIDATED
        slip.save()
        return Response(PaySlipSerializer(slip).data)

    @action(detail=True, methods=["post"], url_path="mark-paid",
            permission_classes=[CanManageHRM])
    def mark_paid(self, request, pk=None):
        """Marquer un bulletin comme paye."""
        _require_manager_or_admin(request, self)
        slip = self.get_object()
        if slip.status not in (PaySlip.Status.DRAFT, PaySlip.Status.VALIDATED):
            raise ValidationError({"detail": "Ce bulletin est deja paye."})
        slip.status = PaySlip.Status.PAID
        slip.paid_at = timezone.now()
        slip.save()
        return Response(PaySlipSerializer(slip).data)

    @action(detail=True, methods=["post"], url_path="compute",
            permission_classes=[CanManageHRM])
    def compute(self, request, pk=None):
        """Recalculer le bulletin a partir des composants employe."""
        _require_manager_or_admin(request, self)
        slip = self.get_object()
        if slip.status == PaySlip.Status.PAID:
            raise ValidationError({"detail": "Impossible de recalculer un bulletin deja paye."})
        components = EmployeeSalaryComponent.objects.filter(
            employee=slip.employee, is_active=True
        ).select_related("component")

        total_earnings = slip.base_salary
        total_deductions = Decimal("0.00")

        lines_data = []
        for esc in components:
            comp = esc.component
            amount = esc.amount if comp.is_fixed else (slip.base_salary * esc.percentage / 100)
            if comp.component_type == "EARNING":
                total_earnings += amount
            else:
                total_deductions += amount
            lines_data.append({
                "line_type": comp.component_type,
                "label": comp.name,
                "amount": amount,
            })

        with transaction.atomic():
            slip.gross_salary = total_earnings
            slip.total_deductions = total_deductions
            slip.net_salary = total_earnings - total_deductions
            slip.save()

            slip.lines.all().delete()
            for i, ld in enumerate(lines_data):
                PaySlipLine.objects.create(payslip=slip, sort_order=i, **ld)

        slip.refresh_from_db()
        return Response(PaySlipSerializer(slip).data)


class PaySlipLineViewSet(viewsets.ModelViewSet):
    """CRUD pour les lignes de bulletin de paie."""

    serializer_class = PaySlipLineSerializer
    queryset = PaySlipLine.objects.select_related("payslip")
    pagination_class = StandardResultsSetPagination
    filterset_fields = ["payslip", "line_type"]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAuthenticated(), ModuleHRMEnabled(), FeatureHRMManagementEnabled(), CanManageHRM()]
        return [IsAuthenticated(), ModuleHRMEnabled(), FeatureHRMManagementEnabled(), CanViewHRM()]

    def get_queryset(self):
        qs = super().get_queryset()
        return _filter_queryset_by_enterprise(
            qs, self.request.user, field_name="payslip__employee__enterprise_id"
        )

    def perform_create(self, serializer):
        _validate_related_enterprise(
            self.request.user,
            serializer.validated_data,
            {"payslip": "employee.enterprise_id"},
        )
        serializer.save()

    def perform_update(self, serializer):
        _validate_related_enterprise(
            self.request.user,
            serializer.validated_data,
            {"payslip": "employee.enterprise_id"},
        )
        serializer.save()


class SalaryComponentViewSet(viewsets.ModelViewSet):
    """CRUD pour les composants de salaire."""

    serializer_class = SalaryComponentSerializer
    queryset = SalaryComponent.objects.all()
    pagination_class = StandardResultsSetPagination
    filterset_fields = ["component_type", "is_active"]
    search_fields = ["name", "code"]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy", "complete"):
            return [IsAuthenticated(), ModuleHRMEnabled(), FeatureHRMManagementEnabled(), CanManageHRM()]
        return [IsAuthenticated(), ModuleHRMEnabled(), FeatureHRMManagementEnabled(), CanViewHRM()]

    def get_queryset(self):
        return _hrm_enterprise_qs(self, super().get_queryset())

    def perform_create(self, serializer):
        enterprise_id = _require_user_enterprise_id(self.request.user)
        serializer.save(enterprise_id=enterprise_id)

    def perform_update(self, serializer):
        serializer.save()


class EmployeeSalaryComponentViewSet(viewsets.ModelViewSet):
    """Affectation des composants de salaire aux employes."""

    serializer_class = EmployeeSalaryComponentSerializer
    queryset = EmployeeSalaryComponent.objects.select_related("employee", "component")
    pagination_class = StandardResultsSetPagination
    filterset_fields = ["employee", "component", "is_active"]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAuthenticated(), ModuleHRMEnabled(), FeatureHRMManagementEnabled(), CanManageHRM()]
        return [IsAuthenticated(), ModuleHRMEnabled(), FeatureHRMManagementEnabled(), CanViewHRM()]

    def get_queryset(self):
        return _hrm_employee_qs(self, super().get_queryset())

    def perform_create(self, serializer):
        _validate_related_enterprise(
            self.request.user,
            serializer.validated_data,
            {"employee": "enterprise_id", "component": "enterprise_id"},
        )
        serializer.save()

    def perform_update(self, serializer):
        _validate_related_enterprise(
            self.request.user,
            serializer.validated_data,
            {"employee": "enterprise_id", "component": "enterprise_id"},
        )
        serializer.save()


# ---------------------------------------------------------------------------
# Performance
# ---------------------------------------------------------------------------

class EvaluationTemplateViewSet(viewsets.ModelViewSet):
    """CRUD pour les modeles d'evaluation."""

    serializer_class = EvaluationTemplateSerializer
    queryset = EvaluationTemplate.objects.prefetch_related("criteria")
    pagination_class = StandardResultsSetPagination
    filterset_fields = ["is_active"]
    search_fields = ["name"]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAuthenticated(), ModuleHRMEnabled(), FeatureHRMManagementEnabled(), CanManageHRM()]
        return [IsAuthenticated(), ModuleHRMEnabled(), FeatureHRMManagementEnabled(), CanViewHRM()]

    def get_queryset(self):
        return _hrm_enterprise_qs(self, super().get_queryset())

    def perform_create(self, serializer):
        enterprise_id = _require_user_enterprise_id(self.request.user)
        serializer.save(enterprise_id=enterprise_id)

    def perform_update(self, serializer):
        serializer.save()


class EvaluationCriteriaViewSet(viewsets.ModelViewSet):
    """CRUD pour les criteres d'evaluation."""

    serializer_class = EvaluationCriteriaSerializer
    queryset = EvaluationCriteria.objects.select_related("template")
    pagination_class = StandardResultsSetPagination
    filterset_fields = ["template"]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAuthenticated(), ModuleHRMEnabled(), FeatureHRMManagementEnabled(), CanManageHRM()]
        return [IsAuthenticated(), ModuleHRMEnabled(), FeatureHRMManagementEnabled(), CanViewHRM()]

    def get_queryset(self):
        qs = super().get_queryset()
        return _filter_queryset_by_enterprise(
            qs, self.request.user, field_name="template__enterprise_id"
        )

    def perform_create(self, serializer):
        _validate_related_enterprise(
            self.request.user,
            serializer.validated_data,
            {"template": "enterprise_id"},
        )
        serializer.save()

    def perform_update(self, serializer):
        _validate_related_enterprise(
            self.request.user,
            serializer.validated_data,
            {"template": "enterprise_id"},
        )
        serializer.save()


class PerformanceReviewViewSet(viewsets.ModelViewSet):
    """CRUD pour les evaluations de performance."""

    serializer_class = PerformanceReviewSerializer
    queryset = PerformanceReview.objects.select_related(
        "employee", "template", "reviewer"
    ).prefetch_related("scores")
    pagination_class = StandardResultsSetPagination
    filterset_fields = ["status", "employee", "template"]
    search_fields = ["employee__first_name", "employee__last_name", "period_label"]
    ordering_fields = ["review_date", "created_at"]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAuthenticated(), ModuleHRMEnabled(), FeatureHRMManagementEnabled(), CanManageHRM()]
        return [IsAuthenticated(), ModuleHRMEnabled(), FeatureHRMManagementEnabled(), CanViewHRM()]

    def get_queryset(self):
        return _hrm_employee_qs(self, super().get_queryset())

    def perform_create(self, serializer):
        _validate_related_enterprise(
            self.request.user,
            serializer.validated_data,
            {
                "employee": "enterprise_id",
                "template": "enterprise_id",
                "reviewer": "enterprise_id",
            },
        )
        serializer.save()

    def perform_update(self, serializer):
        _validate_related_enterprise(
            self.request.user,
            serializer.validated_data,
            {
                "employee": "enterprise_id",
                "template": "enterprise_id",
                "reviewer": "enterprise_id",
            },
        )
        serializer.save()

    @action(detail=True, methods=["post"], permission_classes=[CanManageHRM])
    def complete(self, request, pk=None):
        """Terminer une evaluation (calculer score global)."""
        _require_manager_or_admin(request, self)
        review = self.get_object()
        scores = review.scores.select_related("criteria").all()
        if not scores.exists():
            raise ValidationError({"detail": "Aucune note saisie."})

        total_weight = sum(s.criteria.weight for s in scores)
        if total_weight > 0:
            weighted = sum(s.score * s.criteria.weight for s in scores)
            review.overall_score = weighted / total_weight
        else:
            review.overall_score = Decimal("0.00")

        review.status = PerformanceReview.Status.COMPLETED
        review.save()
        return Response(PerformanceReviewSerializer(review).data)


class PerformanceReviewScoreViewSet(viewsets.ModelViewSet):
    """CRUD pour les notes de criteres."""

    serializer_class = PerformanceReviewScoreSerializer
    queryset = PerformanceReviewScore.objects.select_related("review", "criteria")
    pagination_class = StandardResultsSetPagination
    filterset_fields = ["review"]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAuthenticated(), ModuleHRMEnabled(), FeatureHRMManagementEnabled(), CanManageHRM()]
        return [IsAuthenticated(), ModuleHRMEnabled(), FeatureHRMManagementEnabled(), CanViewHRM()]

    def get_queryset(self):
        qs = super().get_queryset()
        return _filter_queryset_by_enterprise(
            qs, self.request.user, field_name="review__employee__enterprise_id"
        )

    def perform_create(self, serializer):
        _validate_related_enterprise(
            self.request.user,
            serializer.validated_data,
            {"review": "employee.enterprise_id", "criteria": "template.enterprise_id"},
        )
        review = serializer.validated_data.get("review")
        criteria = serializer.validated_data.get("criteria")
        if review and criteria and review.template_id and criteria.template_id != review.template_id:
            raise ValidationError({"criteria": "Le critere doit appartenir au modele de la revue."})
        serializer.save()

    def perform_update(self, serializer):
        _validate_related_enterprise(
            self.request.user,
            serializer.validated_data,
            {"review": "employee.enterprise_id", "criteria": "template.enterprise_id"},
        )
        serializer.save()


# ---------------------------------------------------------------------------
# Discipline
# ---------------------------------------------------------------------------

class DisciplinaryActionViewSet(viewsets.ModelViewSet):
    """CRUD pour les actions disciplinaires."""

    serializer_class = DisciplinaryActionSerializer
    queryset = DisciplinaryAction.objects.select_related("employee", "issued_by")
    pagination_class = StandardResultsSetPagination
    filterset_fields = ["status", "severity", "employee"]
    search_fields = ["employee__first_name", "employee__last_name", "description"]
    ordering_fields = ["incident_date", "created_at"]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAuthenticated(), ModuleHRMEnabled(), FeatureHRMManagementEnabled(), CanManageHRM()]
        return [IsAuthenticated(), ModuleHRMEnabled(), FeatureHRMManagementEnabled(), CanViewHRM()]

    def get_queryset(self):
        return _hrm_employee_qs(self, super().get_queryset())

    def perform_create(self, serializer):
        _validate_related_enterprise(
            self.request.user,
            serializer.validated_data,
            {"employee": "enterprise_id", "issued_by": "enterprise_id"},
        )
        serializer.save()

    def perform_update(self, serializer):
        _validate_related_enterprise(
            self.request.user,
            serializer.validated_data,
            {"employee": "enterprise_id", "issued_by": "enterprise_id"},
        )
        serializer.save()


# ---------------------------------------------------------------------------
# Documents
# ---------------------------------------------------------------------------

class EmployeeDocumentViewSet(viewsets.ModelViewSet):
    """CRUD pour les documents employe."""

    serializer_class = EmployeeDocumentSerializer
    queryset = EmployeeDocument.objects.select_related("employee")
    pagination_class = StandardResultsSetPagination
    filterset_fields = ["employee", "doc_type"]
    search_fields = ["title"]
    ordering_fields = ["created_at"]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAuthenticated(), ModuleHRMEnabled(), FeatureHRMManagementEnabled(), CanManageHRM()]
        return [IsAuthenticated(), ModuleHRMEnabled(), FeatureHRMManagementEnabled(), CanViewHRM()]

    def get_queryset(self):
        return _hrm_employee_qs(self, super().get_queryset())

    def perform_create(self, serializer):
        _validate_related_enterprise(
            self.request.user,
            serializer.validated_data,
            {"employee": "enterprise_id"},
        )
        serializer.save(uploaded_by=self.request.user)

    def perform_update(self, serializer):
        _validate_related_enterprise(
            self.request.user,
            serializer.validated_data,
            {"employee": "enterprise_id"},
        )
        serializer.save()


# ---------------------------------------------------------------------------
# Holiday
# ---------------------------------------------------------------------------

class HolidayViewSet(viewsets.ModelViewSet):
    """CRUD pour les jours feries."""

    serializer_class = HolidaySerializer
    queryset = Holiday.objects.all()
    pagination_class = StandardResultsSetPagination
    filterset_fields = ["is_recurring"]
    search_fields = ["name"]
    ordering_fields = ["date", "created_at"]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAuthenticated(), ModuleHRMEnabled(), FeatureHRMManagementEnabled(), CanManageHRM()]
        return [IsAuthenticated(), ModuleHRMEnabled(), FeatureHRMManagementEnabled(), CanViewHRM()]

    def get_queryset(self):
        return _hrm_enterprise_qs(self, super().get_queryset())

    def perform_create(self, serializer):
        enterprise_id = _require_user_enterprise_id(self.request.user)
        serializer.save(enterprise_id=enterprise_id)

    def perform_update(self, serializer):
        serializer.save()
