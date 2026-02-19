"""Celery tasks for the stores app."""
import logging
from datetime import timedelta

from celery import shared_task
from django.utils import timezone

logger = logging.getLogger("boutique")


@shared_task(name="stores.tasks.deactivate_expired_enterprises")
def deactivate_expired_enterprises():
    """Deactivate enterprises whose subscription has expired.

    Runs daily via Celery Beat.  Enterprises that already have
    ``is_active=False`` are ignored.
    """
    from stores.models import Enterprise

    today = timezone.now().date()
    expired = Enterprise.objects.filter(
        is_active=True,
        subscription_end__isnull=False,
        subscription_end__lt=today,
    )
    count = expired.update(is_active=False)
    if count:
        logger.info("Deactivated %d expired enterprise(s).", count)
    return f"{count} enterprise(s) deactivated"


@shared_task(name="stores.tasks.warn_expiring_enterprises")
def warn_expiring_enterprises():
    """Create alerts for enterprises expiring within the next 5 days.

    One alert per store belonging to the enterprise.  Skips if an
    identical alert already exists for that store on the same day.
    """
    from alerts.models import Alert
    from stores.models import Enterprise, Store

    today = timezone.now().date()
    threshold = today + timedelta(days=5)

    expiring = Enterprise.objects.filter(
        is_active=True,
        subscription_end__isnull=False,
        subscription_end__gt=today,
        subscription_end__lte=threshold,
    )

    created = 0
    for enterprise in expiring:
        days_left = (enterprise.subscription_end - today).days
        stores = Store.objects.filter(enterprise=enterprise, is_active=True)

        for store in stores:
            # Avoid duplicate alerts on the same day
            already = Alert.objects.filter(
                store=store,
                alert_type="SUBSCRIPTION_EXPIRING",
                created_at__date=today,
            ).exists()
            if already:
                continue

            Alert.objects.create(
                store=store,
                alert_type="SUBSCRIPTION_EXPIRING",
                severity="WARNING" if days_left > 3 else "CRITICAL",
                title=f"Abonnement expire dans {days_left} jour{'s' if days_left > 1 else ''}",
                message=(
                    f"L'abonnement de {enterprise.name} expire le "
                    f"{enterprise.subscription_end.strftime('%d/%m/%Y')}. "
                    f"Contactez votre administrateur pour le renouveler."
                ),
            )
            created += 1

    if created:
        logger.info("Created %d subscription expiring alert(s).", created)
    return f"{created} alert(s) created"
