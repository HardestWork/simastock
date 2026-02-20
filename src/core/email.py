"""Email utilities for sending branded HTML emails with plain-text fallback."""

from __future__ import annotations

import logging
from typing import Sequence

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string

logger = logging.getLogger("boutique")


def send_branded_email(
    *,
    subject: str,
    template_name: str,
    context: dict,
    recipient_list: Sequence[str],
    from_email: str | None = None,
    fail_silently: bool = False,
) -> int:
    """Render and send an HTML email with a plain-text fallback.

    *template_name* is the base name **without** extension,
    e.g. ``"emails/password_reset"``.  The function appends ``.html``
    and ``.txt`` automatically.

    Returns the number of emails successfully sent (0 or 1).
    """
    sender = from_email or getattr(settings, "DEFAULT_FROM_EMAIL", None)

    text_body = render_to_string(f"{template_name}.txt", context).strip()
    html_body = render_to_string(f"{template_name}.html", context)

    msg = EmailMultiAlternatives(
        subject=subject,
        body=text_body,
        from_email=sender,
        to=list(recipient_list),
    )
    msg.attach_alternative(html_body, "text/html")
    return msg.send(fail_silently=fail_silently)
