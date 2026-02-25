"""Celery tasks for the reports app."""
import logging
from datetime import date, timedelta
from decimal import Decimal

from celery import shared_task
from django.db.models import Avg, Count, F, Sum, Value
from django.db.models.functions import Coalesce

logger = logging.getLogger("boutique")


@shared_task(name="reports.tasks.daily_kpi_snapshot")
def daily_kpi_snapshot():
    """Calculate and save a KPISnapshot for yesterday for each active store.

    Runs once per day (see ``config/celery.py`` beat schedule).
    """
    from stores.models import Store
    from sales.models import Sale, SaleItem, Refund
    from stock.models import ProductStock
    from reports.models import KPISnapshot

    yesterday = date.today() - timedelta(days=1)
    stores = Store.objects.filter(is_active=True)
    created_count = 0

    for store in stores:
        # Skip if snapshot already exists
        if KPISnapshot.objects.filter(store=store, date=yesterday).exists():
            logger.debug("KPI snapshot already exists for %s on %s", store, yesterday)
            continue

        paid_statuses = [Sale.Status.PAID, Sale.Status.PARTIALLY_PAID]

        # Sales aggregates
        sales_qs = Sale.objects.filter(
            store=store,
            status__in=paid_statuses,
            created_at__date=yesterday,
        )
        sales_agg = sales_qs.aggregate(
            total_sales=Coalesce(Sum("total"), Value(Decimal("0.00"))),
            total_orders=Count("id"),
            avg_basket=Coalesce(Avg("total"), Value(Decimal("0.00"))),
            total_discounts=Coalesce(Sum("discount_amount"), Value(Decimal("0.00"))),
        )

        # Gross margin from sale items
        items_qs = SaleItem.objects.filter(
            sale__store=store,
            sale__status__in=paid_statuses,
            sale__created_at__date=yesterday,
        )
        margin_agg = items_qs.aggregate(
            total_revenue=Coalesce(Sum("line_total"), Value(Decimal("0.00"))),
            total_cost=Coalesce(
                Sum(F("cost_price") * F("quantity")),
                Value(Decimal("0.00")),
            ),
        )
        gross_margin = margin_agg["total_revenue"] - margin_agg["total_cost"]

        # Refunds
        total_refunds = Refund.objects.filter(
            store=store,
            created_at__date=yesterday,
        ).aggregate(
            total=Coalesce(Sum("amount"), Value(Decimal("0.00"))),
        )["total"]

        total_sales = sales_agg["total_sales"]
        total_discounts = sales_agg["total_discounts"]
        net_sales = total_sales - total_discounts - total_refunds

        # Credit outstanding (snapshot at end of day)
        try:
            from credits.models import CustomerAccount

            credit_outstanding = CustomerAccount.objects.filter(
                store=store,
                balance__gt=0,
            ).aggregate(
                total=Coalesce(Sum("balance"), Value(Decimal("0.00"))),
            )["total"]
        except (ImportError, Exception):
            credit_outstanding = Sale.objects.filter(
                store=store,
                is_credit_sale=True,
                amount_due__gt=0,
            ).aggregate(
                total=Coalesce(Sum("amount_due"), Value(Decimal("0.00"))),
            )["total"]

        # Stock value (snapshot at end of day)
        stock_value = ProductStock.objects.filter(
            store=store,
        ).aggregate(
            val=Coalesce(
                Sum(F("quantity") * F("product__cost_price")),
                Value(Decimal("0.00")),
            ),
        )["val"]

        KPISnapshot.objects.create(
            store=store,
            date=yesterday,
            total_sales=total_sales,
            total_orders=sales_agg["total_orders"],
            average_basket=sales_agg["avg_basket"],
            gross_margin=gross_margin,
            total_discounts=total_discounts,
            total_refunds=total_refunds,
            net_sales=net_sales,
            credit_outstanding=credit_outstanding,
            stock_value=stock_value,
        )
        created_count += 1
        logger.info("KPI snapshot created for %s on %s", store, yesterday)

    logger.info("daily_kpi_snapshot completed: %d snapshots created.", created_count)
    return f"{created_count} snapshots created"
