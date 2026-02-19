"""Celery tasks for analytics computation pipeline."""
from datetime import date, timedelta

from celery import shared_task

from analytics import services


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

