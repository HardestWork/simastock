"""Celery tasks for the delivery module."""
import logging
from datetime import timedelta

from celery import shared_task
from django.utils import timezone

logger = logging.getLogger("boutique")


@shared_task(name="delivery.tasks.check_late_deliveries")
def check_late_deliveries():
    """Create alerts for deliveries that exceeded their estimated time."""
    from delivery.models import Delivery
    from alerts.services import create_alert

    now = timezone.now()
    late = (
        Delivery.objects.filter(status=Delivery.Status.IN_TRANSIT)
        .select_related("store", "zone", "agent")
        .exclude(zone__isnull=True)
        .exclude(zone__estimated_minutes__isnull=True)
    )

    count = 0
    for d in late:
        start = d.picked_up_at or d.updated_at
        elapsed = (now - start).total_seconds() / 60
        if elapsed > d.zone.estimated_minutes:
            create_alert(
                store=d.store,
                alert_type="DELIVERY_LATE",
                severity="WARNING",
                title=f"Livraison en retard — {d.recipient_name}",
                message=(
                    f"La livraison pour {d.recipient_name} est en transit depuis "
                    f"{int(elapsed)} min (estime: {d.zone.estimated_minutes} min)."
                ),
                payload={
                    "delivery_id": str(d.pk),
                    "agent_name": d.agent.name if d.agent else None,
                },
            )
            count += 1

    logger.info("check_late_deliveries: %d alertes creees.", count)
    return f"{count} late delivery alerts"


@shared_task(name="delivery.tasks.check_delayed_deliveries")
def check_delayed_deliveries():
    """Create alerts for broadcast deliveries without an agent after 30 minutes."""
    from alerts.models import Alert
    from delivery.models import Delivery

    threshold = timezone.now() - timedelta(minutes=30)
    stuck = (
        Delivery.objects.filter(
            status__in=[Delivery.Status.PENDING, Delivery.Status.PREPARING],
            is_broadcast=True,
            agent__isnull=True,
            created_at__lt=threshold,
        )
        .select_related("store", "seller")
    )

    count = 0
    for delivery in stuck:
        # Avoid duplicate unread alerts for same delivery
        if Alert.objects.filter(
            store=delivery.store,
            alert_type=Alert.Type.DELIVERY_LATE,
            is_read=False,
            payload__delivery_id=str(delivery.pk),
        ).exists():
            continue

        minutes_late = int((timezone.now() - delivery.created_at).total_seconds() / 60)
        Alert.objects.create(
            store=delivery.store,
            alert_type=Alert.Type.DELIVERY_LATE,
            severity=Alert.Severity.WARNING,
            title=f"Livraison #{delivery.confirmation_code} sans livreur depuis {minutes_late} min",
            message=(
                f"Destinataire : {delivery.recipient_name}. "
                f"Aucun livreur n'a pris en charge cette livraison."
            ),
            payload={"delivery_id": str(delivery.pk)},
        )

        if delivery.seller and getattr(delivery.seller, "phone", ""):
            try:
                from communications.services import send_message
                send_message(
                    store=delivery.store,
                    channel="SMS",
                    recipient=delivery.seller.phone,
                    body=(
                        f"Livraison #{delivery.confirmation_code} toujours sans livreur "
                        f"({minutes_late} min). Action requise."
                    ),
                )
            except Exception:
                pass

        count += 1

    logger.info("check_delayed_deliveries: %d alertes creees.", count)
    return f"{count} delayed broadcast delivery alerts"
