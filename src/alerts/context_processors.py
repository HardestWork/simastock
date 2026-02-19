"""Template context processors for the alerts app."""
from alerts.models import Alert


def unread_alerts_count(request):
    """Add ``unread_alerts_count`` to the template context.

    The count reflects unread alerts for the current store so that it
    can be displayed as a badge in the navigation bar.

    Returns ``{'unread_alerts_count': 0}`` for anonymous users or when
    no store is selected.
    """
    store = getattr(request, "current_store", None)

    if not store or not hasattr(request, "user") or not request.user.is_authenticated:
        return {"unread_alerts_count": 0}
    if hasattr(store, "is_feature_enabled") and not store.is_feature_enabled("alerts_center"):
        return {"unread_alerts_count": 0}

    count = Alert.objects.filter(
        store=store,
        is_read=False,
    ).count()

    return {"unread_alerts_count": count}
