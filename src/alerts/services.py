"""Service functions for the alerts app."""
import json
import logging
from datetime import date, timedelta
from decimal import Decimal

from django.conf import settings
from django.db.models import Avg, F, Sum
from django.db.models.functions import Coalesce

from alerts.models import Alert

logger = logging.getLogger("boutique")


# ---------------------------------------------------------------------------
# Web Push helpers
# ---------------------------------------------------------------------------

def send_push_to_subscription(subscription_info, title, body, data=None):
    """Send a single push notification. Returns True on success."""
    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        logger.debug("pywebpush not installed — skipping push.")
        return False

    vapid_private = getattr(settings, "WEBPUSH_VAPID_PRIVATE_KEY", "")
    if not vapid_private:
        return False

    payload = json.dumps({
        "title": title,
        "body": body,
        "data": data or {},
        "icon": "/pwa-192.png",
        "badge": "/pwa-192.png",
        "tag": (data or {}).get("alert_id", "simastok-alert"),
    })

    try:
        webpush(
            subscription_info=subscription_info,
            data=payload,
            vapid_private_key=vapid_private,
            vapid_claims={
                "sub": getattr(
                    settings, "WEBPUSH_VAPID_CLAIMS_EMAIL",
                    "mailto:admin@simastok.com",
                ),
            },
        )
        return True
    except WebPushException as exc:
        logger.warning("Push failed for %s: %s", subscription_info.get("endpoint", "?"), exc)
        # 404/410 = subscription expired — deactivate it
        resp = getattr(exc, "response", None)
        if resp is not None and resp.status_code in (404, 410):
            from alerts.models import PushSubscription
            PushSubscription.objects.filter(
                endpoint=subscription_info.get("endpoint", ""),
                is_active=True,
            ).update(is_active=False)
        return False
    except Exception:
        logger.exception("Unexpected push error")
        return False


def send_push_for_alert(alert):
    """Send push notifications for an alert to all users with store access."""
    from alerts.models import PushSubscription
    from stores.models import StoreUser

    user_ids = StoreUser.objects.filter(
        store=alert.store,
    ).values_list("user_id", flat=True)

    subscriptions = PushSubscription.objects.filter(
        user_id__in=user_ids,
        is_active=True,
    )

    data = {
        "alert_id": str(alert.id),
        "alert_type": alert.alert_type,
        "severity": alert.severity,
        "store_id": str(alert.store_id),
        "url": "/alerts",
    }

    count = 0
    for sub in subscriptions:
        if send_push_to_subscription(sub.subscription_info, alert.title, alert.message, data):
            count += 1
    return count


def create_alert(store, alert_type, severity, title, message, payload=None):
    """Create and return a new Alert instance.

    Parameters
    ----------
    store : stores.models.Store
        The store this alert belongs to.
    alert_type : str
        One of ``Alert.Type`` values.
    severity : str
        One of ``Alert.Severity`` values.
    title : str
        Short human-readable title (max 200 chars).
    message : str
        Detailed description of the alert.
    payload : dict, optional
        Extra JSON-serialisable data to store on the alert.

    Returns
    -------
    Alert
        The newly created ``Alert`` instance.
    """
    alert = Alert.objects.create(
        store=store,
        alert_type=alert_type,
        severity=severity,
        title=title,
        message=message,
        payload=payload or {},
    )
    logger.info(
        "Alert created: [%s] %s for store %s",
        severity, title, store,
    )

    # Trigger async push notification
    try:
        from alerts.tasks import send_push_for_alert_task
        send_push_for_alert_task.delay(str(alert.id))
    except Exception:
        logger.debug("Could not dispatch push task for alert %s", alert.id)

    return alert


def bulk_create_alerts(alert_data_list):
    """Create multiple alerts in a single bulk insert and optionally trigger push notifications.

    Parameters
    ----------
    alert_data_list : list of dict
        Each dict must contain:
        - store: Store instance
        - alert_type: str
        - severity: str
        - title: str
        - message: str
        - payload: dict (optional)
        
    Returns
    -------
    list of Alert
        The created Alert instances (note: IDs may not be populated depending on the DB backend).
    """
    alerts_to_create = []
    for data in alert_data_list:
        alerts_to_create.append(
            Alert(
                store=data["store"],
                alert_type=data["alert_type"],
                severity=data["severity"],
                title=data["title"],
                message=data["message"],
                payload=data.get("payload", {}),
            )
        )
        
    if not alerts_to_create:
        return []
        
    created_alerts = Alert.objects.bulk_create(alerts_to_create)
    logger.info("Bulk created %d alerts", len(created_alerts))
    return created_alerts


def create_stock_level_alert_for_product_stock(product_stock, existing_today_keys=None):
    """Create a low/out-of-stock alert for one ProductStock row.

    Returns the created Alert instance, or ``None`` when no alert should
    be created (stock above threshold, or alert already created today).
    """
    available_qty = int(product_stock.available_qty)
    min_qty = int(product_stock.min_qty)

    if available_qty > min_qty:
        return None

    if available_qty <= 0:
        alert_type = Alert.Type.OUT_OF_STOCK
        severity = Alert.Severity.CRITICAL
        title = f"Rupture de stock : {product_stock.product.name}"
        message = (
            f"Le produit {product_stock.product.name} "
            f"({product_stock.product.sku}) est en rupture dans "
            f"la boutique {product_stock.store.name}."
        )
    else:
        alert_type = Alert.Type.LOW_STOCK
        severity = Alert.Severity.WARNING
        title = f"Stock faible : {product_stock.product.name}"
        message = (
            f"Le produit {product_stock.product.name} "
            f"({product_stock.product.sku}) a un stock disponible de "
            f"{available_qty} (seuil: {min_qty}) dans "
            f"la boutique {product_stock.store.name}."
        )

    product_key = (alert_type, str(product_stock.product_id))
    if existing_today_keys is None:
        already_exists = Alert.objects.filter(
            store=product_stock.store,
            alert_type=alert_type,
            payload__product_id=str(product_stock.product_id),
            created_at__date=date.today(),
        ).exists()
        if already_exists:
            return None
    elif product_key in existing_today_keys:
        return None

    alert = create_alert(
        store=product_stock.store,
        alert_type=alert_type,
        severity=severity,
        title=title,
        message=message,
        payload={
            "product_id": str(product_stock.product_id),
            "product_sku": product_stock.product.sku,
            "quantity": int(product_stock.quantity),
            "reserved_qty": int(product_stock.reserved_qty),
            "available_qty": available_qty,
            "min_qty": min_qty,
        },
    )
    if existing_today_keys is not None:
        existing_today_keys.add(product_key)
    return alert


def sync_low_stock_alerts_for_store(store):
    """Generate low/out-of-stock alerts for a single store.

    Returns the number of created alerts.
    """
    from stock.models import ProductStock

    low_stocks = (
        ProductStock.objects
        .filter(store=store, quantity__lte=F("min_qty") + F("reserved_qty"))
        .select_related("product")
    )

    today = date.today()
    existing_today_keys = set(
        Alert.objects.filter(
            store=store,
            alert_type__in=[Alert.Type.LOW_STOCK, Alert.Type.OUT_OF_STOCK],
            created_at__date=today,
        ).values_list("alert_type", "payload__product_id")
    )

    created_count = 0
    for product_stock in low_stocks:
        if create_stock_level_alert_for_product_stock(
            product_stock,
            existing_today_keys=existing_today_keys,
        ):
            created_count += 1
    return created_count


def get_stock_forecast(store, product):
    """Forecast when a product will reach stock rupture.

    Parameters
    ----------
    store : stores.models.Store
    product : catalog.models.Product

    Returns
    -------
    dict
        - ``avg_daily_sales_7d``: average daily units sold over last 7 days
        - ``avg_daily_sales_30d``: average daily units sold over last 30 days
        - ``current_stock``: current quantity in stock
        - ``days_until_rupture``: estimated days until stock reaches 0
          (based on 7-day average; ``None`` if no sales)
        - ``reorder_suggestion``: suggested reorder quantity to cover
          ``STOCK_LOW_THRESHOLD_DAYS`` of sales
    """
    from sales.models import SaleItem
    from stock.models import ProductStock

    today = date.today()
    seven_days_ago = today - timedelta(days=7)
    thirty_days_ago = today - timedelta(days=30)

    # Average daily sales over 7 days
    sales_7d = SaleItem.objects.filter(
        sale__store=store,
        product=product,
        sale__created_at__date__gte=seven_days_ago,
        sale__created_at__date__lte=today,
    ).aggregate(
        total_qty=Coalesce(Sum("quantity"), 0),
    )["total_qty"]
    avg_daily_7d = Decimal(str(sales_7d)) / Decimal("7") if sales_7d else Decimal("0")

    # Average daily sales over 30 days
    sales_30d = SaleItem.objects.filter(
        sale__store=store,
        product=product,
        sale__created_at__date__gte=thirty_days_ago,
        sale__created_at__date__lte=today,
    ).aggregate(
        total_qty=Coalesce(Sum("quantity"), 0),
    )["total_qty"]
    avg_daily_30d = Decimal(str(sales_30d)) / Decimal("30") if sales_30d else Decimal("0")

    # Current stock
    try:
        ps = ProductStock.objects.get(store=store, product=product)
        current_stock = ps.quantity
    except ProductStock.DoesNotExist:
        current_stock = 0

    # Days until rupture (based on 7-day average for responsiveness)
    if avg_daily_7d > 0:
        days_until_rupture = int(Decimal(str(current_stock)) / avg_daily_7d)
    else:
        days_until_rupture = None  # No sales -- cannot estimate

    # Reorder suggestion: enough stock to cover STOCK_LOW_THRESHOLD_DAYS
    threshold_days = getattr(settings, "STOCK_LOW_THRESHOLD_DAYS", 7)
    if avg_daily_7d > 0:
        target_stock = avg_daily_7d * Decimal(str(threshold_days))
        reorder_qty = max(int(target_stock) - current_stock, 0)
    else:
        reorder_qty = 0

    return {
        "avg_daily_sales_7d": round(float(avg_daily_7d), 2),
        "avg_daily_sales_30d": round(float(avg_daily_30d), 2),
        "current_stock": current_stock,
        "days_until_rupture": days_until_rupture,
        "reorder_suggestion": reorder_qty,
    }


def check_discount_anomaly(sale):
    """Return ``True`` if the discount on *sale* is abnormally high.

    The check uses a simple threshold approach:
    - If ``discount_percent`` exceeds ``MAX_DISCOUNT_PERCENT_MANAGER``
      (from settings), the discount is always considered abnormal.
    - Otherwise, we compare against the store's average discount over
      the last 30 days. If the sale's discount is more than 2 standard
      deviations above the mean, it is flagged.

    Parameters
    ----------
    sale : sales.models.Sale

    Returns
    -------
    bool
    """
    from sales.models import Sale

    max_discount = getattr(settings, "MAX_DISCOUNT_PERCENT_MANAGER", 50)

    # Hard ceiling check
    if sale.discount_percent > Decimal(str(max_discount)):
        return True

    # Statistical check: compare to store average over last 30 days
    thirty_days_ago = date.today() - timedelta(days=30)
    recent_sales = Sale.objects.filter(
        store=sale.store,
        discount_percent__gt=0,
        created_at__date__gte=thirty_days_ago,
    ).exclude(pk=sale.pk)

    if recent_sales.count() < 5:
        # Not enough data for a meaningful statistical check.
        # Fall back to a simple threshold.
        simple_threshold = getattr(settings, "MAX_DISCOUNT_PERCENT_SALES", 10)
        return sale.discount_percent > Decimal(str(simple_threshold))

    agg = recent_sales.aggregate(
        avg_discount=Coalesce(Avg("discount_percent"), Decimal("0")),
    )
    avg_discount = agg["avg_discount"]

    # Calculate standard deviation manually

    discounts = list(
        recent_sales.values_list("discount_percent", flat=True)
    )
    if not discounts:
        return False

    mean = float(avg_discount)
    variance = sum((float(d) - mean) ** 2 for d in discounts) / len(discounts)
    stddev = variance ** 0.5

    # Flag if more than 2 standard deviations above the mean
    threshold = mean + (2 * stddev)
    return float(sale.discount_percent) > threshold
