from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.utils.translation import gettext_lazy as _

from .models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    """Admin configuration for the custom User model."""

    # ------------------------------------------------------------------
    # List view
    # ------------------------------------------------------------------
    list_display = (
        "email",
        "first_name",
        "last_name",
        "role",
        "store_count",
        "is_active",
        "is_staff",
        "date_joined",
    )
    list_filter = ("role", "is_active", "is_staff", "is_superuser")
    search_fields = ("email", "first_name", "last_name", "phone")
    ordering = ("last_name", "first_name")
    actions = ("activate_users", "deactivate_users", "grant_staff", "revoke_staff")

    # ------------------------------------------------------------------
    # Detail / edit view
    # ------------------------------------------------------------------
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        (
            _("Informations personnelles"),
            {"fields": ("first_name", "last_name", "phone")},
        ),
        (
            _("Role et permissions"),
            {
                "fields": (
                    "role",
                    "is_active",
                    "is_staff",
                    "is_superuser",
                    "groups",
                    "user_permissions",
                ),
            },
        ),
        (
            _("Dates importantes"),
            {"fields": ("last_login", "date_joined")},
        ),
    )

    # ------------------------------------------------------------------
    # Add user view
    # ------------------------------------------------------------------
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": (
                    "email",
                    "first_name",
                    "last_name",
                    "phone",
                    "role",
                    "password1",
                    "password2",
                ),
            },
        ),
    )

    readonly_fields = ("date_joined", "last_login")

    def get_queryset(self, request):
        queryset = super().get_queryset(request)
        return queryset.prefetch_related("store_users")

    @admin.display(description="Boutiques")
    def store_count(self, obj):
        return obj.store_users.count()

    @admin.action(description="Activer les utilisateurs selectionnes")
    def activate_users(self, request, queryset):
        queryset.update(is_active=True)

    @admin.action(description="Desactiver les utilisateurs selectionnes")
    def deactivate_users(self, request, queryset):
        queryset.update(is_active=False)

    @admin.action(description="Donner acces staff (admin Django)")
    def grant_staff(self, request, queryset):
        queryset.update(is_staff=True)

    @admin.action(description="Retirer acces staff (admin Django)")
    def revoke_staff(self, request, queryset):
        queryset.update(is_staff=False)
