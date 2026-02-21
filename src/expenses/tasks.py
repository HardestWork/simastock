"""Celery tasks for the expenses app."""
from __future__ import annotations

import logging

from celery import shared_task

from expenses.services import generate_due_recurring_expenses

logger = logging.getLogger("boutique")


@shared_task(name="expenses.tasks.generate_due_recurring_expenses")
def generate_due_recurring_expenses_task():
    """Generate due recurring expenses for all active stores."""
    result = generate_due_recurring_expenses()
    logger.info(
        "Recurring expenses generated=%s failed=%s",
        result.generated_count,
        result.failed_count,
    )
    return {
        "generated_count": result.generated_count,
        "generated_ids": result.generated_ids,
        "failed_count": result.failed_count,
        "failures": result.failures,
    }

