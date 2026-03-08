"""Celery tasks for the communications module."""
import logging

from celery import shared_task
from django.utils import timezone

logger = logging.getLogger("boutique")


@shared_task(name="communications.tasks.process_campaign")
def process_campaign(campaign_id):
    """Send messages for a campaign in batch."""
    from communications.models import Campaign, MessageTemplate
    from communications.services import render_template, send_message, resolve_segment

    campaign = Campaign.objects.select_related("template", "enterprise").get(pk=campaign_id)
    if campaign.status != Campaign.Status.SENDING:
        return "Campaign not in SENDING status"

    template = campaign.template
    customers = resolve_segment(campaign.enterprise, campaign.segment_filter)

    if campaign.store_id:
        customers = customers.filter(sales__store_id=campaign.store_id).distinct()

    campaign.total_recipients = customers.count()
    campaign.save(update_fields=["total_recipients"])

    sent = 0
    failed = 0
    for customer in customers.iterator():
        context = {
            "client_name": f"{customer.first_name} {customer.last_name}".strip(),
            "phone": customer.phone or "",
            "email": customer.email or "",
        }
        body = render_template(template.body, context)
        recipient = customer.phone if template.channel != "EMAIL" else customer.email
        if not recipient:
            failed += 1
            continue

        try:
            store = campaign.store or customer.enterprise.stores.first()
            send_message(
                store=store,
                channel=template.channel,
                recipient=recipient,
                body=body,
                subject=render_template(template.subject, context) if template.subject else "",
                customer=customer,
                template=template,
            )
            sent += 1
        except Exception:
            logger.exception("Failed to send campaign message to %s", recipient)
            failed += 1

    campaign.sent_count = sent
    campaign.failed_count = failed
    campaign.status = Campaign.Status.COMPLETED
    campaign.completed_at = timezone.now()
    campaign.save(update_fields=["sent_count", "failed_count", "status", "completed_at"])

    logger.info("Campaign %s completed: %d sent, %d failed.", campaign.name, sent, failed)
    return f"{sent} sent, {failed} failed"
