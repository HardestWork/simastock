"""Domain services for customers."""

from __future__ import annotations

from django.db import transaction

from customers.models import Customer


@transaction.atomic
def get_or_create_default_customer(*, enterprise) -> Customer:
    """Return the default 'walk-in' customer for an enterprise.

    This customer is used when a sale is created without explicitly selecting
    a customer in the SPA.
    """
    existing = (
        Customer.objects
        .select_for_update()
        .filter(enterprise=enterprise, is_default=True)
        .first()
    )
    if existing:
        if not existing.is_active:
            existing.is_active = True
            existing.save(update_fields=["is_active", "updated_at"])
        return existing

    # Keep it recognizable and searchable.
    return Customer.objects.create(
        enterprise=enterprise,
        first_name="Client",
        last_name="Comptant",
        phone="0000000000",
        email="",
        address="",
        company="",
        tax_id="",
        is_default=True,
        is_active=True,
        notes="Client par defaut (walk-in).",
    )

