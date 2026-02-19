"""Backfill tenant data for users missing enterprise/store links."""

from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction

from accounts.models import User
from accounts.services import provision_enterprise_for_user
from stores.models import StoreUser


class Command(BaseCommand):
    help = (
        "Backfill users without store memberships by creating "
        "Enterprise + Store and linking them as default."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--email",
            default="",
            help="Process only one user email (optional).",
        )
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Apply changes. Without this flag, command runs in dry-run mode.",
        )

    def handle(self, *args, **options):
        target_email = (options.get("email") or "").strip()
        apply_changes = bool(options.get("apply"))

        users_qs = User.objects.all().order_by("date_joined", "email")
        if target_email:
            users_qs = users_qs.filter(email__iexact=target_email)

        users = list(users_qs)
        if not users:
            self.stdout.write("No users found.")
            return

        created_links = 0
        fixed_default_flags = 0
        already_ok = 0

        for user in users:
            memberships = list(StoreUser.objects.filter(user=user).select_related("store", "store__enterprise"))
            if not memberships:
                if apply_changes:
                    with transaction.atomic():
                        enterprise, store = provision_enterprise_for_user(
                            user=user,
                            company_name=self._default_company_name(user),
                            store_name="Boutique Principale",
                        )
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"[CREATE] {user.email} -> {enterprise.code} / {store.code}"
                        )
                    )
                    created_links += 1
                else:
                    self.stdout.write(
                        f"[DRY-RUN CREATE] {user.email} -> would create enterprise + store"
                    )
                continue

            has_default = any(link.is_default for link in memberships)
            if has_default:
                already_ok += 1
                continue

            first_link = memberships[0]
            if apply_changes:
                StoreUser.objects.filter(pk=first_link.pk).update(is_default=True)
                fixed_default_flags += 1
                self.stdout.write(
                    self.style.SUCCESS(
                        f"[FIX DEFAULT] {user.email} -> {first_link.store.code}"
                    )
                )
            else:
                self.stdout.write(
                    f"[DRY-RUN FIX DEFAULT] {user.email} -> would set {first_link.store.code} as default"
                )

        mode = "APPLY" if apply_changes else "DRY-RUN"
        self.stdout.write("")
        self.stdout.write(f"Mode: {mode}")
        self.stdout.write(f"Users scanned: {len(users)}")
        self.stdout.write(f"Created memberships via provisioning: {created_links}")
        self.stdout.write(f"Default memberships fixed: {fixed_default_flags}")
        self.stdout.write(f"Already healthy: {already_ok}")

        if not apply_changes:
            self.stdout.write("")
            self.stdout.write("Run again with --apply to persist changes.")

    def _default_company_name(self, user: User) -> str:
        full_name = user.get_full_name().strip()
        if full_name:
            return f"Entreprise de {full_name}"
        local = (user.email.split("@", 1)[0] if user.email else "").strip()
        if local:
            return f"Entreprise {local}"
        return "Nouvelle Entreprise"

