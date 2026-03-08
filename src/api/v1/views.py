"""ViewSets and API views for the boutique management system API v1."""
import csv
import io
import logging
import secrets
import string
import unicodedata
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from core.email import send_branded_email
from django.db import transaction
from django.db.models.deletion import ProtectedError
from django.db.models import (
    Sum, Avg, Count, F, Q, DecimalField, Exists, OuterRef,
    IntegerField, Subquery, Value,
)
from django.db.models.functions import Coalesce, TruncDate, TruncMonth, TruncYear
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.text import slugify

from rest_framework import viewsets, mixins, status, filters
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError, PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from rest_framework.views import APIView

from django_filters.rest_framework import DjangoFilterBackend

from stores.models import (
    AuditLog,
    BillingModule,
    BillingModuleDependency,
    BillingPlan,
    Enterprise,
    EnterprisePlanAssignment,
    EnterpriseSubscription,
    Store,
    StoreModuleEntitlement,
    StoreUser,
)
from stores.services import resolve_store_module_matrix
from catalog.models import Brand, Category, PricingPolicy, PricingRule, Product, ProductImage, ProductVariant
from stock.models import (
    InventoryMovement, ProductStock,
    StockTransfer, StockTransferLine,
    StockCount, StockCountLine,
)
from customers.models import Customer, LoyaltyAccount, LoyaltyTransaction
from sales.models import Coupon, Quote, QuoteItem, RecurringSale, RecurringSaleItem, Refund, Sale, SaleItem
from cashier.models import CashShift, CashShiftDenomination, Payment
from credits.models import CustomerAccount, CreditLedgerEntry, PaymentSchedule
from purchases.models import Supplier, PurchaseOrder, GoodsReceipt
from alerts.models import Alert
from reports.models import KPISnapshot
from core.pdf import (
    generate_cashier_operations_report_pdf,
    generate_credit_payment_receipt_pdf,
    generate_invoice_pdf,
    generate_receipt_pdf,
)

from accounts.models import CustomRole
from api.v1.serializers import (
    BillingModuleSerializer,
    BillingPlanSerializer,
    CustomRoleSerializer,
    UserSerializer,
    UserCreateSerializer,
    EnterpriseSerializer,
    EnterprisePlanAssignmentSerializer,
    EnterpriseSubscriptionSerializer,
    EnterpriseSetupSerializer,
    StoreSerializer,
    StoreModuleEntitlementBulkUpsertSerializer,
    StoreModuleEntitlementSerializer,
    CategorySerializer,
    BrandSerializer,
    ProductSerializer,
    ProductPOSSerializer,
    ProductStockSerializer,
    InventoryMovementSerializer,
    CustomerSerializer,
    SaleSerializer,
    SaleCreateSerializer,
    SaleAddItemSerializer,
    SaleSetItemQuantitySerializer,
    SaleSetItemUnitPriceSerializer,
    SaleSubmitSerializer,
    SaleItemSerializer,
    PaymentSerializer,
    PaymentCreateSerializer,
    CashShiftSerializer,
    CashShiftOpenSerializer,
    CashShiftCloseSerializer,
    CustomerAccountSerializer,
    CreditLedgerEntrySerializer,
    SupplierSerializer,
    PurchaseOrderCreateSerializer,
    PurchaseOrderUpdateSerializer,
    PurchaseOrderCancelSerializer,
    PurchaseOrderSerializer,
    GoodsReceiptCreateSerializer,
    GoodsReceiptSerializer,
    AlertSerializer,
    KPISerializer,
    MeSerializer,
    ChangePasswordSerializer,
    MyStoreSerializer,
    RefundSerializer,
    RefundCreateSerializer,
    CouponSerializer,
    AuditLogSerializer,
    StockTransferSerializer,
    StockTransferCreateSerializer,
    StockCountSerializer,
    StockCountCreateSerializer,
    StockCountUpdateLinesSerializer,
    BulkStockEntrySerializer,
    BulkStockAdjustSerializer,
    StockTransferLineSerializer,
    StockCountLineSerializer,
    PaymentScheduleSerializer,
    QuoteSerializer,
    QuoteCreateSerializer,
    QuoteAddItemSerializer,
    StoreUserSerializer,
    ProductVariantSerializer,
    LoyaltyAccountSerializer,
    LoyaltyTransactionSerializer,
    PricingPolicySerializer,
    PricingRuleSerializer,
    RecurringSaleSerializer,
    RecurringSaleItemSerializer,
    CashShiftDenominationSerializer,
)
from api.v1.pagination import StandardResultsSetPagination
from api.v1.permissions import (
    IsSuperAdmin,
    IsManagerOrAdmin,
    IsCashier,
    IsSales,
    IsStoreMember,
    CanProcessPayment,
    CanApproveRefund,
    CanManageUsers,
    CanManageStores,
    CanManageSubscriptions,
    CanManageModules,
    ModuleCustomerEnabled,
    ModuleSellOrStockEnabled,
    ModuleStockEnabled,
    FeatureSalesPOSEnabled,
    FeatureSalesRefundEnabled,
    FeatureCashierOperationsEnabled,
    FeatureStockManagementEnabled,
    FeatureStockEntriesEnabled,
    FeaturePurchasesManagementEnabled,
    FeatureCreditManagementEnabled,
    FeatureAlertsCenterEnabled,
    FeatureReportsCenterEnabled,
    CanManageLeads,
)

User = get_user_model()
logger = logging.getLogger("boutique")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _normalize_header(value: str) -> str:
    """Normalize CSV header labels to support french/english aliases."""
    cleaned = (value or "").strip().lower()
    cleaned = unicodedata.normalize("NFKD", cleaned)
    cleaned = "".join(ch for ch in cleaned if not unicodedata.combining(ch))
    for ch in (" ", "-", "_", "/", "\\", ".", "(", ")", ":"):
        cleaned = cleaned.replace(ch, "")
    return cleaned


def _row_value(row: dict, header_map: dict, *aliases: str) -> str:
    """Return the first non-empty value matching one of the provided aliases."""
    for alias in aliases:
        key = header_map.get(_normalize_header(alias))
        if key is None:
            continue
        raw = row.get(key)
        if raw is None:
            continue
        text = str(raw).strip()
        if text != "":
            return text
    return ""


def _parse_decimal_field(
    raw_value: str,
    *,
    field_label: str,
    allow_blank: bool = False,
    default: Decimal = Decimal("0.00"),
) -> Decimal:
    value = (raw_value or "").strip()
    if not value:
        if allow_blank:
            return default
        raise ValueError(f"{field_label} est requis.")
    normalized = value.replace(" ", "").replace(",", ".")
    try:
        return Decimal(normalized)
    except (InvalidOperation, TypeError):
        raise ValueError(f"{field_label} invalide.")


def _parse_bool_field(raw_value: str, *, default: bool = True) -> bool:
    value = (raw_value or "").strip().lower()
    if not value:
        return default
    if value in {"1", "true", "yes", "oui", "vrai", "on"}:
        return True
    if value in {"0", "false", "no", "non", "faux", "off"}:
        return False
    return default


def _parse_iso_date_or_default(raw_value, default_value):
    """Parse an ISO date, returning *default_value* when invalid or missing."""
    if not raw_value:
        return default_value
    try:
        return date.fromisoformat(str(raw_value))
    except (TypeError, ValueError):
        return default_value


def _decode_uploaded_csv(uploaded_file) -> str:
    """Decode uploaded CSV content with utf-8 fallback and size guard."""
    if not uploaded_file:
        raise ValidationError({"file": "Aucun fichier CSV fourni."})
    max_size = 5 * 1024 * 1024
    if getattr(uploaded_file, "size", 0) and uploaded_file.size > max_size:
        raise ValidationError({"file": "Le fichier depasse 5 Mo."})

    raw = uploaded_file.read()
    if not raw:
        raise ValidationError({"file": "Le fichier CSV est vide."})

    try:
        return raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            return raw.decode("latin-1")
        except UnicodeDecodeError:
            raise ValidationError(
                {"file": "Encodage CSV non supporte (utilisez UTF-8)."}
            )


def _build_csv_dict_reader(content: str) -> csv.DictReader:
    """Build a DictReader with automatic delimiter detection."""
    sample = content[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;|\t")
    except csv.Error:
        dialect = csv.excel
    return csv.DictReader(io.StringIO(content), dialect=dialect)


def _unique_slug_for_enterprise(
    model_class,
    *,
    enterprise_id,
    base_value: str,
    fallback: str,
    exclude_pk=None,
) -> str:
    """Generate a slug unique within the same enterprise."""
    base_slug = slugify(base_value or fallback) or fallback
    slug = base_slug
    index = 2
    while True:
        qs = model_class.objects.filter(enterprise_id=enterprise_id, slug=slug)
        if exclude_pk:
            qs = qs.exclude(pk=exclude_pk)
        if not qs.exists():
            return slug
        slug = f"{base_slug}-{index}"
        index += 1


def _generate_secure_password(length: int = 14) -> str:
    """Generate a random password that passes Django validators."""
    charset = string.ascii_letters + string.digits + "!@#$%*_-+=?"
    target_len = max(length, 12)
    for _ in range(64):
        candidate = "".join(secrets.choice(charset) for _ in range(target_len))
        if not any(c.islower() for c in candidate):
            continue
        if not any(c.isupper() for c in candidate):
            continue
        if not any(c.isdigit() for c in candidate):
            continue
        if not any(c in "!@#$%*_-+=?" for c in candidate):
            continue
        try:
            validate_password(candidate)
        except DjangoValidationError:
            continue
        return candidate
    raise ValidationError(
        {"user_password": "Impossible de generer un mot de passe valide. Reessayez."}
    )


def _send_setup_credentials_email(
    *,
    to_email: str,
    user_name: str,
    password: str,
    enterprise_name: str,
    store_name: str,
) -> str:
    """Send account credentials to the created enterprise admin email."""
    base = (getattr(settings, "FRONTEND_URL", "") or "http://localhost:3000").rstrip("/")
    login_url = f"{base}/login"
    send_branded_email(
        subject="Vos acces SimaStock",
        template_name="emails/account_credentials",
        context={
            "user_name": user_name,
            "enterprise_name": enterprise_name,
            "store_name": store_name,
            "to_email": to_email,
            "password": password,
            "login_url": login_url,
        },
        recipient_list=[to_email],
        fail_silently=False,
    )
    return login_url


def _user_store_ids(user):
    """Return a list of store IDs the user has access to."""
    # Platform-level admins (Django superusers) can access all stores.
    if getattr(user, "is_superuser", False):
        return Store.objects.filter(is_active=True).values_list('id', flat=True)

    # Tenant admins can access all stores within their enterprise.
    if getattr(user, "role", None) == "ADMIN":
        enterprise_id = _user_enterprise_id(user)
        if enterprise_id is not None:
            return Store.objects.filter(
                enterprise_id=enterprise_id,
                is_active=True,
            ).values_list('id', flat=True)

    return StoreUser.objects.filter(user=user, store__is_active=True).values_list('store_id', flat=True)


def _user_enterprise_id(user):
    """Return the enterprise ID for the user's stores (first match).

    Superusers without explicit StoreUser records fall back to the first
    active enterprise (best-effort) so that admin tools keep working.
    """
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

    # Fallback for users linked to a custom role scoped to an enterprise.
    custom_role = getattr(user, "custom_role", None)
    custom_role_enterprise_id = getattr(custom_role, "enterprise_id", None)
    if custom_role_enterprise_id:
        return custom_role_enterprise_id

    # Fallback for Django superusers who have no StoreUser records
    if getattr(user, "is_superuser", False):
        first_enterprise = Enterprise.objects.filter(is_active=True).first()
        if first_enterprise:
            return first_enterprise.id

    return None


def _can_override_price_for_store(user, store) -> bool:
    """Return True if user can override prices in the given store context."""
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if getattr(user, "is_superuser", False):
        return True
    if user.role in ("ADMIN", "MANAGER"):
        return True
    if not store:
        return False
    membership = user.store_users.filter(store=store).first()
    if membership:
        return membership.has_capability("CAN_OVERRIDE_PRICE")

    from stores.capabilities import ROLE_CAPABILITY_MAP

    return "CAN_OVERRIDE_PRICE" in ROLE_CAPABILITY_MAP.get(user.role, [])


def _filter_queryset_by_enterprise(qs, user, *, field_name: str = "enterprise_id"):
    """Restrict an enterprise-scoped queryset to the user's enterprise.

    If the user is not linked to any active store/enterprise, return an empty
    queryset to avoid cross-tenant leakage.
    """
    enterprise_id = _user_enterprise_id(user)
    if enterprise_id is None:
        return qs.none()
    return qs.filter(**{field_name: enterprise_id})


def _require_user_enterprise_id(user):
    """Return current user's enterprise ID or raise an explicit permission error."""
    enterprise_id = _user_enterprise_id(user)
    if enterprise_id is None:
        raise PermissionDenied(
            "Aucune entreprise active n'est associee a votre compte."
        )
    return enterprise_id


# ---------------------------------------------------------------------------
# Enterprise ViewSet
# ---------------------------------------------------------------------------

class EnterpriseViewSet(viewsets.ModelViewSet):
    """
    CRUD for enterprises.

    - Only ADMIN can create/update/delete.
    - Authenticated users can list/retrieve (filtered to their enterprise).
    """

    RESET_TARGET_CHOICES = (
        "commercial",
        "analytics",
        "objectives",
        "reports",
        "alerts",
        "expenses",
        "cashier",
        "credits",
        "sales",
        "purchases",
        "stock",
        "audit_logs",
        "sequences",
    )
    RESET_STOCK_STRATEGIES = ("keep", "zero", "delete")

    serializer_class = EnterpriseSerializer
    queryset = Enterprise.objects.all()
    search_fields = ['name', 'code']
    ordering_fields = ['name', 'created_at', 'subscription_end', 'is_active']
    filterset_fields = ['is_active']

    def get_permissions(self):
        # Tenant ADMIN can manage their own enterprise settings, but cannot
        # create/delete enterprises. Only Django superusers can do that.
        if self.action in ('create', 'destroy', 'toggle_active', 'setup', 'reset'):
            return [IsSuperAdmin()]
        if self.action in ('update', 'partial_update'):
            # Superusers can update any enterprise; admins only their own.
            if getattr(self.request.user, "is_superuser", False):
                return [IsSuperAdmin()]
            return [IsAuthenticated(), CanManageStores()]
        return [IsAuthenticated()]

    def get_queryset(self):
        qs = super().get_queryset()
        # Superusers see ALL enterprises (for the management page).
        if getattr(self.request.user, "is_superuser", False):
            return qs
        enterprise_id = _user_enterprise_id(self.request.user)
        if enterprise_id is None:
            return qs.none()
        return qs.filter(pk=enterprise_id)

    def get_object(self):
        obj = super().get_object()
        # Non-superuser admins can only manage their own enterprise.
        if self.action in ('update', 'partial_update'):
            user = self.request.user
            if not getattr(user, 'is_superuser', False):
                user_eid = _user_enterprise_id(user)
                if user_eid != obj.pk:
                    raise PermissionDenied("Vous ne pouvez modifier que votre propre entreprise.")
        return obj

    @action(detail=True, methods=['post'], url_path='toggle-active')
    def toggle_active(self, request, pk=None):
        """Quick activate / deactivate an enterprise."""
        enterprise = self.get_object()
        enterprise.is_active = not enterprise.is_active
        enterprise.save(update_fields=['is_active', 'updated_at'])
        return Response(EnterpriseSerializer(enterprise).data)

    def perform_destroy(self, instance):
        """Delete enterprise along with all users linked to its stores."""
        User = get_user_model()
        user_ids = (
            instance.stores
            .values_list("store_users__user_id", flat=True)
            .distinct()
        )
        # Exclude superusers — they should never be cascade-deleted.
        User.objects.filter(id__in=user_ids, is_superuser=False).delete()
        instance.delete()

    @action(detail=True, methods=['post'], url_path='reset', permission_classes=[IsSuperAdmin])
    def reset(self, request, pk=None):
        """Reset an enterprise, wiping its data.

        Accepts ``{"mode": "full"}`` or ``{"mode": "transactions"}``.

        * **transactions** — delete all transactional data (sales, payments,
          stock movements, credits, expenses, analytics, objectives, alerts,
          audit logs) but keep the structure (products, categories, brands,
          customers, users, stores).
        * **full** — delete everything except the enterprise record itself and
          its stores (stores are emptied, sequences reset).
        """
        enterprise = self.get_object()
        mode = request.data.get('mode', 'transactions')
        if mode not in ('full', 'transactions'):
            return Response(
                {'detail': 'Mode invalide. Utilisez "full" ou "transactions".'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        targets = self._normalize_reset_targets(request.data.get("targets"), mode)
        stock_strategy = self._normalize_stock_strategy(request.data.get("stock_strategy"), mode)
        store_ids = list(enterprise.stores.values_list('id', flat=True))

        with transaction.atomic():
            self._reset_enterprise(enterprise, store_ids, mode, targets, stock_strategy)

        label = 'completement reinitialise' if mode == 'full' else 'transactions supprimees'
        return Response({
            'detail': f'Entreprise {enterprise.name} — {label}.',
            'mode': mode,
            'targets': sorted(targets),
            'stock_strategy': stock_strategy,
        })

    @classmethod
    def _normalize_reset_targets(cls, raw_targets, mode):
        all_targets = set(cls.RESET_TARGET_CHOICES)
        if mode == "full":
            return all_targets

        if raw_targets in (None, ""):
            return all_targets

        if not isinstance(raw_targets, list):
            raise ValidationError(
                {"targets": "Format invalide. Utilisez une liste de cibles."}
            )

        normalized = set()
        invalid = []
        for raw in raw_targets:
            if not isinstance(raw, str):
                invalid.append(str(raw))
                continue
            code = raw.strip().lower()
            if code not in all_targets:
                invalid.append(raw)
                continue
            normalized.add(code)

        if invalid:
            raise ValidationError(
                {
                    "targets": (
                        "Cibles invalides: "
                        f"{', '.join(invalid)}. "
                        f"Cibles valides: {', '.join(cls.RESET_TARGET_CHOICES)}."
                    )
                }
            )
        if not normalized:
            raise ValidationError({"targets": "Selectionnez au moins une cible."})
        return normalized

    @classmethod
    def _normalize_stock_strategy(cls, raw_stock_strategy, mode):
        if mode == "full":
            return "delete"
        if raw_stock_strategy in (None, ""):
            return "keep"
        if not isinstance(raw_stock_strategy, str):
            raise ValidationError(
                {"stock_strategy": "Valeur invalide. Utilisez keep, zero ou delete."}
            )
        code = raw_stock_strategy.strip().lower()
        if code not in cls.RESET_STOCK_STRATEGIES:
            raise ValidationError(
                {"stock_strategy": "Valeur invalide. Utilisez keep, zero ou delete."}
            )
        return code

    # ------------------------------------------------------------------
    @staticmethod
    def _reset_enterprise(enterprise, store_ids, mode, targets, stock_strategy):
        """Perform the actual reset inside a transaction."""
        from analytics.models import (
            ABCAnalysis, ReorderRecommendation, CustomerCreditScore,
            SalesForecast, FraudEvent, CustomerAnalyticsRuleSet,
            CustomerMetricDaily, CustomerMetricMonthly,
            CustomerScoreSnapshot, CustomerSegmentSnapshot,
            CustomerTopMonthly, CustomerIntelligenceAlert,
            CustomerRecommendationCache,
        )
        from objectives.models import (
            SellerSprintResult, SellerSprint, SellerBadge,
            SellerPenalty, SellerBonusHistory, SellerMonthlyStats,
            SellerObjective, LeaderboardSnapshot, LeaderboardSettings,
            SellerPenaltyType, ObjectiveTier, ObjectiveRule,
        )
        from expenses.models import (
            Expense, RecurringExpense, Budget, Wallet,
            ExpenseSequence, ExpenseCategory,
        )
        from catalog.models import ProductImage, ProductSpec
        from purchases.models import GoodsReceiptLine, PurchaseOrderLine

        User = get_user_model()
        sq = Q(store_id__in=store_ids)
        eq = Q(enterprise=enterprise)
        selected_targets = set(targets or [])

        def should_reset(target_code: str) -> bool:
            return mode == "full" or target_code in selected_targets

        if should_reset("commercial"):
            # 0. Commercial
            from commercial.models import (
                CommercialAISignal, CommercialHealthSnapshot,
                CommercialIncentiveResult, CommercialIncentiveRun,
                CommercialIncentiveTier, CommercialIncentivePolicy,
                CommercialObjectiveMonthly,
                CommercialImportErrorRow, CommercialImportJob,
                CommercialFollowUpTask, CommercialActivityAttachment,
                CommercialActivity, CommercialOpportunityStageHistory,
                CommercialOpportunity, CommercialProspect,
                CommercialTeamMembership,
                CommercialRegion, CommercialSector, CommercialTag,
                CommercialLeadSource,
            )
            # Delete in reverse-dependency order
            CommercialAISignal.objects.filter(sq).delete()
            CommercialHealthSnapshot.objects.filter(sq).delete()
            CommercialIncentiveResult.objects.filter(run__store_id__in=store_ids).delete()
            CommercialIncentiveRun.objects.filter(sq).delete()
            CommercialFollowUpTask.objects.filter(sq).delete()
            CommercialActivityAttachment.objects.filter(activity__store_id__in=store_ids).delete()
            CommercialActivity.objects.filter(sq).delete()
            CommercialOpportunityStageHistory.objects.filter(opportunity__store_id__in=store_ids).delete()
            CommercialOpportunity.objects.filter(sq).delete()
            CommercialProspect.objects.filter(sq).delete()
            CommercialImportErrorRow.objects.filter(job__store_id__in=store_ids).delete()
            CommercialImportJob.objects.filter(sq).delete()
            CommercialObjectiveMonthly.objects.filter(sq).delete()
            CommercialTeamMembership.objects.filter(sq).delete()
            policy_q = Q(store_id__in=store_ids)
            if mode == 'full':
                policy_q |= Q(enterprise=enterprise, store__isnull=True)
            CommercialIncentiveTier.objects.filter(policy__in=CommercialIncentivePolicy.objects.filter(policy_q)).delete()
            CommercialIncentivePolicy.objects.filter(policy_q).delete()
            if mode == 'full':
                for M in (CommercialRegion, CommercialSector,
                           CommercialTag, CommercialLeadSource):
                    M.objects.filter(eq).delete()

        if should_reset("analytics"):
            # 1. Analytics
            for M in (
                CustomerRecommendationCache, CustomerIntelligenceAlert,
                CustomerTopMonthly, CustomerSegmentSnapshot,
                CustomerScoreSnapshot, CustomerMetricMonthly,
                CustomerMetricDaily, CustomerAnalyticsRuleSet,
                FraudEvent, SalesForecast, CustomerCreditScore,
                ReorderRecommendation, ABCAnalysis,
            ):
                M.objects.filter(sq).delete()

        if should_reset("objectives"):
            # 2. Objectives
            SellerSprintResult.objects.filter(sprint__store_id__in=store_ids).delete()
            SellerSprint.objects.filter(sq).delete()
            SellerBadge.objects.filter(sq).delete()
            SellerPenalty.objects.filter(stats__store_id__in=store_ids).delete()
            SellerBonusHistory.objects.filter(stats__store_id__in=store_ids).delete()
            SellerMonthlyStats.objects.filter(sq).delete()
            SellerObjective.objects.filter(sq).delete()
            LeaderboardSnapshot.objects.filter(sq).delete()
            LeaderboardSettings.objects.filter(store_id__in=store_ids).delete()
            SellerPenaltyType.objects.filter(sq).delete()
            ObjectiveTier.objects.filter(rule__store_id__in=store_ids).delete()
            ObjectiveRule.objects.filter(sq).delete()

        if should_reset("reports"):
            # 3. Reports
            KPISnapshot.objects.filter(sq).delete()

        if should_reset("alerts"):
            # 4. Alerts
            Alert.objects.filter(sq).delete()

        if should_reset("expenses"):
            # 5. Expenses
            Expense.objects.filter(sq).delete()
            RecurringExpense.objects.filter(sq).delete()
            Budget.objects.filter(sq).delete()
            Wallet.objects.filter(sq).delete()
            ExpenseSequence.objects.filter(sq).delete()
            ExpenseCategory.objects.filter(sq).delete()  # store-scoped categories

        if should_reset("cashier"):
            # 6. Cashier
            Payment.objects.filter(sq).delete()
            CashShift.objects.filter(sq).delete()

        if should_reset("credits"):
            # 7. Credits
            CreditLedgerEntry.objects.filter(account__store_id__in=store_ids).delete()
            PaymentSchedule.objects.filter(account__store_id__in=store_ids).delete()
            CustomerAccount.objects.filter(sq).delete()

        if should_reset("sales"):
            # 8. Sales
            # Payment has PROTECT FK to Sale; clear linked payments first.
            Payment.objects.filter(sale__store_id__in=store_ids).delete()
            Refund.objects.filter(sq).delete()
            SaleItem.objects.filter(sale__store_id__in=store_ids).delete()
            Sale.objects.filter(sq).delete()
            QuoteItem.objects.filter(quote__store_id__in=store_ids).delete()
            Quote.objects.filter(sq).delete()

        if should_reset("purchases"):
            # 9. Purchases
            GoodsReceiptLine.objects.filter(
                receipt__store_id__in=store_ids
            ).delete()
            GoodsReceipt.objects.filter(sq).delete()
            PurchaseOrderLine.objects.filter(
                purchase_order__store_id__in=store_ids
            ).delete()
            PurchaseOrder.objects.filter(sq).delete()
            Supplier.objects.filter(eq).delete()

        if should_reset("stock"):
            # 10. Stock
            StockCountLine.objects.filter(stock_count__store_id__in=store_ids).delete()
            StockCount.objects.filter(sq).delete()
            StockTransferLine.objects.filter(transfer__from_store_id__in=store_ids).delete()
            StockTransfer.objects.filter(from_store_id__in=store_ids).delete()
            InventoryMovement.objects.filter(sq).delete()

            stock_qs = ProductStock.objects.filter(sq)
            if mode == "full" or stock_strategy == "delete":
                stock_qs.delete()
            elif stock_strategy == "zero":
                stock_qs.update(quantity=0, reserved_qty=0)
            # keep => preserve current stock rows/levels

        if mode == 'full':
            # 11. Catalog
            ProductImage.objects.filter(product__enterprise=enterprise).delete()
            ProductSpec.objects.filter(product__enterprise=enterprise).delete()
            Product.objects.filter(eq).delete()
            Category.objects.filter(eq).delete()
            Brand.objects.filter(eq).delete()

            # 12. Customers + enterprise-scoped expense categories
            Customer.objects.filter(eq).delete()
            ExpenseCategory.objects.filter(eq, store__isnull=True).delete()

        # 13. Stores — reset sequences, clear audit logs
        from stores.models import Sequence
        if should_reset("audit_logs"):
            AuditLog.objects.filter(store_id__in=store_ids).delete()
        if should_reset("sequences"):
            Sequence.objects.filter(sq).delete()

        if mode == 'full':
            # 14. Users linked to stores (except superusers) + custom roles
            user_ids = (
                StoreUser.objects
                .filter(store_id__in=store_ids)
                .values_list('user_id', flat=True)
                .distinct()
            )
            StoreUser.objects.filter(store_id__in=store_ids).delete()
            User.objects.filter(id__in=list(user_ids), is_superuser=False).delete()
            from accounts.models import CustomRole
            CustomRole.objects.filter(eq).delete()

    def perform_create(self, serializer):
        enterprise = serializer.save()
        # Create a default walk-in customer for this structure so that POS can
        # create sales without forcing customer creation/selection.
        try:
            from customers.services import get_or_create_default_customer
            get_or_create_default_customer(enterprise=enterprise)
        except Exception:
            # Not critical for enterprise creation; sale flow also self-heals.
            pass

    @action(detail=False, methods=['post'], url_path='setup', permission_classes=[IsSuperAdmin])
    def setup(self, request):
        """One-step enterprise + store + admin user creation."""
        ser = EnterpriseSetupSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        raw_password = d.get('user_password') or ''
        password_generated = not bool(raw_password.strip())
        user_password = _generate_secure_password() if password_generated else raw_password

        if not password_generated:
            try:
                validate_password(raw_password)
            except DjangoValidationError as exc:
                raise ValidationError({'user_password': list(exc.messages)})

        with transaction.atomic():
            enterprise = Enterprise.objects.create(
                name=d['enterprise_name'],
                code=d['enterprise_code'],
                currency=d['enterprise_currency'],
                email=d.get('enterprise_email', ''),
                phone=d.get('enterprise_phone', ''),
                can_create_stores=d.get('can_create_stores', True),
                subscription_start=d.get('subscription_start'),
                subscription_end=d.get('subscription_end'),
            )
            # Default walk-in customer
            Customer.objects.create(
                enterprise=enterprise,
                first_name='Client',
                last_name='comptoir',
                is_default=True,
            )
            store = Store.objects.create(
                enterprise=enterprise,
                name=d['store_name'],
                code=d['store_code'],
                address=d.get('store_address', ''),
                phone=d.get('store_phone', ''),
                email=d.get('store_email', ''),
            )
            user = User.objects.create_user(
                email=d['user_email'],
                password=user_password,
                first_name=d['user_first_name'],
                last_name=d['user_last_name'],
                phone=d.get('user_phone', ''),
                role=d['user_role'],
            )
            StoreUser.objects.create(user=user, store=store, is_default=True)

        email_sent = False
        login_url = (getattr(settings, "FRONTEND_URL", "") or "http://localhost:3000").rstrip("/") + "/login"
        try:
            login_url = _send_setup_credentials_email(
                to_email=user.email,
                user_name=user.get_full_name() or user.email,
                password=user_password,
                enterprise_name=enterprise.name,
                store_name=store.name,
            )
            email_sent = True
        except Exception:
            logger.exception("Failed to send enterprise setup credentials to %s", user.email)

        credentials: dict = {
            'email': user.email,
            'password_generated': password_generated,
            'email_sent': email_sent,
            'login_url': login_url,
        }
        # Only surface the temporary password when the email failed AND it was
        # auto-generated — without this the superadmin has no recovery path.
        # Never expose a caller-supplied password.
        if not email_sent and password_generated:
            credentials['temporary_password'] = user_password

        return Response({
            'enterprise': EnterpriseSerializer(enterprise).data,
            'store': StoreSerializer(store).data,
            'admin_user': UserSerializer(user).data,
            'credentials': credentials,
        }, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# Enterprise Subscription ViewSet
# ---------------------------------------------------------------------------

class EnterpriseSubscriptionViewSet(viewsets.ModelViewSet):
    """CRUD for enterprise subscriptions."""

    serializer_class = EnterpriseSubscriptionSerializer
    queryset = EnterpriseSubscription.objects.select_related("enterprise")
    filterset_fields = ["enterprise", "status", "billing_cycle", "auto_renew"]
    search_fields = ["plan_code", "plan_name", "external_subscription_id", "enterprise__name", "enterprise__code"]
    ordering_fields = ["starts_on", "ends_on", "created_at", "amount", "status"]
    pagination_class = StandardResultsSetPagination

    def get_permissions(self):
        return [IsAuthenticated(), CanManageSubscriptions()]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if getattr(user, "is_superuser", False):
            return qs
        enterprise_id = _user_enterprise_id(user)
        if enterprise_id is None:
            return qs.none()
        return qs.filter(enterprise_id=enterprise_id)

    def perform_create(self, serializer):
        user = self.request.user
        if getattr(user, "is_superuser", False):
            enterprise = serializer.validated_data.get("enterprise")
            if enterprise is None:
                raise ValidationError({"enterprise": "Ce champ est requis pour un superadmin."})
            serializer.save()
            return
        serializer.save(enterprise_id=_require_user_enterprise_id(user))

    def perform_update(self, serializer):
        user = self.request.user
        if getattr(user, "is_superuser", False):
            serializer.save()
            return
        serializer.save(enterprise_id=_require_user_enterprise_id(user))


# ---------------------------------------------------------------------------
# Billing Module / Plan ViewSets
# ---------------------------------------------------------------------------

class BillingModuleViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only module catalog — superadmin only."""

    serializer_class = BillingModuleSerializer
    queryset = BillingModule.objects.all().order_by("display_order", "name")
    filterset_fields = ["is_active"]
    search_fields = ["code", "name"]
    ordering_fields = ["display_order", "name", "code"]
    pagination_class = StandardResultsSetPagination
    permission_classes = [IsAuthenticated, IsSuperAdmin]


class BillingPlanViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only commercial plan catalog — superadmin only."""

    serializer_class = BillingPlanSerializer
    queryset = BillingPlan.objects.prefetch_related("plan_modules__module").order_by("name")
    filterset_fields = ["is_active", "billing_cycle"]
    search_fields = ["code", "name"]
    ordering_fields = ["name", "base_price_fcfa", "billing_cycle"]
    pagination_class = StandardResultsSetPagination
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def get_queryset(self):
        qs = super().get_queryset()
        if getattr(self.request.user, "is_superuser", False):
            return qs
        return qs.filter(is_active=True)


class EnterprisePlanAssignmentViewSet(viewsets.ModelViewSet):
    """Plan assignments per enterprise — superadmin only."""

    serializer_class = EnterprisePlanAssignmentSerializer
    queryset = EnterprisePlanAssignment.objects.select_related(
        "enterprise",
        "plan",
        "source_subscription",
    )
    filterset_fields = ["enterprise", "plan", "status", "auto_renew"]
    ordering_fields = ["starts_on", "ends_on", "created_at", "status"]
    pagination_class = StandardResultsSetPagination

    def get_permissions(self):
        return [IsAuthenticated(), IsSuperAdmin()]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if getattr(user, "is_superuser", False):
            return qs
        enterprise_id = _user_enterprise_id(user)
        if enterprise_id is None:
            return qs.none()
        return qs.filter(enterprise_id=enterprise_id)

    def perform_create(self, serializer):
        user = self.request.user
        if getattr(user, "is_superuser", False):
            enterprise = serializer.validated_data.get("enterprise")
            if enterprise is None:
                raise ValidationError({"enterprise": "Ce champ est requis pour un superadmin."})
            serializer.save()
            return
        serializer.save(enterprise_id=_require_user_enterprise_id(user))

    def perform_update(self, serializer):
        user = self.request.user
        if getattr(user, "is_superuser", False):
            serializer.save()
            return
        serializer.save(enterprise_id=_require_user_enterprise_id(user))

    @action(detail=False, methods=["get"], url_path="current")
    def current_assignment(self, request):
        """Return active assignment for one enterprise (today)."""
        today = timezone.localdate()
        enterprise_id = request.query_params.get("enterprise")
        user = request.user

        if getattr(user, "is_superuser", False):
            if enterprise_id:
                enterprise = Enterprise.objects.filter(pk=enterprise_id, is_active=True).first()
            else:
                enterprise = Enterprise.objects.filter(is_active=True).order_by("name").first()
        else:
            user_enterprise_id = _require_user_enterprise_id(user)
            if enterprise_id and str(enterprise_id) != str(user_enterprise_id):
                raise PermissionDenied("Vous ne pouvez consulter que votre entreprise.")
            enterprise = Enterprise.objects.filter(pk=user_enterprise_id, is_active=True).first()

        if enterprise is None:
            return Response({"enterprise": None, "assignment": None})

        assignment = (
            EnterprisePlanAssignment.objects
            .filter(
                enterprise=enterprise,
                status__in=[EnterprisePlanAssignment.Status.TRIAL, EnterprisePlanAssignment.Status.ACTIVE],
                starts_on__lte=today,
            )
            .filter(Q(ends_on__isnull=True) | Q(ends_on__gte=today))
            .select_related("enterprise", "plan")
            .order_by("-starts_on", "-created_at")
            .first()
        )
        return Response(
            {
                "enterprise": {
                    "id": str(enterprise.id),
                    "name": enterprise.name,
                    "code": enterprise.code,
                },
                "assignment": EnterprisePlanAssignmentSerializer(assignment).data if assignment else None,
            }
        )


class StoreModuleEntitlementViewSet(viewsets.ModelViewSet):
    """Store-level module overrides — superadmin only."""

    serializer_class = StoreModuleEntitlementSerializer
    queryset = StoreModuleEntitlement.objects.select_related("store", "module", "created_by")
    filterset_fields = ["store", "module", "state"]
    ordering_fields = ["store__name", "module__display_order", "module__name", "updated_at"]
    pagination_class = StandardResultsSetPagination

    def get_permissions(self):
        return [IsAuthenticated(), IsSuperAdmin()]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if getattr(user, "is_superuser", False):
            return qs
        store_ids = _user_store_ids(user)
        return qs.filter(store_id__in=store_ids)

    def _assert_store_scope(self, store: Store):
        user = self.request.user
        if getattr(user, "is_superuser", False):
            return
        store_ids = {str(sid) for sid in _user_store_ids(user)}
        if str(store.id) not in store_ids:
            raise PermissionDenied("Vous n'avez pas acces a cette boutique.")
        enterprise_id = _require_user_enterprise_id(user)
        if str(store.enterprise_id) != str(enterprise_id):
            raise PermissionDenied("La boutique cible n'appartient pas a votre entreprise.")

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        store = serializer.validated_data["store"]
        module = serializer.validated_data["module"]
        state = serializer.validated_data["state"]
        reason = serializer.validated_data.get("reason", "")

        self._assert_store_scope(store)

        if state == StoreModuleEntitlement.State.INHERIT:
            StoreModuleEntitlement.objects.filter(store=store, module=module).delete()
            return Response(status=status.HTTP_204_NO_CONTENT)

        instance, created = StoreModuleEntitlement.objects.update_or_create(
            store=store,
            module=module,
            defaults={
                "state": state,
                "reason": reason,
                "created_by": request.user,
            },
        )
        out = self.get_serializer(instance)
        return Response(out.data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    @action(detail=False, methods=["post"], url_path="bulk-upsert")
    def bulk_upsert(self, request):
        """Upsert multiple module overrides for one store in one call."""
        serializer = StoreModuleEntitlementBulkUpsertSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        store = serializer.validated_data["store"]
        self._assert_store_scope(store)

        overrides = serializer.validated_data["overrides"]
        touched_codes = []
        for item in overrides:
            module = item["module"]
            state = item["state"]
            reason = item.get("reason", "")
            touched_codes.append(module.code)

            if state == StoreModuleEntitlement.State.INHERIT:
                StoreModuleEntitlement.objects.filter(store=store, module=module).delete()
                continue

            StoreModuleEntitlement.objects.update_or_create(
                store=store,
                module=module,
                defaults={
                    "state": state,
                    "reason": reason,
                    "created_by": request.user,
                },
            )

        entitlements = (
            StoreModuleEntitlement.objects
            .filter(store=store)
            .select_related("store", "module", "created_by")
            .order_by("module__display_order", "module__name")
        )
        matrix = resolve_store_module_matrix(store=store)
        dependencies = {}
        for row in BillingModuleDependency.objects.select_related("module", "depends_on_module"):
            dependencies.setdefault(row.module.code, []).append(row.depends_on_module.code)

        return Response(
            {
                "store": {
                    "id": str(store.id),
                    "name": store.name,
                    "code": store.code,
                },
                "touched_modules": touched_codes,
                "entitlements": StoreModuleEntitlementSerializer(entitlements, many=True).data,
                "effective_modules": matrix.get("modules", {}),
                "source": matrix.get("source"),
                "plan_code": matrix.get("plan_code"),
                "dependencies": dependencies,
            }
        )

    @action(detail=False, methods=["get"], url_path="matrix")
    def matrix(self, request):
        """Return full module matrix + current store overrides for one store."""
        store_id = request.query_params.get("store")
        if not store_id:
            raise ValidationError({"store": "Le parametre store est requis."})
        store = Store.objects.filter(pk=store_id, is_active=True).first()
        if not store:
            raise ValidationError({"store": "Boutique introuvable."})
        self._assert_store_scope(store)

        matrix = resolve_store_module_matrix(store=store)
        entitlements = (
            StoreModuleEntitlement.objects
            .filter(store=store)
            .select_related("module", "created_by")
            .order_by("module__display_order", "module__name")
        )
        dependencies = {}
        for row in BillingModuleDependency.objects.select_related("module", "depends_on_module"):
            dependencies.setdefault(row.module.code, []).append(row.depends_on_module.code)

        return Response(
            {
                "store": {
                    "id": str(store.id),
                    "name": store.name,
                    "code": store.code,
                },
                "entitlements": StoreModuleEntitlementSerializer(entitlements, many=True).data,
                "effective_modules": matrix.get("modules", {}),
                "source": matrix.get("source"),
                "plan_code": matrix.get("plan_code"),
                "dependencies": dependencies,
            }
        )


# ---------------------------------------------------------------------------
# Store ViewSet
# ---------------------------------------------------------------------------

class StoreViewSet(viewsets.ModelViewSet):
    """
    CRUD for stores.

    - Only ADMIN can create/update/delete.
    - Authenticated users can list/retrieve (filtered to their stores).
    """

    serializer_class = StoreSerializer
    queryset = Store.objects.all()
    filterset_fields = ['is_active', 'enterprise']
    search_fields = ['name', 'code']
    ordering_fields = ['name', 'created_at']

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy', 'assign_users'):
            return [IsAuthenticated(), CanManageStores()]
        return [IsAuthenticated()]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        # Only Django superusers can see all stores globally.
        if getattr(user, "is_superuser", False):
            return qs

        # For assign_users, admins must be able to reach any store in their
        # enterprise (they may not personally be in that store yet).
        if getattr(self, "action", None) == "assign_users":
            enterprise_id = _require_user_enterprise_id(user)
            return qs.filter(enterprise_id=enterprise_id)

        return qs.filter(id__in=_user_store_ids(user)).distinct()

    def perform_create(self, serializer):
        user = self.request.user

        if getattr(user, "is_superuser", False):
            # Superusers must pass enterprise explicitly in request body.
            enterprise_id = self.request.data.get('enterprise')
            if not enterprise_id:
                raise ValidationError({"enterprise": "Ce champ est requis pour les super-administrateurs."})
        else:
            # Regular users: scoped to their own enterprise.
            enterprise_id = _require_user_enterprise_id(user)
            enterprise = Enterprise.objects.filter(pk=enterprise_id).first()
            if enterprise and not enterprise.can_create_stores:
                raise PermissionDenied(
                    "La creation de boutiques n'est pas autorisee pour cette entreprise."
                )

        store = serializer.save(enterprise_id=enterprise_id)
        # For non-superusers, ensure the creator has access to the store.
        if not getattr(user, "is_superuser", False):
            StoreUser.objects.get_or_create(
                store=store,
                user=user,
                defaults={"is_default": False},
            )

    def perform_update(self, serializer):
        """Prevent non-superusers from updating stores outside their enterprise."""
        user = self.request.user
        if not getattr(user, "is_superuser", False):
            store = self.get_object()
            enterprise_id = _require_user_enterprise_id(user)
            if str(store.enterprise_id) != str(enterprise_id):
                raise PermissionDenied("Vous ne pouvez pas modifier une boutique hors de votre entreprise.")
        serializer.save()

    @action(detail=True, methods=['post'], url_path='assign-users')
    def assign_users(self, request, pk=None):
        """Assign users to a store."""
        store = self.get_object()
        user_ids = request.data.get('user_ids', [])
        is_default = bool(request.data.get('is_default', False))
        if not isinstance(user_ids, list):
            return Response(
                {'detail': 'Le champ user_ids doit etre une liste.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        users_qs = User.objects.filter(id__in=user_ids, is_active=True)
        if not getattr(request.user, "is_superuser", False):
            users_qs = users_qs.filter(
                store_users__store__enterprise_id=store.enterprise_id,
            ).distinct()
        users = list(users_qs)

        requested_ids = {str(uid) for uid in user_ids}
        accessible_ids = {str(user.id) for user in users}
        inaccessible_ids = sorted(requested_ids - accessible_ids)
        if inaccessible_ids:
            return Response(
                {
                    'detail': (
                        "Certains utilisateurs sont introuvables ou hors "
                        "de votre entreprise."
                    ),
                    'user_ids': inaccessible_ids,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        created = 0
        for user in users:
            _, was_created = StoreUser.objects.get_or_create(
                store=store,
                user=user,
                defaults={'is_default': is_default},
            )
            if was_created:
                created += 1

        return Response(
            {
                'store': str(store.pk),
                'assigned_count': len(users),
                'new_links': created,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=['get'], url_path='my-stores')
    def my_stores(self, request):
        """Return all stores accessible by the current user with is_default flag."""
        user = request.user
        default_link = StoreUser.objects.filter(user=user, store_id=OuterRef('pk'), is_default=True)
        if getattr(user, "is_superuser", False):
            stores = (
                Store.objects
                .filter(is_active=True)
                .select_related('enterprise')
                .annotate(is_default_for_user=Exists(default_link))
            )
        else:
            store_ids = _user_store_ids(user)
            stores = (
                Store.objects
                .filter(pk__in=store_ids, is_active=True)
                .select_related('enterprise')
                .annotate(is_default_for_user=Exists(default_link))
            )
        serializer = MyStoreSerializer(stores, many=True, context={'request': request})
        return Response(serializer.data)


# ---------------------------------------------------------------------------
# StoreUser ViewSet (capabilities management)
# ---------------------------------------------------------------------------

class StoreUserViewSet(viewsets.ModelViewSet):
    """CRUD for store-user links with capability management.

    Managers and admins can list users for their stores and update
    capabilities.  The ``presets`` action returns the available
    capability presets for quick assignment.
    """

    serializer_class = StoreUserSerializer
    permission_classes = [IsAuthenticated, CanManageUsers, IsStoreMember]
    filterset_fields = ['store', 'user']

    def get_queryset(self):
        qs = StoreUser.objects.select_related('user', 'store')
        store_id = self.request.query_params.get('store')
        if store_id:
            qs = qs.filter(store_id=store_id)
        user_id = self.request.query_params.get('user')
        if user_id:
            qs = qs.filter(user_id=user_id)
        return qs.filter(store_id__in=_user_store_ids(self.request.user))

    @action(detail=False, methods=['get'], url_path='presets')
    def presets(self, request):
        """Return the list of capability presets and all available capabilities."""
        from stores.capabilities import CAPABILITY_PRESETS, CAPABILITY_CHOICES
        return Response({
            'presets': CAPABILITY_PRESETS,
            'all_capabilities': [
                {'code': code, 'label': label}
                for code, label in CAPABILITY_CHOICES
            ],
        })


# ---------------------------------------------------------------------------
# Custom Role ViewSet
# ---------------------------------------------------------------------------

class CustomRoleViewSet(viewsets.ModelViewSet):
    """CRUD for custom roles. Admin only."""

    queryset = CustomRole.objects.all()
    serializer_class = CustomRoleSerializer
    permission_classes = [IsAuthenticated, CanManageUsers]
    filterset_fields = ['base_role', 'is_active']
    search_fields = ['name']
    ordering_fields = ['name', 'base_role', 'is_active']

    def get_queryset(self):
        qs = super().get_queryset()
        enterprise_id = _require_user_enterprise_id(self.request.user)
        return qs.filter(enterprise_id=enterprise_id)

    def perform_create(self, serializer):
        enterprise_id = _require_user_enterprise_id(self.request.user)
        serializer.save(enterprise_id=enterprise_id)

    def perform_destroy(self, instance):
        """Prevent deletion of custom roles that are still assigned to users."""
        if User.objects.filter(custom_role=instance).exists():
            raise ValidationError(
                "Ce role personnalise est encore assigne a des utilisateurs. "
                "Retirez-le d'abord avant de le supprimer."
            )
        instance.delete()


# ---------------------------------------------------------------------------
# User ViewSet
# ---------------------------------------------------------------------------

class UserViewSet(viewsets.ModelViewSet):
    """
    CRUD for users. Admin only.

    Uses UserCreateSerializer for create action and UserSerializer for others.
    """

    queryset = User.objects.all()
    permission_classes = [IsAuthenticated, CanManageUsers]
    filterset_fields = ['role', 'is_active']
    search_fields = ['email', 'first_name', 'last_name']
    ordering_fields = ['last_name', 'date_joined', 'role', 'is_active']

    def get_serializer_class(self):
        if self.action == 'create':
            return UserCreateSerializer
        return UserSerializer
    
    def get_queryset(self):
        qs = super().get_queryset().prefetch_related('store_users__store')
        # Superusers can observe everything (Django admin / platform-level).
        if getattr(self.request.user, "is_superuser", False):
            return qs
        # Tenant admin scope: only users linked to the same enterprise via StoreUser.
        enterprise_id = _require_user_enterprise_id(self.request.user)
        return qs.filter(store_users__store__enterprise_id=enterprise_id).distinct()

    def perform_create(self, serializer):
        user = serializer.save()

        # Auto-link the new user to the creator's default store (within the
        # creator's enterprise only) so they can use the application immediately.
        if not getattr(self.request.user, "is_superuser", False):
            enterprise_id = _require_user_enterprise_id(self.request.user)
            creator_link = (
                StoreUser.objects
                .filter(
                    user=self.request.user,
                    store__is_active=True,
                    store__enterprise_id=enterprise_id,
                )
                .order_by("-is_default", "store_id")
                .select_related("store")
                .first()
            )
        else:
            creator_link = (
                StoreUser.objects
                .filter(user=self.request.user, store__is_active=True)
                .order_by("-is_default", "store_id")
                .select_related("store")
                .first()
            )
        if creator_link and creator_link.store_id:
            StoreUser.objects.get_or_create(
                store_id=creator_link.store_id,
                user=user,
                defaults={"is_default": True},
            )

    def perform_update(self, serializer):
        """Prevent managers from modifying admin accounts."""
        target = self.get_object()
        actor = self.request.user
        if target.role == "ADMIN" and not getattr(actor, "is_superuser", False) and actor.pk != target.pk:
            raise ValidationError("Seuls les superadmins peuvent modifier un compte administrateur.")
        serializer.save()

    def perform_destroy(self, instance):
        """Enforce role hierarchy on deletion."""
        actor = self.request.user
        # Cannot delete yourself
        if actor.pk == instance.pk:
            raise ValidationError("Vous ne pouvez pas supprimer votre propre compte.")
        # Only superusers can delete ADMIN users
        if instance.role == "ADMIN" and not getattr(actor, "is_superuser", False):
            raise ValidationError("Seuls les superadmins peuvent supprimer un compte administrateur.")
        # Managers cannot delete other managers
        if instance.role == "MANAGER" and getattr(actor, "role", None) == "MANAGER":
            raise ValidationError("Un gestionnaire ne peut pas supprimer un autre gestionnaire.")
        instance.delete()

    @action(detail=True, methods=["post"], url_path="set-password")
    def set_password(self, request, pk=None):
        """POST /api/v1/users/{id}/set-password/ — admin sets a new password for a user."""
        user = self.get_object()
        new_password = request.data.get("new_password", "")
        if not new_password:
            return Response({"new_password": ["Ce champ est requis."]}, status=status.HTTP_400_BAD_REQUEST)
        try:
            validate_password(new_password, user)
        except DjangoValidationError as exc:
            return Response({"new_password": list(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)
        user.set_password(new_password)
        user.save(update_fields=["password"])
        return Response({"detail": "Mot de passe mis a jour avec succes."})


# ---------------------------------------------------------------------------
# Category ViewSet
# ---------------------------------------------------------------------------

class CategoryViewSet(viewsets.ModelViewSet):
    """
    CRUD for product categories (enterprise-scoped).

    - Managers and admins can write.
    - All authenticated users can read.
    """

    serializer_class = CategorySerializer
    queryset = Category.objects.all()
    filterset_fields = ['is_active', 'parent']
    search_fields = ['name']
    ordering_fields = ['name', 'is_active']

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy'):
            return [IsManagerOrAdmin(), ModuleStockEnabled()]
        return [IsAuthenticated(), ModuleStockEnabled()]

    def get_queryset(self):
        qs = super().get_queryset()
        return _filter_queryset_by_enterprise(qs, self.request.user)

    def perform_create(self, serializer):
        enterprise_id = _require_user_enterprise_id(self.request.user)
        serializer.save(enterprise_id=enterprise_id)

    # -- CSV export --------------------------------------------------------
    @action(detail=False, methods=['get'], url_path='export-csv')
    def export_csv(self, request):
        """Export filtered categories to a CSV file."""
        from core.export import queryset_to_csv_response
        qs = self.filter_queryset(self.get_queryset()).select_related('parent')
        columns = [
            ('name', 'Nom'),
            (lambda o: o.parent.name if o.parent else '', 'Categorie parente'),
            ('description', 'Description'),
            (lambda o: 'oui' if o.is_active else 'non', 'Actif'),
        ]
        return queryset_to_csv_response(qs, columns, 'categories')

    # -- CSV import --------------------------------------------------------
    @action(detail=False, methods=['post'], url_path='import-csv',
            parser_classes=[MultiPartParser, FormParser])
    def import_csv(self, request):
        """Import categories from a CSV file.

        Expected columns (flexible aliases):
        - name / nom / categorie  (required)
        - parent / parent_name / categorie_parente (optional)
        - description / desc (optional)
        - is_active / actif / active (optional)
        """
        content = _decode_uploaded_csv(request.FILES.get('file'))
        reader = _build_csv_dict_reader(content)
        header_map = {_normalize_header(h): h for h in (reader.fieldnames or [])}

        enterprise_id = _require_user_enterprise_id(request.user)

        # Pre-load existing categories for parent lookup
        existing = {
            c.name.strip().lower(): c
            for c in Category.objects.filter(enterprise_id=enterprise_id)
        }

        created = 0
        updated = 0
        skipped = 0
        errors: list[str] = []

        for row_num, row in enumerate(reader, start=2):
            try:
                name = _row_value(row, header_map, 'name', 'nom', 'categorie', 'category')
                if not name:
                    skipped += 1
                    continue

                description = _row_value(row, header_map, 'description', 'desc')
                is_active = _parse_bool_field(
                    _row_value(row, header_map, 'is_active', 'actif', 'active'),
                    default=True,
                )

                parent = None
                parent_name = _row_value(row, header_map, 'parent', 'parent_name', 'categorie_parente')
                if parent_name:
                    parent = existing.get(parent_name.strip().lower())

                slug = _unique_slug_for_enterprise(
                    Category,
                    enterprise_id=enterprise_id,
                    base_value=name,
                    fallback='categorie',
                )

                obj, obj_created = Category.objects.get_or_create(
                    enterprise_id=enterprise_id,
                    name__iexact=name,
                    defaults={
                        'name': name,
                        'slug': slug,
                        'description': description,
                        'parent': parent,
                        'is_active': is_active,
                    },
                )
                if obj_created:
                    existing[name.strip().lower()] = obj
                    created += 1
                else:
                    changed = False
                    if description and obj.description != description:
                        obj.description = description
                        changed = True
                    if parent and obj.parent != parent:
                        obj.parent = parent
                        changed = True
                    obj.is_active = is_active
                    obj.save(update_fields=['description', 'parent', 'is_active', 'updated_at'])
                    updated += 1
            except Exception as exc:
                if len(errors) < 50:
                    errors.append({'line': row_num, 'message': str(exc)})

        total_rows = created + updated + skipped + len(errors)
        return Response({
            'detail': f'{created} creee(s), {updated} mise(s) a jour, {skipped} ignoree(s).',
            'total_rows': total_rows,
            'created': created,
            'updated': updated,
            'skipped': skipped,
            'error_count': len(errors),
            'errors': errors,
        })


# ---------------------------------------------------------------------------
# Brand ViewSet
# ---------------------------------------------------------------------------

class BrandViewSet(viewsets.ModelViewSet):
    """
    CRUD for brands (enterprise-scoped).

    - Managers and admins can write.
    - All authenticated users can read.
    """

    serializer_class = BrandSerializer
    queryset = Brand.objects.all()
    filterset_fields = ['is_active']
    search_fields = ['name']
    ordering_fields = ['name', 'is_active']

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy'):
            return [IsManagerOrAdmin(), ModuleStockEnabled()]
        return [IsAuthenticated(), ModuleStockEnabled()]

    def get_queryset(self):
        qs = super().get_queryset()
        return _filter_queryset_by_enterprise(qs, self.request.user)

    def perform_create(self, serializer):
        enterprise_id = _require_user_enterprise_id(self.request.user)
        serializer.save(enterprise_id=enterprise_id)

    # -- CSV import --------------------------------------------------------
    @action(detail=False, methods=['post'], url_path='import-csv',
            parser_classes=[MultiPartParser, FormParser])
    def import_csv(self, request):
        """Import brands from a CSV file.

        Expected columns (flexible aliases):
        - name / nom / marque  (required)
        - is_active / actif / active
        """
        content = _decode_uploaded_csv(request.FILES.get('file'))
        reader = _build_csv_dict_reader(content)
        header_map = {_normalize_header(h): h for h in (reader.fieldnames or [])}

        enterprise_id = _require_user_enterprise_id(request.user)

        created = 0
        updated = 0
        skipped = 0
        errors: list[str] = []

        for row_num, row in enumerate(reader, start=2):
            try:
                name = _row_value(row, header_map, 'name', 'nom', 'marque', 'brand')
                if not name:
                    skipped += 1
                    continue

                is_active = _parse_bool_field(
                    _row_value(row, header_map, 'is_active', 'actif', 'active'),
                    default=True,
                )

                slug = _unique_slug_for_enterprise(
                    Brand,
                    enterprise_id=enterprise_id,
                    base_value=name,
                    fallback='brand',
                )

                obj, obj_created = Brand.objects.get_or_create(
                    enterprise_id=enterprise_id,
                    name__iexact=name,
                    defaults={
                        'name': name,
                        'slug': slug,
                        'is_active': is_active,
                    },
                )
                if obj_created:
                    created += 1
                else:
                    obj.is_active = is_active
                    obj.save(update_fields=['is_active', 'updated_at'])
                    updated += 1
            except Exception as exc:
                if len(errors) < 50:
                    errors.append({'line': row_num, 'message': str(exc)})

        total_rows = created + updated + skipped + len(errors)
        return Response({
            'detail': f'{created} creee(s), {updated} mise(s) a jour, {skipped} ignoree(s).',
            'total_rows': total_rows,
            'created': created,
            'updated': updated,
            'skipped': skipped,
            'error_count': len(errors),
            'errors': errors,
        })

    # -- CSV export --------------------------------------------------------
    @action(detail=False, methods=['get'], url_path='export-csv')
    def export_csv(self, request):
        """Export filtered brands to a CSV file."""
        from core.export import queryset_to_csv_response
        qs = self.filter_queryset(self.get_queryset())
        columns = [
            ('name', 'Nom'),
            (lambda o: 'oui' if o.is_active else 'non', 'Actif'),
        ]
        return queryset_to_csv_response(qs, columns, 'marques')


# ---------------------------------------------------------------------------
# Product ViewSet
# ---------------------------------------------------------------------------

class ProductViewSet(viewsets.ModelViewSet):
    """
    CRUD for products (enterprise-scoped).

    - Managers and admins can write.
    - All authenticated users can read.
    - Search by name, SKU, barcode. Filter by category, brand.
    """

    serializer_class = ProductSerializer
    queryset = Product.objects.select_related('category', 'brand').prefetch_related(
        'images', 'specs',
    )
    filterset_fields = ['category', 'brand', 'is_active']
    search_fields = ['name', 'sku', 'barcode']
    ordering_fields = ['name', 'sku', 'cost_price', 'selling_price', 'is_active', 'created_at']
    pagination_class = StandardResultsSetPagination

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy', 'import_csv'):
            return [IsManagerOrAdmin(), ModuleStockEnabled()]
        return [IsAuthenticated(), ModuleSellOrStockEnabled()]

    def get_queryset(self):
        qs = super().get_queryset()
        return _filter_queryset_by_enterprise(qs, self.request.user)

    def perform_create(self, serializer):
        enterprise_id = _require_user_enterprise_id(self.request.user)
        product = serializer.save(enterprise_id=enterprise_id)
        # Handle image upload if provided
        image_file = self.request.FILES.get('image')
        if image_file:
            ProductImage.objects.create(product=product, image=image_file, is_primary=True)

    def perform_update(self, serializer):
        product = serializer.save()
        # Handle image upload if provided
        image_file = self.request.FILES.get('image')
        if image_file:
            ProductImage.objects.create(product=product, image=image_file, is_primary=True)

    def perform_destroy(self, instance):
        """Delete product after cleaning technical stock rows.

        If the product is used in historical documents (sales/purchases/etc.),
        keep data integrity and return a clear business error.
        """
        try:
            with transaction.atomic():
                ProductStock.objects.filter(product=instance).delete()
                instance.delete()
        except ProtectedError as exc:
            blocked_models = sorted(
                {
                    obj._meta.verbose_name_plural
                    for obj in getattr(exc, "protected_objects", [])
                    if hasattr(obj, "_meta")
                }
            )
            blocked_suffix = ""
            if blocked_models:
                blocked_suffix = f" References detectees: {', '.join(blocked_models[:3])}."
            raise ValidationError(
                {
                    "detail": (
                        "Impossible de supprimer ce produit car il est deja utilise "
                        "dans des documents existants. Desactivez-le a la place."
                        f"{blocked_suffix}"
                    )
                }
            )

    @action(detail=True, methods=['post'], url_path='upload-image')
    def upload_image(self, request, pk=None):
        """Upload an image for a product."""
        product = self.get_object()
        image_file = request.FILES.get('image')
        if not image_file:
            raise ValidationError({'image': 'Aucun fichier image fourni.'})

        # Validate file size (max 5 MB)
        max_size = 5 * 1024 * 1024
        if image_file.size and image_file.size > max_size:
            raise ValidationError({'image': 'L\'image ne doit pas depasser 5 Mo.'})

        # Validate MIME type
        allowed_types = {'image/jpeg', 'image/png', 'image/webp', 'image/gif'}
        if image_file.content_type not in allowed_types:
            raise ValidationError({'image': 'Format accepte: JPEG, PNG, WebP ou GIF.'})

        # Verify the file is a valid image
        from PIL import Image as PILImage
        try:
            img_check = PILImage.open(image_file)
            img_check.verify()
            image_file.seek(0)
        except Exception:
            raise ValidationError({'image': 'Le fichier n\'est pas une image valide.'})

        is_primary = request.data.get('is_primary', 'false').lower() in ('true', '1')
        if is_primary:
            product.images.update(is_primary=False)
        img = ProductImage.objects.create(product=product, image=image_file, is_primary=is_primary)
        return Response({
            'id': str(img.id), 'image': img.image.url,
            'is_primary': img.is_primary, 'sort_order': img.sort_order,
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='delete-image')
    def delete_image(self, request, pk=None):
        """Delete a product image by image ID."""
        product = self.get_object()
        image_id = request.data.get('image_id')
        if not image_id:
            raise ValidationError({'image_id': 'Ce champ est requis.'})
        try:
            img = product.images.get(id=image_id)
        except ProductImage.DoesNotExist:
            raise ValidationError({'detail': 'Image introuvable.'})
        img.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=['post'], url_path='import-csv')
    def import_csv(self, request):
        """Bulk import products from CSV file.

        Expected columns (aliases supported):
        - name/nom
        - sku
        - selling_price/prix_vente (required)
        - cost_price/prix_achat (optional)
        - barcode/code_barres (optional)
        - category/categorie (optional, auto-created)
        - brand/marque (optional, auto-created)
        - description (optional)
        - is_active/actif (optional)
        """
        content = _decode_uploaded_csv(request.FILES.get('file'))
        reader = _build_csv_dict_reader(content)
        if not reader.fieldnames:
            raise ValidationError({'file': 'En-tetes CSV introuvables.'})

        header_map = {
            _normalize_header(col): col
            for col in reader.fieldnames
            if col is not None and str(col).strip() != ""
        }
        if not header_map:
            raise ValidationError({'file': 'Le CSV ne contient aucun en-tete exploitable.'})

        enterprise_id = _require_user_enterprise_id(request.user)
        categories = {
            c.name.strip().lower(): c
            for c in Category.objects.filter(enterprise_id=enterprise_id)
        }
        brands = {
            b.name.strip().lower(): b
            for b in Brand.objects.filter(enterprise_id=enterprise_id)
        }

        total_rows = 0
        created = 0
        updated = 0
        skipped = 0
        error_count = 0
        errors = []

        for line_no, row in enumerate(reader, start=2):
            total_rows += 1
            row_values = [
                str(v).strip() if v is not None else ""
                for v in row.values()
            ]
            if not any(row_values):
                skipped += 1
                continue

            try:
                name = _row_value(row, header_map, 'name', 'nom', 'produit', 'product_name')
                sku = _row_value(row, header_map, 'sku', 'reference', 'ref', 'code')
                if not name:
                    raise ValueError('Nom produit manquant.')
                if not sku:
                    raise ValueError('SKU manquant.')

                selling_price = _parse_decimal_field(
                    _row_value(row, header_map, 'selling_price', 'prix_vente', 'price', 'prix'),
                    field_label='prix_vente',
                    allow_blank=False,
                )
                cost_price = _parse_decimal_field(
                    _row_value(row, header_map, 'cost_price', 'prix_achat', 'purchase_price'),
                    field_label='prix_achat',
                    allow_blank=True,
                    default=Decimal('0.00'),
                )
                if selling_price < 0:
                    raise ValueError('prix_vente ne peut pas etre negatif.')
                if cost_price < 0:
                    raise ValueError('prix_achat ne peut pas etre negatif.')

                barcode = _row_value(row, header_map, 'barcode', 'code_barres', 'codebarres', 'ean')
                description = _row_value(row, header_map, 'description', 'desc')
                is_active = _parse_bool_field(
                    _row_value(row, header_map, 'is_active', 'actif', 'active'),
                    default=True,
                )

                category = None
                category_name = _row_value(row, header_map, 'category', 'categorie')
                if category_name:
                    cat_key = category_name.lower()
                    category = categories.get(cat_key)
                    if category is None:
                        category = Category.objects.create(
                            enterprise_id=enterprise_id,
                            name=category_name,
                            slug=_unique_slug_for_enterprise(
                                Category,
                                enterprise_id=enterprise_id,
                                base_value=category_name,
                                fallback='categorie',
                            ),
                            is_active=True,
                        )
                        categories[cat_key] = category

                brand = None
                brand_name = _row_value(row, header_map, 'brand', 'marque')
                if brand_name:
                    brand_key = brand_name.lower()
                    brand = brands.get(brand_key)
                    if brand is None:
                        brand = Brand.objects.create(
                            enterprise_id=enterprise_id,
                            name=brand_name,
                            slug=_unique_slug_for_enterprise(
                                Brand,
                                enterprise_id=enterprise_id,
                                base_value=brand_name,
                                fallback='marque',
                            ),
                            is_active=True,
                        )
                        brands[brand_key] = brand

                product = Product.objects.filter(
                    enterprise_id=enterprise_id,
                    sku=sku,
                ).first()
                if product:
                    product.name = name
                    product.slug = _unique_slug_for_enterprise(
                        Product,
                        enterprise_id=enterprise_id,
                        base_value=sku,
                        fallback='produit',
                        exclude_pk=product.pk,
                    )
                    product.barcode = barcode
                    product.description = description
                    product.category = category
                    product.brand = brand
                    product.cost_price = cost_price
                    product.selling_price = selling_price
                    product.is_active = is_active
                    product.save(
                        update_fields=[
                            'name', 'slug', 'barcode', 'description',
                            'category', 'brand', 'cost_price', 'selling_price',
                            'is_active', 'updated_at',
                        ]
                    )
                    updated += 1
                else:
                    Product.objects.create(
                        enterprise_id=enterprise_id,
                        name=name,
                        slug=_unique_slug_for_enterprise(
                            Product,
                            enterprise_id=enterprise_id,
                            base_value=sku,
                            fallback='produit',
                        ),
                        sku=sku,
                        barcode=barcode,
                        description=description,
                        category=category,
                        brand=brand,
                        cost_price=cost_price,
                        selling_price=selling_price,
                        is_active=is_active,
                    )
                    created += 1
            except Exception as exc:
                error_count += 1
                if len(errors) < 50:
                    errors.append({'line': line_no, 'message': str(exc)})

        return Response({
            'detail': "Import CSV termine.",
            'total_rows': total_rows,
            'created': created,
            'updated': updated,
            'skipped': skipped,
            'error_count': error_count,
            'errors': errors,
        })

    @action(detail=False, methods=['get'], url_path='available')
    def available(self, request):
        """POS helper: products with store-scoped availability.

        Query params:
        - store: UUID (required)
        - search: optional (name/sku/barcode)
        - in_stock: "1" to return only products with available_qty > 0 (default "0")
        """
        store_id = request.query_params.get("store")
        if not store_id:
            return Response({"detail": "store est requis."}, status=status.HTTP_400_BAD_REQUEST)

        store_ids = {str(x) for x in _user_store_ids(request.user)}
        if store_id not in store_ids:
            return Response(
                {"detail": "Vous n'avez pas acces a cette boutique."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Subqueries avoid duplicates and include products without a stock row.
        stock_qs = (
            ProductStock.objects
            .filter(store_id=store_id, product_id=OuterRef("pk"))
            .annotate(avail=F("quantity") - F("reserved_qty"))
            .values("avail")[:1]
        )
        has_stock_qs = ProductStock.objects.filter(store_id=store_id, product_id=OuterRef("pk"))

        qs = self.get_queryset().annotate(
            available_qty=Coalesce(Subquery(stock_qs, output_field=IntegerField()), Value(0)),
            has_stock=Exists(has_stock_qs),
        )

        in_stock = request.query_params.get("in_stock", "0")
        if in_stock in ("1", "true", "True", "yes", "on"):
            qs = qs.filter(
                Q(track_stock=False) | Q(available_qty__gt=0)
            )

        qs = self.filter_queryset(qs)

        page = self.paginate_queryset(qs)
        if page is not None:
            return self.get_paginated_response(ProductPOSSerializer(page, many=True).data)
        return Response(ProductPOSSerializer(qs, many=True).data)

    # -- CSV export --------------------------------------------------------
    @action(detail=False, methods=['get'], url_path='export-csv')
    def export_csv(self, request):
        """Export filtered products to a CSV file."""
        from core.export import queryset_to_csv_response
        qs = self.filter_queryset(self.get_queryset()).select_related('category', 'brand')
        columns = [
            ('name', 'Nom'),
            ('sku', 'SKU'),
            ('barcode', 'Code-barres'),
            (lambda o: o.category.name if o.category else '', 'Categorie'),
            (lambda o: o.brand.name if o.brand else '', 'Marque'),
            ('cost_price', 'Prix achat'),
            ('selling_price', 'Prix vente'),
            ('description', 'Description'),
            (lambda o: 'oui' if o.is_active else 'non', 'Actif'),
        ]
        return queryset_to_csv_response(qs, columns, 'produits')


# ---------------------------------------------------------------------------
# ProductStock ViewSet (Read-Only)
# ---------------------------------------------------------------------------

class ProductStockViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only viewset for product stock levels.

    Filter by store and product. Only shows stock for user's accessible stores.
    On list, automatically creates missing ProductStock rows so that newly
    created products appear with quantity=0.
    """

    serializer_class = ProductStockSerializer
    queryset = ProductStock.objects.select_related('store', 'product')
    filterset_fields = ['store', 'product']
    search_fields = ['product__name', 'product__sku', 'product__barcode']
    ordering_fields = ['quantity', 'product__name', 'reserved_qty', 'min_qty']
    permission_classes = [IsAuthenticated, FeatureStockManagementEnabled]
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        qs = super().get_queryset()
        store_ids = _user_store_ids(self.request.user)
        return qs.filter(store_id__in=store_ids, product__track_stock=True)

    def list(self, request, *args, **kwargs):
        """Sync missing ProductStock rows before listing."""
        store_id = request.query_params.get("store")
        if store_id:
            try:
                store = Store.objects.select_related("enterprise").get(
                    pk=store_id, id__in=_user_store_ids(request.user),
                )
            except Store.DoesNotExist:
                pass
            else:
                existing = ProductStock.objects.filter(store=store).values_list(
                    "product_id", flat=True,
                )
                missing = list(
                    Product.objects.filter(
                        enterprise=store.enterprise, is_active=True, track_stock=True,
                    )
                    .exclude(pk__in=existing)
                    .values_list("pk", flat=True)
                )
                if missing:
                    ProductStock.objects.bulk_create(
                        [ProductStock(store=store, product_id=pid) for pid in missing],
                        ignore_conflicts=True,
                    )
        return super().list(request, *args, **kwargs)


# ---------------------------------------------------------------------------
# InventoryMovement ViewSet (List + Create)
# ---------------------------------------------------------------------------

class InventoryMovementViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    """
    List and create inventory movements.

    Filter by store, product, movement type.
    Filtered to user's accessible stores.
    """

    serializer_class = InventoryMovementSerializer
    queryset = InventoryMovement.objects.select_related('store', 'product', 'actor')
    filterset_fields = ['store', 'product', 'movement_type']
    ordering_fields = ['created_at', 'product__name', 'movement_type', 'quantity']

    def get_permissions(self):
        if self.action in ('create', 'bulk_entry', 'bulk_adjust'):
            return [IsAuthenticated(), FeatureStockEntriesEnabled()]
        return [IsAuthenticated(), FeatureStockManagementEnabled()]

    def get_queryset(self):
        qs = super().get_queryset()
        store_ids = _user_store_ids(self.request.user)
        return qs.filter(store_id__in=store_ids)

    def perform_create(self, serializer):
        """Create a movement **and** update the real stock level."""
        data = serializer.validated_data
        if not bool(getattr(data["product"], "track_stock", True)):
            raise ValidationError(
                {"product": "Ce produit est un service et ne suit pas le stock."}
            )
        from stock.services import adjust_stock

        adjust_stock(
            store=data['store'],
            product=data['product'],
            qty_delta=data['quantity'],
            movement_type=data['movement_type'],
            reason=data.get('reason', ''),
            actor=self.request.user,
            reference=data.get('reference', ''),
            batch_id=data.get('batch_id'),
        )

    # ---- bulk actions -------------------------------------------------

    @action(detail=False, methods=['post'], url_path='bulk-entry')
    def bulk_entry(self, request):
        """Batch stock entry (movement_type=IN, qty > 0)."""
        from stock.services import adjust_stock
        import uuid as _uuid

        serializer = BulkStockEntrySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data

        store_id = request.data.get('store_id')
        if not store_id:
            raise ValidationError({'store_id': 'Ce champ est requis.'})

        store_ids = {str(x) for x in _user_store_ids(request.user)}
        if str(store_id) not in store_ids:
            raise PermissionDenied("Vous n'avez pas acces a cette boutique.")
        store = Store.objects.select_related("enterprise").get(pk=store_id)

        entries = d['entries']
        if len(entries) > 500:
            raise ValidationError({'entries': 'Maximum 500 produits par operation.'})

        # Check for duplicate product_ids
        pids = [str(e['product_id']) for e in entries]
        if len(pids) != len(set(pids)):
            raise ValidationError({'entries': 'Un meme produit ne peut apparaitre qu\'une seule fois.'})

        enterprise_id = _user_enterprise_id(request.user)

        # Validate all products upfront before making any stock changes
        products = {}
        for i, entry in enumerate(entries):
            try:
                product = Product.objects.get(
                    pk=entry['product_id'],
                    enterprise_id=enterprise_id,
                )
            except Product.DoesNotExist:
                raise ValidationError({
                    'entries': f"Ligne {i + 1}: produit introuvable ou n'appartient pas a votre entreprise."
                })
            if not product.track_stock:
                raise ValidationError({
                    'entries': f"Ligne {i + 1}: le produit \"{product.name}\" est un service et ne suit pas le stock."
                })
            if str(product.enterprise_id) != str(store.enterprise_id):
                raise ValidationError({
                    'entries': f"Ligne {i + 1}: le produit \"{product.name}\" n'appartient pas a l'entreprise de cette boutique."
                })
            products[str(entry['product_id'])] = product

        batch_id = _uuid.uuid4()
        movements = []
        with transaction.atomic():
            for entry in entries:
                product = products[str(entry['product_id'])]
                mv = adjust_stock(
                    store=store, product=product,
                    qty_delta=entry['quantity'],
                    movement_type=InventoryMovement.MovementType.IN,
                    reason=d.get('reason', ''),
                    actor=request.user,
                    reference=d.get('reference', ''),
                    batch_id=batch_id,
                    unit_cost=entry.get('unit_cost'),
                )
                movements.append(mv)

        return Response({
            'batch_id': str(batch_id),
            'count': len(movements),
        }, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'], url_path='bulk-adjust')
    def bulk_adjust(self, request):
        """Batch stock adjustment (movement_type=ADJUST, qty can be +/-)."""
        from stock.services import adjust_stock
        import uuid as _uuid

        serializer = BulkStockAdjustSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data

        store_id = request.data.get('store_id')
        if not store_id:
            raise ValidationError({'store_id': 'Ce champ est requis.'})

        store_ids = {str(x) for x in _user_store_ids(request.user)}
        if str(store_id) not in store_ids:
            raise PermissionDenied("Vous n'avez pas acces a cette boutique.")
        store = Store.objects.select_related("enterprise").get(pk=store_id)

        adjustments = d['adjustments']
        if len(adjustments) > 500:
            raise ValidationError({'adjustments': 'Maximum 500 produits par operation.'})

        enterprise_id = _user_enterprise_id(request.user)

        # Validate all products upfront
        products = {}
        for i, adj in enumerate(adjustments):
            try:
                product = Product.objects.get(
                    pk=adj['product_id'],
                    enterprise_id=enterprise_id,
                )
            except Product.DoesNotExist:
                raise ValidationError({
                    'adjustments': f"Ligne {i + 1}: produit introuvable ou n'appartient pas a votre entreprise."
                })
            if not product.track_stock:
                raise ValidationError({
                    'adjustments': f"Ligne {i + 1}: le produit \"{product.name}\" est un service et ne suit pas le stock."
                })
            products[str(adj['product_id'])] = product

        batch_id = _uuid.uuid4()
        movements = []
        with transaction.atomic():
            for adj in adjustments:
                product = products[str(adj['product_id'])]
                mv = adjust_stock(
                    store=store, product=product,
                    qty_delta=adj['quantity'],
                    movement_type=InventoryMovement.MovementType.ADJUST,
                    reason=d['reason'],
                    actor=request.user,
                    reference='',
                    batch_id=batch_id,
                )
                movements.append(mv)

        return Response({
            'batch_id': str(batch_id),
            'count': len(movements),
        }, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'], url_path='document')
    def document(self, request):
        """Return movements for a given batch_id (printable document)."""
        batch_id = request.query_params.get('batch_id')
        if not batch_id:
            return Response({'detail': 'batch_id est requis.'}, status=status.HTTP_400_BAD_REQUEST)

        qs = self.get_queryset().filter(batch_id=batch_id).order_by('product__name')
        if not qs.exists():
            return Response({'detail': 'Aucun mouvement pour ce lot.'}, status=status.HTTP_404_NOT_FOUND)

        first = qs.first()
        all_positive = all(m.quantity >= 0 for m in qs)
        all_negative = all(m.quantity <= 0 for m in qs)
        if all_positive:
            doc_type = "Bon d'entree"
        elif all_negative:
            doc_type = "Bon de sortie"
        else:
            doc_type = "Bon d'ajustement"

        return Response({
            'batch_id': str(batch_id),
            'doc_type': doc_type,
            'store_name': first.store.name if first.store else '',
            'date': first.created_at.isoformat(),
            'reference': first.reference,
            'reason': first.reason,
            'movements': InventoryMovementSerializer(qs, many=True).data,
            'total_lines': qs.count(),
            'total_qty': sum(abs(m.quantity) for m in qs),
        })

    @action(detail=False, methods=['get'], url_path='export-csv')
    def export_csv(self, request):
        """Export filtered inventory movements to a CSV file."""
        from core.export import queryset_to_csv_response
        qs = self.filter_queryset(self.get_queryset()).select_related('product', 'actor')
        columns = [
            (lambda o: o.created_at.strftime('%d/%m/%Y %H:%M'), 'Date'),
            ('movement_type', 'Type'),
            (lambda o: o.product.name if o.product else '', 'Produit'),
            ('quantity', 'Quantite'),
            ('reference', 'Reference'),
            (lambda o: o.actor.get_full_name() if o.actor else '', 'Acteur'),
        ]
        return queryset_to_csv_response(qs, columns, 'mouvements_stock')


# ---------------------------------------------------------------------------
# Stock Transfer ViewSet
# ---------------------------------------------------------------------------

class StockTransferViewSet(viewsets.ModelViewSet):
    """
    CRUD + workflow for stock transfers between stores.

    - list: transfers involving user's stores
    - create: create a transfer from current store
    - retrieve: transfer detail with lines
    - approve: approve and process the transfer (manager+)
    - receive: mark transfer as received at destination
    """

    serializer_class = StockTransferSerializer
    queryset = StockTransfer.objects.select_related(
        'from_store', 'to_store', 'created_by', 'approved_by',
    ).prefetch_related('lines', 'lines__product')
    filterset_fields = ['from_store', 'to_store', 'status']
    ordering_fields = ['created_at', 'status']
    http_method_names = ['get', 'post', 'head', 'options']

    def get_permissions(self):
        if self.action == 'approve':
            return [IsManagerOrAdmin(), FeatureStockManagementEnabled()]
        return [IsAuthenticated(), FeatureStockManagementEnabled()]

    def get_queryset(self):
        qs = super().get_queryset()
        store_ids = _user_store_ids(self.request.user)
        return qs.filter(Q(from_store_id__in=store_ids) | Q(to_store_id__in=store_ids))

    def create(self, request, *args, **kwargs):
        serializer = StockTransferCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data

        store_id = request.data.get('from_store_id')
        if not store_id:
            raise ValidationError({'from_store_id': 'Ce champ est requis.'})

        store_ids = {str(x) for x in _user_store_ids(request.user)}
        if str(store_id) not in store_ids:
            raise PermissionDenied("Vous n'avez pas acces a cette boutique source.")
        if str(d['to_store']) == str(store_id):
            raise ValidationError({'to_store': 'La boutique destination doit etre differente.'})

        from_store = Store.objects.get(pk=store_id)
        to_store = Store.objects.get(pk=d['to_store'])
        if from_store.enterprise_id != to_store.enterprise_id:
            raise ValidationError({'to_store': 'La boutique destination doit appartenir a la meme entreprise.'})
        enterprise_id = _user_enterprise_id(request.user)

        transfer = StockTransfer.objects.create(
            from_store=from_store,
            to_store=to_store,
            created_by=request.user,
            notes=d.get('notes', ''),
        )

        lines_data = []
        for line in d['lines']:
            product = Product.objects.get(
                pk=line['product_id'],
                enterprise_id=enterprise_id,
                track_stock=True,
            )
            lines_data.append(StockTransferLine(
                transfer=transfer,
                product=product,
                quantity=line['quantity'],
            ))
        StockTransferLine.objects.bulk_create(lines_data)

        transfer.refresh_from_db()
        out = StockTransferSerializer(transfer).data
        return Response(out, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve and process the transfer (deduct source, add destination)."""
        transfer = self.get_object()
        if transfer.status != StockTransfer.Status.PENDING:
            raise ValidationError({'detail': 'Seuls les transferts en attente peuvent etre approuves.'})

        transfer.status = StockTransfer.Status.APPROVED
        transfer.approved_by = request.user
        transfer.save(update_fields=['status', 'approved_by', 'updated_at'])

        from stock.services import process_transfer
        process_transfer(transfer, actor=request.user)

        transfer.refresh_from_db()
        return Response(StockTransferSerializer(transfer).data)

    @action(detail=True, methods=['post'])
    def receive(self, request, pk=None):
        """Mark the transfer as received at destination."""
        transfer = self.get_object()
        if transfer.status not in (StockTransfer.Status.APPROVED, StockTransfer.Status.IN_TRANSIT):
            raise ValidationError({'detail': 'Ce transfert ne peut pas etre marque comme recu.'})

        user_stores = {str(x) for x in _user_store_ids(request.user)}
        if str(transfer.to_store_id) not in user_stores:
            raise PermissionDenied("Seule la boutique destination peut confirmer la reception.")

        transfer.status = StockTransfer.Status.RECEIVED
        transfer.save(update_fields=['status', 'updated_at'])
        transfer.lines.update(received_qty=F('quantity'))

        transfer.refresh_from_db()
        return Response(StockTransferSerializer(transfer).data)


# ---------------------------------------------------------------------------
# Stock Count ViewSet
# ---------------------------------------------------------------------------

class StockCountViewSet(viewsets.ModelViewSet):
    """
    CRUD + workflow for inventory counts.

    - list: counts for user's stores
    - create: starts a new count (auto-populates lines from current stock)
    - retrieve: count detail with all lines
    - update_lines: bulk save counted quantities
    - complete: finalize the count and generate adjustment movements
    """

    serializer_class = StockCountSerializer
    queryset = StockCount.objects.select_related(
        'store', 'created_by',
    ).prefetch_related('lines', 'lines__product')
    filterset_fields = ['store', 'status']
    ordering_fields = ['created_at', 'status', 'completed_at']
    http_method_names = ['get', 'post', 'patch', 'head', 'options']
    permission_classes = [IsAuthenticated, FeatureStockManagementEnabled]

    def get_queryset(self):
        qs = super().get_queryset()
        store_ids = _user_store_ids(self.request.user)
        return qs.filter(store_id__in=store_ids)

    def create(self, request, *args, **kwargs):
        serializer = StockCountCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        store_id = request.data.get('store_id')
        if not store_id:
            raise ValidationError({'store_id': 'Ce champ est requis.'})

        store_ids = {str(x) for x in _user_store_ids(request.user)}
        if str(store_id) not in store_ids:
            raise PermissionDenied("Vous n'avez pas acces a cette boutique.")

        store = Store.objects.get(pk=store_id)
        count = StockCount.objects.create(
            store=store,
            status=StockCount.Status.IN_PROGRESS,
            created_by=request.user,
            notes=serializer.validated_data.get('notes', ''),
        )

        # Auto-populate lines from current ProductStock
        stock_rows = ProductStock.objects.filter(
            store=store,
            product__track_stock=True,
        ).select_related('product')
        lines = [
            StockCountLine(
                stock_count=count,
                product=ps.product,
                system_qty=ps.quantity,
            )
            for ps in stock_rows
        ]
        StockCountLine.objects.bulk_create(lines)

        count.refresh_from_db()
        return Response(StockCountSerializer(count).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['patch'], url_path='update-lines')
    def update_lines(self, request, pk=None):
        """Bulk update counted quantities on count lines."""
        count = self.get_object()
        if count.status != StockCount.Status.IN_PROGRESS:
            raise ValidationError({'detail': "L'inventaire n'est plus en cours."})

        serializer = StockCountUpdateLinesSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        line_map = {str(line.id): line for line in count.lines.all()}
        for update in serializer.validated_data['lines']:
            line = line_map.get(str(update['id']))
            if line:
                line.counted_qty = update['counted_qty']
                line.save(update_fields=['counted_qty', 'updated_at'])

        count.refresh_from_db()
        return Response(StockCountSerializer(count).data)

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """Finalize the count and create adjustment movements for variances."""
        count = self.get_object()
        if count.status != StockCount.Status.IN_PROGRESS:
            raise ValidationError({'detail': "L'inventaire n'est plus en cours."})

        from stock.services import complete_stock_count
        complete_stock_count(count, actor=request.user)

        count.refresh_from_db()
        return Response(StockCountSerializer(count).data)


# ---------------------------------------------------------------------------
# Customer ViewSet
# ---------------------------------------------------------------------------

class CustomerViewSet(viewsets.ModelViewSet):
    """
    CRUD for customers (enterprise-scoped).

    Search by name and phone.
    Filtered to user's enterprise.
    """

    serializer_class = CustomerSerializer
    queryset = Customer.objects.all()
    permission_classes = [IsAuthenticated]
    filterset_fields = ['is_active']
    search_fields = ['first_name', 'last_name', 'phone']
    ordering_fields = ['last_name', 'created_at', 'is_active']

    def get_permissions(self):
        if self.action == 'import_csv':
            return [IsManagerOrAdmin(), ModuleCustomerEnabled()]
        return [IsAuthenticated(), ModuleCustomerEnabled()]

    def get_queryset(self):
        qs = super().get_queryset()
        return _filter_queryset_by_enterprise(qs, self.request.user)

    def perform_create(self, serializer):
        """Inject enterprise from user's stores and track who created the customer."""
        enterprise_id = _require_user_enterprise_id(self.request.user)
        serializer.save(enterprise_id=enterprise_id, created_by=self.request.user)

    @action(detail=False, methods=['get'], url_path='export-csv')
    def export_csv(self, request):
        """Export filtered customers to a CSV file."""
        from core.export import queryset_to_csv_response
        qs = self.filter_queryset(self.get_queryset())
        columns = [
            ('first_name', 'Prenom'),
            ('last_name', 'Nom'),
            ('email', 'Email'),
            ('phone', 'Telephone'),
            ('address', 'Adresse'),
            (lambda o: o.created_at.strftime('%d/%m/%Y'), 'Date creation'),
        ]
        return queryset_to_csv_response(qs, columns, 'clients')

    @action(detail=False, methods=['post'], url_path='import-csv')
    def import_csv(self, request):
        """Bulk import customers from CSV file."""
        content = _decode_uploaded_csv(request.FILES.get('file'))
        reader = _build_csv_dict_reader(content)
        if not reader.fieldnames:
            raise ValidationError({'file': 'En-tetes CSV introuvables.'})

        header_map = {
            _normalize_header(col): col
            for col in reader.fieldnames
            if col is not None and str(col).strip() != ""
        }
        if not header_map:
            raise ValidationError({'file': 'Le CSV ne contient aucun en-tete exploitable.'})

        enterprise_id = _require_user_enterprise_id(request.user)
        base_qs = Customer.objects.filter(enterprise_id=enterprise_id, is_default=False)

        total_rows = 0
        created = 0
        updated = 0
        skipped = 0
        error_count = 0
        errors = []

        for line_no, row in enumerate(reader, start=2):
            total_rows += 1
            row_values = [
                str(v).strip() if v is not None else ""
                for v in row.values()
            ]
            if not any(row_values):
                skipped += 1
                continue

            try:
                first_name = _row_value(row, header_map, 'first_name', 'prenom', 'firstname')
                last_name = _row_value(row, header_map, 'last_name', 'nom', 'lastname')
                full_name = _row_value(row, header_map, 'full_name', 'nom_complet', 'client')
                if full_name and (not first_name or not last_name):
                    chunks = [chunk for chunk in full_name.split(' ') if chunk]
                    if chunks:
                        if not first_name:
                            first_name = chunks[0]
                        if not last_name:
                            last_name = " ".join(chunks[1:]) if len(chunks) > 1 else chunks[0]

                phone = _row_value(row, header_map, 'phone', 'telephone', 'tel', 'numero')
                email = _row_value(row, header_map, 'email', 'mail').lower()
                address = _row_value(row, header_map, 'address', 'adresse')
                company = _row_value(row, header_map, 'company', 'entreprise', 'societe')
                tax_id = _row_value(row, header_map, 'tax_id', 'taxid', 'numero_fiscal')
                notes = _row_value(row, header_map, 'notes', 'note')
                is_active = _parse_bool_field(
                    _row_value(row, header_map, 'is_active', 'actif', 'active'),
                    default=True,
                )

                if not first_name:
                    raise ValueError('Prenom manquant.')
                if not last_name:
                    raise ValueError('Nom manquant.')
                if not phone:
                    raise ValueError('Telephone manquant.')

                customer = None
                if email:
                    customer = base_qs.filter(email__iexact=email).first()
                if customer is None:
                    customer = base_qs.filter(
                        phone=phone,
                        first_name__iexact=first_name,
                        last_name__iexact=last_name,
                    ).first()

                if customer:
                    customer.first_name = first_name
                    customer.last_name = last_name
                    customer.phone = phone
                    customer.email = email
                    customer.address = address
                    customer.company = company
                    customer.tax_id = tax_id
                    customer.notes = notes
                    customer.is_active = is_active
                    customer.save(
                        update_fields=[
                            'first_name', 'last_name', 'phone', 'email',
                            'address', 'company', 'tax_id', 'notes',
                            'is_active', 'updated_at',
                        ]
                    )
                    updated += 1
                else:
                    Customer.objects.create(
                        enterprise_id=enterprise_id,
                        first_name=first_name,
                        last_name=last_name,
                        phone=phone,
                        email=email,
                        address=address,
                        company=company,
                        tax_id=tax_id,
                        notes=notes,
                        is_active=is_active,
                    )
                    created += 1
            except Exception as exc:
                error_count += 1
                if len(errors) < 50:
                    errors.append({'line': line_no, 'message': str(exc)})

        return Response({
            'detail': "Import CSV termine.",
            'total_rows': total_rows,
            'created': created,
            'updated': updated,
            'skipped': skipped,
            'error_count': error_count,
            'errors': errors,
        })


# ---------------------------------------------------------------------------
# Sale ViewSet
# ---------------------------------------------------------------------------

class SaleViewSet(viewsets.ModelViewSet):
    """
    ViewSet for sales with custom workflow actions.

    - list: filter by store, status, seller, date range
    - create: creates a DRAFT sale
    - submit: submits the sale to the cashier for payment
    - cancel: cancels the sale (requires manager)
    - add_item: adds an item to a draft sale
    - remove_item: removes an item from a draft sale
    """

    serializer_class = SaleSerializer
    queryset = Sale.objects.select_related(
        'store', 'seller', 'customer', 'source_quote',
    ).prefetch_related('items', 'items__product', 'payments__cashier')
    filterset_fields = ['store', 'status', 'seller', 'customer', 'is_credit_sale']
    search_fields = [
        'invoice_number',
        'customer__first_name',
        'customer__last_name',
        'customer__phone',
        'seller__first_name',
        'seller__last_name',
        'seller__email',
    ]
    ordering_fields = [
        'created_at',
        'total',
        'invoice_number',
        'status',
        'amount_due',
        'seller__last_name',
        'seller__first_name',
    ]
    pagination_class = StandardResultsSetPagination

    def get_permissions(self):
        if self.action in ('create', 'add_item', 'set_item_quantity', 'remove_item', 'submit', 'apply_coupon', 'remove_coupon', 'set_delivery', 'remove_delivery'):
            return [IsSales(), FeatureSalesPOSEnabled()]
        if self.action == 'set_item_unit_price':
            return [IsSales(), FeatureSalesPOSEnabled()]
        if self.action == 'cancel':
            return [IsManagerOrAdmin(), FeatureSalesPOSEnabled()]
        return [IsAuthenticated(), FeatureSalesPOSEnabled()]

    def get_queryset(self):
        qs = super().get_queryset()
        store_ids = _user_store_ids(self.request.user)
        qs = qs.filter(store_id__in=store_ids)

        # Pure SALES role only sees own sales; SALES_CASHIER sees all store
        # sales so they can process payments for other sellers.
        user_role = getattr(self.request.user, "role", None)
        if self.action == "list" and user_role == "SALES":
            qs = qs.filter(seller=self.request.user)

        # Optional multi-status filter used by cashier queues.
        status_in = self.request.query_params.get("status_in")
        if status_in:
            allowed_statuses = {choice[0] for choice in Sale.Status.choices}
            requested_statuses = [
                raw_status.strip()
                for raw_status in status_in.split(",")
                if raw_status.strip()
            ]
            statuses = [
                sale_status
                for sale_status in requested_statuses
                if sale_status in allowed_statuses
            ]
            qs = qs.filter(status__in=statuses) if statuses else qs.none()

        # Date range filtering
        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        if date_from:
            qs = qs.filter(created_at__date__gte=date_from)
        if date_to:
            qs = qs.filter(created_at__date__lte=date_to)

        cashier_id = self.request.query_params.get('cashier')
        if cashier_id:
            qs = qs.filter(payments__cashier_id=cashier_id).distinct()

        shift_id = self.request.query_params.get('shift')
        if shift_id:
            qs = qs.filter(payments__shift_id=shift_id).distinct()

        return qs

    def perform_update(self, serializer):
        """Override to recalculate totals when discount/fields change."""
        sale = self.get_object()
        discount_changed = (
            'discount_percent' in serializer.validated_data
            or 'discount_amount' in serializer.validated_data
        )
        if discount_changed and sale.status not in (Sale.Status.DRAFT, Sale.Status.PENDING_PAYMENT):
            raise ValidationError(
                "Impossible de modifier la remise apres un paiement partiel ou total."
            )
        sale = serializer.save()
        from sales.services import recalculate_sale
        recalculate_sale(sale)

    def create(self, request, *args, **kwargs):
        """Create a new DRAFT sale.

        Validates that:
        - The user has access to the requested store.
        - The customer (if any) belongs to the same store.
        """
        serializer = SaleCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        store_id = serializer.validated_data['store_id']

        # --- Store isolation: verify user access ---
        store_ids = _user_store_ids(request.user)
        if store_id not in store_ids:
            return Response(
                {'detail': "Vous n'avez pas acces a cette boutique."},
                status=status.HTTP_403_FORBIDDEN,
            )
        try:
            store = Store.objects.get(pk=store_id, is_active=True)
        except Store.DoesNotExist:
            return Response(
                {'detail': 'Boutique introuvable.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        # --- Customer isolation: must belong to the same enterprise ---
        customer = None
        customer_id = serializer.validated_data.get('customer_id')
        if customer_id:
            try:
                customer = Customer.objects.get(
                    pk=customer_id, enterprise=store.enterprise,
                )
            except Customer.DoesNotExist:
                return Response(
                    {'detail': 'Client introuvable dans cette entreprise.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            # Default walk-in customer (created at enterprise creation; fallback
            # here for existing datasets).
            try:
                from customers.services import get_or_create_default_customer
                customer = get_or_create_default_customer(enterprise=store.enterprise)
            except Exception:
                customer = None

        from sales.services import create_sale
        sale = create_sale(
            store=store,
            seller=request.user,
            customer=customer,
        )

        # Apply optional fields
        if serializer.validated_data.get('discount_percent'):
            sale.discount_percent = serializer.validated_data['discount_percent']
        if serializer.validated_data.get('notes'):
            sale.notes = serializer.validated_data['notes']
        if sale.discount_percent or sale.notes:
            sale.save(update_fields=['discount_percent', 'notes', 'updated_at'])

        return Response(
            SaleSerializer(sale).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['post'], url_path='submit')
    def submit(self, request, pk=None):
        """Submit the sale to the cashier for payment processing.

        Delegates to ``sales.services.submit_sale_to_cashier`` so that
        invoice number generation + audit logging are always applied.
        """
        sale = self.get_object()
        try:
            from sales.services import submit_sale_to_cashier
            sale = submit_sale_to_cashier(sale, actor=request.user)
        except ValueError as e:
            return Response(
                {'detail': str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(SaleSerializer(sale).data)

    @action(detail=True, methods=['post'], url_path='cancel')
    def cancel(self, request, pk=None):
        """Cancel the sale. Requires manager or admin role.

        Delegates to ``sales.services.cancel_sale``.
        """
        sale = self.get_object()
        reason = request.data.get('reason', '')
        try:
            from sales.services import cancel_sale
            sale = cancel_sale(sale, reason=reason, actor=request.user)
        except ValueError as e:
            return Response(
                {'detail': str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(SaleSerializer(sale).data)

    @action(detail=True, methods=['post'], url_path='add-item')
    def add_item(self, request, pk=None):
        """Add an item to a draft sale.

        Delegates to ``sales.services.add_item_to_sale`` so that stock
        availability is checked and the sale totals are recalculated.

        If ``unit_price_override`` is provided, user must have permission
        to override prices in the sale store.
        """
        sale = self.get_object()

        if sale.status not in (Sale.Status.DRAFT, Sale.Status.PENDING_PAYMENT):
            return Response(
                {'detail': 'Les articles ne peuvent etre ajoutes qu\'avant encaissement.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = SaleAddItemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        enterprise_id = _user_enterprise_id(request.user)
        try:
            product = Product.objects.get(
                pk=serializer.validated_data['product_id'],
                enterprise_id=enterprise_id,
            )
        except Product.DoesNotExist:
            return Response(
                {'detail': 'Produit introuvable dans votre entreprise.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        quantity = serializer.validated_data['quantity']
        discount_amount = serializer.validated_data.get('discount_amount', Decimal('0.00'))
        unit_price_override = serializer.validated_data.get('unit_price_override')

        # Check override permission and bounds
        if unit_price_override is not None:
            if not _can_override_price_for_store(request.user, sale.store):
                return Response(
                    {'detail': "Vous n'avez pas la permission de modifier le prix de vente."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if unit_price_override <= Decimal('0'):
                return Response(
                    {'detail': 'Le prix doit etre strictement positif.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        try:
            from sales.services import add_item_to_sale
            add_item_to_sale(
                sale=sale,
                product=product,
                qty=quantity,
                discount=discount_amount,
                unit_price=unit_price_override,
                actor=request.user,
            )
        except ValueError as e:
            return Response(
                {'detail': str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        sale.refresh_from_db()
        return Response(SaleSerializer(sale).data)

    @action(detail=True, methods=['post'], url_path='remove-item')
    def remove_item(self, request, pk=None):
        """Remove an item from a draft sale."""
        sale = self.get_object()

        if sale.status not in (Sale.Status.DRAFT, Sale.Status.PENDING_PAYMENT):
            return Response(
                {'detail': 'Les articles ne peuvent etre retires qu\'avant encaissement.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        item_id = request.data.get('item_id')
        if not item_id:
            return Response(
                {'detail': 'item_id est requis.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            item = sale.items.get(pk=item_id)
        except SaleItem.DoesNotExist:
            return Response(
                {'detail': 'Article introuvable dans cette vente.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        # UX: the SPA uses this endpoint for both decrement and delete.
        # If qty > 1, decrement by 1; else remove the line.
        if item.quantity and item.quantity > 1:
            item.quantity -= 1
            item.save(update_fields=["quantity"])
        else:
            item.delete()

        # Recalculate sale totals (also clears any prefetched cache).
        from sales.services import recalculate_sale
        recalculate_sale(sale)

        # Reload through the viewset queryset so response contains up-to-date items.
        sale = self.get_queryset().get(pk=sale.pk)
        return Response(SaleSerializer(sale).data)

    @action(detail=True, methods=['post'], url_path='set-item-quantity')
    def set_item_quantity(self, request, pk=None):
        """Set an exact quantity for one item in a draft sale."""
        sale = self.get_object()

        if sale.status not in (Sale.Status.DRAFT, Sale.Status.PENDING_PAYMENT):
            return Response(
                {'detail': 'La quantite ne peut etre modifiee qu\'avant encaissement.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = SaleSetItemQuantitySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        item_id = serializer.validated_data['item_id']
        quantity = serializer.validated_data['quantity']

        try:
            from sales.services import update_item_quantity
            update_item_quantity(
                sale=sale,
                item_id=item_id,
                new_qty=quantity,
                actor=request.user,
            )
        except ValueError as e:
            return Response(
                {'detail': str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        sale = self.get_queryset().get(pk=sale.pk)
        return Response(SaleSerializer(sale).data)

    @action(detail=True, methods=['post'], url_path='set-item-unit-price')
    def set_item_unit_price(self, request, pk=None):
        """Set an exact unit price for one item in a draft sale."""
        sale = self.get_object()

        if sale.status not in (Sale.Status.DRAFT, Sale.Status.PENDING_PAYMENT):
            return Response(
                {'detail': 'Le prix ne peut etre modifie qu\'avant encaissement.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not _can_override_price_for_store(request.user, sale.store):
            return Response(
                {'detail': "Vous n'avez pas la permission de modifier le prix de vente."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = SaleSetItemUnitPriceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        item_id = serializer.validated_data['item_id']
        unit_price = serializer.validated_data['unit_price']

        try:
            from sales.services import update_item_unit_price
            update_item_unit_price(
                sale=sale,
                item_id=item_id,
                new_unit_price=unit_price,
                actor=request.user,
            )
        except ValueError as e:
            return Response(
                {'detail': str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        sale = self.get_queryset().get(pk=sale.pk)
        return Response(SaleSerializer(sale).data)

    @action(detail=True, methods=["get"], url_path="invoice")
    def invoice(self, request, pk=None):
        """Generate and return an invoice PDF for a sale.

        SPA-friendly endpoint that uses API authentication (JWT cookie/header).

        Query params:
        - kind: invoice (default). Proforma/devis are now managed via Quotes.
        """
        sale = self.get_object()
        kind = (request.query_params.get("kind") or "invoice").strip().lower()
        if kind in ("proforma", "quote"):
            return Response(
                {
                    "detail": "Les proformas et devis sont desormais geres via le module Devis. "
                    "Utilisez /api/v1/quotes/ pour creer un devis ou une facture proforma."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            return generate_invoice_pdf(sale=sale, store=sale.store, document_kind=kind)
        except Exception:
            return Response(
                {"detail": "Impossible de generer la facture pour cette vente."},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=True, methods=["get"], url_path="receipt")
    def receipt(self, request, pk=None):
        """Generate and return a receipt/ticket PDF for a sale.

        Query params:
        - template: ticket | compact | modern (also accepts invoice aliases).
        - download: 1/true/on to force attachment download.
        """
        sale = self.get_object()
        template_code = (request.query_params.get("template") or "").strip()
        as_attachment = (request.query_params.get("download") or "").strip().lower() in {
            "1", "true", "yes", "on",
        }
        try:
            payments = sale.payments.all().order_by("created_at")
        except Exception:
            payments = None
        try:
            return generate_receipt_pdf(
                sale=sale,
                store=sale.store,
                payments=payments,
                cashier_name=request.user.get_full_name(),
                template_code=template_code,
                as_attachment=as_attachment,
            )
        except Exception:
            return Response(
                {"detail": "Impossible de generer le recu pour cette vente."},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=True, methods=['post'], url_path='apply-coupon')
    def apply_coupon(self, request, pk=None):
        """Apply a coupon code to a draft sale.

        POST /api/v1/sales/{id}/apply-coupon/
        Body: { "code": "PROMO10" }
        """
        sale = self.get_object()

        if sale.status not in (Sale.Status.DRAFT, Sale.Status.PENDING_PAYMENT):
            return Response(
                {'detail': 'Le coupon ne peut etre applique qu\'avant encaissement.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        code = (request.data.get('code') or '').strip().upper()
        if not code:
            return Response(
                {'detail': 'Le code coupon est requis.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            coupon = Coupon.objects.get(code=code, store=sale.store)
        except Coupon.DoesNotExist:
            return Response(
                {'detail': 'Code coupon invalide ou inapplicable a cette boutique.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        is_valid, error_msg = coupon.is_valid(order_amount=sale.subtotal)
        if not is_valid:
            return Response({'detail': error_msg}, status=status.HTTP_400_BAD_REQUEST)

        # Apply coupon discount to the sale
        if coupon.discount_type == Coupon.DiscountType.PERCENT:
            sale.discount_percent = coupon.discount_value
            sale.discount_amount = Decimal('0.00')
        else:
            sale.discount_amount = coupon.discount_value
            sale.discount_percent = Decimal('0.00')

        sale.coupon = coupon
        sale.coupon_code = coupon.code
        sale.recalculate_totals()
        sale.save(update_fields=[
            'discount_percent', 'discount_amount', 'subtotal', 'tax_amount',
            'total', 'amount_due', 'coupon', 'coupon_code', 'updated_at',
        ])

        # Increment coupon usage counter so max_uses limit is enforced
        Coupon.objects.filter(pk=coupon.pk).update(uses_count=models.F('uses_count') + 1)

        sale = self.get_queryset().get(pk=sale.pk)
        return Response(SaleSerializer(sale).data)

    @action(detail=True, methods=['post'], url_path='remove-coupon')
    def remove_coupon(self, request, pk=None):
        """Remove the coupon from a draft sale and reset discount."""
        sale = self.get_object()

        if sale.status not in (Sale.Status.DRAFT, Sale.Status.PENDING_PAYMENT):
            return Response(
                {'detail': 'Le coupon ne peut etre retire qu\'avant encaissement.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        old_coupon = sale.coupon
        sale.coupon = None
        sale.coupon_code = ''
        sale.discount_percent = Decimal('0.00')
        sale.discount_amount = Decimal('0.00')
        sale.recalculate_totals()
        sale.save(update_fields=[
            'discount_percent', 'discount_amount', 'subtotal', 'tax_amount',
            'total', 'amount_due', 'coupon', 'coupon_code', 'updated_at',
        ])

        # Decrement coupon usage counter when removed
        if old_coupon:
            Coupon.objects.filter(pk=old_coupon.pk, uses_count__gt=0).update(
                uses_count=models.F('uses_count') - 1,
            )

        sale = self.get_queryset().get(pk=sale.pk)
        return Response(SaleSerializer(sale).data)

    @action(detail=True, methods=["post"], url_path="set-delivery")
    def set_delivery(self, request, pk=None):
        """Attach a delivery to a draft sale and update delivery_fee."""
        from delivery.models import Delivery, DeliveryZone, DeliveryAgent, DeliveryPickupLocation
        from sales.services import recalculate_sale

        sale = self.get_object()
        if sale.status not in (Sale.Status.DRAFT, Sale.Status.PENDING_PAYMENT):
            return Response(
                {"detail": "Impossible de modifier la livraison après encaissement."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Cancel any existing pending delivery
        sale.deliveries.filter(status__in=["PENDING", "PREPARING"]).update(status=Delivery.Status.CANCELLED)

        zone_id = request.data.get("zone_id")
        zone = None
        if zone_id:
            try:
                zone = DeliveryZone.objects.get(pk=zone_id, store=sale.store)
            except DeliveryZone.DoesNotExist:
                return Response({"detail": "Zone introuvable."}, status=status.HTTP_400_BAD_REQUEST)

        fee_raw = request.data.get("delivery_fee")
        delivery_fee = Decimal(str(fee_raw)) if fee_raw is not None else (zone.fee if zone else Decimal("0.00"))

        agent_id = request.data.get("agent_id")
        agent = None
        if agent_id:
            try:
                agent = DeliveryAgent.objects.get(pk=agent_id, store=sale.store, is_active=True)
            except DeliveryAgent.DoesNotExist:
                return Response({"detail": "Livreur introuvable."}, status=status.HTTP_400_BAD_REQUEST)

        pickup_location = None
        ploc_id = request.data.get("pickup_location_id")
        if ploc_id:
            pickup_location = DeliveryPickupLocation.objects.filter(pk=ploc_id, store=sale.store).first()

        is_broadcast = not bool(agent)
        customer = sale.customer
        delivery = Delivery.objects.create(
            store=sale.store,
            sale=sale,
            zone=zone,
            agent=agent,
            seller=request.user,
            is_broadcast=is_broadcast,
            status=Delivery.Status.PENDING,
            recipient_name=request.data.get("recipient_name") or (customer.full_name if customer else ""),
            recipient_phone=request.data.get("recipient_phone") or (getattr(customer, "phone", "") if customer else ""),
            delivery_address=request.data.get("delivery_address", ""),
            payout_amount=zone.fee if zone else Decimal("0.00"),
            pickup_location=pickup_location,
            pickup_notes=request.data.get("pickup_notes", ""),
        )

        if is_broadcast:
            try:
                from api.v1.delivery_views import _broadcast_to_agents
                _broadcast_to_agents(delivery)
            except Exception:
                pass

        sale.delivery_fee = delivery_fee
        sale.save(update_fields=["delivery_fee", "updated_at"])
        recalculate_sale(sale)

        sale = self.get_queryset().get(pk=sale.pk)
        return Response(SaleSerializer(sale).data)

    @action(detail=True, methods=["post"], url_path="remove-delivery")
    def remove_delivery(self, request, pk=None):
        """Remove delivery from a draft sale and reset delivery_fee."""
        from delivery.models import Delivery
        from sales.services import recalculate_sale

        sale = self.get_object()
        if sale.status not in (Sale.Status.DRAFT, Sale.Status.PENDING_PAYMENT):
            return Response(
                {"detail": "Impossible de modifier la livraison après encaissement."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        sale.deliveries.filter(status__in=["PENDING", "PREPARING"]).update(status=Delivery.Status.CANCELLED)
        sale.delivery_fee = Decimal("0.00")
        sale.save(update_fields=["delivery_fee", "updated_at"])
        recalculate_sale(sale)

        sale = self.get_queryset().get(pk=sale.pk)
        return Response(SaleSerializer(sale).data)

    @action(detail=False, methods=['get'], url_path='export-csv')
    def export_csv(self, request):
        """Export filtered sales to a CSV file."""
        from core.export import queryset_to_csv_response
        qs = self.filter_queryset(self.get_queryset()).select_related('customer', 'seller')
        columns = [
            ('invoice_number', 'Reference'),
            (lambda o: o.created_at.strftime('%d/%m/%Y %H:%M'), 'Date'),
            (lambda o: o.customer.full_name if o.customer else '', 'Client'),
            (lambda o: o.seller.get_full_name() if o.seller else '', 'Vendeur'),
            ('status', 'Statut'),
            ('total', 'Total'),
            ('discount_amount', 'Remise'),
            ('amount_due', 'Net'),
        ]
        return queryset_to_csv_response(qs, columns, 'ventes')


# ---------------------------------------------------------------------------
# Payment ViewSet (List + Create)
# ---------------------------------------------------------------------------

class PaymentViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    """
    List and create payments.

    - List: filtered by user's accessible stores.
    - Create: processes one or more payments against a sale.
      Requires CanProcessPayment permission.
    """

    serializer_class = PaymentSerializer
    queryset = Payment.objects.select_related('sale', 'cashier', 'shift')
    filterset_fields = ['sale', 'method', 'store', 'shift']
    search_fields = [
        'reference',
        'sale__invoice_number',
        'cashier__first_name',
        'cashier__last_name',
        'cashier__email',
    ]
    ordering_fields = ['created_at']
    pagination_class = StandardResultsSetPagination

    def get_permissions(self):
        if self.action == 'create':
            return [CanProcessPayment(), FeatureCashierOperationsEnabled()]
        return [IsAuthenticated(), FeatureCashierOperationsEnabled()]

    def get_queryset(self):
        qs = super().get_queryset()
        store_ids = _user_store_ids(self.request.user)
        return qs.filter(store_id__in=store_ids)

    def create(self, request, *args, **kwargs):
        """Process payment(s) for a sale.

        Delegates to ``cashier.services.process_payment`` which handles:
        - Atomic transaction with ``select_for_update``
        - Stock decrement on full payment
        - Credit ledger entries for credit payments
        - Shift totals update
        - Audit logging
        """
        serializer = PaymentCreateSerializer(
            data=request.data,
            context={'request': request},
        )
        serializer.is_valid(raise_exception=True)

        # --- Resolve sale and validate store access ---
        try:
            sale = Sale.objects.get(pk=serializer.validated_data['sale_id'])
        except Sale.DoesNotExist:
            return Response(
                {'detail': 'Vente introuvable.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        store_ids = _user_store_ids(request.user)
        if sale.store_id not in store_ids:
            return Response(
                {'detail': "Vous n'avez pas acces a cette boutique."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # --- Find current open shift ---
        try:
            shift = CashShift.objects.get(
                cashier=request.user,
                store=sale.store,
                status=CashShift.Status.OPEN,
            )
        except CashShift.DoesNotExist:
            return Response(
                {'detail': 'Aucune session de caisse ouverte. Veuillez ouvrir une session.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # --- Delegate to the service layer ---
        try:
            from cashier.services import process_payment
            created_payments = process_payment(
                sale=sale,
                payments_data=serializer.validated_data['payments'],
                cashier=request.user,
                shift=shift,
            )
        except ValueError as e:
            return Response(
                {'detail': str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            PaymentSerializer(created_payments, many=True).data,
            status=status.HTTP_201_CREATED,
        )


# ---------------------------------------------------------------------------
# CashShift ViewSet
# ---------------------------------------------------------------------------

class CashShiftViewSet(viewsets.ModelViewSet):
    """
    ViewSet for cash shifts with open/close workflow actions.

    - list/retrieve: filtered by user's accessible stores.
    - open_shift: opens a new cash shift for the current user.
    - close_shift: closes the current open shift.
    - current: returns the current open shift for the user.
    """

    serializer_class = CashShiftSerializer
    queryset = CashShift.objects.select_related('store', 'cashier')
    filterset_fields = ['store', 'cashier', 'status']
    ordering_fields = ['opened_at', 'closed_at']
    permission_classes = [IsCashier, FeatureCashierOperationsEnabled]

    def get_queryset(self):
        qs = super().get_queryset()
        store_ids = _user_store_ids(self.request.user)
        return qs.filter(store_id__in=store_ids)

    @action(detail=False, methods=['post'], url_path='open')
    def open_shift(self, request):
        """Open a new cash shift for the current user."""
        serializer = CashShiftOpenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        store_id = serializer.validated_data['store']

        try:
            store = Store.objects.get(pk=store_id, is_active=True)
        except Store.DoesNotExist:
            return Response(
                {'detail': 'Boutique introuvable.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Check user has access to this store
        if not request.user.is_superuser:
            if not StoreUser.objects.filter(user=request.user, store=store).exists():
                return Response(
                    {'detail': 'Vous n\'avez pas acces a cette boutique.'},
                    status=status.HTTP_403_FORBIDDEN,
                )

        # Check no existing open shift
        existing = CashShift.objects.filter(
            cashier=request.user,
            store=store,
            status=CashShift.Status.OPEN,
        ).first()
        if existing:
            return Response(
                {'detail': 'Vous avez deja une session de caisse ouverte dans cette boutique.',
                 'shift': CashShiftSerializer(existing).data},
                status=status.HTTP_400_BAD_REQUEST,
            )

        shift = CashShift.objects.create(
            store=store,
            cashier=request.user,
            opening_float=serializer.validated_data['opening_float'],
        )

        return Response(
            CashShiftSerializer(shift).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['post'], url_path='close')
    def close_shift(self, request, pk=None):
        """Close the specified cash shift."""
        shift = self.get_object()

        if shift.status != CashShift.Status.OPEN:
            return Response(
                {'detail': 'Cette session de caisse est deja fermee.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if shift.cashier != request.user and request.user.role not in ('ADMIN', 'MANAGER'):
            return Response(
                {'detail': 'Vous ne pouvez fermer que votre propre session.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = CashShiftCloseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        shift.closing_cash = serializer.validated_data['closing_cash']
        shift.calculate_expected_cash()
        shift.variance = shift.closing_cash - shift.expected_cash
        shift.status = CashShift.Status.CLOSED
        shift.closed_at = timezone.now()
        shift.notes = serializer.validated_data.get('notes', '')
        shift.save()

        return Response(CashShiftSerializer(shift).data)

    @action(detail=False, methods=['get'], url_path='current')
    def current(self, request):
        """Get the current open shift for the authenticated user."""
        store_id = request.query_params.get('store')
        filters = {
            'cashier': request.user,
            'status': CashShift.Status.OPEN,
        }
        if store_id:
            filters['store_id'] = store_id

        shift = CashShift.objects.filter(**filters).first()
        if not shift:
            return Response(
                {'detail': 'Aucune session de caisse ouverte.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(CashShiftSerializer(shift).data)

    @action(detail=True, methods=['get', 'post'], url_path='denominations')
    def denominations(self, request, pk=None):
        """List or save denominations for this shift."""
        shift = self.get_object()
        if request.method == 'GET':
            qs = CashShiftDenomination.objects.filter(shift=shift)
            serializer = CashShiftDenominationSerializer(qs, many=True)
            return Response({'count': qs.count(), 'results': serializer.data})
        # POST — upsert denomination
        serializer = CashShiftDenominationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        denomination = serializer.validated_data["denomination"]
        count = serializer.validated_data["count"]
        obj, _ = CashShiftDenomination.objects.update_or_create(
            shift=shift,
            denomination=denomination,
            defaults={"count": count},
        )
        return Response(CashShiftDenominationSerializer(obj).data, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# CustomerAccount ViewSet
# ---------------------------------------------------------------------------

class CustomerAccountViewSet(viewsets.ModelViewSet):
    """
    CRUD for customer credit accounts.

    Filter by store and customer.
    Filtered to user's accessible stores.
    """

    serializer_class = CustomerAccountSerializer
    queryset = CustomerAccount.objects.select_related('store', 'customer')
    filterset_fields = ['store', 'customer', 'is_active']
    ordering_fields = ['balance', 'created_at', 'credit_limit', 'is_active']
    permission_classes = [IsManagerOrAdmin, FeatureCreditManagementEnabled]

    def get_queryset(self):
        qs = super().get_queryset()
        store_ids = _user_store_ids(self.request.user)
        return qs.filter(store_id__in=store_ids)

    @action(detail=True, methods=['post'], url_path='pay')
    def pay(self, request, pk=None):
        """Record a credit payment against this account."""
        account = self.get_object()

        amount = request.data.get('amount')
        reference = request.data.get('reference', '')
        sale_id = request.data.get('sale_id')

        if not amount:
            raise ValidationError({'amount': 'Ce champ est requis.'})

        try:
            amount = Decimal(str(amount))
        except Exception:
            raise ValidationError({'amount': 'Montant invalide.'})

        sale = None
        if sale_id:
            try:
                sale = Sale.objects.get(pk=sale_id)
            except Sale.DoesNotExist:
                raise ValidationError({'sale_id': 'Facture introuvable.'})

            if sale.store_id != account.store_id or sale.customer_id != account.customer_id:
                raise ValidationError(
                    {'sale_id': "La facture selectionnee n'appartient pas a ce client dans cette boutique."},
                )

            has_credit_entry_for_sale = CreditLedgerEntry.objects.filter(
                account=account,
                sale=sale,
                entry_type=CreditLedgerEntry.EntryType.SALE_ON_CREDIT,
            ).exists()
            if not has_credit_entry_for_sale:
                raise ValidationError(
                    {'sale_id': "Cette facture n'est pas enregistree dans l'historique credit du client."},
                )

            if not reference and sale.invoice_number:
                reference = f"Paiement facture {sale.invoice_number}"

        try:
            from credits.services import record_credit_payment
            entry = record_credit_payment(
                account=account,
                amount=amount,
                reference=reference,
                actor=request.user,
                sale=sale,
            )
        except ValueError as e:
            raise ValidationError({'detail': str(e)})

        account.refresh_from_db()
        response_data = CustomerAccountSerializer(account).data
        response_data['payment_entry'] = CreditLedgerEntrySerializer(entry).data
        response_data['receipt_url'] = self.reverse_action(
            'payment-receipt',
            kwargs={'pk': str(account.pk), 'entry_id': str(entry.pk)},
        )
        return Response(response_data)

    @action(
        detail=True,
        methods=['get'],
        url_path=r'payments/(?P<entry_id>[^/.]+)/receipt',
        url_name='payment-receipt',
    )
    def payment_receipt(self, request, pk=None, entry_id=None):
        """Return a printable PDF receipt for a credit payment ledger entry."""
        account = self.get_object()
        entry = get_object_or_404(
            CreditLedgerEntry.objects.select_related('account', 'created_by', 'sale'),
            pk=entry_id,
            account=account,
            entry_type=CreditLedgerEntry.EntryType.CREDIT_PAYMENT,
        )

        if not account.is_active:
            raise PermissionDenied('Compte credit inactif.')

        return generate_credit_payment_receipt_pdf(
            account=account,
            entry=entry,
            store=account.store,
        )

    @action(detail=False, methods=['get'], url_path='export-csv')
    def export_csv(self, request):
        """Export filtered credit accounts to a CSV file."""
        from core.export import queryset_to_csv_response
        qs = self.filter_queryset(self.get_queryset()).select_related('customer')
        columns = [
            (lambda o: o.customer.full_name if o.customer else '', 'Client'),
            ('balance', 'Solde'),
            ('credit_limit', 'Limite'),
            (lambda o: o.created_at.strftime('%d/%m/%Y'), 'Date creation'),
        ]
        return queryset_to_csv_response(qs, columns, 'credits')


# ---------------------------------------------------------------------------
# CreditLedger ViewSet (Read-Only)
# ---------------------------------------------------------------------------

class CreditLedgerViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only viewset for credit ledger entries.

    Filter by account.
    """

    serializer_class = CreditLedgerEntrySerializer
    queryset = CreditLedgerEntry.objects.select_related(
        'account', 'account__store', 'account__customer', 'sale', 'created_by',
    )
    filterset_fields = ['account', 'sale']
    ordering_fields = ['created_at']
    permission_classes = [IsAuthenticated, FeatureCreditManagementEnabled]

    def get_queryset(self):
        qs = super().get_queryset()
        store_ids = _user_store_ids(self.request.user)
        return qs.filter(account__store_id__in=store_ids)


# ---------------------------------------------------------------------------
# PaymentSchedule ViewSet
# ---------------------------------------------------------------------------

class PaymentScheduleViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """List, retrieve, and update payment schedules."""

    serializer_class = PaymentScheduleSerializer
    queryset = PaymentSchedule.objects.select_related(
        'account', 'account__store', 'account__customer', 'sale',
    )
    filterset_fields = ['account', 'status']
    ordering_fields = ['due_date', 'created_at']
    permission_classes = [IsManagerOrAdmin, FeatureCreditManagementEnabled]

    def get_queryset(self):
        qs = super().get_queryset()
        store_ids = _user_store_ids(self.request.user)
        return qs.filter(account__store_id__in=store_ids)


# ---------------------------------------------------------------------------
# Purchases ViewSets
# ---------------------------------------------------------------------------

class SupplierViewSet(viewsets.ModelViewSet):
    serializer_class = SupplierSerializer
    queryset = Supplier.objects.select_related("enterprise")
    permission_classes = [IsManagerOrAdmin, FeaturePurchasesManagementEnabled]
    filterset_fields = ["is_active"]
    search_fields = ["name", "contact_name", "phone"]
    ordering_fields = ["name", "created_at"]

    def get_queryset(self):
        qs = super().get_queryset()
        return _filter_queryset_by_enterprise(qs, self.request.user)

    def perform_create(self, serializer):
        enterprise_id = _require_user_enterprise_id(self.request.user)
        serializer.save(enterprise_id=enterprise_id)


class PurchaseOrderViewSet(viewsets.ModelViewSet):
    serializer_class = PurchaseOrderSerializer
    queryset = PurchaseOrder.objects.select_related("store", "supplier", "created_by").prefetch_related("lines", "lines__product")
    permission_classes = [IsManagerOrAdmin, IsStoreMember, FeaturePurchasesManagementEnabled]
    filterset_fields = ["store", "supplier", "status"]
    search_fields = ["po_number"]
    ordering_fields = ["created_at", "po_number", "status", "subtotal"]

    def get_serializer_class(self):
        if self.action == "create":
            return PurchaseOrderCreateSerializer
        if self.action in ("update", "partial_update"):
            return PurchaseOrderUpdateSerializer
        return PurchaseOrderSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        store_ids = _user_store_ids(self.request.user)
        return qs.filter(store_id__in=store_ids)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        store_id = serializer.validated_data["store"]
        supplier_id = serializer.validated_data["supplier"]
        store_ids = _user_store_ids(request.user)

        if not Store.objects.filter(pk=store_id, pk__in=store_ids, is_active=True).exists():
            return Response(
                {"detail": "Acces refuse a cette boutique."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            store = Store.objects.get(pk=store_id, is_active=True)
        except Store.DoesNotExist:
            return Response(
                {"detail": "Boutique introuvable."},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            supplier = Supplier.objects.get(pk=supplier_id, enterprise_id=store.enterprise_id)
        except Supplier.DoesNotExist:
            return Response(
                {"detail": "Fournisseur introuvable pour cette boutique."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from purchases.services import create_purchase_order

        try:
            purchase_order = create_purchase_order(
                store=store,
                supplier=supplier,
                actor=request.user,
                lines=serializer.validated_data["lines"],
                notes=serializer.validated_data.get("notes", ""),
                po_number=serializer.validated_data.get("po_number", ""),
                submit_now=serializer.validated_data.get("submit_now", False),
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            PurchaseOrderSerializer(purchase_order, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    def partial_update(self, request, *args, **kwargs):
        purchase_order = self.get_object()
        serializer = self.get_serializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        supplier = None
        supplier_id = serializer.validated_data.get("supplier")
        if supplier_id:
            try:
                supplier = Supplier.objects.get(
                    pk=supplier_id,
                    enterprise_id=purchase_order.store.enterprise_id,
                )
            except Supplier.DoesNotExist:
                return Response(
                    {"detail": "Fournisseur introuvable pour cette boutique."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        from purchases.services import update_purchase_order

        try:
            purchase_order = update_purchase_order(
                purchase_order,
                actor=request.user,
                supplier=supplier,
                notes=serializer.validated_data.get("notes")
                if "notes" in serializer.validated_data
                else None,
                lines=serializer.validated_data.get("lines")
                if "lines" in serializer.validated_data
                else None,
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(PurchaseOrderSerializer(purchase_order, context={"request": request}).data)

    def update(self, request, *args, **kwargs):
        return self.partial_update(request, *args, **kwargs)

    @action(detail=True, methods=["post"], url_path="submit")
    def submit(self, request, pk=None):
        purchase_order = self.get_object()
        from purchases.services import submit_purchase_order

        try:
            purchase_order = submit_purchase_order(purchase_order, actor=request.user)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(PurchaseOrderSerializer(purchase_order, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, pk=None):
        purchase_order = self.get_object()
        serializer = PurchaseOrderCancelSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)

        from purchases.services import cancel_purchase_order

        try:
            purchase_order = cancel_purchase_order(
                purchase_order,
                actor=request.user,
                reason=serializer.validated_data.get("reason", ""),
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(PurchaseOrderSerializer(purchase_order, context={"request": request}).data)

    def perform_destroy(self, instance):
        if instance.status != PurchaseOrder.Status.DRAFT:
            raise ValidationError(
                {"detail": "Seul un bon de commande en brouillon peut etre supprime."},
            )
        instance.lines.all().delete()
        instance.delete()


class GoodsReceiptViewSet(viewsets.ModelViewSet):
    serializer_class = GoodsReceiptSerializer
    queryset = GoodsReceipt.objects.select_related("store", "purchase_order", "received_by").prefetch_related("lines")
    permission_classes = [IsManagerOrAdmin, IsStoreMember, FeaturePurchasesManagementEnabled]
    filterset_fields = ["store", "purchase_order"]
    search_fields = ["receipt_number"]
    ordering_fields = ["created_at", "receipt_number"]

    def get_serializer_class(self):
        if self.action == "create":
            return GoodsReceiptCreateSerializer
        return GoodsReceiptSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        store_ids = _user_store_ids(self.request.user)
        return qs.filter(store_id__in=store_ids)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        store_id = serializer.validated_data["store"]
        purchase_order_id = serializer.validated_data["purchase_order"]
        store_ids = _user_store_ids(request.user)
        if not Store.objects.filter(pk=store_id, pk__in=store_ids, is_active=True).exists():
            return Response(
                {"detail": "Acces refuse a cette boutique."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            store = Store.objects.get(pk=store_id, is_active=True)
        except Store.DoesNotExist:
            return Response(
                {"detail": "Boutique introuvable."},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            purchase_order = PurchaseOrder.objects.select_related("store").get(
                pk=purchase_order_id,
                store_id=store.id,
            )
        except PurchaseOrder.DoesNotExist:
            return Response(
                {"detail": "Bon de commande introuvable pour cette boutique."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from purchases.services import generate_goods_receipt_number, receive_goods

        receipt_number = (serializer.validated_data.get("receipt_number") or "").strip()
        if not receipt_number:
            receipt_number = generate_goods_receipt_number(store)

        try:
            receipt = receive_goods(
                purchase_order=purchase_order,
                receipt_number=receipt_number,
                lines=serializer.validated_data["lines"],
                actor=request.user,
                notes=serializer.validated_data.get("notes", ""),
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            GoodsReceiptSerializer(receipt, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


# ---------------------------------------------------------------------------
# Alert ViewSet
# ---------------------------------------------------------------------------

class AlertViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """
    Read-only ViewSet for system alerts with mark-read actions.

    Alerts are created by the system (Celery tasks, signals), never
    directly via the API. This ViewSet only exposes list, retrieve,
    mark-read, and mark-all-read.
    """

    serializer_class = AlertSerializer
    queryset = Alert.objects.all()
    permission_classes = [IsAuthenticated, FeatureAlertsCenterEnabled]
    filterset_fields = ['store', 'alert_type', 'severity', 'is_read']
    ordering_fields = ['created_at', 'severity']

    def get_queryset(self):
        qs = super().get_queryset()
        store_ids = _user_store_ids(self.request.user)
        return qs.filter(store_id__in=store_ids)

    @action(detail=True, methods=['post'], url_path='mark-read')
    def mark_read(self, request, pk=None):
        """Mark a single alert as read."""
        alert = self.get_object()
        alert.is_read = True
        alert.read_by = request.user
        alert.read_at = timezone.now()
        alert.save(update_fields=['is_read', 'read_by', 'read_at', 'updated_at'])
        return Response(AlertSerializer(alert).data)

    @action(detail=False, methods=['post'], url_path='mark-all-read')
    def mark_all_read(self, request):
        """Mark all unread alerts as read for the user's accessible stores."""
        store_ids = _user_store_ids(request.user)
        updated = Alert.objects.filter(
            store_id__in=store_ids,
            is_read=False,
        ).update(is_read=True, read_by=request.user, read_at=timezone.now())
        return Response({'detail': f'{updated} alerte(s) marquee(s) comme lue(s).'})


# ---------------------------------------------------------------------------
# KPI View (Dashboard)
# ---------------------------------------------------------------------------

class KPIView(APIView):
    """
    GET endpoint returning dashboard KPIs for a store and optional date range.

    Query params:
        - store (required): store UUID
        - date_from (optional): start date (YYYY-MM-DD)
        - date_to (optional): end date (YYYY-MM-DD)
    """

    permission_classes = [IsAuthenticated, FeatureReportsCenterEnabled]

    def get(self, request):
        store_id = request.query_params.get('store')
        if not store_id:
            return Response(
                {'detail': 'Le parametre store est requis.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Verify access using queryset filter (safe UUID comparison)
        store_ids = _user_store_ids(request.user)
        if not Store.objects.filter(pk=store_id, id__in=store_ids).exists():
            return Response(
                {'detail': 'Acces refuse a cette boutique.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')

        # Default to today if no dates provided
        today = timezone.now().date()
        if not date_from:
            date_from = today
        if not date_to:
            date_to = today

        user_role = getattr(request.user, "role", None)
        is_sales_user = user_role == "SALES"

        # Try to get a KPI snapshot first
        snapshot = None
        if not is_sales_user:
            snapshot = KPISnapshot.objects.filter(
                store_id=store_id,
                date__gte=date_from,
                date__lte=date_to,
            ).order_by('-date').first()

        if snapshot:
            data = {
                'total_sales': snapshot.total_sales,
                'total_orders': snapshot.total_orders,
                'average_basket': snapshot.average_basket,
                'gross_margin': snapshot.gross_margin,
                'total_discounts': snapshot.total_discounts,
                'total_refunds': snapshot.total_refunds,
                'net_sales': snapshot.net_sales,
                'credit_outstanding': snapshot.credit_outstanding,
                'stock_value': snapshot.stock_value,
            }
        else:
            # Calculate KPIs from raw data
            sales_qs = Sale.objects.filter(
                store_id=store_id,
                status__in=[Sale.Status.PAID, Sale.Status.PARTIALLY_PAID],
                created_at__date__gte=date_from,
                created_at__date__lte=date_to,
            )
            if is_sales_user:
                sales_qs = sales_qs.filter(seller_id=request.user.id)

            aggregates = sales_qs.aggregate(
                total_sales=Coalesce(Sum('total'), Decimal('0.00'), output_field=DecimalField()),
                total_orders=Count('id'),
                average_basket=Coalesce(Avg('total'), Decimal('0.00'), output_field=DecimalField()),
                total_discounts=Coalesce(Sum('discount_amount'), Decimal('0.00'), output_field=DecimalField()),
            )

            # Gross margin from sale items
            items_qs = SaleItem.objects.filter(
                sale__store_id=store_id,
                sale__status__in=[Sale.Status.PAID, Sale.Status.PARTIALLY_PAID],
                sale__created_at__date__gte=date_from,
                sale__created_at__date__lte=date_to,
            )
            if is_sales_user:
                items_qs = items_qs.filter(sale__seller_id=request.user.id)
            margin_data = items_qs.aggregate(
                gross_margin=Coalesce(
                    Sum(F('line_total') - F('cost_price') * F('quantity')),
                    Decimal('0.00'),
                    output_field=DecimalField(),
                ),
            )

            # Stock value
            stock_value = ProductStock.objects.filter(
                store_id=store_id,
            ).aggregate(
                value=Coalesce(
                    Sum(F('quantity') * F('product__cost_price')),
                    Decimal('0.00'),
                    output_field=DecimalField(),
                ),
            )['value']
            credit_outstanding = CustomerAccount.objects.filter(
                store_id=store_id,
                balance__gt=0,
            ).aggregate(
                total=Coalesce(
                    Sum('balance'),
                    Decimal('0.00'),
                    output_field=DecimalField(),
                ),
            )['total']

            data = {
                'total_sales': aggregates['total_sales'],
                'total_orders': aggregates['total_orders'],
                'average_basket': aggregates['average_basket'],
                'gross_margin': margin_data['gross_margin'],
                'total_discounts': aggregates['total_discounts'],
                'total_refunds': Decimal('0.00'),
                'net_sales': aggregates['total_sales'] - aggregates['total_discounts'],
                'credit_outstanding': credit_outstanding,
                'stock_value': stock_value,
            }

        # Top products
        top_products_qs = SaleItem.objects.filter(
            sale__store_id=store_id,
            sale__status__in=[Sale.Status.PAID, Sale.Status.PARTIALLY_PAID],
            sale__created_at__date__gte=date_from,
            sale__created_at__date__lte=date_to,
        )
        if is_sales_user:
            top_products_qs = top_products_qs.filter(sale__seller_id=request.user.id)
        top_products = (
            top_products_qs
            .values('product__name')
            .annotate(
                total_quantity=Sum('quantity'),
                total_revenue=Sum('line_total'),
            )
            .order_by('-total_revenue')[:10]
        )
        data['top_products'] = list(top_products)

        # Sales trend (daily aggregation)
        sales_trend_qs = Sale.objects.filter(
            store_id=store_id,
            status__in=[Sale.Status.PAID, Sale.Status.PARTIALLY_PAID],
            created_at__date__gte=date_from,
            created_at__date__lte=date_to,
        )
        if is_sales_user:
            sales_trend_qs = sales_trend_qs.filter(seller_id=request.user.id)
        sales_trend = (
            sales_trend_qs
            .annotate(date=TruncDate('created_at'))
            .values('date')
            .annotate(
                daily_total=Sum('total'),
                daily_count=Count('id'),
            )
            .order_by('date')
        )
        data['sales_trend'] = [
            {
                'date': str(entry['date']),
                'total': str(entry['daily_total']),
                'count': entry['daily_count'],
            }
            for entry in sales_trend
        ]

        serializer = KPISerializer(data)
        return Response(serializer.data)


# ---------------------------------------------------------------------------
# Cash Flow Report View
# ---------------------------------------------------------------------------

class CashFlowView(APIView):
    """
    GET /api/v1/reports/cash-flow/

    Aggregates cash inflows (payments) and outflows (expenses) for a store
    over a date range, grouped by day or month.

    Query params:
        - store (required): store UUID
        - start_date (required): YYYY-MM-DD
        - end_date (required): YYYY-MM-DD
        - group_by: 'day' (default) or 'month'
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.db.models import Sum
        from django.db.models.functions import TruncDay, TruncMonth

        store_id = request.query_params.get('store')
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        group_by = request.query_params.get('group_by', 'day')

        if not store_id or not start_date or not end_date:
            return Response(
                {'detail': 'Les parametres store, start_date et end_date sont requis.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check store access
        store_ids = _user_store_ids(request.user)
        try:
            import uuid as _uuid
            store_uuid = _uuid.UUID(str(store_id))
        except (ValueError, AttributeError):
            return Response({'detail': 'Identifiant boutique invalide.'}, status=status.HTTP_400_BAD_REQUEST)

        if store_uuid not in store_ids:
            return Response({'detail': "Acces interdit a cette boutique."}, status=status.HTTP_403_FORBIDDEN)

        trunc_fn = TruncDay if group_by == 'day' else TruncMonth

        # Cash inflows: Payments (all non-credit methods)
        payments_qs = (
            Payment.objects
            .filter(store_id=store_uuid, created_at__date__gte=start_date, created_at__date__lte=end_date)
            .annotate(period=trunc_fn('created_at'))
            .values('period')
            .annotate(cash_in=Sum('amount'))
            .order_by('period')
        )

        # Cash outflows: Expenses (status=POSTED only)
        from expenses.models import Expense
        expenses_qs = (
            Expense.objects
            .filter(store_id=store_uuid, expense_date__gte=start_date, expense_date__lte=end_date, status='POSTED')
            .values('expense_date')
            .annotate(cash_out=Sum('amount'))
            .order_by('expense_date')
        )

        # Build unified period map
        period_map: dict = {}

        for row in payments_qs:
            if row['period'] is None:
                continue
            key = row['period'].strftime('%Y-%m-%d')
            period_map.setdefault(key, {'date': key, 'cash_in': Decimal('0.00'), 'cash_out': Decimal('0.00')})
            period_map[key]['cash_in'] += row['cash_in'] or Decimal('0.00')

        for row in expenses_qs:
            if row['expense_date'] is None:
                continue
            # For month grouping, truncate to first day of month
            if group_by == 'month':
                key = row['expense_date'].strftime('%Y-%m-01')
            else:
                key = row['expense_date'].strftime('%Y-%m-%d')
            period_map.setdefault(key, {'date': key, 'cash_in': Decimal('0.00'), 'cash_out': Decimal('0.00')})
            period_map[key]['cash_out'] += row['cash_out'] or Decimal('0.00')

        periods = []
        total_cash_in = Decimal('0.00')
        total_cash_out = Decimal('0.00')

        for key in sorted(period_map.keys()):
            p = period_map[key]
            net = p['cash_in'] - p['cash_out']
            periods.append({
                'date': p['date'],
                'cash_in': str(p['cash_in']),
                'cash_out': str(p['cash_out']),
                'net': str(net),
            })
            total_cash_in += p['cash_in']
            total_cash_out += p['cash_out']

        return Response({
            'periods': periods,
            'totals': {
                'cash_in': str(total_cash_in),
                'cash_out': str(total_cash_out),
                'net': str(total_cash_in - total_cash_out),
            },
        })


# Sales Report API View
# ---------------------------------------------------------------------------

class SalesReportAPIView(APIView):
    """
    GET endpoint returning a detailed sales report for a store and date range.

    Query params:
        - store (required): store UUID
        - date_from (optional): start date (YYYY-MM-DD)
        - date_to (optional): end date (YYYY-MM-DD)
        - customer / customer_id (optional): customer UUID
        - cashier / cashier_id (optional): cashier UUID
        - product / product_id (optional): product UUID
        - group_by (optional): 'day', 'month', 'year' (default: 'day')
    """

    permission_classes = [IsAuthenticated, IsManagerOrAdmin, FeatureReportsCenterEnabled]

    def get(self, request):
        store_id = request.query_params.get('store')
        if not store_id:
            return Response(
                {'detail': 'Le parametre store est requis.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Verify access using queryset filter (safe UUID comparison)
        store_ids = _user_store_ids(request.user)
        if not Store.objects.filter(pk=store_id, id__in=store_ids).exists():
            return Response(
                {'detail': 'Acces refuse a cette boutique.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        today = timezone.now().date()
        date_from = _parse_iso_date_or_default(
            request.query_params.get('date_from'),
            today,
        )
        date_to = _parse_iso_date_or_default(
            request.query_params.get('date_to'),
            today,
        )
        if date_from > date_to:
            date_from, date_to = date_to, date_from

        customer_id = request.query_params.get('customer') or request.query_params.get('customer_id')
        cashier_id = request.query_params.get('cashier') or request.query_params.get('cashier_id')
        product_id = request.query_params.get('product') or request.query_params.get('product_id')

        # Base queryset for completed sales
        sales_qs = Sale.objects.filter(
            store_id=store_id,
            status__in=[Sale.Status.PAID, Sale.Status.PARTIALLY_PAID],
            created_at__date__gte=date_from,
            created_at__date__lte=date_to,
        )
        if customer_id:
            sales_qs = sales_qs.filter(customer_id=customer_id)
        if cashier_id:
            sale_ids_for_cashier = (
                Payment.objects
                .filter(store_id=store_id, cashier_id=cashier_id)
                .values('sale_id')
            )
            sales_qs = sales_qs.filter(id__in=sale_ids_for_cashier)
        if product_id:
            sale_ids_for_product = (
                SaleItem.objects
                .filter(sale__store_id=store_id, product_id=product_id)
                .values('sale_id')
            )
            sales_qs = sales_qs.filter(id__in=sale_ids_for_product)

        selected_sale_ids = sales_qs.values('id')

        # Summary
        summary = sales_qs.aggregate(
            total_revenue=Coalesce(Sum('total'), Decimal('0.00'), output_field=DecimalField()),
            total_orders=Count('id', distinct=True),
            average_order=Coalesce(Avg('total'), Decimal('0.00'), output_field=DecimalField()),
            total_discounts=Coalesce(Sum('discount_amount'), Decimal('0.00'), output_field=DecimalField()),
            total_collected=Coalesce(Sum('amount_paid'), Decimal('0.00'), output_field=DecimalField()),
            total_outstanding=Coalesce(Sum('amount_due'), Decimal('0.00'), output_field=DecimalField()),
        )

        # By payment method
        payments_by_method = (
            Payment.objects.filter(
                store_id=store_id,
                sale_id__in=selected_sale_ids,
                created_at__date__gte=date_from,
                created_at__date__lte=date_to,
            )
            .values('method')
            .annotate(
                total=Sum('amount'),
                count=Count('id'),
            )
            .order_by('method')
        )

        # By seller
        by_seller = (
            sales_qs
            .values('seller__first_name', 'seller__last_name')
            .annotate(
                total_sales=Sum('total'),
                order_count=Count('id'),
            )
            .order_by('-total_sales')
        )

        # By category
        by_category = (
            SaleItem.objects.filter(
                sale_id__in=selected_sale_ids,
            )
            .values('product__category__name')
            .annotate(
                total_revenue=Sum('line_total'),
                total_quantity=Sum('quantity'),
            )
            .order_by('-total_revenue')
        )

        # Breakdown by period (day/month/year)
        group_by = request.query_params.get('group_by', 'day')
        if group_by == 'month':
            trunc_fn = TruncMonth('created_at')
        elif group_by == 'year':
            trunc_fn = TruncYear('created_at')
        else:
            trunc_fn = TruncDate('created_at')

        breakdown = (
            sales_qs
            .annotate(period=trunc_fn)
            .values('period')
            .annotate(
                revenue=Sum('total'),
                orders=Count('id'),
                discounts=Sum('discount_amount'),
            )
            .order_by('period')
        )

        report = {
            'store': store_id,
            'date_from': date_from.isoformat(),
            'date_to': date_to.isoformat(),
            'group_by': group_by,
            'filters': {
                'customer': customer_id,
                'cashier': cashier_id,
                'product': product_id,
            },
            'summary': {
                'total_revenue': str(summary['total_revenue']),
                'total_orders': summary['total_orders'],
                'average_order': str(summary['average_order']),
                'total_discounts': str(summary['total_discounts']),
                'total_collected': str(summary['total_collected']),
                'total_outstanding': str(summary['total_outstanding']),
            },
            'payments_by_method': [
                {
                    'method': entry['method'],
                    'total': str(entry['total']),
                    'count': entry['count'],
                }
                for entry in payments_by_method
            ],
            'by_seller': [
                {
                    'seller': f"{entry['seller__first_name']} {entry['seller__last_name']}",
                    'total_sales': str(entry['total_sales']),
                    'order_count': entry['order_count'],
                }
                for entry in by_seller
            ],
            'by_category': [
                {
                    'category': entry['product__category__name'],
                    'total_revenue': str(entry['total_revenue']),
                    'total_quantity': entry['total_quantity'],
                }
                for entry in by_category
            ],
            'breakdown': [
                {
                    'date': str(entry['period'].date() if hasattr(entry['period'], 'date') else entry['period']),
                    'revenue': str(entry['revenue']),
                    'orders': entry['orders'],
                    'discounts': str(entry['discounts']),
                }
                for entry in breakdown
            ],
        }

        return Response(report)


# ---------------------------------------------------------------------------
# Cashier Operations PDF Export
# ---------------------------------------------------------------------------

class CashierOperationsPDFAPIView(APIView):
    """
    GET endpoint returning a PDF report of cashier operations.

    Query params:
        - store (required): store UUID
        - date_from (optional): start date (YYYY-MM-DD)
        - date_to (optional): end date (YYYY-MM-DD)
        - customer / customer_id (optional): customer UUID
        - cashier / cashier_id (optional): cashier UUID
        - product / product_id (optional): product UUID
    """

    permission_classes = [IsAuthenticated, IsManagerOrAdmin, FeatureReportsCenterEnabled]
    MAX_OPERATION_ROWS = 300

    def get(self, request):
        store_id = request.query_params.get('store')
        if not store_id:
            return Response(
                {'detail': 'Le parametre store est requis.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        store_ids = _user_store_ids(request.user)
        store = Store.objects.filter(pk=store_id, id__in=store_ids).first()
        if store is None:
            return Response(
                {'detail': 'Acces refuse a cette boutique.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        today = timezone.now().date()
        date_from = _parse_iso_date_or_default(request.query_params.get('date_from'), today)
        date_to = _parse_iso_date_or_default(request.query_params.get('date_to'), today)
        if date_from > date_to:
            date_from, date_to = date_to, date_from

        customer_id = request.query_params.get('customer') or request.query_params.get('customer_id')
        cashier_id = request.query_params.get('cashier') or request.query_params.get('cashier_id')
        product_id = request.query_params.get('product') or request.query_params.get('product_id')

        payments_qs = Payment.objects.filter(
            store_id=store.id,
            sale__status__in=[Sale.Status.PAID, Sale.Status.PARTIALLY_PAID],
            created_at__date__gte=date_from,
            created_at__date__lte=date_to,
        ).select_related('cashier', 'sale')

        if customer_id:
            payments_qs = payments_qs.filter(sale__customer_id=customer_id)
        if cashier_id:
            payments_qs = payments_qs.filter(cashier_id=cashier_id)
        if product_id:
            sale_ids_for_product = (
                SaleItem.objects
                .filter(sale__store_id=store.id, product_id=product_id)
                .values('sale_id')
            )
            payments_qs = payments_qs.filter(sale_id__in=sale_ids_for_product)

        totals = payments_qs.aggregate(
            total_operations=Count('id'),
            total_amount=Coalesce(
                Sum('amount'),
                Decimal('0.00'),
                output_field=DecimalField(),
            ),
        )
        total_operations = int(totals.get('total_operations') or 0)
        total_amount = totals.get('total_amount') or Decimal('0.00')
        average_ticket = (
            (total_amount / Decimal(total_operations)).quantize(Decimal('0.01'))
            if total_operations > 0
            else Decimal('0.00')
        )

        by_cashier_rows = (
            payments_qs
            .values(
                'cashier__first_name',
                'cashier__last_name',
                'cashier__email',
            )
            .annotate(
                operation_count=Count('id'),
                total_amount=Coalesce(
                    Sum('amount'),
                    Decimal('0.00'),
                    output_field=DecimalField(),
                ),
            )
            .order_by('-total_amount', 'cashier__last_name', 'cashier__first_name')
        )
        by_cashier = []
        for row in by_cashier_rows:
            cashier_name = (
                f"{row.get('cashier__first_name') or ''} {row.get('cashier__last_name') or ''}"
            ).strip() or row.get('cashier__email') or "-"
            count = int(row.get('operation_count') or 0)
            total = row.get('total_amount') or Decimal('0.00')
            avg = (total / Decimal(count)).quantize(Decimal('0.01')) if count > 0 else Decimal('0.00')
            by_cashier.append(
                {
                    'cashier_name': cashier_name,
                    'operation_count': count,
                    'total_amount': total,
                    'average_ticket': avg,
                }
            )

        method_display_map = dict(Payment.Method.choices)
        by_method_rows = (
            payments_qs
            .values('method')
            .annotate(
                operation_count=Count('id'),
                total_amount=Coalesce(
                    Sum('amount'),
                    Decimal('0.00'),
                    output_field=DecimalField(),
                ),
            )
            .order_by('method')
        )
        by_method = [
            {
                'method': row.get('method'),
                'method_display': method_display_map.get(row.get('method'), row.get('method')),
                'operation_count': int(row.get('operation_count') or 0),
                'total_amount': row.get('total_amount') or Decimal('0.00'),
            }
            for row in by_method_rows
        ]

        sampled_rows = list(payments_qs.order_by('-created_at', '-id')[:self.MAX_OPERATION_ROWS])
        operations = []
        for payment in sampled_rows:
            cashier_name = payment.cashier.get_full_name().strip() or payment.cashier.email
            sale_ref = payment.sale.invoice_number or f"VTE-{str(payment.sale_id).split('-')[0].upper()}"
            operations.append(
                {
                    'created_at': payment.created_at,
                    'cashier_name': cashier_name,
                    'invoice_number': sale_ref,
                    'method_display': method_display_map.get(payment.method, payment.method),
                    'amount': payment.amount,
                    'reference': payment.reference,
                }
            )

        customer_name = ""
        if customer_id:
            customer = (
                Customer.objects
                .filter(pk=customer_id, enterprise_id=store.enterprise_id)
                .only('first_name', 'last_name')
                .first()
            )
            if customer:
                customer_name = customer.full_name

        cashier_name = ""
        if cashier_id:
            cashier = User.objects.filter(pk=cashier_id).only('first_name', 'last_name', 'email').first()
            if cashier:
                cashier_name = cashier.get_full_name().strip() or cashier.email

        product_name = ""
        if product_id:
            product = Product.objects.filter(pk=product_id, enterprise_id=store.enterprise_id).only('name').first()
            if product:
                product_name = product.name

        summary = {
            'total_operations': total_operations,
            'total_amount': total_amount,
            'average_ticket': average_ticket,
            'selected_customer': customer_name,
            'selected_cashier': cashier_name,
            'selected_product': product_name,
        }

        try:
            return generate_cashier_operations_report_pdf(
                store=store,
                date_from=date_from,
                date_to=date_to,
                summary=summary,
                by_cashier=by_cashier,
                by_method=by_method,
                operations=operations,
                operations_truncated=total_operations > len(operations),
                generated_at=timezone.now(),
            )
        except RuntimeError:
            logger.exception("Cashier operations PDF export failed: PDF backend unavailable.")
            return Response(
                {
                    'detail': (
                        "Generation PDF indisponible sur ce serveur. "
                        "Installez les dependances WeasyPrint systeme (glib/pango/cairo)."
                    )
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )


# ---------------------------------------------------------------------------
# Stock Value Trend
# ---------------------------------------------------------------------------

class StockValueTrendView(APIView):
    """Return daily KPISnapshot stock_value / gross_margin for a date range.

    GET /api/v1/reports/stock-trend/?store=UUID&date_from=...&date_to=...
    """

    permission_classes = [IsAuthenticated, IsManagerOrAdmin, FeatureReportsCenterEnabled]

    def get(self, request):
        store_id = request.query_params.get('store')
        if not store_id:
            return Response(
                {'detail': 'Le parametre store est requis.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        store_ids = _user_store_ids(request.user)
        if not Store.objects.filter(pk=store_id, id__in=store_ids).exists():
            return Response(
                {'detail': 'Acces refuse a cette boutique.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        today = timezone.now().date()
        date_from = request.query_params.get('date_from', str(today - timedelta(days=29)))
        date_to = request.query_params.get('date_to', str(today))

        snapshots = (
            KPISnapshot.objects.filter(
                store_id=store_id,
                date__gte=date_from,
                date__lte=date_to,
            )
            .values('date', 'stock_value', 'gross_margin')
            .order_by('date')
        )

        trend = [
            {
                'date': str(entry['date']),
                'stock_value': str(entry['stock_value']),
                'gross_margin': str(entry['gross_margin']),
            }
            for entry in snapshots
        ]

        return Response({'trend': trend})


# ---------------------------------------------------------------------------
# Daily Statistics (profit per day)
# ---------------------------------------------------------------------------

class DailyStatisticsAPIView(APIView):
    """
    GET endpoint returning daily sales statistics with profit breakdown.

    Query params:
        - store (required): store UUID
        - date_from (optional): start date (YYYY-MM-DD), default: 30 days ago
        - date_to (optional): end date (YYYY-MM-DD), default: today
    """

    permission_classes = [IsAuthenticated, IsManagerOrAdmin, FeatureReportsCenterEnabled]

    def get(self, request):
        store_id = request.query_params.get('store')
        if not store_id:
            return Response(
                {'detail': 'Le parametre store est requis.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        store_ids = _user_store_ids(request.user)
        if not Store.objects.filter(pk=store_id, id__in=store_ids).exists():
            return Response(
                {'detail': 'Acces refuse a cette boutique.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        store = Store.objects.get(pk=store_id)
        today = timezone.now().date()
        date_from = request.query_params.get('date_from', str(today - timedelta(days=29)))
        date_to = request.query_params.get('date_to', str(today))

        from reports.services import get_daily_statistics
        data = get_daily_statistics(store, date_from, date_to)
        return Response(data)


# ---------------------------------------------------------------------------
# Me View (Current User Profile)
# ---------------------------------------------------------------------------

class MeView(APIView):
    """
    GET /api/v1/auth/me/ — return the authenticated user's profile.
    PATCH /api/v1/auth/me/ — update first_name, last_name, phone.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = MeSerializer(request.user)
        return Response(serializer.data)

    def patch(self, request):
        serializer = MeSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


# ---------------------------------------------------------------------------
# Module Matrix View (Store-scoped entitlements)
# ---------------------------------------------------------------------------


class ModuleMatrixView(APIView):
    """GET /api/v1/auth/module-matrix/ - module + feature + capability matrix."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        requested_store_id = request.query_params.get("store")
        accessible_store_ids = [str(sid) for sid in _user_store_ids(request.user)]

        store = None
        if requested_store_id:
            if not getattr(request.user, "is_superuser", False) and requested_store_id not in accessible_store_ids:
                return Response(
                    {"detail": "Acces refuse a cette boutique."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            store = Store.objects.filter(pk=requested_store_id, is_active=True).first()
        else:
            current_store = getattr(request, "current_store", None)
            if current_store and (
                getattr(request.user, "is_superuser", False) or str(current_store.id) in accessible_store_ids
            ):
                store = current_store
            elif accessible_store_ids:
                store = Store.objects.filter(id__in=accessible_store_ids, is_active=True).order_by("name").first()

        if store is None:
            return Response(
                {"detail": "Aucune boutique active disponible."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        matrix = resolve_store_module_matrix(store=store)

        store_user = StoreUser.objects.filter(store=store, user=request.user).first()
        if store_user:
            capabilities = store_user.get_effective_capabilities()
        elif request.user.role in ("ADMIN", "MANAGER") or getattr(request.user, "is_superuser", False):
            from stores.capabilities import ALL_CAPABILITIES
            capabilities = list(ALL_CAPABILITIES)
        else:
            capabilities = []

        return Response(
            {
                "store_id": str(store.id),
                "store_name": store.name,
                "as_of": matrix.get("as_of"),
                "source": matrix.get("source"),
                "plan_code": matrix.get("plan_code"),
                "modules": matrix.get("modules", {}),
                "features": store.effective_feature_flags,
                "capabilities": capabilities,
            }
        )


# ---------------------------------------------------------------------------
# Change Password View
# ---------------------------------------------------------------------------

class ChangePasswordView(APIView):
    """POST /api/v1/auth/password/change/ — change the authenticated user's password."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(
            data=request.data, context={'request': request},
        )
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data['new_password'])
        request.user.save()
        return Response({'detail': 'Mot de passe modifie avec succes.'})


# ---------------------------------------------------------------------------
# Quote ViewSet
# ---------------------------------------------------------------------------

class QuoteViewSet(viewsets.ModelViewSet):
    """
    ViewSet for quotes (devis) with custom workflow actions.

    - list: filter by store, status, customer, date range
    - create: creates a DRAFT quote
    - add_item: adds an item to a draft quote
    - remove_item: removes an item from a draft quote
    - send: sends the quote to the customer
    - accept: accepts the quote (manager+)
    - refuse: refuses the quote (manager+)
    - convert: converts the quote to a sale (manager+)
    - duplicate: duplicates the quote
    - pdf: generates a PDF for the quote
    """

    serializer_class = QuoteSerializer
    queryset = Quote.objects.select_related(
        'store', 'created_by', 'customer', 'converted_sale',
    ).prefetch_related('items', 'items__product')
    filterset_fields = ['store', 'status', 'customer', 'created_by']
    search_fields = [
        'quote_number',
        'customer__first_name',
        'customer__last_name',
        'customer__phone',
    ]
    ordering_fields = ['created_at', 'total', 'quote_number', 'status', 'valid_until']
    pagination_class = StandardResultsSetPagination

    def get_permissions(self):
        if self.action in ('create', 'add_item', 'remove_item', 'send', 'duplicate'):
            # COMMERCIAL role can also create and manage quotes (CRM workflow)
            return [IsAuthenticated(), FeatureSalesPOSEnabled(), CanManageLeads()]
        if self.action in ('accept', 'refuse', 'convert', 'cancel'):
            return [IsManagerOrAdmin(), FeatureSalesPOSEnabled()]
        return [IsAuthenticated(), FeatureSalesPOSEnabled()]

    def get_queryset(self):
        qs = super().get_queryset()
        store_ids = _user_store_ids(self.request.user)
        qs = qs.filter(store_id__in=store_ids)

        # Date range filtering
        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        if date_from:
            qs = qs.filter(created_at__date__gte=date_from)
        if date_to:
            qs = qs.filter(created_at__date__lte=date_to)

        return qs

    def perform_update(self, serializer):
        """Override to recalculate totals when discount/fields change."""
        quote = serializer.save()
        from sales.services import recalculate_quote
        recalculate_quote(quote)

    def create(self, request, *args, **kwargs):
        """Create a new DRAFT quote.

        Validates that:
        - The user has access to the requested store.
        - The customer (if any) belongs to the same enterprise.
        """
        serializer = QuoteCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        store_id = serializer.validated_data['store_id']

        # --- Store isolation: verify user access ---
        store_ids = _user_store_ids(request.user)
        if store_id not in store_ids:
            return Response(
                {'detail': "Vous n'avez pas acces a cette boutique."},
                status=status.HTTP_403_FORBIDDEN,
            )
        try:
            store = Store.objects.get(pk=store_id, is_active=True)
        except Store.DoesNotExist:
            return Response(
                {'detail': 'Boutique introuvable.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        # --- Customer isolation: must belong to the same enterprise ---
        customer = None
        customer_id = serializer.validated_data.get('customer_id')
        if customer_id:
            try:
                customer = Customer.objects.get(
                    pk=customer_id, enterprise=store.enterprise,
                )
            except Customer.DoesNotExist:
                return Response(
                    {'detail': 'Client introuvable dans cette entreprise.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        try:
            from sales.services import create_quote
            document_type = serializer.validated_data.get('document_type', 'DEVIS')
            quote = create_quote(
                store=store,
                created_by=request.user,
                customer=customer,
                document_type=document_type,
            )
        except ValueError as e:
            return Response(
                {'detail': str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Apply optional fields
        update_fields = []
        if serializer.validated_data.get('discount_percent'):
            quote.discount_percent = serializer.validated_data['discount_percent']
            update_fields.append('discount_percent')
        if serializer.validated_data.get('notes'):
            quote.notes = serializer.validated_data['notes']
            update_fields.append('notes')
        if serializer.validated_data.get('conditions'):
            quote.conditions = serializer.validated_data['conditions']
            update_fields.append('conditions')
        if serializer.validated_data.get('valid_until'):
            quote.valid_until = serializer.validated_data['valid_until']
            update_fields.append('valid_until')
        if update_fields:
            update_fields.append('updated_at')
            quote.save(update_fields=update_fields)

        return Response(
            QuoteSerializer(quote).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['post'], url_path='add-item')
    def add_item(self, request, pk=None):
        """Add an item to a draft quote.

        Delegates to ``sales.services.add_item_to_quote`` so that
        the quote totals are recalculated.

        If ``unit_price_override`` is provided, user must have permission
        to override prices in the quote store.
        """
        quote = self.get_object()

        if quote.status != Quote.Status.DRAFT:
            return Response(
                {'detail': 'Les articles ne peuvent etre ajoutes que sur des devis en brouillon.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = QuoteAddItemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        enterprise_id = _user_enterprise_id(request.user)
        try:
            product = Product.objects.get(
                pk=serializer.validated_data['product_id'],
                enterprise_id=enterprise_id,
            )
        except Product.DoesNotExist:
            return Response(
                {'detail': 'Produit introuvable dans votre entreprise.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        quantity = serializer.validated_data['quantity']
        discount_amount = serializer.validated_data.get('discount_amount', Decimal('0.00'))
        unit_price_override = serializer.validated_data.get('unit_price_override')

        # Check override permission and bounds
        if unit_price_override is not None:
            if not _can_override_price_for_store(request.user, quote.store):
                return Response(
                    {'detail': "Vous n'avez pas la permission de modifier le prix de vente."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if unit_price_override <= Decimal('0'):
                return Response(
                    {'detail': 'Le prix doit etre strictement positif.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        try:
            from sales.services import add_item_to_quote
            add_item_to_quote(
                quote=quote,
                product=product,
                qty=quantity,
                discount=discount_amount,
                unit_price=unit_price_override,
                actor=request.user,
            )
        except ValueError as e:
            return Response(
                {'detail': str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        quote.refresh_from_db()
        return Response(QuoteSerializer(quote).data)

    @action(detail=True, methods=['post'], url_path='remove-item')
    def remove_item(self, request, pk=None):
        """Remove an item from a draft quote."""
        quote = self.get_object()

        if quote.status != Quote.Status.DRAFT:
            return Response(
                {'detail': 'Les articles ne peuvent etre retires que des devis en brouillon.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        item_id = request.data.get('item_id')
        if not item_id:
            return Response(
                {'detail': 'item_id est requis.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            from sales.services import remove_item_from_quote
            remove_item_from_quote(quote, item_id, actor=request.user)
        except ValueError as e:
            return Response(
                {'detail': str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        quote.refresh_from_db()
        return Response(QuoteSerializer(quote).data)

    @action(detail=True, methods=['post'], url_path='send')
    def send(self, request, pk=None):
        """Send the quote to the customer."""
        quote = self.get_object()
        try:
            from sales.services import send_quote
            quote = send_quote(quote, actor=request.user)
        except ValueError as e:
            return Response(
                {'detail': str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(QuoteSerializer(quote).data)

    @action(detail=True, methods=['post'], url_path='accept')
    def accept(self, request, pk=None):
        """Accept the quote. Requires manager or admin role."""
        quote = self.get_object()
        try:
            from sales.services import accept_quote
            quote = accept_quote(quote, actor=request.user)
        except ValueError as e:
            return Response(
                {'detail': str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(QuoteSerializer(quote).data)

    @action(detail=True, methods=['post'], url_path='refuse')
    def refuse(self, request, pk=None):
        """Refuse the quote. Requires manager or admin role."""
        quote = self.get_object()
        reason = request.data.get('reason', '')
        try:
            from sales.services import refuse_quote
            quote = refuse_quote(quote, reason, actor=request.user)
        except ValueError as e:
            return Response(
                {'detail': str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(QuoteSerializer(quote).data)

    @action(detail=True, methods=['post'], url_path='convert')
    def convert(self, request, pk=None):
        """Convert the quote to a sale. Requires manager or admin role."""
        quote = self.get_object()
        try:
            from sales.services import convert_quote_to_sale
            sale = convert_quote_to_sale(quote, actor=request.user)
        except ValueError as e:
            return Response(
                {'detail': str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(SaleSerializer(sale).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='cancel')
    def cancel(self, request, pk=None):
        """Cancel a quote. Requires manager or admin role."""
        quote = self.get_object()
        reason = (request.data.get('reason') or '').strip()
        if not reason:
            return Response(
                {'detail': "Une raison d'annulation est requise."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            from sales.services import cancel_quote
            quote = cancel_quote(quote, reason=reason, actor=request.user)
        except ValueError as e:
            return Response(
                {'detail': str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(QuoteSerializer(quote).data)

    @action(detail=True, methods=['post'], url_path='duplicate')
    def duplicate(self, request, pk=None):
        """Duplicate the quote."""
        quote = self.get_object()
        try:
            from sales.services import duplicate_quote
            new_quote = duplicate_quote(quote, actor=request.user)
        except ValueError as e:
            return Response(
                {'detail': str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(QuoteSerializer(new_quote).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'], url_path='pdf')
    def pdf(self, request, pk=None):
        """Generate and return a PDF for the quote."""
        quote = self.get_object()
        try:
            from core.pdf import generate_quote_pdf
            return generate_quote_pdf(quote, quote.store)
        except (ImportError, AttributeError):
            return Response(
                {'detail': 'PDF non disponible.'},
                status=status.HTTP_501_NOT_IMPLEMENTED,
            )
        except Exception:
            return Response(
                {'detail': 'Impossible de generer le PDF pour ce devis.'},
                status=status.HTTP_400_BAD_REQUEST,
            )


# ---------------------------------------------------------------------------
# Refund ViewSet
# ---------------------------------------------------------------------------

class RefundViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    """
    List, retrieve, and create refunds.

    - Create requires CanApproveRefund permission (MANAGER/ADMIN).
    - List/Retrieve filtered to user's accessible stores.
    """

    serializer_class = RefundSerializer
    queryset = Refund.objects.select_related('sale', 'store', 'approved_by')
    filterset_fields = ['store', 'sale', 'refund_method']
    ordering_fields = ['created_at', 'amount']
    pagination_class = StandardResultsSetPagination

    def get_permissions(self):
        if self.action == 'create':
            return [CanApproveRefund(), FeatureSalesRefundEnabled()]
        return [IsAuthenticated(), FeatureSalesRefundEnabled()]

    def get_queryset(self):
        qs = super().get_queryset()
        store_ids = _user_store_ids(self.request.user)
        return qs.filter(store_id__in=store_ids)

    def create(self, request, *args, **kwargs):
        serializer = RefundCreateSerializer(
            data=request.data,
            context={'request': request},
        )
        serializer.is_valid(raise_exception=True)
        sale_id = serializer.validated_data['sale_id']
        store_ids = _user_store_ids(request.user)
        sale = Sale.objects.filter(pk=sale_id, store_id__in=store_ids).first()
        if sale is None:
            return Response(
                {'detail': "Vente introuvable ou inaccessible."},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            from sales.services import create_refund

            with transaction.atomic():
                refund = create_refund(
                    sale=sale,
                    amount=serializer.validated_data['amount'],
                    reason=serializer.validated_data['reason'],
                    refund_method=serializer.validated_data['refund_method'],
                    approved_by=request.user,
                    processed_by=request.user,
                    restore_stock=serializer.validated_data.get('restore_stock', False),
                )
        except ValueError as exc:
            return Response(
                {'detail': str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            RefundSerializer(refund).data,
            status=status.HTTP_201_CREATED,
        )


# ---------------------------------------------------------------------------
# Coupon ViewSet
# ---------------------------------------------------------------------------

class CouponViewSet(viewsets.ModelViewSet):
    """
    CRUD for promotional coupons + validate action.

    - List/Retrieve: any authenticated user with SELL module.
    - Create/Update/Delete: MANAGER/ADMIN only.
    - validate action: GET /api/v1/coupons/validate/?code=XXX&store=YYY&order_amount=ZZZ
    """

    serializer_class = CouponSerializer
    queryset = Coupon.objects.select_related('store')
    filterset_fields = ['store', 'is_active', 'discount_type']
    ordering_fields = ['created_at', 'code', 'valid_until']
    pagination_class = StandardResultsSetPagination

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy'):
            return [IsManagerOrAdmin()]
        return [IsAuthenticated()]

    def get_queryset(self):
        qs = super().get_queryset()
        store_ids = _user_store_ids(self.request.user)
        return qs.filter(store_id__in=store_ids)

    @action(detail=False, methods=['get'], url_path='validate')
    def validate_coupon(self, request):
        """Validate a coupon code without applying it.

        GET /api/v1/coupons/validate/?code=XXX&store=YYY&order_amount=ZZZ
        Returns: {valid: bool, coupon: {...}} or {valid: false, error: '...'}
        """
        code = (request.query_params.get('code') or '').strip().upper()
        store_id = request.query_params.get('store')
        order_amount_raw = request.query_params.get('order_amount', '0') or '0'
        try:
            order_amount = Decimal(order_amount_raw)
        except Exception:
            order_amount = Decimal('0.00')

        if not code or not store_id:
            return Response(
                {'valid': False, 'error': 'Les parametres code et store sont requis.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Verify store is accessible by the user
        store_ids = _user_store_ids(request.user)
        try:
            import uuid
            store_uuid = uuid.UUID(str(store_id))
        except (ValueError, AttributeError):
            return Response(
                {'valid': False, 'error': 'Identifiant boutique invalide.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if store_uuid not in store_ids:
            return Response(
                {'valid': False, 'error': 'Boutique inaccessible.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            coupon = Coupon.objects.get(code=code, store_id=store_uuid)
        except Coupon.DoesNotExist:
            return Response(
                {'valid': False, 'error': 'Code coupon introuvable.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        is_valid, error_msg = coupon.is_valid(order_amount=order_amount)
        if not is_valid:
            return Response(
                {'valid': False, 'error': error_msg},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response({
            'valid': True,
            'coupon': CouponSerializer(coupon).data,
        })


# ---------------------------------------------------------------------------
# AuditLog ViewSet (Read-Only)
# ---------------------------------------------------------------------------

class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only viewset for audit log entries.

    Only ADMIN and MANAGER roles can access.
    Filtered to user's accessible stores.
    """

    serializer_class = AuditLogSerializer
    queryset = AuditLog.objects.select_related('actor', 'store')
    permission_classes = [IsManagerOrAdmin, FeatureReportsCenterEnabled]
    filterset_fields = ['store', 'action', 'entity_type']
    search_fields = ['action', 'entity_type', 'entity_id']
    ordering_fields = ['created_at']
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        qs = super().get_queryset()
        store_ids = _user_store_ids(self.request.user)
        return qs.filter(store_id__in=store_ids)


# ---------------------------------------------------------------------------
# Public document verification
# ---------------------------------------------------------------------------

class DocumentVerifyView(APIView):
    """
    Public endpoint to verify the authenticity of a document by its token.
    No authentication required – throttled to prevent abuse.
    """

    permission_classes = []
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "document_verify"

    def get(self, request, token):
        # 1) Sale (invoice / receipt)
        sale = (
            Sale.objects.filter(verification_token=token)
            .select_related("store__enterprise", "customer")
            .prefetch_related("items")
            .first()
        )
        if sale:
            return Response(self._sale_payload(sale))

        # 2) Quote
        quote = (
            Quote.objects.filter(verification_token=token)
            .select_related("store__enterprise", "customer")
            .prefetch_related("items")
            .first()
        )
        if quote:
            return Response(self._quote_payload(quote))

        # 3) Credit ledger entry
        entry = (
            CreditLedgerEntry.objects.filter(verification_token=token)
            .select_related("account__customer", "account__store__enterprise")
            .first()
        )
        if entry:
            return Response(self._credit_payload(entry))

        # 4) Stock movement batch — validate batch_id is a valid UUID
        if token.startswith("batch-"):
            batch_id = token[6:]
            import uuid as _uuid
            try:
                _uuid.UUID(batch_id)
            except ValueError:
                return Response({"found": False}, status=status.HTTP_404_NOT_FOUND)
            movements = list(
                InventoryMovement.objects.filter(batch_id=batch_id)
                .select_related("store__enterprise")
                .order_by("created_at")
            )
            if movements:
                return Response(self._stock_payload(movements))

        return Response({"found": False}, status=status.HTTP_404_NOT_FOUND)

    # -- helpers --------------------------------------------------------------

    @staticmethod
    def _enterprise_name(store):
        ent = getattr(store, "enterprise", None)
        return ent.name if ent else ""

    # -- payload builders -----------------------------------------------------

    @staticmethod
    def _sale_payload(sale):
        store = sale.store
        items = [
            {
                "product": item.product_name,
                "quantity": item.quantity,
                "unit_price": str(item.unit_price),
                "line_total": str(item.line_total),
            }
            for item in sale.items.all()
        ]
        return {
            "found": True,
            "document_type": "INVOICE",
            "number": sale.invoice_number or f"FAC-{str(sale.pk).split('-')[0].upper()}",
            "date": sale.created_at.isoformat() if sale.created_at else "",
            "total": str(sale.total),
            "currency": "FCFA",
            "status": sale.status,
            "enterprise": DocumentVerifyView._enterprise_name(store),
            "store": store.name,
            "hash": sale.verification_hash,
            "customer": str(sale.customer) if sale.customer else "Client comptoir",
            "items": items,
        }

    @staticmethod
    def _quote_payload(quote):
        store = quote.store
        items = [
            {
                "product": item.product_name,
                "quantity": item.quantity,
                "unit_price": str(item.unit_price),
                "line_total": str(item.line_total),
            }
            for item in quote.items.all()
        ]
        return {
            "found": True,
            "document_type": "QUOTE",
            "number": quote.quote_number or f"DEV-{str(quote.pk).split('-')[0].upper()}",
            "date": quote.created_at.isoformat() if quote.created_at else "",
            "total": str(quote.total),
            "currency": "FCFA",
            "status": quote.status,
            "enterprise": DocumentVerifyView._enterprise_name(store),
            "store": store.name,
            "hash": quote.verification_hash,
            "customer": str(quote.customer) if quote.customer else "",
            "items": items,
        }

    @staticmethod
    def _credit_payload(entry):
        account = entry.account
        store = account.store
        return {
            "found": True,
            "document_type": "CREDIT_PAYMENT",
            "number": f"RCR-{str(entry.pk).split('-')[0].upper()}",
            "date": entry.created_at.isoformat() if entry.created_at else "",
            "total": str(abs(entry.amount)),
            "currency": "FCFA",
            "status": "PAID",
            "enterprise": DocumentVerifyView._enterprise_name(store),
            "store": store.name,
            "hash": entry.verification_hash,
            "customer": str(account.customer) if account.customer else "",
            "items": [],
        }

    @staticmethod
    def _stock_payload(movements):
        first = movements[0]
        store = first.store
        items = [
            {
                "product": m.product.name if m.product else str(m.product_id),
                "quantity": m.quantity,
                "movement_type": m.movement_type,
            }
            for m in movements
        ]
        return {
            "found": True,
            "document_type": "STOCK_MOVEMENT",
            "number": f"MVT-{str(first.batch_id).split('-')[0].upper()}",
            "date": first.created_at.isoformat() if first.created_at else "",
            "total": "",
            "currency": "FCFA",
            "status": first.movement_type,
            "enterprise": DocumentVerifyView._enterprise_name(store),
            "store": store.name,
            "hash": "",
            "customer": "",
            "items": items,
        }


# =====================================================================
# Accounting (SYSCOHADA)
# =====================================================================

from accounting.models import (  # noqa: E402
    Account as AcctAccount,
    AccountingPeriod as AcctPeriod,
    AccountingSettings as AcctSettings,
    FiscalYear as AcctFiscalYear,
    Journal as AcctJournal,
    JournalEntry as AcctJournalEntry,
    TaxRate as AcctTaxRate,
)
from api.v1.serializers import (  # noqa: E402
    AccountSerializer,
    AccountingPeriodSerializer,
    AccountingSettingsSerializer,
    AcctJournalSerializer,
    FiscalYearSerializer,
    JournalEntryCreateSerializer,
    JournalEntrySerializer,
    TaxRateSerializer,
)
from api.v1.permissions import FeatureAccountingEnabled  # noqa: E402


class AccountViewSet(viewsets.ModelViewSet):
    """CRUD for Chart of Accounts (Plan comptable PCGO)."""

    serializer_class = AccountSerializer
    queryset = AcctAccount.objects.select_related("parent", "enterprise").all()
    permission_classes = [IsManagerOrAdmin, FeatureAccountingEnabled]
    filterset_fields = ["account_type", "is_active", "is_system", "allow_entries", "parent"]
    search_fields = ["code", "name"]
    ordering_fields = ["code", "name", "created_at"]
    ordering = ["code"]

    def get_queryset(self):
        qs = super().get_queryset()
        return _filter_queryset_by_enterprise(qs, self.request.user)

    def perform_create(self, serializer):
        enterprise_id = _require_user_enterprise_id(self.request.user)
        serializer.save(enterprise_id=enterprise_id)

    def perform_destroy(self, instance):
        if instance.is_system:
            raise ValidationError("Les comptes systeme ne peuvent pas etre supprimes.")
        if instance.entry_lines.exists():
            raise ValidationError("Ce compte a des ecritures — impossible de le supprimer.")
        instance.delete()


class AcctJournalViewSet(viewsets.ModelViewSet):
    """CRUD for Accounting Journals."""

    serializer_class = AcctJournalSerializer
    queryset = AcctJournal.objects.select_related("enterprise").all()
    permission_classes = [IsManagerOrAdmin, FeatureAccountingEnabled]
    filterset_fields = ["journal_type", "is_active"]
    search_fields = ["code", "name"]
    ordering_fields = ["code", "name"]
    ordering = ["code"]

    def get_queryset(self):
        qs = super().get_queryset()
        return _filter_queryset_by_enterprise(qs, self.request.user)

    def perform_create(self, serializer):
        enterprise_id = _require_user_enterprise_id(self.request.user)
        serializer.save(enterprise_id=enterprise_id)


class FiscalYearViewSet(viewsets.ModelViewSet):
    """CRUD for Fiscal Years."""

    serializer_class = FiscalYearSerializer
    queryset = AcctFiscalYear.objects.select_related("enterprise").all()
    permission_classes = [IsManagerOrAdmin, FeatureAccountingEnabled]
    filterset_fields = ["status"]
    search_fields = ["name"]
    ordering_fields = ["start_date", "name"]
    ordering = ["-start_date"]

    def get_queryset(self):
        qs = super().get_queryset()
        return _filter_queryset_by_enterprise(qs, self.request.user)

    def perform_create(self, serializer):
        enterprise_id = _require_user_enterprise_id(self.request.user)
        serializer.save(enterprise_id=enterprise_id)

    @action(detail=True, methods=["post"])
    def create_periods(self, request, pk=None):
        """Auto-create monthly periods for this fiscal year."""
        import calendar
        fy = self.get_object()
        if fy.periods.exists():
            return Response(
                {"detail": "Les periodes existent deja."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        year = fy.start_date.year
        from datetime import date as dt_date
        # Period 0 — Opening
        AcctPeriod.objects.create(
            fiscal_year=fy, period_number=0,
            start_date=fy.start_date, end_date=fy.start_date,
        )
        # Periods 1-12
        for month in range(1, 13):
            last_day = calendar.monthrange(year, month)[1]
            AcctPeriod.objects.create(
                fiscal_year=fy, period_number=month,
                start_date=dt_date(year, month, 1),
                end_date=dt_date(year, month, last_day),
            )
        # Period 13 — Closing
        AcctPeriod.objects.create(
            fiscal_year=fy, period_number=13,
            start_date=fy.end_date, end_date=fy.end_date,
        )
        return Response(
            {"detail": f"14 periodes creees pour {fy.name}."},
            status=status.HTTP_201_CREATED,
        )


class AccountingPeriodViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only access to Accounting Periods."""

    serializer_class = AccountingPeriodSerializer
    queryset = AcctPeriod.objects.select_related("fiscal_year").all()
    permission_classes = [IsManagerOrAdmin, FeatureAccountingEnabled]
    filterset_fields = ["fiscal_year", "status"]
    ordering_fields = ["period_number"]
    ordering = ["fiscal_year", "period_number"]

    def get_queryset(self):
        qs = super().get_queryset()
        enterprise_id = _user_enterprise_id(self.request.user)
        if enterprise_id is None:
            return qs.none()
        return qs.filter(fiscal_year__enterprise_id=enterprise_id)


class JournalEntryViewSet(viewsets.ModelViewSet):
    """CRUD for Journal Entries with nested lines."""

    serializer_class = JournalEntrySerializer
    queryset = (
        AcctJournalEntry.objects
        .select_related("journal", "fiscal_year", "period", "store", "created_by", "enterprise")
        .prefetch_related("lines", "lines__account")
        .all()
    )
    permission_classes = [IsManagerOrAdmin, FeatureAccountingEnabled]
    filterset_fields = ["journal", "period", "status", "source_type", "store", "fiscal_year"]
    search_fields = ["label", "reference"]
    ordering_fields = ["entry_date", "sequence_number", "created_at"]
    ordering = ["-entry_date", "-sequence_number"]

    def get_queryset(self):
        qs = super().get_queryset()
        return _filter_queryset_by_enterprise(qs, self.request.user)

    def get_serializer_class(self):
        if self.action == "create":
            return JournalEntryCreateSerializer
        return JournalEntrySerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        enterprise_id = _require_user_enterprise_id(request.user)

        # Resolve accounts
        lines_data = []
        for line in data["lines"]:
            try:
                account = AcctAccount.objects.get(
                    pk=line["account_id"], enterprise_id=enterprise_id,
                )
            except AcctAccount.DoesNotExist:
                return Response(
                    {"detail": f"Compte introuvable: {line['account_id']}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            lines_data.append({
                "account": account,
                "debit": line["debit"],
                "credit": line["credit"],
                "label": line.get("label", ""),
            })

        from accounting.services import create_journal_entry
        from stores.models import Enterprise, Store

        enterprise = Enterprise.objects.get(pk=enterprise_id)
        store = None
        if data.get("store"):
            store = Store.objects.filter(pk=data["store"]).first()

        entry = create_journal_entry(
            enterprise=enterprise,
            store=store,
            journal_code=data["journal_code"],
            lines_data=lines_data,
            label=data["label"],
            reference=data.get("reference", ""),
            entry_date=data["entry_date"],
            created_by=request.user,
            auto_post=False,
        )
        if not entry:
            return Response(
                {"detail": "Impossible de creer l'ecriture. Verifiez journal et periode."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        out = JournalEntrySerializer(entry).data
        return Response(out, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def validate_entry(self, request, pk=None):
        """Validate a draft entry."""
        entry = self.get_object()
        if entry.status != AcctJournalEntry.Status.DRAFT:
            return Response(
                {"detail": "Seules les ecritures en brouillon peuvent etre validees."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        entry.status = AcctJournalEntry.Status.VALIDATED
        entry.validated_by = request.user
        entry.save(update_fields=["status", "validated_by", "updated_at"])
        return Response(JournalEntrySerializer(entry).data)

    @action(detail=True, methods=["post"])
    def post_entry(self, request, pk=None):
        """Post (comptabiliser) a validated entry."""
        entry = self.get_object()
        if entry.status not in (
            AcctJournalEntry.Status.DRAFT,
            AcctJournalEntry.Status.VALIDATED,
        ):
            return Response(
                {"detail": "Cette ecriture est deja comptabilisee."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not entry.is_balanced:
            return Response(
                {"detail": "L'ecriture n'est pas equilibree."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        entry.status = AcctJournalEntry.Status.POSTED
        if not entry.validated_by:
            entry.validated_by = request.user
        entry.save(update_fields=["status", "validated_by", "updated_at"])
        return Response(JournalEntrySerializer(entry).data)

    @action(detail=False, methods=["get"])
    def balance_generale(self, request):
        """Return balance generale: debit/credit/solde per account."""
        from django.db.models import Sum
        enterprise_id = _user_enterprise_id(request.user)
        if not enterprise_id:
            return Response([])

        filters = {"entry__enterprise_id": enterprise_id, "entry__status": "POSTED"}
        fiscal_year_id = request.query_params.get("fiscal_year")
        if fiscal_year_id:
            filters["entry__fiscal_year_id"] = fiscal_year_id

        from accounting.models import JournalEntryLine
        qs = (
            JournalEntryLine.objects
            .filter(**filters)
            .values("account__code", "account__name", "account__account_type")
            .annotate(total_debit=Sum("debit"), total_credit=Sum("credit"))
            .order_by("account__code")
        )
        results = []
        for row in qs:
            solde = (row["total_debit"] or Decimal("0")) - (row["total_credit"] or Decimal("0"))
            results.append({
                "account_code": row["account__code"],
                "account_name": row["account__name"],
                "account_type": row["account__account_type"],
                "total_debit": row["total_debit"] or Decimal("0"),
                "total_credit": row["total_credit"] or Decimal("0"),
                "solde": solde,
            })
        return Response(results)

    @action(detail=False, methods=["get"])
    def grand_livre(self, request):
        """Return grand livre: all entries for a given account."""
        enterprise_id = _user_enterprise_id(request.user)
        if not enterprise_id:
            return Response([])

        account_id = request.query_params.get("account")
        if not account_id:
            return Response(
                {"detail": "Le parametre 'account' est requis."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from accounting.models import JournalEntryLine
        qs = (
            JournalEntryLine.objects
            .filter(
                account_id=account_id,
                entry__enterprise_id=enterprise_id,
                entry__status="POSTED",
            )
            .select_related("entry", "entry__journal", "account")
            .order_by("entry__entry_date", "entry__sequence_number")
        )

        fiscal_year_id = request.query_params.get("fiscal_year")
        if fiscal_year_id:
            qs = qs.filter(entry__fiscal_year_id=fiscal_year_id)

        results = []
        running_balance = Decimal("0")
        for line in qs:
            running_balance += line.debit - line.credit
            results.append({
                "entry_date": line.entry.entry_date,
                "journal_code": line.entry.journal.code,
                "sequence_number": line.entry.sequence_number,
                "label": line.label or line.entry.label,
                "reference": line.entry.reference,
                "debit": line.debit,
                "credit": line.credit,
                "solde": running_balance,
            })
        return Response(results)

    @action(detail=False, methods=["get"])
    def bilan(self, request):
        """Return SYSCOHADA Balance Sheet (Bilan) structured data."""
        from accounting.reports import generate_bilan
        from accounting.models import FiscalYear as AcctFiscalYear
        enterprise_id = _user_enterprise_id(request.user)
        if not enterprise_id:
            return Response({"actif": [], "passif": [], "totals": {}})

        fiscal_year_id = request.query_params.get("fiscal_year")
        if fiscal_year_id:
            try:
                fiscal_year = AcctFiscalYear.objects.get(pk=fiscal_year_id, enterprise_id=enterprise_id)
            except AcctFiscalYear.DoesNotExist:
                return Response({"detail": "Exercice fiscal introuvable."}, status=status.HTTP_404_NOT_FOUND)
        else:
            fiscal_year = AcctFiscalYear.objects.filter(
                enterprise_id=enterprise_id, status=AcctFiscalYear.Status.OPEN
            ).order_by("-end_date").first()

        if not fiscal_year:
            return Response({"actif": [], "passif": [], "totals": {}})

        data = generate_bilan(enterprise_id, fiscal_year)
        return Response(data)

    @action(detail=False, methods=["get"])
    def compte_resultat(self, request):
        """Return SYSCOHADA Income Statement (Compte de resultat) structured data."""
        from accounting.reports import generate_compte_resultat
        from accounting.models import FiscalYear as AcctFiscalYear
        enterprise_id = _user_enterprise_id(request.user)
        if not enterprise_id:
            return Response({"charges": [], "produits": [], "totals": {}})

        fiscal_year_id = request.query_params.get("fiscal_year")
        if fiscal_year_id:
            try:
                fiscal_year = AcctFiscalYear.objects.get(pk=fiscal_year_id, enterprise_id=enterprise_id)
            except AcctFiscalYear.DoesNotExist:
                return Response({"detail": "Exercice fiscal introuvable."}, status=status.HTTP_404_NOT_FOUND)
        else:
            fiscal_year = AcctFiscalYear.objects.filter(
                enterprise_id=enterprise_id, status=AcctFiscalYear.Status.OPEN
            ).order_by("-end_date").first()

        if not fiscal_year:
            return Response({"charges": [], "produits": [], "totals": {}})

        data = generate_compte_resultat(enterprise_id, fiscal_year)
        return Response(data)


class TaxRateViewSet(viewsets.ModelViewSet):
    """CRUD for Tax Rates."""

    serializer_class = TaxRateSerializer
    queryset = AcctTaxRate.objects.select_related("enterprise").all()
    permission_classes = [IsManagerOrAdmin, FeatureAccountingEnabled]
    filterset_fields = ["is_active", "is_exempt"]
    search_fields = ["name"]
    ordering = ["rate"]

    def get_queryset(self):
        qs = super().get_queryset()
        return _filter_queryset_by_enterprise(qs, self.request.user)

    def perform_create(self, serializer):
        enterprise_id = _require_user_enterprise_id(self.request.user)
        serializer.save(enterprise_id=enterprise_id)


class AccountingSettingsViewSet(viewsets.GenericViewSet):
    """Retrieve and update accounting settings for the user's enterprise."""

    serializer_class = AccountingSettingsSerializer
    permission_classes = [IsManagerOrAdmin, FeatureAccountingEnabled]

    def get_object(self):
        enterprise_id = _require_user_enterprise_id(self.request.user)
        obj, _ = AcctSettings.objects.get_or_create(enterprise_id=enterprise_id)
        return obj

    def list(self, request, *args, **kwargs):
        obj = self.get_object()
        serializer = self.get_serializer(obj)
        return Response(serializer.data)

    def partial_update(self, request, *args, **kwargs):
        obj = self.get_object()
        serializer = self.get_serializer(obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


# ---------------------------------------------------------------------------
# Public invoice download (no auth — used for WhatsApp sharing)
# ---------------------------------------------------------------------------

class InvoiceDownloadView(APIView):
    """
    Public endpoint to download an invoice PDF by its verification token.
    No authentication required — throttled to prevent abuse.
    """

    permission_classes = []
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "document_verify"

    def get(self, request, token):
        sale = (
            Sale.objects.filter(verification_token=token)
            .select_related("store")
            .first()
        )
        if not sale:
            return Response(
                {"detail": "Document introuvable."},
                status=status.HTTP_404_NOT_FOUND,
            )
        try:
            return generate_invoice_pdf(sale=sale, store=sale.store, document_kind="invoice")
        except Exception:
            return Response(
                {"detail": "Impossible de generer la facture."},
                status=status.HTTP_400_BAD_REQUEST,
            )


# ---------------------------------------------------------------------------
# Phase 3 ViewSets
# ---------------------------------------------------------------------------

class ProductVariantViewSet(viewsets.ModelViewSet):
    """CRUD for product variants."""

    serializer_class = ProductVariantSerializer
    permission_classes = [IsAuthenticated, IsManagerOrAdmin]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ["product", "is_active"]
    search_fields = ["name", "sku", "barcode"]
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        qs = ProductVariant.objects.select_related("product")
        return _filter_queryset_by_enterprise(qs, self.request.user, field_name="product__enterprise_id")

    def perform_create(self, serializer):
        serializer.save()


class LoyaltyAccountViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """List loyalty accounts for the current store."""

    serializer_class = LoyaltyAccountSerializer
    permission_classes = [IsAuthenticated, IsManagerOrAdmin]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["customer"]
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        store_ids = _user_store_ids(self.request.user)
        return LoyaltyAccount.objects.filter(store_id__in=store_ids).select_related("customer")

    @action(detail=False, methods=["post"], url_path="redeem")
    def redeem_points(self, request):
        """Redeem loyalty points for a customer."""
        from customers.services import redeem_points as _redeem_points
        customer_id = request.data.get("customer_id")
        points = request.data.get("points")
        sale_id = request.data.get("sale_id")
        store_ids = list(_user_store_ids(request.user))
        if not store_ids:
            return Response({"detail": "Aucune boutique accessible."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            account = LoyaltyAccount.objects.get(store_id__in=store_ids, customer_id=customer_id)
            result = _redeem_points(account=account, points=float(points), sale_id=sale_id, actor=request.user)
            return Response(LoyaltyAccountSerializer(result).data)
        except LoyaltyAccount.DoesNotExist:
            return Response({"detail": "Compte fidelite introuvable."}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class PricingPolicyViewSet(viewsets.ModelViewSet):
    """CRUD for pricing policies."""

    serializer_class = PricingPolicySerializer
    permission_classes = [IsAuthenticated, IsManagerOrAdmin]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ["is_active", "customer_tier", "store"]
    search_fields = ["name"]
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        qs = PricingPolicy.objects.prefetch_related("rules").order_by("-priority")
        return _filter_queryset_by_enterprise(qs, self.request.user)

    def perform_create(self, serializer):
        enterprise_id = _require_user_enterprise_id(self.request.user)
        serializer.save(enterprise_id=enterprise_id)


class RecurringSaleViewSet(viewsets.ModelViewSet):
    """CRUD for recurring sales."""

    serializer_class = RecurringSaleSerializer
    permission_classes = [IsAuthenticated, IsManagerOrAdmin]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ["is_active", "frequency", "customer"]
    search_fields = ["name"]
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        store_ids = _user_store_ids(self.request.user)
        return RecurringSale.objects.filter(store_id__in=store_ids).prefetch_related("items")

    def perform_create(self, serializer):
        # Use user's default store
        su = StoreUser.objects.filter(
            user=self.request.user, is_default=True, store__is_active=True,
        ).select_related("store").first()
        if not su:
            raise PermissionDenied("Aucune boutique par defaut trouvee.")
        serializer.save(store=su.store)

    @action(detail=True, methods=["post"], url_path="generate-now")
    def generate_now(self, request, pk=None):
        """Manually trigger generation of a recurring sale."""
        from sales.services import generate_from_template
        rs = self.get_object()
        try:
            sale = generate_from_template(rs)
            return Response({"detail": "Vente generee.", "sale_id": str(sale.id)})
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class CashShiftDenominationViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
):
    """Save/list denominations for a cash shift closing."""

    serializer_class = CashShiftDenominationSerializer
    permission_classes = [IsAuthenticated, IsCashier]
    pagination_class = StandardResultsSetPagination

    def _get_shift(self):
        shift_id = self.kwargs.get("shift_pk")
        store_ids = _user_store_ids(self.request.user)
        return get_object_or_404(CashShift, pk=shift_id, store_id__in=store_ids)

    def get_queryset(self):
        shift = self._get_shift()
        return CashShiftDenomination.objects.filter(shift=shift)

    def perform_create(self, serializer):
        shift = self._get_shift()
        denomination = serializer.validated_data["denomination"]
        # upsert
        obj, _ = CashShiftDenomination.objects.update_or_create(
            shift=shift,
            denomination=denomination,
            defaults={"count": serializer.validated_data["count"]},
        )
        serializer.instance = obj
