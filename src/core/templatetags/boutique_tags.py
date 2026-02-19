"""Custom template tags."""
from django import template
from django.conf import settings

register = template.Library()


@register.filter
def currency(value):
    """Format value as currency."""
    try:
        val = float(value)
        formatted = f"{val:,.0f}"
        return f"{formatted} {settings.CURRENCY_SYMBOL}"
    except (ValueError, TypeError):
        return f"0 {settings.CURRENCY_SYMBOL}"


@register.filter
def percentage(value):
    """Format as percentage."""
    try:
        return f"{float(value):.1f}%"
    except (ValueError, TypeError):
        return "0%"


@register.simple_tag
def get_currency():
    return settings.CURRENCY_SYMBOL


@register.filter
def status_badge(status):
    """Return CSS classes for status badges."""
    badges = {
        "DRAFT": "bg-gray-100 text-gray-800",
        "PENDING_PAYMENT": "bg-yellow-100 text-yellow-800",
        "PARTIALLY_PAID": "bg-orange-100 text-orange-800",
        "PAID": "bg-green-100 text-green-800",
        "CANCELLED": "bg-red-100 text-red-800",
        "REFUNDED": "bg-purple-100 text-purple-800",
        "OPEN": "bg-blue-100 text-blue-800",
        "CLOSED": "bg-gray-100 text-gray-800",
        "OVERDUE": "bg-red-100 text-red-800",
        "PENDING": "bg-yellow-100 text-yellow-800",
    }
    return badges.get(status, "bg-gray-100 text-gray-800")


@register.filter
def store_feature_enabled(store, feature_key):
    """Return True when a store feature flag is enabled.

    Falls back to True when no store is available so navigation does not
    disappear before a store is selected.
    """
    if store is None:
        return True
    checker = getattr(store, "is_feature_enabled", None)
    if callable(checker):
        return bool(checker(feature_key))
    return True


@register.simple_tag(takes_context=True)
def nav_active(context, *patterns):
    """Return active/inactive sidebar classes based on current view/path.

    Supported patterns:
    - Exact view name: ``sales:sale-create``
    - Prefix wildcard: ``sales:product-*``
    - Path prefix: ``path:/cashier/``
    """
    active_classes = "bg-sidebar-active text-primary-400"
    inactive_classes = "text-gray-300"

    request = context.get("request")
    if request is None:
        return inactive_classes

    resolver_match = getattr(request, "resolver_match", None)
    current_view = getattr(resolver_match, "view_name", "") or ""
    current_path = getattr(request, "path", "") or ""

    for pattern in patterns:
        pattern = str(pattern)
        if not pattern:
            continue

        if pattern.startswith("path:"):
            if current_path.startswith(pattern[5:]):
                return active_classes
            continue

        if pattern.endswith("*"):
            if current_view.startswith(pattern[:-1]):
                return active_classes
            continue

        if current_view == pattern:
            return active_classes

    return inactive_classes
