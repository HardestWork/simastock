"""Service / helper functions for the stores app."""
from __future__ import annotations

from typing import Any
from datetime import date

from django.contrib.auth import get_user_model
from django.db import models
from django.http import HttpRequest
from django.utils import timezone

from stores.models import (
    AuditLog,
    BillingPlanModule,
    Enterprise,
    EnterprisePlanAssignment,
    MODULE_DEFAULT_ORDER,
    Store,
    StoreModuleEntitlement,
    StoreUser,
)

User = get_user_model()

MODULE_DEPENDENCIES = {
    "SELL": ("CORE",),
    "CASH": ("SELL",),
    "CUSTOMER": ("SELL", "CASH"),
    "STOCK": ("CORE",),
    "PURCHASE": ("STOCK",),
    "EXPENSE": ("CORE",),
    "SELLER_PERF": ("SELL", "CASH"),
    "ANALYTICS_MANAGER": ("SELL", "CASH", "STOCK"),
    "ANALYTICS_CASHIER": ("CASH",),
    "ANALYTICS_STOCK": ("STOCK",),
    "ANALYTICS_DG": ("ANALYTICS_MANAGER", "ANALYTICS_CASHIER", "ANALYTICS_STOCK"),
    "CLIENT_INTEL": ("CUSTOMER", "ANALYTICS_MANAGER"),
    "ALERTS": ("CORE",),
}


def create_audit_log(
    actor: User | None,
    store: Store | None,
    action: str,
    entity_type: str,
    entity_id: str,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
    ip: str | None = None,
) -> AuditLog:
    """Create and return a new :class:`~stores.models.AuditLog` entry."""
    return AuditLog.objects.create(
        actor=actor,
        store=store,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id),
        before_json=before,
        after_json=after,
        ip_address=ip,
    )


def get_user_enterprise(user: User) -> Enterprise | None:
    """Return the enterprise for the user's first active store, or None."""
    store_user = (
        StoreUser.objects
        .filter(user=user, store__is_active=True)
        .select_related("store__enterprise")
        .first()
    )
    if store_user and store_user.store:
        return store_user.store.enterprise
    return None


def get_user_stores(user: User):
    """Return a queryset of active stores the *user* belongs to."""
    return (
        Store.objects
        .filter(store_users__user=user, is_active=True)
        .order_by("name")
    )


def switch_store(request: HttpRequest, store_id: str) -> Store:
    """Switch the user's active store.

    Validates that the user has access to the requested store and that
    the store is active.  On success the session is updated and the
    :class:`~stores.models.Store` instance is returned.

    Raises
    ------
    Store.DoesNotExist
        If the store does not exist or the user does not have access.
    """
    store_user = (
        StoreUser.objects
        .filter(user=request.user, store_id=store_id, store__is_active=True)
        .select_related("store")
        .first()
    )
    if store_user is None:
        raise Store.DoesNotExist("Store not found or access denied.")

    request.session["store_id"] = str(store_user.store.pk)
    request.current_store = store_user.store
    return store_user.store


def _derive_module_matrix_from_feature_flags(store: Store | None) -> dict[str, bool]:
    """Build module activation from current store feature flags."""
    modules = {code: False for code in MODULE_DEFAULT_ORDER}
    if store is None:
        return modules

    flags = getattr(store, "effective_feature_flags", {}) or {}

    modules["CORE"] = bool(getattr(store, "is_active", True))
    modules["SELL"] = bool(flags.get("sales_pos", True))
    modules["CASH"] = bool(flags.get("cashier_operations", True))
    modules["CUSTOMER"] = bool(flags.get("sales_pos", True) and flags.get("credit_management", True))
    modules["STOCK"] = bool(flags.get("stock_management", True))
    modules["PURCHASE"] = bool(flags.get("purchases_management", True))
    modules["EXPENSE"] = bool(flags.get("expenses_management", True))
    modules["SELLER_PERF"] = bool(flags.get("enabled", True) and flags.get("sales_pos", True))
    modules["ANALYTICS_MANAGER"] = bool(flags.get("enabled", True) and flags.get("reports_center", True))
    modules["ANALYTICS_CASHIER"] = bool(flags.get("enabled", True) and flags.get("cashier_operations", True))
    modules["ANALYTICS_STOCK"] = bool(flags.get("enabled", True) and flags.get("stock_management", True))
    modules["ANALYTICS_DG"] = bool(flags.get("enabled", True) and flags.get("dashboard_strategic", True))
    modules["CLIENT_INTEL"] = bool(
        flags.get("enabled", True)
        and flags.get("credit_scoring", True)
        and flags.get("credit_management", True)
    )
    modules["ALERTS"] = bool(flags.get("alerts_center", True))
    return modules


def _enforce_module_dependencies(modules: dict[str, bool]) -> dict[str, bool]:
    """Disable modules whose required dependencies are not enabled."""
    normalized = {code: bool(value) for code, value in modules.items()}
    for code in MODULE_DEFAULT_ORDER:
        normalized.setdefault(code, False)

    changed = True
    while changed:
        changed = False
        for module_code, deps in MODULE_DEPENDENCIES.items():
            if not normalized.get(module_code):
                continue
            if any(not normalized.get(dep_code, False) for dep_code in deps):
                normalized[module_code] = False
                changed = True
    return normalized


def _resolve_active_plan_assignment(*, enterprise: Enterprise, as_of: date) -> EnterprisePlanAssignment | None:
    return (
        EnterprisePlanAssignment.objects
        .filter(
            enterprise=enterprise,
            status__in=[EnterprisePlanAssignment.Status.TRIAL, EnterprisePlanAssignment.Status.ACTIVE],
            starts_on__lte=as_of,
        )
        .filter(models.Q(ends_on__isnull=True) | models.Q(ends_on__gte=as_of))
        .select_related("plan")
        .order_by("-starts_on", "-created_at")
        .first()
    )


def _resolve_plan_module_map(assignment: EnterprisePlanAssignment) -> dict[str, bool]:
    modules = {code: False for code in MODULE_DEFAULT_ORDER}
    rows = (
        BillingPlanModule.objects
        .filter(plan=assignment.plan, included=True, module__is_active=True)
        .select_related("module")
    )
    for row in rows:
        modules[row.module.code] = True
    return modules


def _apply_store_module_overrides(*, store: Store, modules: dict[str, bool]) -> dict[str, bool]:
    resolved = dict(modules)
    rows = (
        StoreModuleEntitlement.objects
        .filter(store=store)
        .select_related("module")
    )
    for row in rows:
        code = row.module.code
        if row.state == StoreModuleEntitlement.State.ENABLED:
            resolved[code] = True
        elif row.state == StoreModuleEntitlement.State.DISABLED:
            resolved[code] = False
    return resolved


def resolve_store_module_matrix(*, store: Store | None, as_of: date | None = None) -> dict:
    """Return module activation matrix for one store and one date."""
    as_of_date = as_of or timezone.localdate()
    feature_modules = _derive_module_matrix_from_feature_flags(store)
    modules = dict(feature_modules)
    source = "feature_flags"
    plan_code = None

    if store and store.enterprise_id:
        assignment = _resolve_active_plan_assignment(enterprise=store.enterprise, as_of=as_of_date)
        if assignment is not None:
            source = "plan"
            plan_code = assignment.plan.code
            modules = _resolve_plan_module_map(assignment)

        modules = _apply_store_module_overrides(store=store, modules=modules)

        # Technical feature flags still apply even if a module is commercially enabled.
        for code in MODULE_DEFAULT_ORDER:
            modules[code] = bool(modules.get(code, False) and feature_modules.get(code, False))

    modules = _enforce_module_dependencies(modules)

    return {
        "as_of": str(as_of_date),
        "source": source,
        "plan_code": plan_code,
        "modules": modules,
    }
