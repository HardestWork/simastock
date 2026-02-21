"""ViewSets and endpoints for the expenses module."""
from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Q, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.expense_serializers import (
    BudgetSerializer,
    ExpenseCategorySerializer,
    ExpenseSerializer,
    RecurringExpenseSerializer,
    WalletSerializer,
)
from api.v1.pagination import StandardResultsSetPagination
from api.v1.permissions import (
    CanCreateExpense,
    CanEditExpense,
    CanManageExpenseCategories,
    CanManageExpenseWallets,
    CanSetExpenseBudgets,
    CanVoidExpense,
    CanViewExpenseReports,
    FeatureExpensesManagementEnabled,
)
from core.export import queryset_to_csv_response
from expenses.models import Budget, Expense, ExpenseCategory, RecurringExpense, Wallet
from expenses.services import create_expense, generate_due_recurring_expenses, update_expense, void_expense
from sales.models import Sale
from stores.models import Enterprise, Store, StoreUser


def _user_store_ids(user):
    """Return a queryset/list of store ids the user can access."""
    if getattr(user, "is_superuser", False):
        return Store.objects.filter(is_active=True).values_list("id", flat=True)
    return StoreUser.objects.filter(user=user, store__is_active=True).values_list("store_id", flat=True)


def _user_enterprise_id(user):
    """Return enterprise id from the user's default/first active store."""
    store_user = (
        StoreUser.objects
        .filter(
            user=user,
            store__is_active=True,
            store__enterprise__is_active=True,
        )
        .order_by("-is_default", "store_id")
        .select_related("store__enterprise")
        .first()
    )
    if store_user and store_user.store and store_user.store.enterprise_id:
        return store_user.store.enterprise_id

    if getattr(user, "is_superuser", False):
        enterprise = Enterprise.objects.filter(is_active=True).order_by("created_at").first()
        if enterprise:
            return enterprise.id
    return None


def _require_user_enterprise_id(user):
    enterprise_id = _user_enterprise_id(user)
    if enterprise_id is None:
        raise PermissionDenied("Aucune entreprise active n'est associee a votre compte.")
    return enterprise_id


def _coerce_store_for_user(*, request, store_id=None):
    """Resolve a store and enforce user access."""
    if store_id:
        store = Store.objects.filter(pk=store_id, is_active=True).select_related("enterprise").first()
        if store is None:
            raise ValidationError({"store": "Boutique introuvable."})
        if (
            not getattr(request.user, "is_superuser", False)
            and not request.user.store_users.filter(store_id=store.id).exists()
        ):
            raise PermissionDenied("Vous n'avez pas acces a cette boutique.")
        return store

    current_store = getattr(request, "current_store", None)
    if current_store is not None:
        return current_store

    if getattr(request.user, "is_superuser", False):
        store = Store.objects.filter(is_active=True).select_related("enterprise").first()
        if store:
            return store

    default_link = (
        request.user.store_users
        .filter(store__is_active=True)
        .select_related("store__enterprise")
        .order_by("-is_default", "store_id")
        .first()
    )
    if default_link:
        return default_link.store

    raise PermissionDenied("Aucune boutique active disponible pour cet utilisateur.")


class ExpenseCategoryViewSet(viewsets.ModelViewSet):
    """CRUD for expense categories (enterprise global or store-specific)."""

    serializer_class = ExpenseCategorySerializer
    queryset = ExpenseCategory.objects.select_related("enterprise", "store")
    permission_classes = [IsAuthenticated, FeatureExpensesManagementEnabled, CanManageExpenseCategories]
    filterset_fields = ["store", "type", "is_active"]
    search_fields = ["name"]
    ordering_fields = ["name", "created_at"]
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        qs = super().get_queryset()
        if getattr(self.request.user, "is_superuser", False):
            return qs
        enterprise_id = _user_enterprise_id(self.request.user)
        if enterprise_id is None:
            return qs.none()
        user_store_ids = _user_store_ids(self.request.user)
        return qs.filter(
            enterprise_id=enterprise_id,
        ).filter(
            Q(store__isnull=True) | Q(store_id__in=user_store_ids)
        )

    def perform_create(self, serializer):
        enterprise_id = _require_user_enterprise_id(self.request.user)
        store = None
        store_id = self.request.data.get("store")
        if store_id:
            store = _coerce_store_for_user(request=self.request, store_id=store_id)
            if store.enterprise_id != enterprise_id:
                raise ValidationError({"store": "La boutique n'appartient pas a votre entreprise."})
        serializer.save(enterprise_id=enterprise_id, store=store)

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=["is_active", "updated_at"])


class WalletViewSet(viewsets.ModelViewSet):
    """CRUD for wallets."""

    serializer_class = WalletSerializer
    queryset = Wallet.objects.select_related("store")
    permission_classes = [IsAuthenticated, FeatureExpensesManagementEnabled, CanManageExpenseWallets]
    filterset_fields = ["store", "type", "is_active"]
    search_fields = ["name"]
    ordering_fields = ["name", "balance", "created_at"]
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        qs = super().get_queryset()
        if getattr(self.request.user, "is_superuser", False):
            return qs
        return qs.filter(store_id__in=_user_store_ids(self.request.user))

    def perform_create(self, serializer):
        store = _coerce_store_for_user(request=self.request, store_id=self.request.data.get("store"))
        serializer.save(store=store)

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=["is_active", "updated_at"])


class ExpenseViewSet(viewsets.ModelViewSet):
    """CRUD for expenses with wallet-safe posting and voiding."""

    serializer_class = ExpenseSerializer
    queryset = (
        Expense.objects
        .select_related("store", "category", "wallet", "created_by", "voided_by")
    )
    filterset_fields = ["store", "status", "category", "wallet", "created_by", "expense_date"]
    search_fields = ["expense_number", "description", "supplier_name"]
    ordering_fields = ["created_at", "expense_date", "amount", "expense_number", "status"]
    pagination_class = StandardResultsSetPagination

    def get_permissions(self):
        base = [IsAuthenticated(), FeatureExpensesManagementEnabled()]
        if self.action in ("list", "retrieve", "export_csv"):
            return base + [CanViewExpenseReports()]
        if self.action in ("create",):
            return base + [CanCreateExpense()]
        if self.action in ("update", "partial_update"):
            return base + [CanEditExpense()]
        if self.action in ("void",):
            return base + [CanVoidExpense()]
        if self.action in ("destroy",):
            return base + [CanVoidExpense()]
        return base

    def get_queryset(self):
        qs = super().get_queryset()
        if getattr(self.request.user, "is_superuser", False):
            return qs
        return qs.filter(store_id__in=_user_store_ids(self.request.user))

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        store = _coerce_store_for_user(request=request, store_id=serializer.validated_data.get("store").id)
        expense = create_expense(
            store=store,
            category=serializer.validated_data["category"],
            wallet=serializer.validated_data["wallet"],
            amount=serializer.validated_data["amount"],
            description=serializer.validated_data.get("description", ""),
            supplier_name=serializer.validated_data.get("supplier_name", ""),
            expense_date=serializer.validated_data.get("expense_date"),
            created_by=request.user,
        )
        response_serializer = self.get_serializer(expense)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)

        if "store" in serializer.validated_data and serializer.validated_data["store"].id != instance.store_id:
            raise ValidationError({"store": "Le changement de boutique n'est pas autorise."})

        try:
            expense = update_expense(
                instance,
                actor=request.user,
                **serializer.validated_data,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)})
        response_serializer = self.get_serializer(expense)
        return Response(response_serializer.data)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        reason = request.data.get("reason") if isinstance(request.data, dict) else ""
        try:
            void_expense(instance, actor=request.user, reason=reason)
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)})
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    def void(self, request, pk=None):
        expense = self.get_object()
        reason = request.data.get("reason") if isinstance(request.data, dict) else ""
        try:
            expense = void_expense(expense, actor=request.user, reason=reason)
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)})
        return Response(self.get_serializer(expense).data)

    @action(detail=False, methods=["get"], url_path="export-csv")
    def export_csv(self, request):
        """Export filtered expenses to CSV."""
        qs = self.filter_queryset(self.get_queryset()).select_related("category", "wallet", "created_by")
        columns = [
            ("expense_number", "Numero"),
            (lambda o: o.expense_date.strftime("%d/%m/%Y") if o.expense_date else "", "Date"),
            (lambda o: o.category.name if o.category else "", "Categorie"),
            (lambda o: o.wallet.name if o.wallet else "", "Wallet"),
            ("description", "Description"),
            ("supplier_name", "Fournisseur"),
            ("amount", "Montant"),
            (lambda o: "Validee" if o.status == Expense.Status.POSTED else "Annulee", "Statut"),
            (lambda o: o.created_by.get_full_name() if o.created_by else "", "Cree par"),
            (lambda o: o.created_at.strftime("%d/%m/%Y %H:%M"), "Date creation"),
        ]
        return queryset_to_csv_response(qs, columns, "depenses")


class BudgetViewSet(viewsets.ModelViewSet):
    """CRUD for monthly expense budgets."""

    serializer_class = BudgetSerializer
    queryset = Budget.objects.select_related("store", "category")
    permission_classes = [IsAuthenticated, FeatureExpensesManagementEnabled, CanSetExpenseBudgets]
    filterset_fields = ["store", "category", "period"]
    search_fields = ["period", "category__name"]
    ordering_fields = ["period", "limit_amount", "created_at"]
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        qs = super().get_queryset()
        if getattr(self.request.user, "is_superuser", False):
            return qs
        return qs.filter(store_id__in=_user_store_ids(self.request.user))

    def perform_create(self, serializer):
        store = _coerce_store_for_user(request=self.request, store_id=self.request.data.get("store"))
        serializer.save(store=store)


class RecurringExpenseViewSet(viewsets.ModelViewSet):
    """CRUD for recurring expense templates."""

    serializer_class = RecurringExpenseSerializer
    queryset = RecurringExpense.objects.select_related("store", "category", "wallet", "created_by")
    permission_classes = [IsAuthenticated, FeatureExpensesManagementEnabled, CanCreateExpense]
    filterset_fields = ["store", "frequency", "is_active", "next_run_date"]
    search_fields = ["description", "supplier_name"]
    ordering_fields = ["next_run_date", "created_at", "amount"]
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        qs = super().get_queryset()
        if getattr(self.request.user, "is_superuser", False):
            return qs
        return qs.filter(store_id__in=_user_store_ids(self.request.user))

    def perform_create(self, serializer):
        store = _coerce_store_for_user(request=self.request, store_id=self.request.data.get("store"))
        serializer.save(store=store, created_by=self.request.user)

    @action(detail=False, methods=["post"], permission_classes=[IsAuthenticated, FeatureExpensesManagementEnabled, CanSetExpenseBudgets])
    def run_due(self, request):
        """Manually run recurring expense generation (optional store scoped)."""
        store_id = request.data.get("store") or request.query_params.get("store")
        if store_id:
            _coerce_store_for_user(request=request, store_id=store_id)
        run_date = request.data.get("run_date") or request.query_params.get("run_date")
        parsed_run_date = None
        if run_date:
            try:
                parsed_run_date = date.fromisoformat(run_date)
            except ValueError:
                raise ValidationError({"run_date": "Format de date invalide. Utilisez YYYY-MM-DD."})

        result = generate_due_recurring_expenses(
            run_date=parsed_run_date,
            actor=request.user,
            store_id=store_id,
        )
        return Response(
            {
                "generated_count": result.generated_count,
                "generated_ids": result.generated_ids,
                "failed_count": result.failed_count,
                "failures": result.failures,
            }
        )


class ExpenseDashboardAPIView(APIView):
    """Analytics endpoint for expense KPIs and budget monitoring."""

    permission_classes = [IsAuthenticated, FeatureExpensesManagementEnabled, CanViewExpenseReports]

    @staticmethod
    def _month_bounds(anchor: date):
        start = date(anchor.year, anchor.month, 1)
        if anchor.month == 12:
            next_month_start = date(anchor.year + 1, 1, 1)
        else:
            next_month_start = date(anchor.year, anchor.month + 1, 1)
        end = next_month_start - timedelta(days=1)
        return start, end

    @staticmethod
    def _parse_period(value: str | None):
        if value:
            if len(value) != 7 or value[4] != "-":
                raise ValidationError({"period": "Format de periode invalide. Utilisez YYYY-MM."})
            try:
                year = int(value[0:4])
                month = int(value[5:7])
            except ValueError:
                raise ValidationError({"period": "Format de periode invalide. Utilisez YYYY-MM."})
            if month < 1 or month > 12:
                raise ValidationError({"period": "Mois de periode invalide."})
            start = date(year, month, 1)
        else:
            today = timezone.now().date()
            start = date(today.year, today.month, 1)

        if start.month == 1:
            prev_anchor = date(start.year - 1, 12, 1)
        else:
            prev_anchor = date(start.year, start.month - 1, 1)
        prev_start, prev_end = ExpenseDashboardAPIView._month_bounds(prev_anchor)
        start, end = ExpenseDashboardAPIView._month_bounds(start)
        return start, end, prev_start, prev_end

    def get(self, request):
        store = _coerce_store_for_user(
            request=request,
            store_id=request.query_params.get("store"),
        )
        start, end, prev_start, prev_end = self._parse_period(request.query_params.get("period"))
        period_label = f"{start:%Y-%m}"

        expense_qs = Expense.objects.filter(
            store=store,
            status=Expense.Status.POSTED,
            expense_date__range=(start, end),
        )
        prev_expense_qs = Expense.objects.filter(
            store=store,
            status=Expense.Status.POSTED,
            expense_date__range=(prev_start, prev_end),
        )

        total_expenses = expense_qs.aggregate(total=Coalesce(Sum("amount"), Decimal("0.00")))["total"]
        previous_total_expenses = prev_expense_qs.aggregate(total=Coalesce(Sum("amount"), Decimal("0.00")))["total"]

        by_category = list(
            expense_qs.values("category_id", "category__name")
            .annotate(total=Coalesce(Sum("amount"), Decimal("0.00")))
            .order_by("-total")
        )
        by_wallet = list(
            expense_qs.values("wallet_id", "wallet__name", "wallet__type")
            .annotate(total=Coalesce(Sum("amount"), Decimal("0.00")))
            .order_by("-total")
        )
        top_categories = by_category[:5]

        delta = total_expenses - previous_total_expenses
        growth_pct = None
        if previous_total_expenses > 0:
            growth_pct = (delta / previous_total_expenses) * Decimal("100")

        revenue_total = (
            Sale.objects.filter(
                store=store,
                status__in=[Sale.Status.PAID, Sale.Status.PARTIALLY_PAID],
                created_at__date__range=(start, end),
            )
            .aggregate(total=Coalesce(Sum("total"), Decimal("0.00")))
            .get("total")
            or Decimal("0.00")
        )
        expense_ratio = Decimal("0.00")
        if revenue_total > 0:
            expense_ratio = (total_expenses / revenue_total) * Decimal("100")

        budgets = Budget.objects.filter(store=store, period=period_label).select_related("category")
        budget_status = []
        for budget in budgets:
            if budget.category_id:
                spent = (
                    expense_qs.filter(category_id=budget.category_id)
                    .aggregate(total=Coalesce(Sum("amount"), Decimal("0.00")))
                    .get("total")
                    or Decimal("0.00")
                )
            else:
                spent = total_expenses

            consumed_pct = Decimal("0.00")
            if budget.limit_amount > 0:
                consumed_pct = (spent / budget.limit_amount) * Decimal("100")

            budget_status.append(
                {
                    "budget_id": str(budget.id),
                    "category_id": str(budget.category_id) if budget.category_id else None,
                    "category_name": budget.category.name if budget.category_id else "Global",
                    "limit_amount": budget.limit_amount,
                    "spent_amount": spent,
                    "remaining_amount": budget.limit_amount - spent,
                    "consumed_percent": consumed_pct.quantize(Decimal("0.01")),
                    "alert_threshold_percent": budget.alert_threshold_percent,
                    "threshold_reached": consumed_pct >= Decimal(str(budget.alert_threshold_percent)),
                    "over_budget": spent > budget.limit_amount,
                }
            )

        return Response(
            {
                "store": {"id": str(store.id), "name": store.name},
                "period": period_label,
                "date_from": start.isoformat(),
                "date_to": end.isoformat(),
                "total_expenses": total_expenses,
                "previous_total_expenses": previous_total_expenses,
                "comparison": {
                    "delta": delta,
                    "growth_percent": growth_pct.quantize(Decimal("0.01")) if growth_pct is not None else None,
                },
                "by_category": by_category,
                "by_wallet": by_wallet,
                "top_5_categories": top_categories,
                "revenue_total": revenue_total,
                "expense_ratio_percent": expense_ratio.quantize(Decimal("0.01")),
                "expense_ratio_alert_red": expense_ratio > Decimal("40.00"),
                "budgets": budget_status,
            }
        )
