"""Custom DRF permissions for the boutique management system."""
from rest_framework.permissions import BasePermission


FEATURE_FLAG_TO_MODULE_CODE = {
    "sales_pos": "SELL",
    "sales_refund": "SELL",
    "cashier_operations": "CASH",
    "stock_management": "STOCK",
    "stock_entries": "STOCK",
    "purchases_management": "PURCHASE",
    "credit_management": "CUSTOMER",
    "expenses_management": "EXPENSE",
    "commercial_pipeline": "COMMERCIAL",
    "commercial_ai": "COMMERCIAL",
    "commercial_incentives": "COMMERCIAL",
    "commercial_exports": "COMMERCIAL",
    "hrm_management": "HRM",
    "alerts_center": "ALERTS",
    "reports_center": "ANALYTICS_MANAGER",
    "dashboard_strategic": "ANALYTICS_DG",
    "abc_analysis": "ANALYTICS_MANAGER",
    "dynamic_reorder": "ANALYTICS_MANAGER",
    "credit_scoring": "CLIENT_INTEL",
    "sales_forecast": "ANALYTICS_MANAGER",
    "fraud_detection": "ANALYTICS_MANAGER",
    "enabled": "ANALYTICS_MANAGER",
}


def _resolve_store_from_request(
    request,
    view,
    *,
    store_lookup_fields=("store", "store_id", "from_store_id", "to_store_id"),
):
    """Best-effort store resolution for permission checks."""
    from stores.models import Store

    query_params = getattr(request, "query_params", {}) or {}
    data = getattr(request, "data", {}) or {}
    kwargs = getattr(view, "kwargs", {}) or {}

    store_id = None
    for key in store_lookup_fields:
        store_id = query_params.get(key) or data.get(key) or kwargs.get(key)
        if store_id:
            break

    if not store_id:
        sale_id = query_params.get("sale_id") or data.get("sale_id") or data.get("sale")
        if sale_id:
            from sales.models import Sale
            sale = Sale.objects.filter(pk=sale_id).only("store_id").first()
            if sale:
                store_id = sale.store_id

    if not store_id:
        account_id = query_params.get("account_id") or data.get("account_id") or data.get("account")
        if account_id:
            from credits.models import CustomerAccount
            account = CustomerAccount.objects.filter(pk=account_id).only("store_id").first()
            if account:
                store_id = account.store_id

    if store_id:
        return Store.objects.filter(pk=store_id, is_active=True).first()

    current_store = getattr(request, "current_store", None)
    if current_store is not None:
        return current_store

    if getattr(request.user, "is_superuser", False):
        return Store.objects.filter(is_active=True).first()

    default_link = (
        request.user.store_users
        .filter(store__is_active=True)
        .select_related("store")
        .order_by("-is_default", "store_id")
        .first()
    )
    if default_link:
        return default_link.store
    return None


def _resolve_object_store(obj):
    from stores.models import Store

    direct_store = getattr(obj, "store", None)
    if direct_store is not None and getattr(direct_store, "id", None):
        return direct_store

    if hasattr(obj, "store_id") and getattr(obj, "store_id", None):
        return Store.objects.filter(pk=obj.store_id, is_active=True).first()

    related_attrs = ("sale", "account", "purchase_order", "shift")
    for attr in related_attrs:
        related = getattr(obj, attr, None)
        if related is None:
            continue
        nested_store = getattr(related, "store", None)
        if nested_store is not None and getattr(nested_store, "id", None):
            return nested_store
        nested_store_id = getattr(related, "store_id", None)
        if nested_store_id:
            return Store.objects.filter(pk=nested_store_id, is_active=True).first()
    return None


def _resolve_user_enterprise_id(user):
    """Best-effort enterprise resolution for tenant-scoped admin checks."""
    store_link = (
        user.store_users
        .filter(store__is_active=True, store__enterprise__is_active=True)
        .select_related("store__enterprise")
        .order_by("-is_default", "store_id")
        .first()
    )
    if store_link and store_link.store and store_link.store.enterprise_id:
        return store_link.store.enterprise_id

    custom_role = getattr(user, "custom_role", None)
    custom_role_enterprise_id = getattr(custom_role, "enterprise_id", None)
    if custom_role_enterprise_id:
        return custom_role_enterprise_id

    return None


def _user_has_store_access(user, store_id: str) -> bool:
    """Tenant-safe store access check used by IsStoreMember."""
    if getattr(user, "is_superuser", False):
        return True

    if getattr(user, "role", None) == "ADMIN":
        from stores.models import Store

        enterprise_id = _resolve_user_enterprise_id(user)
        if enterprise_id is not None:
            return Store.objects.filter(
                pk=store_id,
                enterprise_id=enterprise_id,
                is_active=True,
            ).exists()

    return user.store_users.filter(store_id=str(store_id), store__is_active=True).exists()


def _is_store_module_enabled(store, module_code: str) -> bool:
    if not module_code:
        return True
    from stores.services import resolve_store_module_matrix

    matrix = resolve_store_module_matrix(store=store)
    modules = matrix.get("modules", {}) or {}
    return bool(modules.get(module_code, False))


def _format_module_label(module_code: str) -> str:
    from stores.models import MODULE_CODE_LABELS

    return MODULE_CODE_LABELS.get(module_code, module_code)


class RequireStoreModuleEnabled(BasePermission):
    """Enforce commercial module entitlement at store scope."""

    module_code = None
    module_codes_any = ()
    store_lookup_fields = ("store", "store_id", "from_store_id", "to_store_id")
    message = "Module desactive pour cette boutique."

    def _effective_module_codes(self, view):
        exact = getattr(view, "required_module_code", None) or self.module_code
        if exact:
            return (exact,)
        any_of = getattr(view, "required_module_any_of", None) or self.module_codes_any
        if any_of:
            return tuple(any_of)
        return ()

    def _is_enabled(self, store, module_codes):
        return any(_is_store_module_enabled(store, module_code) for module_code in module_codes)

    def _deny(self, module_codes):
        if len(module_codes) == 1:
            label = _format_module_label(module_codes[0])
            self.message = f"Le module '{label}' n'est pas active pour cette boutique."
        else:
            labels = ", ".join(_format_module_label(code) for code in module_codes)
            self.message = f"Aucun des modules requis n'est actif ({labels})."
        return False

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if getattr(request.user, "is_superuser", False):
            return True

        module_codes = self._effective_module_codes(view)
        if not module_codes:
            return True

        store = _resolve_store_from_request(
            request,
            view,
            store_lookup_fields=self.store_lookup_fields,
        )
        if store:
            if self._is_enabled(store, module_codes):
                return True
            return self._deny(module_codes)

        # For detail routes, defer to object-level checks.
        if getattr(view, "kwargs", {}).get("pk"):
            return True

        links = (
            request.user.store_users
            .filter(store__is_active=True)
            .select_related("store")
            .order_by("-is_default", "store_id")
        )
        for link in links:
            if self._is_enabled(link.store, module_codes):
                return True
        return self._deny(module_codes)

    def has_object_permission(self, request, view, obj):
        if not request.user.is_authenticated:
            return False
        if getattr(request.user, "is_superuser", False):
            return True

        module_codes = self._effective_module_codes(view)
        if not module_codes:
            return True

        store = _resolve_object_store(obj)
        if not store:
            # Some resources are enterprise-scoped (no direct store FK), e.g.
            # catalog categories/products. In that case rely on route-level
            # module checks already performed in has_permission().
            return True
        if self._is_enabled(store, module_codes):
            return True
        return self._deny(module_codes)


class ModuleCoreEnabled(RequireStoreModuleEnabled):
    module_code = "CORE"


class ModuleSellEnabled(RequireStoreModuleEnabled):
    module_code = "SELL"


class ModuleSellOrStockEnabled(RequireStoreModuleEnabled):
    module_codes_any = ("SELL", "STOCK")


class ModuleCashEnabled(RequireStoreModuleEnabled):
    module_code = "CASH"


class ModuleCustomerEnabled(RequireStoreModuleEnabled):
    module_code = "CUSTOMER"


class ModuleStockEnabled(RequireStoreModuleEnabled):
    module_code = "STOCK"


class ModulePurchaseEnabled(RequireStoreModuleEnabled):
    module_code = "PURCHASE"


class ModuleExpenseEnabled(RequireStoreModuleEnabled):
    module_code = "EXPENSE"


class ModuleCommercialEnabled(RequireStoreModuleEnabled):
    module_code = "COMMERCIAL"


class ModuleSellerPerformanceEnabled(RequireStoreModuleEnabled):
    module_code = "SELLER_PERF"


class ModuleAnalyticsManagerEnabled(RequireStoreModuleEnabled):
    module_code = "ANALYTICS_MANAGER"


class ModuleAnalyticsCashierEnabled(RequireStoreModuleEnabled):
    module_code = "ANALYTICS_CASHIER"


class ModuleAnalyticsStockEnabled(RequireStoreModuleEnabled):
    module_code = "ANALYTICS_STOCK"


class ModuleAnalyticsDGEnabled(RequireStoreModuleEnabled):
    module_code = "ANALYTICS_DG"


class ModuleClientIntelEnabled(RequireStoreModuleEnabled):
    module_code = "CLIENT_INTEL"


class ModuleAlertsEnabled(RequireStoreModuleEnabled):
    module_code = "ALERTS"


class ModuleHRMEnabled(RequireStoreModuleEnabled):
    module_code = "HRM"


class RequireStoreFeatureFlag(BasePermission):
    """Enforce a store feature flag on API endpoints."""

    feature_key = None
    store_lookup_fields = ("store", "store_id", "from_store_id", "to_store_id")
    message = "Module desactive pour cette boutique."

    def _effective_feature_key(self, view):
        return getattr(view, "required_feature_flag", None) or self.feature_key

    def _effective_module_code(self, view, feature_key):
        explicit_module = getattr(view, "required_module_code", None)
        if explicit_module:
            return explicit_module
        return FEATURE_FLAG_TO_MODULE_CODE.get(feature_key)

    def _is_feature_enabled(self, store, feature_key):
        checker = getattr(store, "is_feature_enabled", None)
        return bool(callable(checker) and checker(feature_key))

    def _deny_feature(self, feature_key):
        from stores.models import FEATURE_FLAG_LABELS

        label = FEATURE_FLAG_LABELS.get(feature_key, feature_key)
        self.message = f"Le module '{label}' est desactive pour cette boutique."
        return False

    def _deny_module(self, module_code):
        label = _format_module_label(module_code)
        self.message = f"Le module '{label}' n'est pas active pour cette boutique."
        return False

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if getattr(request.user, "is_superuser", False):
            return True

        feature_key = self._effective_feature_key(view)
        if not feature_key:
            return True
        required_module_code = self._effective_module_code(view, feature_key)

        store = _resolve_store_from_request(
            request,
            view,
            store_lookup_fields=self.store_lookup_fields,
        )
        if store:
            if not self._is_feature_enabled(store, feature_key):
                return self._deny_feature(feature_key)
            if required_module_code and not _is_store_module_enabled(store, required_module_code):
                return self._deny_module(required_module_code)
            return True

        # For detail routes, defer to object-level checks.
        if getattr(view, "kwargs", {}).get("pk"):
            return True

        links = (
            request.user.store_users
            .filter(store__is_active=True)
            .select_related("store")
            .order_by("-is_default", "store_id")
        )
        module_denied = False
        for link in links:
            if not self._is_feature_enabled(link.store, feature_key):
                continue
            if required_module_code and not _is_store_module_enabled(link.store, required_module_code):
                module_denied = True
                continue
            return True
        if required_module_code and module_denied:
            return self._deny_module(required_module_code)
        return self._deny_feature(feature_key)

    def has_object_permission(self, request, view, obj):
        if not request.user.is_authenticated:
            return False
        if getattr(request.user, "is_superuser", False):
            return True

        feature_key = self._effective_feature_key(view)
        if not feature_key:
            return True
        required_module_code = self._effective_module_code(view, feature_key)

        store = _resolve_object_store(obj)
        if not store:
            # Some resources are enterprise-scoped and do not carry a direct
            # store FK (e.g. HRM objects). In that case rely on route-level
            # permission checks already done in has_permission().
            return True
        if not self._is_feature_enabled(store, feature_key):
            return self._deny_feature(feature_key)
        if required_module_code and not _is_store_module_enabled(store, required_module_code):
            return self._deny_module(required_module_code)
        return True


class FeatureSalesPOSEnabled(RequireStoreFeatureFlag):
    feature_key = "sales_pos"


class FeatureSalesRefundEnabled(RequireStoreFeatureFlag):
    feature_key = "sales_refund"


class FeatureCashierOperationsEnabled(RequireStoreFeatureFlag):
    feature_key = "cashier_operations"


class FeatureStockManagementEnabled(RequireStoreFeatureFlag):
    feature_key = "stock_management"


class FeatureStockEntriesEnabled(RequireStoreFeatureFlag):
    feature_key = "stock_entries"


class FeaturePurchasesManagementEnabled(RequireStoreFeatureFlag):
    feature_key = "purchases_management"


class FeatureCreditManagementEnabled(RequireStoreFeatureFlag):
    feature_key = "credit_management"


class FeatureExpensesManagementEnabled(RequireStoreFeatureFlag):
    feature_key = "expenses_management"


class FeatureCommercialPipelineEnabled(RequireStoreFeatureFlag):
    feature_key = "commercial_pipeline"


class FeatureCommercialAIEnabled(RequireStoreFeatureFlag):
    feature_key = "commercial_ai"


class FeatureCommercialIncentivesEnabled(RequireStoreFeatureFlag):
    feature_key = "commercial_incentives"


class FeatureCommercialExportsEnabled(RequireStoreFeatureFlag):
    feature_key = "commercial_exports"


class FeatureHRMManagementEnabled(RequireStoreFeatureFlag):
    feature_key = "hrm_management"


class FeatureAlertsCenterEnabled(RequireStoreFeatureFlag):
    feature_key = "alerts_center"


class FeatureReportsCenterEnabled(RequireStoreFeatureFlag):
    feature_key = "reports_center"


class FeatureAnalyticsEnabled(RequireStoreFeatureFlag):
    feature_key = "enabled"


class IsSuperAdmin(BasePermission):
    """Allow access only to Django superusers (platform-level)."""

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.is_superuser


class IsAdmin(BasePermission):
    """Allow access to tenant administrators (ADMIN/MANAGER)."""

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in ('ADMIN', 'MANAGER')


class IsManagerOrAdmin(BasePermission):
    """Allow access to users with the ADMIN or MANAGER role."""

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in ('ADMIN', 'MANAGER')


# ---------------------------------------------------------------------------
# Capability-aware permission base class
# ---------------------------------------------------------------------------

class _CapabilityPermission(BasePermission):
    """Base class for capability-aware permissions.

    When the ``advanced_permissions`` feature flag is enabled on the store,
    checks the user's explicit capabilities on their StoreUser record.
    Otherwise falls back to the legacy role-based check.

    Subclasses must set ``capability`` and ``allowed_roles``.
    """

    capability = None       # e.g. "CAN_SELL"
    allowed_roles = ()      # e.g. ("SALES", "MANAGER", "ADMIN")

    def _resolve_store(self, request, view):
        """Try to determine the store from request context."""
        return _resolve_store_from_request(
            request,
            view,
            store_lookup_fields=("store", "store_id", "from_store_id", "to_store_id"),
        )

    def _has_capability_on_store(self, user, store):
        if not self.capability:
            return False
        store_user = user.store_users.filter(store=store).first()
        if store_user:
            return store_user.has_capability(self.capability)
        if getattr(user, "role", None) in ("ADMIN", "MANAGER") and _user_has_store_access(user, str(store.id)):
            from stores.capabilities import ROLE_CAPABILITY_MAP

            return self.capability in ROLE_CAPABILITY_MAP.get(user.role, [])
        return False

    def has_permission(self, request, view):
        user = request.user
        if not user.is_authenticated:
            return False
        # Platform-level superadmins always pass.
        if getattr(user, "is_superuser", False):
            return True

        # Capability-based check when advanced permissions are enabled.
        if self.capability:
            store = self._resolve_store(request, view)
            if store and store.is_feature_enabled("advanced_permissions"):
                return self._has_capability_on_store(user, store)

            if not store:
                links = (
                    user.store_users
                    .filter(store__is_active=True)
                    .select_related("store")
                    .order_by("-is_default", "store_id")
                )
                advanced_links = [link for link in links if link.store.is_feature_enabled("advanced_permissions")]
                if advanced_links:
                    return any(link.has_capability(self.capability) for link in advanced_links)

        # Legacy role-based fallback
        return user.role in self.allowed_roles


class IsCashier(_CapabilityPermission):
    """Allow access to cashiers, managers, and admins (or users with CAN_CASH)."""
    capability = "CAN_CASH"
    allowed_roles = ("CASHIER", "ADMIN", "MANAGER")


class IsSales(_CapabilityPermission):
    """Allow access to sales staff, managers, and admins (or users with CAN_SELL)."""
    capability = "CAN_SELL"
    allowed_roles = ("SALES", "ADMIN", "MANAGER")


class IsStoreMember(BasePermission):
    """Check that the user has access to the requested store via StoreUser.

    - Superusers always pass.
    - ADMIN users are granted access to stores in their own enterprise.
    - If a ``store`` parameter is present (query or body), verify the user
      has access to it.
    - If no ``store`` is given, read-only requests pass through (queryset
      filtering handles isolation), but mutating requests are denied to
      prevent writes without an explicit store context.
    """

    @staticmethod
    def _extract_store_id(request, view):
        store_id = request.query_params.get('store') or request.data.get('store')
        if store_id:
            return store_id

        # Common URL kwargs used by nested routes.
        kwargs = getattr(view, "kwargs", {}) or {}
        return kwargs.get("store") or kwargs.get("store_id") or kwargs.get("store_pk")

    @staticmethod
    def _resolve_object_store_id(obj):
        if hasattr(obj, "store_id") and getattr(obj, "store_id", None):
            return str(obj.store_id)

        related_attrs = ("store", "sale", "account", "purchase_order")
        for attr in related_attrs:
            related = getattr(obj, attr, None)
            if related is None:
                continue
            related_store_id = getattr(related, "store_id", None)
            if related_store_id:
                return str(related_store_id)
            nested_store = getattr(related, "store", None)
            if nested_store and getattr(nested_store, "pk", None):
                return str(nested_store.pk)
        return None

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        # Platform-level bypass only for Django superusers.
        if getattr(request.user, "is_superuser", False):
            return True

        store_id = self._extract_store_id(request, view)
        if not store_id:
            if request.method in ('GET', 'HEAD', 'OPTIONS'):
                return True

            # For detail routes, defer store check to has_object_permission.
            if getattr(view, "kwargs", {}).get("pk"):
                return True
            return False
        return _user_has_store_access(request.user, str(store_id))

    def has_object_permission(self, request, view, obj):
        if not request.user.is_authenticated:
            return False
        if getattr(request.user, "is_superuser", False):
            return True

        store_id = self._resolve_object_store_id(obj)
        if not store_id:
            return False
        return _user_has_store_access(request.user, store_id)


class CanProcessPayment(_CapabilityPermission):
    """Allow cashiers, managers, and admins to process payments."""
    capability = "CAN_CASH"
    allowed_roles = ("CASHIER", "MANAGER", "ADMIN")


class CanApproveRefund(_CapabilityPermission):
    """Allow only managers and admins to approve refunds."""
    capability = "CAN_REFUND"
    allowed_roles = ("MANAGER", "ADMIN")


class CanOverridePrice(_CapabilityPermission):
    """Allow managers and admins to override the selling price at sale time."""
    capability = "CAN_OVERRIDE_PRICE"
    allowed_roles = ("MANAGER", "ADMIN")


class CanCreateExpense(_CapabilityPermission):
    """Allow cashier/manager/admin to create expenses."""
    capability = "CAN_CREATE_EXPENSE"
    allowed_roles = ("CASHIER", "MANAGER", "ADMIN")


class CanEditExpense(_CapabilityPermission):
    """Allow manager/admin to edit expenses."""
    capability = "CAN_EDIT_EXPENSE"
    allowed_roles = ("MANAGER", "ADMIN")


class CanVoidExpense(_CapabilityPermission):
    """Allow manager/admin to void expenses."""
    capability = "CAN_VOID_EXPENSE"
    allowed_roles = ("MANAGER", "ADMIN")


class CanViewExpenseReports(_CapabilityPermission):
    """Allow cashier/manager/admin to view expense analytics and lists."""
    capability = "CAN_VIEW_EXPENSE_REPORTS"
    allowed_roles = ("CASHIER", "MANAGER", "ADMIN")


class CanManageExpenseCategories(_CapabilityPermission):
    """Allow manager/admin to manage expense categories."""
    capability = "CAN_MANAGE_CATEGORIES"
    allowed_roles = ("MANAGER", "ADMIN")


class CanManageExpenseWallets(_CapabilityPermission):
    """Allow manager/admin to manage wallets."""
    capability = "CAN_MANAGE_WALLETS"
    allowed_roles = ("MANAGER", "ADMIN")


class CanSetExpenseBudgets(_CapabilityPermission):
    """Allow manager/admin to manage budgets."""
    capability = "CAN_SET_BUDGETS"
    allowed_roles = ("MANAGER", "ADMIN")


class CanManageLeads(_CapabilityPermission):
    """Allow sales/manager/admin to manage leads and prospects."""
    capability = "CAN_MANAGE_LEADS"
    allowed_roles = ("SALES", "COMMERCIAL", "MANAGER", "ADMIN")


class CanManageOpportunities(_CapabilityPermission):
    """Allow sales/manager/admin to manage opportunities."""
    capability = "CAN_MANAGE_OPPORTUNITIES"
    allowed_roles = ("SALES", "COMMERCIAL", "MANAGER", "ADMIN")


class CanLogCommercialActivity(_CapabilityPermission):
    """Allow sales/manager/admin to log activities and follow-up tasks."""
    capability = "CAN_LOG_ACTIVITY"
    allowed_roles = ("SALES", "COMMERCIAL", "MANAGER", "ADMIN")


class CanViewCommercialTeam(_CapabilityPermission):
    """Allow manager/admin to view team-wide commercial data."""
    capability = "CAN_VIEW_COMMERCIAL_TEAM"
    allowed_roles = ("MANAGER", "ADMIN")


class CanApproveCommercialBonus(_CapabilityPermission):
    """Allow manager/admin to approve commercial incentive runs."""
    capability = "CAN_APPROVE_COMMERCIAL_BONUS"
    allowed_roles = ("MANAGER", "ADMIN")


class CanExportCommercial(_CapabilityPermission):
    """Allow commercial/manager/admin to export commercial datasets."""
    capability = "CAN_EXPORT_COMMERCIAL"
    allowed_roles = ("COMMERCIAL", "MANAGER", "ADMIN")


class CanManageUsers(_CapabilityPermission):
    """Allow tenant admins/managers to manage users when capability is granted."""
    capability = "CAN_MANAGE_USERS"
    allowed_roles = ("MANAGER", "ADMIN")


class CanManageStores(_CapabilityPermission):
    """Allow tenant admins/managers to manage stores when capability is granted."""
    capability = "CAN_MANAGE_STORES"
    allowed_roles = ("MANAGER", "ADMIN")


class CanManageSubscriptions(_CapabilityPermission):
    """Allow tenant admins/managers to manage enterprise subscriptions/plans."""
    capability = "CAN_MANAGE_SUBSCRIPTIONS"
    allowed_roles = ("MANAGER", "ADMIN")


class CanManageModules(_CapabilityPermission):
    """Allow tenant admins/managers to manage paid modules and entitlements."""
    capability = "CAN_MANAGE_MODULES"
    allowed_roles = ("MANAGER", "ADMIN")


class CanViewHRM(_CapabilityPermission):
    """Allow HR/manager/admin to consult HRM data."""
    capability = "CAN_VIEW_HRM"
    allowed_roles = ("HR", "MANAGER", "ADMIN")


class CanManageHRM(_CapabilityPermission):
    """Allow HR/manager/admin to mutate HRM data."""
    capability = "CAN_MANAGE_HRM"
    allowed_roles = ("HR", "MANAGER", "ADMIN")
