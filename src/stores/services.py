"""Service / helper functions for the stores app."""
from __future__ import annotations

from typing import Any

from django.contrib.auth import get_user_model
from django.http import HttpRequest

from stores.models import AuditLog, Enterprise, Store, StoreUser

User = get_user_model()


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
