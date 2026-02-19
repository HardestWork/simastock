"""Celery tasks for the alerts app."""
import logging
from datetime import date, timedelta
from decimal import Decimal

from celery import shared_task
from django.conf import settings
from django.db.models import Q
from django.utils import timezone

logger = logging.getLogger("boutique")


@shared_task(name="alerts.tasks.check_low_stock")
def check_low_stock():
    """Check for products with available_qty <= min_qty in each active store.

    Creates a LOW_STOCK or OUT_OF_STOCK alert if one does not already
    exist for the same product/store on today's date.
    """
    from stores.models import Store
    from alerts.services import sync_low_stock_alerts_for_store

    stores = Store.objects.filter(is_active=True)
    alert_count = 0
    for store in stores:
        alert_count += sync_low_stock_alerts_for_store(store)

    logger.info("check_low_stock completed: %d alerts created.", alert_count)
    return f"{alert_count} alerts created"


@shared_task(name="alerts.tasks.check_pending_payments")
def check_pending_payments():
    """Find sales in PENDING_PAYMENT status for longer than the configured threshold.

    The threshold is ``settings.PENDING_PAYMENT_ALERT_HOURS`` (default 2).
    """
    from sales.models import Sale
    from alerts.services import create_alert
    from alerts.models import Alert

    threshold_hours = getattr(settings, "PENDING_PAYMENT_ALERT_HOURS", 2)
    cutoff = timezone.now() - timedelta(hours=threshold_hours)

    pending_sales = Sale.objects.filter(
        status=Sale.Status.PENDING_PAYMENT,
        submitted_at__isnull=False,
        submitted_at__lte=cutoff,
    ).select_related("store", "seller")

    today = date.today()
    pending_sales = list(pending_sales)
    existing_sale_ids = set(
        Alert.objects.filter(
            alert_type=Alert.Type.PENDING_PAYMENT_TIMEOUT,
            payload__sale_id__in=[str(sale.pk) for sale in pending_sales],
            created_at__date=today,
        ).values_list("payload__sale_id", flat=True)
    )

    alert_count = 0

    for sale in pending_sales:
        sale_id = str(sale.pk)
        if sale_id in existing_sale_ids:
            continue
        hours_waiting = (timezone.now() - sale.submitted_at).total_seconds() / 3600
        create_alert(
            store=sale.store,
            alert_type=Alert.Type.PENDING_PAYMENT_TIMEOUT,
            severity=Alert.Severity.WARNING,
            title=f"Paiement en attente : {sale.invoice_number}",
            message=(
                f"La vente {sale.invoice_number} est en attente de paiement "
                f"depuis {hours_waiting:.1f} heures (seuil: {threshold_hours}h). "
                f"Vendeur : {sale.seller.get_full_name()}."
            ),
            payload={
                "sale_id": sale_id,
                "invoice_number": sale.invoice_number,
                "total": str(sale.total),
                "hours_waiting": round(hours_waiting, 1),
            },
        )
        existing_sale_ids.add(sale_id)
        alert_count += 1

    logger.info("check_pending_payments completed: %d alerts created.", alert_count)
    return f"{alert_count} alerts created"


@shared_task(name="alerts.tasks.check_abnormal_discounts")
def check_abnormal_discounts():
    """Find sales with discount_percent exceeding the configured threshold.

    Uses ``settings.MAX_DISCOUNT_PERCENT_MANAGER`` as the upper bound.
    Sales with discount above this level are flagged.
    """
    from sales.models import Sale
    from alerts.services import create_alert, check_discount_anomaly
    from alerts.models import Alert

    today = date.today()

    # Check today's paid sales for abnormal discounts
    sales = Sale.objects.filter(
        created_at__date=today,
        discount_percent__gt=0,
    ).select_related("store", "seller")

    sales = list(sales)
    existing_sale_ids = set(
        Alert.objects.filter(
            alert_type=Alert.Type.ABNORMAL_DISCOUNT,
            payload__sale_id__in=[str(sale.pk) for sale in sales],
        ).values_list("payload__sale_id", flat=True)
    )

    alert_count = 0

    for sale in sales:
        if check_discount_anomaly(sale):
            sale_id = str(sale.pk)
            if sale_id in existing_sale_ids:
                continue
            create_alert(
                store=sale.store,
                alert_type=Alert.Type.ABNORMAL_DISCOUNT,
                severity=Alert.Severity.WARNING,
                title=f"Remise anormale : {sale.invoice_number}",
                message=(
                    f"La vente {sale.invoice_number} a une remise de "
                    f"{sale.discount_percent}% ({sale.discount_amount} "
                    f"{getattr(settings, 'CURRENCY', 'FCFA')}). "
                    f"Vendeur : {sale.seller.get_full_name()}."
                ),
                payload={
                    "sale_id": sale_id,
                    "invoice_number": sale.invoice_number,
                    "discount_percent": str(sale.discount_percent),
                    "discount_amount": str(sale.discount_amount),
                    "seller": sale.seller.get_full_name(),
                },
            )
            existing_sale_ids.add(sale_id)
            alert_count += 1

    logger.info("check_abnormal_discounts completed: %d alerts created.", alert_count)
    return f"{alert_count} alerts created"


@shared_task(name="alerts.tasks.check_cash_variance")
def check_cash_variance():
    """Find recently closed shifts with a variance exceeding a threshold.

    A variance greater than 5000 FCFA (absolute) is considered notable.
    """
    from cashier.models import CashShift
    from alerts.services import create_alert
    from alerts.models import Alert

    # Check shifts closed today
    today = date.today()
    variance_threshold = Decimal("5000.00")

    closed_shifts = CashShift.objects.filter(
        status=CashShift.Status.CLOSED,
        closed_at__date=today,
    ).select_related("store", "cashier").filter(
        Q(variance__gt=variance_threshold) | Q(variance__lt=-variance_threshold)
    )

    closed_shifts = list(closed_shifts)
    existing_shift_ids = set(
        Alert.objects.filter(
            alert_type=Alert.Type.CASH_VARIANCE,
            payload__shift_id__in=[str(shift.pk) for shift in closed_shifts],
        ).values_list("payload__shift_id", flat=True)
    )

    alert_count = 0

    for shift in closed_shifts:
        shift_id = str(shift.pk)
        if shift_id in existing_shift_ids:
            continue
        abs_variance = abs(shift.variance) if shift.variance else Decimal("0")
        severity = (
            Alert.Severity.CRITICAL
            if abs_variance > Decimal("20000")
            else Alert.Severity.WARNING
        )
        create_alert(
            store=shift.store,
            alert_type=Alert.Type.CASH_VARIANCE,
            severity=severity,
            title=f"Ecart de caisse : {shift.cashier.get_full_name()}",
            message=(
                f"La session de caisse de {shift.cashier.get_full_name()} "
                f"fermee le {shift.closed_at:%d/%m/%Y %H:%M} presente un "
                f"ecart de {shift.variance} "
                f"{getattr(settings, 'CURRENCY', 'FCFA')}."
            ),
            payload={
                "shift_id": shift_id,
                "cashier": shift.cashier.get_full_name(),
                "variance": str(shift.variance),
                "expected_cash": str(shift.expected_cash),
                "closing_cash": str(shift.closing_cash),
            },
        )
        existing_shift_ids.add(shift_id)
        alert_count += 1

    logger.info("check_cash_variance completed: %d alerts created.", alert_count)
    return f"{alert_count} alerts created"


@shared_task(name="alerts.tasks.check_overdue_credits")
def check_overdue_credits():
    """Find overdue credit payment schedules and create alerts.

    Looks for ``PaymentSchedule`` entries with ``due_date < today``
    that are not yet paid.  Falls back to checking ``Sale.amount_due``
    if the credits app is not available.
    """
    from alerts.services import create_alert
    from alerts.models import Alert

    today = date.today()
    alert_count = 0

    try:
        from credits.models import PaymentSchedule

        overdue = (
            PaymentSchedule.objects
            .filter(due_date__lt=today)
            .exclude(status="PAID")
            .select_related("sale__store", "sale__customer", "account__customer")
        )

        overdue = list(overdue)
        existing_schedule_ids = set(
            Alert.objects.filter(
                alert_type=Alert.Type.CREDIT_OVERDUE,
                payload__schedule_id__in=[str(schedule.pk) for schedule in overdue],
                created_at__date=today,
            ).values_list("payload__schedule_id", flat=True)
        )

        for schedule in overdue:
            sale = schedule.sale
            if sale:
                store = sale.store
                customer_name = sale.customer.full_name if sale.customer else "N/A"
                invoice_number = sale.invoice_number
                sale_id = str(sale.pk)
            else:
                store = schedule.account.store
                customer_name = schedule.account.customer.full_name
                invoice_number = "N/A"
                sale_id = ""
            schedule_id = str(schedule.pk)
            if schedule_id in existing_schedule_ids:
                continue
            days_overdue = (today - schedule.due_date).days

            severity = (
                Alert.Severity.CRITICAL
                if days_overdue > 30
                else Alert.Severity.WARNING
            )
            create_alert(
                store=store,
                alert_type=Alert.Type.CREDIT_OVERDUE,
                severity=severity,
                title=f"Credit en retard : {customer_name}",
                message=(
                    f"L'echeance de {schedule.amount_due} "
                    f"{getattr(settings, 'CURRENCY', 'FCFA')} pour le "
                    f"client {customer_name} (vente {invoice_number}) "
                    f"est en retard de {days_overdue} jour(s). "
                    f"Date d'echeance : {schedule.due_date:%d/%m/%Y}."
                ),
                payload={
                    "schedule_id": schedule_id,
                    "sale_id": sale_id,
                    "invoice_number": invoice_number,
                    "customer": customer_name,
                    "amount_due": str(schedule.amount_due),
                    "due_date": schedule.due_date.isoformat(),
                    "days_overdue": days_overdue,
                },
            )
            existing_schedule_ids.add(schedule_id)
            alert_count += 1

    except (ImportError, Exception) as exc:
        # credits app not yet available -- fall back to Sale.amount_due
        logger.debug("Credits app not available (%s), falling back to Sale model.", exc)

        from sales.models import Sale

        overdue_sales = list(Sale.objects.filter(
            is_credit_sale=True,
            amount_due__gt=0,
        ).select_related("store", "customer")
        )
        existing_sale_ids = set(
            Alert.objects.filter(
                alert_type=Alert.Type.CREDIT_OVERDUE,
                payload__sale_id__in=[str(sale.pk) for sale in overdue_sales],
                created_at__date=today,
            ).values_list("payload__sale_id", flat=True)
        )

        for sale in overdue_sales:
            # If the sale was created more than CREDIT_OVERDUE_GRACE_DAYS ago
            grace_days = getattr(settings, "CREDIT_OVERDUE_GRACE_DAYS", 3)
            if (today - sale.created_at.date()).days <= grace_days:
                continue

            sale_id = str(sale.pk)
            if sale_id in existing_sale_ids:
                continue
            customer_name = sale.customer.full_name if sale.customer else "N/A"
            days_overdue = (today - sale.created_at.date()).days - grace_days

            create_alert(
                store=sale.store,
                alert_type=Alert.Type.CREDIT_OVERDUE,
                severity=Alert.Severity.WARNING,
                title=f"Credit en retard : {customer_name}",
                message=(
                    f"La vente a credit {sale.invoice_number} pour le "
                    f"client {customer_name} a un solde impaye de "
                    f"{sale.amount_due} "
                    f"{getattr(settings, 'CURRENCY', 'FCFA')} depuis "
                    f"{days_overdue} jour(s)."
                ),
                payload={
                    "sale_id": sale_id,
                    "invoice_number": sale.invoice_number,
                    "customer": customer_name,
                    "amount_due": str(sale.amount_due),
                    "days_overdue": days_overdue,
                },
            )
            existing_sale_ids.add(sale_id)
            alert_count += 1

    logger.info("check_overdue_credits completed: %d alerts created.", alert_count)
    return f"{alert_count} alerts created"
