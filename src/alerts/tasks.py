"""Celery tasks for the alerts app."""
import logging
from datetime import date, timedelta
from decimal import Decimal

from celery import shared_task
from django.conf import settings
from django.db.models import Q
from django.utils import timezone

logger = logging.getLogger("boutique")


@shared_task(name="alerts.tasks.send_push_for_alert_task", bind=True, max_retries=2)
def send_push_for_alert_task(self, alert_id):
    """Send push notifications for a newly created alert."""
    from alerts.models import Alert
    from alerts.services import send_push_for_alert

    try:
        alert = Alert.objects.get(pk=alert_id)
    except Alert.DoesNotExist:
        logger.warning("send_push_for_alert_task: Alert %s not found.", alert_id)
        return "Alert not found"

    count = send_push_for_alert(alert)
    logger.info("Push sent for alert %s: %d deliveries.", alert_id, count)
    return f"{count} push(es) sent"


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

    alert_data_list = []
    
    for sale in pending_sales:
        sale_id = str(sale.pk)
        if sale_id in existing_sale_ids:
            continue
        hours_waiting = (timezone.now() - sale.submitted_at).total_seconds() / 3600
        alert_data_list.append({
            "store": sale.store,
            "alert_type": Alert.Type.PENDING_PAYMENT_TIMEOUT,
            "severity": Alert.Severity.WARNING,
            "title": f"Paiement en attente : {sale.invoice_number}",
            "message": (
                f"La vente {sale.invoice_number} est en attente de paiement "
                f"depuis {hours_waiting:.1f} heures (seuil: {threshold_hours}h). "
                f"Vendeur : {sale.seller.get_full_name()}."
            ),
            "payload": {
                "sale_id": sale_id,
                "invoice_number": sale.invoice_number,
                "total": str(sale.total),
                "hours_waiting": round(hours_waiting, 1),
            },
        })
        existing_sale_ids.add(sale_id)

    if alert_data_list:
        from alerts.services import bulk_create_alerts
        bulk_create_alerts(alert_data_list)
        
    alert_count = len(alert_data_list)

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

    alert_data_list = []

    for sale in sales:
        if check_discount_anomaly(sale):
            sale_id = str(sale.pk)
            if sale_id in existing_sale_ids:
                continue
            alert_data_list.append({
                "store": sale.store,
                "alert_type": Alert.Type.ABNORMAL_DISCOUNT,
                "severity": Alert.Severity.WARNING,
                "title": f"Remise anormale : {sale.invoice_number}",
                "message": (
                    f"La vente {sale.invoice_number} a une remise de "
                    f"{sale.discount_percent}% ({sale.discount_amount} "
                    f"{getattr(settings, 'CURRENCY', 'FCFA')}). "
                    f"Vendeur : {sale.seller.get_full_name()}."
                ),
                "payload": {
                    "sale_id": sale_id,
                    "invoice_number": sale.invoice_number,
                    "discount_percent": str(sale.discount_percent),
                    "discount_amount": str(sale.discount_amount),
                    "seller": sale.seller.get_full_name(),
                },
            })
            existing_sale_ids.add(sale_id)

    if alert_data_list:
        from alerts.services import bulk_create_alerts
        bulk_create_alerts(alert_data_list)
        
    alert_count = len(alert_data_list)

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

    alert_data_list = []

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
        alert_data_list.append({
            "store": shift.store,
            "alert_type": Alert.Type.CASH_VARIANCE,
            "severity": severity,
            "title": f"Ecart de caisse : {shift.cashier.get_full_name()}",
            "message": (
                f"La session de caisse de {shift.cashier.get_full_name()} "
                f"fermee le {shift.closed_at:%d/%m/%Y %H:%M} presente un "
                f"ecart de {shift.variance} "
                f"{getattr(settings, 'CURRENCY', 'FCFA')}."
            ),
            "payload": {
                "shift_id": shift_id,
                "cashier": shift.cashier.get_full_name(),
                "variance": str(shift.variance),
                "expected_cash": str(shift.expected_cash),
                "closing_cash": str(shift.closing_cash),
            },
        })
        existing_shift_ids.add(shift_id)

    if alert_data_list:
        from alerts.services import bulk_create_alerts
        bulk_create_alerts(alert_data_list)
        
    alert_count = len(alert_data_list)

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


@shared_task(name="alerts.tasks.check_sav_overdue")
def check_sav_overdue():
    """Find SAV tickets that have been open too long without progress.

    Creates SAV_OVERDUE alerts for tickets in active statuses that have not
    been updated for more than ``settings.SAV_OVERDUE_DAYS`` days (default 3).
    Also creates SAV_READY alerts for tickets in READY status that have not
    been picked up for more than ``settings.SAV_READY_PICKUP_DAYS`` days (default 7).
    """
    from alerts.services import create_alert
    from alerts.models import Alert
    from sav.models import SAVTicket

    today = date.today()
    alert_count = 0

    # --- SAV_OVERDUE: tickets stagnating in active statuses ---
    overdue_days = getattr(settings, "SAV_OVERDUE_DAYS", 3)
    cutoff = timezone.now() - timedelta(days=overdue_days)

    active_statuses = [
        SAVTicket.Status.RECEIVED,
        SAVTicket.Status.DIAGNOSING,
        SAVTicket.Status.IN_REPAIR,
        SAVTicket.Status.AWAITING_PART,
        SAVTicket.Status.AWAITING_CLIENT,
    ]

    stale_tickets = list(
        SAVTicket.objects.filter(
            status__in=active_statuses,
            updated_at__lte=cutoff,
        ).select_related("store", "technician")
    )

    existing_ticket_refs = set(
        Alert.objects.filter(
            alert_type=Alert.Type.SAV_OVERDUE,
            payload__ticket_ref__in=[t.reference for t in stale_tickets],
            created_at__date=today,
        ).values_list("payload__ticket_ref", flat=True)
    )

    for ticket in stale_tickets:
        if ticket.reference in existing_ticket_refs:
            continue

        days_stale = (timezone.now() - ticket.updated_at).days
        severity = (
            Alert.Severity.CRITICAL if days_stale > 7
            else Alert.Severity.WARNING
        )
        tech_name = ""
        if ticket.technician:
            tech_name = ticket.technician.get_full_name() or ticket.technician.email

        create_alert(
            store=ticket.store,
            alert_type=Alert.Type.SAV_OVERDUE,
            severity=severity,
            title=f"SAV en retard : {ticket.reference}",
            message=(
                f"Le dossier SAV {ticket.reference} ({ticket.brand_name} {ticket.model_name}) "
                f"est en statut '{ticket.get_status_display()}' depuis {days_stale} jour(s). "
                f"Client : {ticket.customer_name}."
                f"{f' Technicien : {tech_name}.' if tech_name else ''}"
            ),
            payload={
                "ticket_ref": ticket.reference,
                "ticket_id": str(ticket.pk),
                "status": ticket.status,
                "customer_name": ticket.customer_name,
                "brand": ticket.brand_name,
                "model": ticket.model_name,
                "days_stale": days_stale,
            },
        )
        existing_ticket_refs.add(ticket.reference)
        alert_count += 1

    # --- SAV_READY: tickets ready for pickup but not collected ---
    pickup_days = getattr(settings, "SAV_READY_PICKUP_DAYS", 7)
    pickup_cutoff = timezone.now() - timedelta(days=pickup_days)

    ready_tickets = list(
        SAVTicket.objects.filter(
            status__in=[SAVTicket.Status.READY, SAVTicket.Status.REPAIRED],
            updated_at__lte=pickup_cutoff,
        ).select_related("store")
    )

    existing_ready_refs = set(
        Alert.objects.filter(
            alert_type=Alert.Type.SAV_READY,
            payload__ticket_ref__in=[t.reference for t in ready_tickets],
            created_at__date=today,
        ).values_list("payload__ticket_ref", flat=True)
    )

    for ticket in ready_tickets:
        if ticket.reference in existing_ready_refs:
            continue

        days_waiting = (timezone.now() - ticket.updated_at).days
        create_alert(
            store=ticket.store,
            alert_type=Alert.Type.SAV_READY,
            severity=Alert.Severity.INFO,
            title=f"SAV pret non recupere : {ticket.reference}",
            message=(
                f"L'appareil {ticket.brand_name} {ticket.model_name} "
                f"(dossier {ticket.reference}) est pret depuis {days_waiting} jour(s) "
                f"mais n'a pas ete recupere par {ticket.customer_name}. "
                f"Tel: {ticket.customer_phone}."
            ),
            payload={
                "ticket_ref": ticket.reference,
                "ticket_id": str(ticket.pk),
                "customer_name": ticket.customer_name,
                "customer_phone": ticket.customer_phone,
                "days_waiting": days_waiting,
            },
        )
        existing_ready_refs.add(ticket.reference)
        alert_count += 1

    logger.info("check_sav_overdue completed: %d alerts created.", alert_count)
    return f"{alert_count} alerts created"
