"""Middlewares related to store and enterprise context."""
import re

from django.contrib import messages
from django.http import JsonResponse
from django.shortcuts import redirect

from stores.models import StoreUser


class CurrentStoreMiddleware:
    """Read the active store from the session and set ``request.current_store``.

    Resolution order:
    1. ``store_id`` stored in the session (set when the user switches stores).
    2. The user's default store (``StoreUser.is_default=True``).
    3. The first store the user belongs to.

    If the user is anonymous or has no stores, ``request.current_store`` is
    set to ``None``.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.current_store = None
        request.current_enterprise = None

        if request.user.is_authenticated:
            store_id = request.session.get("store_id")

            if store_id:
                # Validate that the user still has access to this store
                store_user = (
                    StoreUser.objects
                    .filter(user=request.user, store_id=store_id, store__is_active=True)
                    .select_related("store__enterprise")
                    .first()
                )
                if store_user:
                    request.current_store = store_user.store
                else:
                    # Stale session value -- clear it and fall through
                    del request.session["store_id"]

            if request.current_store is None:
                # Try the user's default store
                default_su = (
                    StoreUser.objects
                    .filter(user=request.user, is_default=True, store__is_active=True)
                    .select_related("store__enterprise")
                    .first()
                )
                if default_su:
                    request.current_store = default_su.store
                    request.session["store_id"] = str(default_su.store.pk)
                else:
                    # Fall back to the first available store
                    first_su = (
                        StoreUser.objects
                        .filter(user=request.user, store__is_active=True)
                        .select_related("store__enterprise")
                        .first()
                    )
                    if first_su:
                        request.current_store = first_su.store
                        request.session["store_id"] = str(first_su.store.pk)

            if request.current_store is not None:
                request.current_enterprise = request.current_store.enterprise

            # Block access when the enterprise subscription has expired
            # (superusers are exempt so they can still manage the enterprise).
            enterprise = request.current_enterprise
            if (
                enterprise is not None
                and enterprise.is_expired
                and not getattr(request.user, "is_superuser", False)
            ):
                request.current_store = None
                request.current_enterprise = None

        return self.get_response(request)


class StoreFeatureFlagsMiddleware:
    """Gate module access based on effective store feature flags."""

    EXEMPT_PREFIXES = (
        "/admin/",
        "/accounts/",
        "/stores/",
        "/settings/",
        "/static/",
        "/media/",
        "/__debug__/",
    )

    FEATURE_RULES = (
        (
            re.compile(r"^/pos/[0-9a-f-]+/refund/?$"),
            "sales_refund",
            "Le module remboursements est desactive pour cette boutique.",
        ),
        (
            re.compile(r"^/pos/"),
            "sales_pos",
            "Le module de vente POS est desactive pour cette boutique.",
        ),
        (
            re.compile(r"^/cashier/"),
            "cashier_operations",
            "Le module caisse est desactive pour cette boutique.",
        ),
        (
            re.compile(r"^/stock/(entries/|adjust/)"),
            "stock_entries",
            "Les entrees/ajustements de stock sont desactives pour cette boutique.",
        ),
        (
            re.compile(r"^/stock/"),
            "stock_management",
            "Le module stock est desactive pour cette boutique.",
        ),
        (
            re.compile(r"^/purchases/"),
            "purchases_management",
            "Le module achats est desactive pour cette boutique.",
        ),
        (
            re.compile(r"^/credits/"),
            "credit_management",
            "Le module credit client est desactive pour cette boutique.",
        ),
        (
            re.compile(r"^/expenses/"),
            "expenses_management",
            "Le module depenses est desactive pour cette boutique.",
        ),
        (
            re.compile(r"^/alerts/"),
            "alerts_center",
            "Le module alertes est desactive pour cette boutique.",
        ),
        (
            re.compile(r"^/reports/"),
            "reports_center",
            "Le module rapports est desactive pour cette boutique.",
        ),
        (
            re.compile(r"^/analytics/"),
            "enabled",
            "Le module analytics est desactive pour cette boutique.",
        ),
        (
            re.compile(r"^/api/v1/analytics/"),
            "enabled",
            "Le module analytics est desactive pour cette boutique.",
        ),
        (
            re.compile(r"^/api/v1/(expenses|expense-categories|wallets|expense-budgets|recurring-expenses)/"),
            "expenses_management",
            "Le module depenses est desactive pour cette boutique.",
        ),
    )

    def __init__(self, get_response):
        self.get_response = get_response

    def _resolve_rule(self, path: str):
        for regex, feature_key, message in self.FEATURE_RULES:
            if regex.search(path):
                return feature_key, message
        return None, None

    def __call__(self, request):
        path = request.path or "/"
        if any(path.startswith(prefix) for prefix in self.EXEMPT_PREFIXES):
            return self.get_response(request)

        if request.user.is_authenticated:
            current_store = getattr(request, "current_store", None)
            feature_checker = getattr(current_store, "is_feature_enabled", None)
            if current_store is not None and callable(feature_checker):
                feature_key, block_message = self._resolve_rule(path)
                if feature_key and not feature_checker(feature_key):
                    if path.startswith("/api/"):
                        return JsonResponse(
                            {
                                "detail": block_message,
                                "feature_flag": feature_key,
                            },
                            status=403,
                        )
                    messages.error(request, block_message)
                    return redirect("dashboard:index")

        return self.get_response(request)
