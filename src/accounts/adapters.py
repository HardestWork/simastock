"""Adapters for third-party authentication providers."""

from allauth.socialaccount.adapter import DefaultSocialAccountAdapter

from accounts.models import User
from accounts.services import provision_enterprise_for_user


class BoutiqueSocialAccountAdapter(DefaultSocialAccountAdapter):
    """Ensure required custom user fields are populated for social signup."""

    def populate_user(self, request, sociallogin, data):
        user = super().populate_user(request, sociallogin, data)

        first_name = (data.get("first_name") or data.get("given_name") or "").strip()
        last_name = (data.get("last_name") or data.get("family_name") or "").strip()

        if not first_name:
            email = (data.get("email") or "").strip()
            first_name = (email.split("@")[0] if email else "Utilisateur").strip() or "Utilisateur"
        if not last_name:
            last_name = "Google"

        user.first_name = first_name[:150]
        user.last_name = last_name[:150]
        return user

    def save_user(self, request, sociallogin, form=None):
        """Provision enterprise/store for first-time Google signups."""
        is_new_user = sociallogin.user.pk is None
        user = super().save_user(request, sociallogin, form=form)

        if not is_new_user:
            return user

        # New social signups become tenant admins for their own enterprise,
        # but must NOT be granted Django admin access (is_staff) automatically.
        if user.role != User.Role.ADMIN:
            user.role = User.Role.ADMIN
            user.save(update_fields=["role"])

        email_local = (user.email.split("@", 1)[0] if user.email else "").strip()
        default_company = f"{email_local.title() or 'Mon'} Entreprise"
        provision_enterprise_for_user(
            user=user,
            company_name=default_company,
            store_name="Boutique Principale",
        )
        return user
