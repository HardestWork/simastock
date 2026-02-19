"""Custom DRF permissions for the boutique management system."""
from rest_framework.permissions import BasePermission, SAFE_METHODS


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


class RequireStoreFeatureFlag(BasePermission):
    """Enforce a store feature flag on API endpoints."""

    feature_key = None
    store_lookup_fields = ("store", "store_id", "from_store_id", "to_store_id")
    message = "Module desactive pour cette boutique."

    def _effective_feature_key(self, view):
        return getattr(view, "required_feature_flag", None) or self.feature_key

    def _is_enabled(self, store, feature_key):
        checker = getattr(store, "is_feature_enabled", None)
        return bool(callable(checker) and checker(feature_key))

    def _deny(self, feature_key):
        from stores.models import FEATURE_FLAG_LABELS

        label = FEATURE_FLAG_LABELS.get(feature_key, feature_key)
        self.message = f"Le module '{label}' est desactive pour cette boutique."
        return False

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if getattr(request.user, "is_superuser", False):
            return True

        feature_key = self._effective_feature_key(view)
        if not feature_key:
            return True

        store = _resolve_store_from_request(
            request,
            view,
            store_lookup_fields=self.store_lookup_fields,
        )
        if store:
            if self._is_enabled(store, feature_key):
                return True
            return self._deny(feature_key)

        # For detail routes, defer to object-level checks.
        if getattr(view, "kwargs", {}).get("pk"):
            return True

        # For non-contextual read routes, allow if at least one store is enabled.
        if request.method in SAFE_METHODS:
            links = (
                request.user.store_users
                .filter(store__is_active=True)
                .select_related("store")
                .order_by("-is_default", "store_id")
            )
            for link in links:
                if self._is_enabled(link.store, feature_key):
                    return True
            return self._deny(feature_key)

        return False

    def has_object_permission(self, request, view, obj):
        if not request.user.is_authenticated:
            return False
        if getattr(request.user, "is_superuser", False):
            return True

        feature_key = self._effective_feature_key(view)
        if not feature_key:
            return True

        store = _resolve_object_store(obj)
        if not store:
            return False
        if self._is_enabled(store, feature_key):
            return True
        return self._deny(feature_key)


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
    """Allow access only to users with the ADMIN role."""

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'ADMIN'


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

    def has_permission(self, request, view):
        user = request.user
        if not user.is_authenticated:
            return False
        # ADMIN and MANAGER always pass
        if user.role in ("ADMIN", "MANAGER"):
            return True

        # Capability-based check when feature flag is active
        if self.capability:
            store = self._resolve_store(request, view)
            if store and store.is_feature_enabled("advanced_permissions"):
                store_user = user.store_users.filter(store=store).first()
                if store_user:
                    return store_user.has_capability(self.capability)

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

    - ADMIN users always pass.
    - If a ``store`` parameter is present (query or body), verify the user
      has a StoreUser link to it.
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
        return request.user.store_users.filter(store_id=str(store_id)).exists()

    def has_object_permission(self, request, view, obj):
        if not request.user.is_authenticated:
            return False
        if getattr(request.user, "is_superuser", False):
            return True

        store_id = self._resolve_object_store_id(obj)
        if not store_id:
            return False
        return request.user.store_users.filter(store_id=store_id).exists()


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
