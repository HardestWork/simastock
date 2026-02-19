from django import template

register = template.Library()


@register.filter(name="has_role")
def has_role(user, role_name):
    """
    Check whether the given user has the specified role.

    Usage in templates::

        {% load account_tags %}

        {% if user|has_role:"ADMIN" %}
            <!-- admin-only content -->
        {% endif %}

        {% if user|has_role:"CASHIER" %}
            <!-- cashier-only content -->
        {% endif %}

    The filter is case-insensitive for convenience, so both
    ``"ADMIN"`` and ``"admin"`` will work.

    Returns ``False`` if the user is anonymous (not authenticated).
    """
    if not hasattr(user, "role"):
        return False
    # Support comma-separated roles: has_role:"ADMIN,MANAGER"
    roles = [r.strip().upper() for r in role_name.split(",")]
    return user.role in roles


@register.filter(name="has_any_role")
def has_any_role(user, role_names):
    """
    Check whether the user has any of the specified roles.

    Usage in templates::

        {% load account_tags %}

        {% if user|has_any_role:"ADMIN,MANAGER" %}
            <!-- admin or manager content -->
        {% endif %}

    Roles should be provided as a comma-separated string.
    Returns ``False`` if the user is anonymous.
    """
    if not hasattr(user, "role"):
        return False
    roles = [r.strip().upper() for r in role_names.split(",")]
    return user.role in roles
