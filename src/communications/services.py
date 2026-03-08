"""Communication services — template rendering, message dispatch."""
import logging
import re

from django.db.models import Count, Q
from django.utils import timezone

logger = logging.getLogger("boutique")


def render_template(body: str, context: dict) -> str:
    """Replace {{placeholder}} tokens in body with context values."""
    def replacer(match):
        key = match.group(1).strip()
        return str(context.get(key, f"{{{{{key}}}}}"))
    return re.sub(r"\{\{(\s*\w+\s*)\}\}", replacer, body)


def send_message(*, store, channel, recipient, body, subject="", customer=None, template=None):
    """Send a message (currently logs only — no real SMS/WhatsApp integration).

    Returns the created MessageLog instance.
    """
    from communications.models import MessageLog

    log = MessageLog.objects.create(
        store=store,
        customer=customer,
        template=template,
        channel=channel,
        recipient_contact=recipient,
        subject=subject,
        body_rendered=body,
        status=MessageLog.Status.SENT,
        sent_at=timezone.now(),
    )
    logger.info(
        "Message [%s] sent to %s via %s (store=%s)",
        log.pk, recipient, channel, store,
    )
    return log


def resolve_segment(enterprise, segment_filter: dict):
    """Return a Customer QuerySet matching segment_filter criteria.

    Supported filters:
    - min_purchases: int — minimum total number of sales
    - inactive_days: int — no purchase in last N days
    - has_email: bool
    - has_phone: bool
    """
    from customers.models import Customer

    qs = Customer.objects.filter(enterprise=enterprise, is_active=True)

    if "min_purchases" in segment_filter:
        qs = qs.annotate(sales_count=Count("sales")).filter(
            sales_count__gte=segment_filter["min_purchases"]
        )

    if "inactive_days" in segment_filter:
        cutoff = timezone.now() - timezone.timedelta(days=segment_filter["inactive_days"])
        qs = qs.exclude(sales__created_at__gte=cutoff)

    if segment_filter.get("has_email"):
        qs = qs.exclude(Q(email="") | Q(email__isnull=True))

    if segment_filter.get("has_phone"):
        qs = qs.exclude(Q(phone="") | Q(phone__isnull=True))

    return qs
