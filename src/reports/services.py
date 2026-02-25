"""Service functions for the reports app.

These functions encapsulate the business logic for building report data
so that views stay thin and logic is reusable from Celery tasks or the API.
"""
import csv
import io
import logging
from datetime import date, timedelta
from decimal import Decimal

from django.db.models import (
    Avg,
    Count,
    F,
    Q,
    Sum,
    Value,
)
from django.db.models.functions import Coalesce, ExtractHour, TruncDate
from django.http import HttpResponse
from django.utils import timezone

logger = logging.getLogger("boutique")


# ---------------------------------------------------------------------------
# Dashboard KPIs
# ---------------------------------------------------------------------------

def get_dashboard_kpis(store, date_from=None, date_to=None):
    """Return a dict of key performance indicators for *store*.

    When *date_from* and *date_to* are ``None`` the function calculates
    today's figures from live data.  When they are supplied it queries
    the ``KPISnapshot`` table for the given range.
    """
    from sales.models import Sale, SaleItem, Refund
    from stock.models import ProductStock
    from cashier.models import Payment

    today = date.today()

    if date_from is None:
        date_from = today
    if date_to is None:
        date_to = today

    # -- Sales for the period --
    paid_statuses = [Sale.Status.PAID, Sale.Status.PARTIALLY_PAID]
    sales_qs = Sale.objects.filter(
        store=store,
        status__in=paid_statuses,
        created_at__date__gte=date_from,
        created_at__date__lte=date_to,
    )

    sales_agg = sales_qs.aggregate(
        total_sales=Coalesce(Sum("total"), Value(Decimal("0.00"))),
        total_orders=Count("id"),
        avg_basket=Coalesce(Avg("total"), Value(Decimal("0.00"))),
        total_discounts=Coalesce(Sum("discount_amount"), Value(Decimal("0.00"))),
    )

    today_sales = sales_agg["total_sales"]
    today_orders = sales_agg["total_orders"]
    today_avg_basket = sales_agg["avg_basket"]
    total_discounts = sales_agg["total_discounts"]

    # -- Gross margin --
    items_qs = SaleItem.objects.filter(
        sale__store=store,
        sale__status__in=paid_statuses,
        sale__created_at__date__gte=date_from,
        sale__created_at__date__lte=date_to,
    )
    margin_agg = items_qs.aggregate(
        total_revenue=Coalesce(Sum("line_total"), Value(Decimal("0.00"))),
        total_cost=Coalesce(
            Sum(F("cost_price") * F("quantity")),
            Value(Decimal("0.00")),
        ),
    )
    gross_margin = margin_agg["total_revenue"] - margin_agg["total_cost"]

    # -- Refunds --
    refunds_agg = Refund.objects.filter(
        store=store,
        created_at__date__gte=date_from,
        created_at__date__lte=date_to,
    ).aggregate(
        total_refunds=Coalesce(Sum("amount"), Value(Decimal("0.00"))),
    )
    total_refunds = refunds_agg["total_refunds"]

    # -- Top products (by quantity sold) --
    top_products = (
        items_qs
        .values("product_id", "product_name")
        .annotate(
            qty_sold=Coalesce(Sum("quantity"), Value(0)),
            revenue=Coalesce(Sum("line_total"), Value(Decimal("0.00"))),
        )
        .order_by("-qty_sold")[:5]
    )

    # -- Recent sales --
    recent_sales = (
        Sale.objects
        .filter(store=store)
        .select_related("seller", "customer")
        .order_by("-created_at")[:10]
    )

    # -- Low stock count --
    low_stock_count = ProductStock.objects.filter(
        store=store,
        quantity__lte=F("min_qty"),
    ).count()

    # -- Overdue credits count --
    overdue_credits_count = _get_overdue_credits_count(store)

    # -- Pending payments count --
    pending_payments_count = Sale.objects.filter(
        store=store,
        status=Sale.Status.PENDING_PAYMENT,
    ).count()

    return {
        "today_sales": today_sales,
        "today_orders": today_orders,
        "today_avg_basket": today_avg_basket,
        "gross_margin": gross_margin,
        "total_discounts": total_discounts,
        "total_refunds": total_refunds,
        "net_sales": today_sales - total_discounts - total_refunds,
        "top_products": list(top_products),
        "recent_sales": recent_sales,
        "low_stock_count": low_stock_count,
        "overdue_credits_count": overdue_credits_count,
        "pending_payments_count": pending_payments_count,
    }


def _get_overdue_credits_count(store):
    """Return the number of overdue credit schedule lines for *store*.

    If the credits app with ``PaymentSchedule`` is not yet available,
    we fall back to counting credit sales that still have an outstanding
    balance.
    """
    try:
        from credits.models import PaymentSchedule
        return PaymentSchedule.objects.filter(
            account__store=store,
            due_date__lt=date.today(),
        ).exclude(status="PAID").count()
    except (ImportError, Exception):
        # credits app may not be fully set up yet -- fall back
        from sales.models import Sale
        return Sale.objects.filter(
            store=store,
            is_credit_sale=True,
            amount_due__gt=0,
        ).count()


# ---------------------------------------------------------------------------
# Sales report
# ---------------------------------------------------------------------------

def get_sales_report(store, date_from, date_to):
    """Build a detailed sales report for *store* over the given date range.

    Returns a dict with:
      total_ca, net_ca, nb_ventes, avg_basket, total_discounts,
      total_refunds, by_category, by_seller, by_payment_method, top_products
    """
    from sales.models import Sale, SaleItem, Refund
    from cashier.models import Payment

    paid_statuses = [Sale.Status.PAID, Sale.Status.PARTIALLY_PAID]

    sales_qs = Sale.objects.filter(
        store=store,
        status__in=paid_statuses,
        created_at__date__gte=date_from,
        created_at__date__lte=date_to,
    )

    agg = sales_qs.aggregate(
        total_ca=Coalesce(Sum("total"), Value(Decimal("0.00"))),
        nb_ventes=Count("id"),
        avg_basket=Coalesce(Avg("total"), Value(Decimal("0.00"))),
        total_discounts=Coalesce(Sum("discount_amount"), Value(Decimal("0.00"))),
    )

    refunds_total = Refund.objects.filter(
        store=store,
        created_at__date__gte=date_from,
        created_at__date__lte=date_to,
    ).aggregate(
        total=Coalesce(Sum("amount"), Value(Decimal("0.00"))),
    )["total"]

    items_qs = SaleItem.objects.filter(
        sale__store=store,
        sale__status__in=paid_statuses,
        sale__created_at__date__gte=date_from,
        sale__created_at__date__lte=date_to,
    )

    # By category
    by_category = list(
        items_qs
        .values(category_name=F("product__category__name"))
        .annotate(
            qty=Coalesce(Sum("quantity"), Value(0)),
            revenue=Coalesce(Sum("line_total"), Value(Decimal("0.00"))),
        )
        .order_by("-revenue")
    )

    # By seller
    by_seller = list(
        sales_qs
        .values(
            seller_name=F("seller__first_name"),
            seller_last=F("seller__last_name"),
        )
        .annotate(
            nb=Count("id"),
            ca=Coalesce(Sum("total"), Value(Decimal("0.00"))),
        )
        .order_by("-ca")
    )

    # By payment method
    by_payment_method = list(
        Payment.objects
        .filter(
            store=store,
            created_at__date__gte=date_from,
            created_at__date__lte=date_to,
        )
        .values("method")
        .annotate(
            total=Coalesce(Sum("amount"), Value(Decimal("0.00"))),
            count=Count("id"),
        )
        .order_by("-total")
    )

    # Top products
    top_products = list(
        items_qs
        .values("product_id", "product_name")
        .annotate(
            qty_sold=Coalesce(Sum("quantity"), Value(0)),
            revenue=Coalesce(Sum("line_total"), Value(Decimal("0.00"))),
        )
        .order_by("-qty_sold")[:10]
    )

    total_ca = agg["total_ca"]
    total_discounts = agg["total_discounts"]

    return {
        "total_ca": total_ca,
        "net_ca": total_ca - total_discounts - refunds_total,
        "nb_ventes": agg["nb_ventes"],
        "avg_basket": agg["avg_basket"],
        "total_discounts": total_discounts,
        "total_refunds": refunds_total,
        "by_category": by_category,
        "by_seller": by_seller,
        "by_payment_method": by_payment_method,
        "top_products": top_products,
    }


# ---------------------------------------------------------------------------
# Daily statistics (profit per day)
# ---------------------------------------------------------------------------

def get_daily_statistics(store, date_from, date_to):
    """Build daily statistics with profit breakdown for *store*.

    Returns today's profit, period summary, daily rows with profit,
    top products by profit, hourly distribution, and payment methods.
    """
    from sales.models import Sale, SaleItem, Refund
    from cashier.models import Payment
    from django.db.models import DecimalField
    from django.db.models.functions import Coalesce as C

    today = date.today()
    paid_statuses = [Sale.Status.PAID, Sale.Status.PARTIALLY_PAID]

    # -- Base querysets --
    sales_qs = Sale.objects.filter(
        store=store,
        status__in=paid_statuses,
        created_at__date__gte=date_from,
        created_at__date__lte=date_to,
    )
    items_qs = SaleItem.objects.filter(
        sale__store=store,
        sale__status__in=paid_statuses,
        sale__created_at__date__gte=date_from,
        sale__created_at__date__lte=date_to,
    )

    # -- Daily aggregation: Sales level --
    sales_daily = list(
        sales_qs
        .annotate(day=TruncDate('created_at'))
        .values('day')
        .annotate(
            nb_sales=Count('id'),
            revenue=Coalesce(Sum('total'), Value(Decimal("0.00"))),
            total_discounts=Coalesce(Sum('discount_amount'), Value(Decimal("0.00"))),
            avg_basket=Coalesce(Avg('total'), Value(Decimal("0.00"))),
        )
        .order_by('day')
    )

    # -- Daily aggregation: Items level (for profit) --
    items_daily = list(
        items_qs
        .annotate(day=TruncDate('sale__created_at'))
        .values('day')
        .annotate(
            total_line_revenue=Coalesce(Sum('line_total'), Value(Decimal("0.00"))),
            total_cost=Coalesce(
                Sum(F('cost_price') * F('quantity')),
                Value(Decimal("0.00")),
                output_field=DecimalField(),
            ),
            total_items=Coalesce(Sum('quantity'), Value(0)),
        )
        .order_by('day')
    )
    items_by_day = {str(row['day']): row for row in items_daily}

    # -- Merge daily data --
    daily_data = []
    for row in sales_daily:
        day_str = str(row['day'])
        item_row = items_by_day.get(day_str, {})
        line_rev = item_row.get('total_line_revenue', Decimal("0.00"))
        total_cost = item_row.get('total_cost', Decimal("0.00"))
        profit = line_rev - total_cost
        margin_pct = (profit / line_rev * 100) if line_rev > 0 else Decimal("0.00")
        total_items = item_row.get('total_items', 0)

        daily_data.append({
            'date': day_str,
            'nb_sales': row['nb_sales'],
            'revenue': str(row['revenue']),
            'profit': str(profit.quantize(Decimal("0.01"))),
            'margin_pct': str(round(margin_pct, 1)),
            'avg_basket': str(row['avg_basket'].quantize(Decimal("0.01")) if isinstance(row['avg_basket'], Decimal) else row['avg_basket']),
            'total_discounts': str(row['total_discounts']),
            'total_items': total_items,
        })

    # -- Period summary --
    period_agg = sales_qs.aggregate(
        total_revenue=Coalesce(Sum('total'), Value(Decimal("0.00"))),
        nb_sales=Count('id'),
        avg_basket=Coalesce(Avg('total'), Value(Decimal("0.00"))),
        total_discounts=Coalesce(Sum('discount_amount'), Value(Decimal("0.00"))),
    )
    margin_agg = items_qs.aggregate(
        total_line_revenue=Coalesce(Sum('line_total'), Value(Decimal("0.00"))),
        total_cost=Coalesce(
            Sum(F('cost_price') * F('quantity')),
            Value(Decimal("0.00")),
            output_field=DecimalField(),
        ),
        total_items=Coalesce(Sum('quantity'), Value(0)),
    )
    total_profit = margin_agg['total_line_revenue'] - margin_agg['total_cost']
    total_rev = margin_agg['total_line_revenue']
    summary_margin_pct = (total_profit / total_rev * 100) if total_rev > 0 else Decimal("0.00")

    refunds_total = Refund.objects.filter(
        store=store,
        created_at__date__gte=date_from,
        created_at__date__lte=date_to,
    ).aggregate(
        total=Coalesce(Sum('amount'), Value(Decimal("0.00"))),
    )['total']

    summary = {
        'total_revenue': str(period_agg['total_revenue']),
        'nb_sales': period_agg['nb_sales'],
        'avg_basket': str(period_agg['avg_basket'].quantize(Decimal("0.01")) if isinstance(period_agg['avg_basket'], Decimal) else period_agg['avg_basket']),
        'total_discounts': str(period_agg['total_discounts']),
        'total_profit': str(total_profit.quantize(Decimal("0.01"))),
        'margin_pct': str(round(summary_margin_pct, 1)),
        'total_items': margin_agg['total_items'],
        'total_refunds': str(refunds_total),
    }

    # -- Today's stats --
    today_sales_qs = Sale.objects.filter(
        store=store,
        status__in=paid_statuses,
        created_at__date=today,
    )
    today_sales_agg = today_sales_qs.aggregate(
        revenue=Coalesce(Sum('total'), Value(Decimal("0.00"))),
        nb_sales=Count('id'),
    )
    today_items_qs = SaleItem.objects.filter(
        sale__store=store,
        sale__status__in=paid_statuses,
        sale__created_at__date=today,
    )
    today_margin = today_items_qs.aggregate(
        rev=Coalesce(Sum('line_total'), Value(Decimal("0.00"))),
        cost=Coalesce(
            Sum(F('cost_price') * F('quantity')),
            Value(Decimal("0.00")),
            output_field=DecimalField(),
        ),
        total_items=Coalesce(Sum('quantity'), Value(0)),
    )
    today_profit = today_margin['rev'] - today_margin['cost']
    today_margin_pct = (today_profit / today_margin['rev'] * 100) if today_margin['rev'] > 0 else Decimal("0.00")

    today_data = {
        'revenue': str(today_sales_agg['revenue']),
        'profit': str(today_profit.quantize(Decimal("0.01"))),
        'margin_pct': str(round(today_margin_pct, 1)),
        'nb_sales': today_sales_agg['nb_sales'],
        'total_items': today_margin['total_items'],
    }

    # -- Top 10 products by profit --
    top_products_by_profit = list(
        items_qs
        .values('product_name')
        .annotate(
            qty_sold=Coalesce(Sum('quantity'), Value(0)),
            revenue=Coalesce(Sum('line_total'), Value(Decimal("0.00"))),
            cost=Coalesce(
                Sum(F('cost_price') * F('quantity')),
                Value(Decimal("0.00")),
                output_field=DecimalField(),
            ),
        )
        .order_by()  # clear default ordering
        .annotate(profit=F('revenue') - F('cost'))
        .order_by('-profit')[:10]
    )
    top_products_data = [
        {
            'product_name': p['product_name'],
            'qty_sold': p['qty_sold'],
            'revenue': str(p['revenue']),
            'profit': str(p['profit'].quantize(Decimal("0.01")) if isinstance(p['profit'], Decimal) else p['profit']),
        }
        for p in top_products_by_profit
    ]

    # -- Hourly distribution --
    hourly_distribution = list(
        sales_qs
        .annotate(hour=ExtractHour('created_at'))
        .values('hour')
        .annotate(
            nb_sales=Count('id'),
            revenue=Coalesce(Sum('total'), Value(Decimal("0.00"))),
        )
        .order_by('hour')
    )
    hourly_data = [
        {
            'hour': h['hour'],
            'nb_sales': h['nb_sales'],
            'revenue': str(h['revenue']),
        }
        for h in hourly_distribution
    ]

    # -- By payment method --
    by_payment_method = list(
        Payment.objects.filter(
            store=store,
            created_at__date__gte=date_from,
            created_at__date__lte=date_to,
        )
        .values('method')
        .annotate(
            total=Coalesce(Sum('amount'), Value(Decimal("0.00"))),
            count=Count('id'),
        )
        .order_by('-total')
    )
    payment_data = [
        {
            'method': m['method'],
            'total': str(m['total']),
            'count': m['count'],
        }
        for m in by_payment_method
    ]

    # -- Best / worst day --
    best_day = None
    worst_day = None
    if daily_data:
        sorted_by_revenue = sorted(daily_data, key=lambda d: Decimal(d['revenue']), reverse=True)
        best_day = sorted_by_revenue[0]
        non_zero = [d for d in sorted_by_revenue if Decimal(d['revenue']) > 0]
        if non_zero:
            worst_day = non_zero[-1]

    return {
        'today': today_data,
        'summary': summary,
        'daily': daily_data,
        'top_products_by_profit': top_products_data,
        'hourly_distribution': hourly_data,
        'by_payment_method': payment_data,
        'best_day': best_day,
        'worst_day': worst_day,
    }


# ---------------------------------------------------------------------------
# Stock report
# ---------------------------------------------------------------------------

def get_stock_report(store):
    """Build a stock report for *store*.

    Returns a dict with:
      total_products, total_stock_value, low_stock_items, out_of_stock,
      dormant_items (no sales in the last 30 days), top_movers
    """
    from stock.models import ProductStock
    from sales.models import SaleItem

    stocks = ProductStock.objects.filter(store=store).select_related("product")

    total_products = stocks.count()
    total_stock_value = stocks.aggregate(
        val=Coalesce(
            Sum(F("quantity") * F("product__cost_price")),
            Value(Decimal("0.00")),
        ),
    )["val"]

    low_stock_items = list(
        stocks
        .filter(quantity__lte=F("min_qty"), quantity__gt=0)
        .values(
            "product__name",
            "product__sku",
            "quantity",
            "min_qty",
        )
        .order_by("quantity")[:20]
    )

    out_of_stock = list(
        stocks
        .filter(quantity__lte=0)
        .values("product__name", "product__sku")
        .order_by("product__name")
    )

    # Dormant items: products with stock but no sales in last 30 days
    thirty_days_ago = date.today() - timedelta(days=30)
    sold_product_ids = (
        SaleItem.objects
        .filter(
            sale__store=store,
            sale__created_at__date__gte=thirty_days_ago,
        )
        .values_list("product_id", flat=True)
        .distinct()
    )
    dormant_items = list(
        stocks
        .filter(quantity__gt=0)
        .exclude(product_id__in=sold_product_ids)
        .values("product__name", "product__sku", "quantity")
        .order_by("-quantity")[:20]
    )

    # Top movers: most sold products in last 30 days
    top_movers = list(
        SaleItem.objects
        .filter(
            sale__store=store,
            sale__created_at__date__gte=thirty_days_ago,
        )
        .values("product__name", "product__sku")
        .annotate(qty_sold=Coalesce(Sum("quantity"), Value(0)))
        .order_by("-qty_sold")[:10]
    )

    return {
        "total_products": total_products,
        "total_stock_value": total_stock_value,
        "low_stock_items": low_stock_items,
        "out_of_stock": out_of_stock,
        "dormant_items": dormant_items,
        "top_movers": top_movers,
    }


# ---------------------------------------------------------------------------
# Cashier report
# ---------------------------------------------------------------------------

def get_cashier_report(store, date_from, date_to):
    """Build a cashier report for *store* over the given date range.

    Returns a dict with:
      shifts, total_by_method, total_variance, by_cashier
    """
    from cashier.models import CashShift, Payment

    shifts = list(
        CashShift.objects
        .filter(
            store=store,
            opened_at__date__gte=date_from,
            opened_at__date__lte=date_to,
        )
        .select_related("cashier")
        .order_by("-opened_at")
    )

    # Total by payment method
    total_by_method = list(
        Payment.objects
        .filter(
            store=store,
            created_at__date__gte=date_from,
            created_at__date__lte=date_to,
        )
        .values("method")
        .annotate(
            total=Coalesce(Sum("amount"), Value(Decimal("0.00"))),
            count=Count("id"),
        )
        .order_by("-total")
    )

    # Total variance
    variance_agg = CashShift.objects.filter(
        store=store,
        status=CashShift.Status.CLOSED,
        opened_at__date__gte=date_from,
        opened_at__date__lte=date_to,
    ).aggregate(
        total_variance=Coalesce(Sum("variance"), Value(Decimal("0.00"))),
    )
    total_variance = variance_agg["total_variance"]

    # By cashier
    by_cashier = list(
        CashShift.objects
        .filter(
            store=store,
            opened_at__date__gte=date_from,
            opened_at__date__lte=date_to,
        )
        .values(
            cashier_name=F("cashier__first_name"),
            cashier_last=F("cashier__last_name"),
        )
        .annotate(
            nb_shifts=Count("id"),
            total_sales=Coalesce(Sum("total_sales"), Value(Decimal("0.00"))),
            total_variance=Coalesce(Sum("variance"), Value(Decimal("0.00"))),
        )
        .order_by("-total_sales")
    )

    total_collected = sum((row["total"] for row in total_by_method), Decimal("0.00"))

    return {
        "shifts": shifts,
        "total_by_method": total_by_method,
        "total_collected": total_collected,
        "total_variance": total_variance,
        "by_cashier": by_cashier,
    }


# ---------------------------------------------------------------------------
# Credit report
# ---------------------------------------------------------------------------

def get_credit_report(store):
    """Build a credit report for *store*.

    Returns a dict with:
      total_outstanding, overdue_amount, overdue_count, avg_dso, by_customer
    """
    try:
        from credits.models import CreditLedgerEntry, CustomerAccount, PaymentSchedule

        accounts_qs = CustomerAccount.objects.filter(
            store=store,
            balance__gt=0,
        )
        total_outstanding = accounts_qs.aggregate(
            total=Coalesce(Sum("balance"), Value(Decimal("0.00")))
        )["total"]

        account_rows = list(
            accounts_qs.values(
                "id",
                customer_name=F("customer__first_name"),
                customer_last=F("customer__last_name"),
                customer_phone=F("customer__phone"),
                outstanding=F("balance"),
            )
        )

        sale_counts_by_account = dict(
            CreditLedgerEntry.objects.filter(
                account__store=store,
                account__balance__gt=0,
                entry_type=CreditLedgerEntry.EntryType.SALE_ON_CREDIT,
                sale__isnull=False,
            )
            .values("account_id")
            .annotate(nb_sales=Count("sale_id", distinct=True))
            .values_list("account_id", "nb_sales")
        )

        by_customer = [
            {
                "customer_name": row["customer_name"],
                "customer_last": row["customer_last"],
                "customer_phone": row["customer_phone"],
                "nb_sales": sale_counts_by_account.get(row["id"], 0),
                "outstanding": row["outstanding"],
            }
            for row in account_rows
        ]
        by_customer.sort(key=lambda row: row["outstanding"], reverse=True)

        overdue_qs = PaymentSchedule.objects.filter(
            account__store=store,
            due_date__lt=date.today(),
        ).exclude(status=PaymentSchedule.Status.PAID)
        overdue_agg = overdue_qs.aggregate(
            overdue_amount=Coalesce(Sum("amount_due"), Value(Decimal("0.00"))),
            overdue_count=Count("id"),
        )
        overdue_amount = overdue_agg["overdue_amount"]
        overdue_count = overdue_agg["overdue_count"]

        avg_dso = 0
        outstanding_credit_entries = CreditLedgerEntry.objects.filter(
            account__store=store,
            account__balance__gt=0,
            entry_type=CreditLedgerEntry.EntryType.SALE_ON_CREDIT,
        )
        if outstanding_credit_entries.exists():
            total_days = sum(
                (date.today() - entry.created_at.date()).days
                for entry in outstanding_credit_entries
            )
            avg_dso = total_days / outstanding_credit_entries.count()

        return {
            "total_outstanding": total_outstanding,
            "overdue_amount": overdue_amount,
            "overdue_count": overdue_count,
            "avg_dso": round(avg_dso, 1),
            "by_customer": by_customer,
        }
    except (ImportError, Exception):
        # credits app not yet available -- fall back to Sale.amount_due.
        from sales.models import Sale

        credit_sales = Sale.objects.filter(
            store=store,
            is_credit_sale=True,
            amount_due__gt=0,
        )

        agg = credit_sales.aggregate(
            total_outstanding=Coalesce(Sum("amount_due"), Value(Decimal("0.00"))),
            count=Count("id"),
        )
        total_outstanding = agg["total_outstanding"]

        overdue_amount = Decimal("0.00")
        overdue_count = 0
        avg_dso = 0
        if credit_sales.exists():
            total_days = sum(
                (date.today() - sale.created_at.date()).days
                for sale in credit_sales
            )
            avg_dso = total_days / credit_sales.count()

        by_customer = list(
            credit_sales
            .values(
                customer_name=F("customer__first_name"),
                customer_last=F("customer__last_name"),
                customer_phone=F("customer__phone"),
            )
            .annotate(
                nb_sales=Count("id"),
                outstanding=Coalesce(Sum("amount_due"), Value(Decimal("0.00"))),
            )
            .order_by("-outstanding")
        )

        return {
            "total_outstanding": total_outstanding,
            "overdue_amount": overdue_amount,
            "overdue_count": overdue_count,
            "avg_dso": round(avg_dso, 1),
            "by_customer": by_customer,
        }


# ---------------------------------------------------------------------------
# Export helpers
# ---------------------------------------------------------------------------

def export_to_excel(data, report_type):
    """Export *data* as an Excel (.xlsx) file and return an HttpResponse.

    Uses ``openpyxl`` for Excel generation.
    """
    try:
        from openpyxl import Workbook
    except ImportError:
        logger.error("openpyxl is not installed -- cannot export to Excel.")
        return _fallback_csv_response(data, report_type)

    wb = Workbook()
    ws = wb.active
    ws.title = report_type.capitalize()

    # Write data depending on report type
    if report_type == "sales":
        _write_sales_excel(ws, data)
    elif report_type == "stock":
        _write_stock_excel(ws, data)
    elif report_type == "cashier":
        _write_cashier_excel(ws, data)
    elif report_type == "credit":
        _write_credit_excel(ws, data)
    else:
        ws.append(["Aucune donnee disponible pour ce type de rapport."])

    response = HttpResponse(
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    filename = f"rapport_{report_type}_{date.today().isoformat()}.xlsx"
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    wb.save(response)
    return response


def _write_sales_excel(ws, data):
    """Write sales report data to an Excel worksheet."""
    ws.append(["Rapport des Ventes"])
    ws.append([])
    ws.append(["Indicateur", "Valeur"])
    ws.append(["Chiffre d'affaires total", str(data.get("total_ca", 0))])
    ws.append(["CA net", str(data.get("net_ca", 0))])
    ws.append(["Nombre de ventes", data.get("nb_ventes", 0)])
    ws.append(["Panier moyen", str(data.get("avg_basket", 0))])
    ws.append(["Total remises", str(data.get("total_discounts", 0))])
    ws.append(["Total remboursements", str(data.get("total_refunds", 0))])
    ws.append([])

    # Top products
    ws.append(["Top Produits"])
    ws.append(["Produit", "Quantite vendue", "Chiffre d'affaires"])
    for p in data.get("top_products", []):
        ws.append([p.get("product_name", ""), p.get("qty_sold", 0), str(p.get("revenue", 0))])

    ws.append([])

    # By category
    ws.append(["Par Categorie"])
    ws.append(["Categorie", "Quantite", "CA"])
    for c in data.get("by_category", []):
        ws.append([c.get("category_name", ""), c.get("qty", 0), str(c.get("revenue", 0))])


def _write_stock_excel(ws, data):
    """Write stock report data to an Excel worksheet."""
    ws.append(["Rapport du Stock"])
    ws.append([])
    ws.append(["Indicateur", "Valeur"])
    ws.append(["Total produits", data.get("total_products", 0)])
    ws.append(["Valeur du stock", str(data.get("total_stock_value", 0))])
    ws.append([])

    ws.append(["Stock faible"])
    ws.append(["Produit", "SKU", "Quantite", "Seuil minimum"])
    for item in data.get("low_stock_items", []):
        ws.append([
            item.get("product__name", ""),
            item.get("product__sku", ""),
            item.get("quantity", 0),
            item.get("min_qty", 0),
        ])

    ws.append([])
    ws.append(["Rupture de stock"])
    ws.append(["Produit", "SKU"])
    for item in data.get("out_of_stock", []):
        ws.append([item.get("product__name", ""), item.get("product__sku", "")])


def _write_cashier_excel(ws, data):
    """Write cashier report data to an Excel worksheet."""
    ws.append(["Rapport de Caisse"])
    ws.append([])
    ws.append(["Ecart total", str(data.get("total_variance", 0))])
    ws.append([])

    ws.append(["Par methode de paiement"])
    ws.append(["Methode", "Total", "Nombre"])
    for m in data.get("total_by_method", []):
        ws.append([m.get("method", ""), str(m.get("total", 0)), m.get("count", 0)])

    ws.append([])
    ws.append(["Par caissier"])
    ws.append(["Caissier", "Nombre de sessions", "Total ventes", "Ecart"])
    for c in data.get("by_cashier", []):
        name = f"{c.get('cashier_name', '')} {c.get('cashier_last', '')}".strip()
        ws.append([name, c.get("nb_shifts", 0), str(c.get("total_sales", 0)), str(c.get("total_variance", 0))])


def _write_credit_excel(ws, data):
    """Write credit report data to an Excel worksheet."""
    ws.append(["Rapport des Credits"])
    ws.append([])
    ws.append(["Indicateur", "Valeur"])
    ws.append(["Encours total", str(data.get("total_outstanding", 0))])
    ws.append(["Montant en retard", str(data.get("overdue_amount", 0))])
    ws.append(["Nombre en retard", data.get("overdue_count", 0)])
    ws.append(["DSO moyen (jours)", data.get("avg_dso", 0)])
    ws.append([])

    ws.append(["Par client"])
    ws.append(["Client", "Telephone", "Nombre de ventes", "Encours"])
    for c in data.get("by_customer", []):
        name = f"{c.get('customer_name', '')} {c.get('customer_last', '')}".strip()
        ws.append([name, c.get("customer_phone", ""), c.get("nb_sales", 0), str(c.get("outstanding", 0))])


def export_to_csv(data, report_type):
    """Export *data* as a CSV file and return an HttpResponse."""
    response = HttpResponse(content_type="text/csv; charset=utf-8")
    filename = f"rapport_{report_type}_{date.today().isoformat()}.csv"
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    # BOM for Excel compatibility
    response.write("\ufeff")

    writer = csv.writer(response, delimiter=";")

    if report_type == "sales":
        writer.writerow(["Rapport des Ventes"])
        writer.writerow([])
        writer.writerow(["Indicateur", "Valeur"])
        writer.writerow(["Chiffre d'affaires total", str(data.get("total_ca", 0))])
        writer.writerow(["CA net", str(data.get("net_ca", 0))])
        writer.writerow(["Nombre de ventes", data.get("nb_ventes", 0)])
        writer.writerow(["Panier moyen", str(data.get("avg_basket", 0))])
        writer.writerow(["Total remises", str(data.get("total_discounts", 0))])
        writer.writerow(["Total remboursements", str(data.get("total_refunds", 0))])
        writer.writerow([])
        writer.writerow(["Top Produits"])
        writer.writerow(["Produit", "Quantite vendue", "CA"])
        for p in data.get("top_products", []):
            writer.writerow([p.get("product_name", ""), p.get("qty_sold", 0), str(p.get("revenue", 0))])

    elif report_type == "stock":
        writer.writerow(["Rapport du Stock"])
        writer.writerow([])
        writer.writerow(["Total produits", data.get("total_products", 0)])
        writer.writerow(["Valeur du stock", str(data.get("total_stock_value", 0))])
        writer.writerow([])
        writer.writerow(["Stock faible"])
        writer.writerow(["Produit", "SKU", "Quantite", "Seuil minimum"])
        for item in data.get("low_stock_items", []):
            writer.writerow([
                item.get("product__name", ""),
                item.get("product__sku", ""),
                item.get("quantity", 0),
                item.get("min_qty", 0),
            ])

    elif report_type == "cashier":
        writer.writerow(["Rapport de Caisse"])
        writer.writerow([])
        writer.writerow(["Ecart total", str(data.get("total_variance", 0))])
        writer.writerow([])
        writer.writerow(["Par methode de paiement"])
        writer.writerow(["Methode", "Total", "Nombre"])
        for m in data.get("total_by_method", []):
            writer.writerow([m.get("method", ""), str(m.get("total", 0)), m.get("count", 0)])

    elif report_type == "credit":
        writer.writerow(["Rapport des Credits"])
        writer.writerow([])
        writer.writerow(["Encours total", str(data.get("total_outstanding", 0))])
        writer.writerow(["Montant en retard", str(data.get("overdue_amount", 0))])
        writer.writerow(["Nombre en retard", data.get("overdue_count", 0)])
        writer.writerow(["DSO moyen (jours)", data.get("avg_dso", 0)])
        writer.writerow([])
        writer.writerow(["Par client"])
        writer.writerow(["Client", "Telephone", "Nombre de ventes", "Encours"])
        for c in data.get("by_customer", []):
            name = f"{c.get('customer_name', '')} {c.get('customer_last', '')}".strip()
            writer.writerow([name, c.get("customer_phone", ""), c.get("nb_sales", 0), str(c.get("outstanding", 0))])

    return response


def _fallback_csv_response(data, report_type):
    """Fallback if openpyxl is not installed -- export as CSV instead."""
    logger.warning("Falling back to CSV export because openpyxl is not available.")
    return export_to_csv(data, report_type)
