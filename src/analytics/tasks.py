"""Celery tasks for analytics computation pipeline."""
from datetime import date, timedelta

from celery import shared_task

from analytics import services
from analytics.customer_intelligence import (
    list_churn_risk_customers,
    list_credit_risk_customers,
    list_dormant_customers,
    refresh_customer_intelligence_for_customer,
    refresh_top_clients_month,
)


def _iter_stores(store_id=None):
    from stores.models import Store

    qs = Store.objects.filter(is_active=True)
    if store_id:
        qs = qs.filter(pk=store_id)
    return qs


@shared_task(name="analytics.tasks.refresh_abc_analysis")
def refresh_abc_analysis(store_id=None, period_days=30):
    end_date = date.today()
    start_date = end_date - timedelta(days=int(period_days) - 1)
    total = 0
    for store in _iter_stores(store_id):
        total += services.compute_abc_analysis(store, start_date, end_date)
    return f"abc rows={total}"


@shared_task(name="analytics.tasks.refresh_dynamic_reorder")
def refresh_dynamic_reorder(store_id=None, lookback_days=30):
    as_of = date.today()
    total = 0
    for store in _iter_stores(store_id):
        total += services.compute_dynamic_reorder(store, as_of=as_of, lookback_days=int(lookback_days))
    return f"reorder rows={total}"


@shared_task(name="analytics.tasks.refresh_credit_scores")
def refresh_credit_scores(store_id=None):
    as_of = date.today()
    total = 0
    for store in _iter_stores(store_id):
        total += services.compute_credit_scores(store, as_of=as_of)
    return f"credit score rows={total}"


@shared_task(name="analytics.tasks.refresh_sales_forecast")
def refresh_sales_forecast(store_id=None, lookback_days=60, horizon_days=14):
    as_of = date.today()
    total = 0
    for store in _iter_stores(store_id):
        total += services.compute_sales_forecast(
            store,
            as_of=as_of,
            lookback_days=int(lookback_days),
            horizon_days=int(horizon_days),
        )
    return f"forecast rows={total}"


@shared_task(name="analytics.tasks.detect_fraud")
def detect_fraud(store_id=None, lookback_days=1):
    end_date = date.today()
    start_date = end_date - timedelta(days=int(lookback_days) - 1)
    total = 0
    for store in _iter_stores(store_id):
        total += services.detect_fraud_signals(store, date_from=start_date, date_to=end_date)
    return f"fraud events={total}"


@shared_task(name="analytics.tasks.run_full_pipeline")
def run_full_pipeline(store_id=None):
    """Run the complete daily analytics refresh for one/all stores."""
    refresh_abc_analysis(store_id=store_id)
    refresh_dynamic_reorder(store_id=store_id)
    refresh_credit_scores(store_id=store_id)
    refresh_sales_forecast(store_id=store_id)
    detect_fraud(store_id=store_id)
    return "ok"


@shared_task(name="analytics.tasks.refresh_customer_intelligence_store")
def refresh_customer_intelligence_store(store_id=None, lookback_days=365):
    """Daily full recompute for customer intelligence snapshots."""
    from customers.models import Customer
    from sales.models import Sale

    as_of = date.today()
    total_customers = 0
    total_dormant = 0
    total_credit_risk = 0
    total_churn_risk = 0

    for store in _iter_stores(store_id):
        window_start = as_of - timedelta(days=max(30, int(lookback_days)))
        customer_ids = list(
            Sale.objects.filter(
                store=store,
                customer_id__isnull=False,
                customer__is_default=False,
                created_at__date__gte=window_start,
                created_at__date__lte=as_of,
            )
            .values_list("customer_id", flat=True)
            .distinct()
        )
        customers = Customer.objects.filter(id__in=customer_ids, is_default=False)

        for customer in customers:
            refresh_customer_intelligence_for_customer(
                store=store,
                customer=customer,
                as_of=as_of,
                actor=None,
                force_recommendations_refresh=True,
            )
            total_customers += 1

        refresh_top_clients_month(store=store, period_month=as_of.replace(day=1), limit=10, actor=None)
        total_dormant += len(list_dormant_customers(store=store, as_of=as_of, actor=None))
        total_credit_risk += len(
            list_credit_risk_customers(
                store=store,
                as_of=as_of,
                min_risk_score=45,
                limit=200,
                actor=None,
            )
        )
        total_churn_risk += len(
            list_churn_risk_customers(
                store=store,
                as_of=as_of,
                window_days=30,
                drop_threshold_pct=30,
                limit=200,
                actor=None,
            )
        )

    return (
        "customer intelligence refreshed "
        f"customers={total_customers} dormant={total_dormant} "
        f"credit_risk={total_credit_risk} churn={total_churn_risk}"
    )


@shared_task(name="analytics.tasks.refresh_customer_intelligence_customer")
def refresh_customer_intelligence_customer(store_id, customer_id, as_of=None):
    """Incremental recompute for one customer after payment/refund/credit events."""
    from customers.models import Customer
    from stores.models import Store

    as_of_date = date.fromisoformat(as_of) if as_of else date.today()
    store = Store.objects.filter(pk=store_id, is_active=True).first()
    customer = Customer.objects.filter(pk=customer_id, is_default=False).first()
    if not store or not customer:
        return "skipped"

    payload = refresh_customer_intelligence_for_customer(
        store=store,
        customer=customer,
        as_of=as_of_date,
        actor=None,
        force_recommendations_refresh=True,
    )
    # Keep monthly top cache warm for the current month.
    refresh_top_clients_month(store=store, period_month=as_of_date.replace(day=1), limit=10, actor=None)
    return payload
