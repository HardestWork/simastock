"""Account-related helper services."""

from __future__ import annotations

import re
from typing import Tuple

from django.db import transaction
from django.contrib.auth.tokens import default_token_generator
from django.urls import reverse
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from django.utils.text import slugify

from core.email import send_branded_email
from stores.models import Enterprise, Sequence, Store, StoreUser


def build_verification_url(request, user):
    """Build absolute email verification URL for a user."""
    uidb64 = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    path = reverse("accounts:verify-email", kwargs={"uidb64": uidb64, "token": token})
    return request.build_absolute_uri(path)


def send_verification_email(request, user):
    """Send an email verification link."""
    verification_url = build_verification_url(request, user)
    send_branded_email(
        subject="Verification de votre adresse e-mail",
        template_name="emails/verify_email",
        context={"user": user, "verification_url": verification_url},
        recipient_list=[user.email],
        fail_silently=False,
    )


def provision_enterprise_for_user(user, company_name: str, store_name: str = "") -> Tuple[Enterprise, Store]:
    """Create a first enterprise/store for a user if they have no store yet."""
    existing_link = StoreUser.objects.filter(user=user).select_related("store", "store__enterprise").first()
    if existing_link:
        return existing_link.store.enterprise, existing_link.store

    company = (company_name or "").strip() or "Nouvelle Entreprise"
    first_store_name = (store_name or "").strip() or "Boutique Principale"

    with transaction.atomic():
        enterprise = Enterprise.objects.create(
            name=company,
            code=_unique_code(Enterprise, "ENT", company),
            legal_name=company,
            currency="FCFA",
            email=user.email or "",
            is_active=True,
        )

        store = Store.objects.create(
            enterprise=enterprise,
            name=first_store_name,
            code=_unique_code(Store, "BQ", f"{company}-{first_store_name}"),
            currency=enterprise.currency,
            email=user.email or "",
            is_active=True,
        )

        StoreUser.objects.create(
            store=store,
            user=user,
            is_default=True,
        )

        Sequence.objects.get_or_create(store=store, prefix="FAC", defaults={"next_number": 1})
        Sequence.objects.get_or_create(store=store, prefix="AV", defaults={"next_number": 1})

    return enterprise, store


def _unique_code(model, prefix: str, label: str) -> str:
    """Generate a unique human-readable code for Enterprise/Store."""
    base = slugify(label or "").upper()
    base = re.sub(r"[^A-Z0-9]+", "", base)
    if not base:
        base = "DEFAULT"
    base = base[:30]

    candidate = f"{prefix}-{base}"
    index = 2
    while model.objects.filter(code=candidate).exists():
        suffix = f"-{index}"
        candidate = f"{prefix}-{base[:50 - len(prefix) - len(suffix) - 1]}{suffix}"
        index += 1
    return candidate
