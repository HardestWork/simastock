"""Template context processors for the stores app."""
from stores.models import StoreUser


def current_store(request):
    """Add store and enterprise context to the template context.

    * ``current_store`` -- the :class:`~stores.models.Store` currently
      selected by the user (may be ``None``).
    * ``current_enterprise`` -- the :class:`~stores.models.Enterprise`
      of the current store (may be ``None``).
    * ``user_stores`` -- queryset of all active stores the user belongs to.
    """
    if not hasattr(request, "user") or not request.user.is_authenticated:
        return {"current_store": None, "current_enterprise": None, "user_stores": []}

    user_stores = (
        StoreUser.objects
        .filter(user=request.user, store__is_active=True)
        .select_related("store__enterprise")
        .order_by("store__name")
    )

    return {
        "current_store": getattr(request, "current_store", None),
        "current_enterprise": getattr(request, "current_enterprise", None),
        "user_stores": user_stores,
    }
