"""Core analytics services for scoring, forecasting and strategic KPIs."""
from __future__ import annotations

import logging
from datetime import date, timedelta
from decimal import Decimal
from statistics import mean, pstdev

from django.conf import settings
from django.db import transaction
from django.db.models import Count, DecimalField, F, Q, Sum, Value
from django.db.models.functions import Coalesce, TruncDate

from analytics.models import (
    ABCAnalysis,
    CustomerCreditScore,
    FraudEvent,
    ReorderRecommendation,
    SalesForecast,
)

logger = logging.getLogger("boutique")


def _safe_decimal(value, default="0.00"):
    if value is None:
        return Decimal(default)
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def _grade_from_score(score: int) -> str:
    if score >= 80:
        return CustomerCreditScore.Grade.A
    if score >= 65:
        return CustomerCreditScore.Grade.B
    if score >= 50:
        return CustomerCreditScore.Grade.C
    if score >= 35:
        return CustomerCreditScore.Grade.D
    return CustomerCreditScore.Grade.E


def _feature_enabled(store, key: str) -> bool:
    checker = getattr(store, "is_analytics_feature_enabled", None)
    if callable(checker):
        return bool(checker(key))
    return True


@transaction.atomic
def compute_abc_analysis(store, date_from: date, date_to: date) -> int:
    """Compute and persist ABC classification for one store and period."""
    if not _feature_enabled(store, "abc_analysis"):
        logger.info("ABC analysis skipped for store %s: feature disabled.", store)
        return 0
    from sales.models import Sale, SaleItem

    paid_statuses = [Sale.Status.PAID, Sale.Status.PARTIALLY_PAID]
    rows = list(
        SaleItem.objects.filter(
            sale__store=store,
            sale__status__in=paid_statuses,
            sale__created_at__date__gte=date_from,
            sale__created_at__date__lte=date_to,
        )
        .values("product_id")
        .annotate(
            quantity_sold=Coalesce(Sum("quantity"), Value(0)),
            revenue=Coalesce(Sum("line_total"), Value(Decimal("0.00"))),
        )
        .order_by("-revenue")
    )

    total_revenue = sum((_safe_decimal(r["revenue"]) for r in rows), Decimal("0.00"))
    cumulative = Decimal("0.0000")
    to_create = []

    for row in rows:
        revenue = _safe_decimal(row["revenue"])
        share = (revenue / total_revenue) if total_revenue > 0 else Decimal("0.0000")
        cumulative += share

        if cumulative <= Decimal("0.80"):
            abc_class = ABCAnalysis.ABCClass.A
        elif cumulative <= Decimal("0.95"):
            abc_class = ABCAnalysis.ABCClass.B
        else:
            abc_class = ABCAnalysis.ABCClass.C

        to_create.append(
            ABCAnalysis(
                store=store,
                product_id=row["product_id"],
                period_start=date_from,
                period_end=date_to,
                quantity_sold=_safe_decimal(row["quantity_sold"]),
                revenue=revenue.quantize(Decimal("0.01")),
                revenue_share=share.quantize(Decimal("0.0001")),
                cumulative_share=cumulative.quantize(Decimal("0.0001")),
                abc_class=abc_class,
            )
        )

    ABCAnalysis.objects.filter(
        store=store,
        period_start=date_from,
        period_end=date_to,
    ).delete()

    if to_create:
        ABCAnalysis.objects.bulk_create(to_create, batch_size=500)

    logger.info(
        "ABC analysis computed for store %s (%s -> %s): %d rows",
        store,
        date_from,
        date_to,
        len(to_create),
    )
    return len(to_create)


@transaction.atomic
def compute_dynamic_reorder(store, as_of: date, lookback_days: int = 30) -> int:
    """Compute dynamic reorder recommendations from real sales velocity."""
    if not _feature_enabled(store, "dynamic_reorder"):
        logger.info("Dynamic reorder skipped for store %s: feature disabled.", store)
        return 0
    from sales.models import Sale, SaleItem
    from stock.models import ProductStock

    start_date = as_of - timedelta(days=lookback_days - 1)
    paid_statuses = [Sale.Status.PAID, Sale.Status.PARTIALLY_PAID]

    sales_map = {
        row["product_id"]: _safe_decimal(row["qty"])
        for row in (
            SaleItem.objects.filter(
                sale__store=store,
                sale__status__in=paid_statuses,
                sale__created_at__date__gte=start_date,
                sale__created_at__date__lte=as_of,
            )
            .values("product_id")
            .annotate(qty=Coalesce(Sum("quantity"), Value(0)))
        )
    }

    lead_time_days = int(getattr(settings, "DYNAMIC_REORDER_LEAD_DAYS", 7))
    safety_days = int(getattr(settings, "DYNAMIC_REORDER_SAFETY_DAYS", 3))
    coverage_multiplier = _safe_decimal(getattr(settings, "DYNAMIC_REORDER_TARGET_MULTIPLIER", "1.10"), default="1.10")

    to_create = []
    for stock in ProductStock.objects.filter(store=store).select_related("product"):
        sold_qty = sales_map.get(stock.product_id, Decimal("0.00"))
        avg_daily_sales = sold_qty / Decimal(str(lookback_days))
        reorder_point = avg_daily_sales * Decimal(str(lead_time_days + safety_days))
        current_available = _safe_decimal(stock.available_qty)
        target_stock = reorder_point * coverage_multiplier
        suggested_order_qty = max(target_stock - current_available, Decimal("0.00"))

        if avg_daily_sales > 0:
            days_of_cover = current_available / avg_daily_sales
        else:
            days_of_cover = Decimal("999.00")

        if current_available <= 0 or days_of_cover < Decimal(str(max(1, lead_time_days // 2))):
            urgency = ReorderRecommendation.Urgency.HIGH
        elif current_available <= reorder_point:
            urgency = ReorderRecommendation.Urgency.MEDIUM
        else:
            urgency = ReorderRecommendation.Urgency.LOW

        to_create.append(
            ReorderRecommendation(
                store=store,
                product=stock.product,
                computed_for=as_of,
                avg_daily_sales=avg_daily_sales.quantize(Decimal("0.0001")),
                lead_time_days=lead_time_days,
                safety_days=safety_days,
                reorder_point=reorder_point.quantize(Decimal("0.01")),
                current_available=current_available.quantize(Decimal("0.01")),
                suggested_order_qty=suggested_order_qty.quantize(Decimal("0.01")),
                days_of_cover=days_of_cover.quantize(Decimal("0.01")),
                urgency=urgency,
            )
        )

    ReorderRecommendation.objects.filter(store=store, computed_for=as_of).delete()
    if to_create:
        ReorderRecommendation.objects.bulk_create(to_create, batch_size=500)

    logger.info(
        "Dynamic reorder computed for store %s @ %s: %d rows",
        store,
        as_of,
        len(to_create),
    )
    return len(to_create)


@transaction.atomic
def compute_credit_scores(store, as_of: date) -> int:
    """Compute customer credit scoring snapshots."""
    if not _feature_enabled(store, "credit_scoring"):
        logger.info("Credit scoring skipped for store %s: feature disabled.", store)
        return 0
    from credits.models import CustomerAccount, PaymentSchedule

    schedule_rows = (
        PaymentSchedule.objects.filter(account__store=store)
        .values("account_id")
        .annotate(
            total_count=Count("id"),
            total_due=Coalesce(Sum("amount_due"), Value(Decimal("0.00"))),
            total_paid=Coalesce(Sum("amount_paid"), Value(Decimal("0.00"))),
            overdue_count=Count("id", filter=Q(due_date__lt=as_of) & ~Q(status=PaymentSchedule.Status.PAID)),
            overdue_amount=Coalesce(
                Sum(
                    F("amount_due") - F("amount_paid"),
                    filter=Q(due_date__lt=as_of) & ~Q(status=PaymentSchedule.Status.PAID),
                    output_field=DecimalField(max_digits=14, decimal_places=2),
                ),
                Value(Decimal("0.00")),
            ),
        )
    )
    schedule_map = {row["account_id"]: row for row in schedule_rows}

    to_create = []
    for account in CustomerAccount.objects.filter(store=store, is_active=True).select_related("customer"):
        sched = schedule_map.get(account.pk, None)
        total_count = int(sched["total_count"]) if sched else 0
        total_due = _safe_decimal(sched["total_due"]) if sched else Decimal("0.00")
        total_paid = _safe_decimal(sched["total_paid"]) if sched else Decimal("0.00")
        overdue_count = int(sched["overdue_count"]) if sched else 0
        overdue_amount = _safe_decimal(sched["overdue_amount"]) if sched else Decimal("0.00")

        credit_limit = _safe_decimal(account.credit_limit)
        balance = _safe_decimal(account.balance)

        utilization = (balance / credit_limit) if credit_limit > 0 else (Decimal("1.0") if balance > 0 else Decimal("0.0"))
        payment_ratio = (total_paid / total_due) if total_due > 0 else Decimal("1.0")
        overdue_ratio = (Decimal(str(overdue_count)) / Decimal(str(total_count))) if total_count > 0 else Decimal("0.0")

        score = Decimal("100.0")
        score -= min(utilization, Decimal("2.0")) * Decimal("35.0")
        score -= (Decimal("1.0") - min(payment_ratio, Decimal("1.0"))) * Decimal("30.0")
        score -= min(overdue_ratio, Decimal("1.0")) * Decimal("25.0")
        if overdue_amount > 0:
            score -= Decimal("10.0")
        if credit_limit > 0 and balance > credit_limit:
            score -= Decimal("15.0")

        score_int = int(max(0, min(100, round(score))))
        grade = _grade_from_score(score_int)

        if grade in (CustomerCreditScore.Grade.A, CustomerCreditScore.Grade.B):
            recommended_limit = max(credit_limit, (balance * Decimal("1.20")).quantize(Decimal("0.01")))
        elif grade in (CustomerCreditScore.Grade.D, CustomerCreditScore.Grade.E):
            recommended_limit = max(balance, (credit_limit * Decimal("0.70")).quantize(Decimal("0.01")))
        else:
            recommended_limit = credit_limit

        to_create.append(
            CustomerCreditScore(
                store=store,
                account=account,
                customer=account.customer,
                computed_for=as_of,
                score=score_int,
                grade=grade,
                utilization_rate=utilization.quantize(Decimal("0.0001")),
                payment_ratio=payment_ratio.quantize(Decimal("0.0001")),
                overdue_ratio=overdue_ratio.quantize(Decimal("0.0001")),
                overdue_amount=overdue_amount.quantize(Decimal("0.01")),
                balance=balance.quantize(Decimal("0.01")),
                recommended_limit=recommended_limit.quantize(Decimal("0.01")),
            )
        )

    CustomerCreditScore.objects.filter(store=store, computed_for=as_of).delete()
    if to_create:
        CustomerCreditScore.objects.bulk_create(to_create, batch_size=500)

    logger.info(
        "Credit scores computed for store %s @ %s: %d rows",
        store,
        as_of,
        len(to_create),
    )
    return len(to_create)


@transaction.atomic
def compute_sales_forecast(store, as_of: date, lookback_days: int = 60, horizon_days: int = 14) -> int:
    """Compute simple product-level forecasts using moving averages."""
    if not _feature_enabled(store, "sales_forecast"):
        logger.info("Sales forecast skipped for store %s: feature disabled.", store)
        return 0
    from sales.models import Sale, SaleItem
    from stock.models import ProductStock

    start_date = as_of - timedelta(days=lookback_days - 1)
    paid_statuses = [Sale.Status.PAID, Sale.Status.PARTIALLY_PAID]

    daily_rows = (
        SaleItem.objects.filter(
            sale__store=store,
            sale__status__in=paid_statuses,
            sale__created_at__date__gte=start_date,
            sale__created_at__date__lte=as_of,
        )
        .annotate(sale_day=TruncDate("sale__created_at"))
        .values("product_id", "sale_day")
        .annotate(qty=Coalesce(Sum("quantity"), Value(0)))
    )

    product_daily = {}
    for row in daily_rows:
        pmap = product_daily.setdefault(row["product_id"], {})
        pmap[row["sale_day"]] = _safe_decimal(row["qty"])

    stock_product_ids = list(ProductStock.objects.filter(store=store).values_list("product_id", flat=True))
    product_ids = set(stock_product_ids) | set(product_daily.keys())

    forecast_dates = [as_of + timedelta(days=i) for i in range(1, horizon_days + 1)]
    SalesForecast.objects.filter(
        store=store,
        method=SalesForecast.Method.MOVING_AVG,
        forecast_date__in=forecast_dates,
    ).delete()

    to_create = []
    day_list = [start_date + timedelta(days=i) for i in range(lookback_days)]
    for product_id in product_ids:
        day_qty = [product_daily.get(product_id, {}).get(d, Decimal("0.00")) for d in day_list]
        ma7 = sum(day_qty[-7:]) / Decimal("7")
        ma30 = sum(day_qty[-30:]) / Decimal("30")
        non_zero_days = sum(1 for q in day_qty if q > 0)
        confidence = min(Decimal("1.0000"), (Decimal(str(non_zero_days)) / Decimal(str(lookback_days))) + Decimal("0.20"))
        base_prediction = max(ma7, ma30 * Decimal("0.80"))

        for fd in forecast_dates:
            to_create.append(
                SalesForecast(
                    store=store,
                    product_id=product_id,
                    forecast_date=fd,
                    method=SalesForecast.Method.MOVING_AVG,
                    predicted_qty=base_prediction.quantize(Decimal("0.01")),
                    ma_7d=ma7.quantize(Decimal("0.0001")),
                    ma_30d=ma30.quantize(Decimal("0.0001")),
                    confidence=confidence.quantize(Decimal("0.0001")),
                )
            )

    if to_create:
        SalesForecast.objects.bulk_create(to_create, batch_size=1000)

    logger.info(
        "Sales forecast computed for store %s @ %s horizon=%d: %d rows",
        store,
        as_of,
        horizon_days,
        len(to_create),
    )
    return len(to_create)


def _create_fraud_event(
    *,
    store,
    detected_on: date,
    rule_code: str,
    severity: str,
    risk_score: int,
    title: str,
    description: str,
    sale=None,
    payment=None,
    payload=None,
) -> bool:
    exists = FraudEvent.objects.filter(
        store=store,
        detected_on=detected_on,
        rule_code=rule_code,
        sale=sale,
        payment=payment,
    ).exists()
    if exists:
        return False

    FraudEvent.objects.create(
        store=store,
        sale=sale,
        payment=payment,
        detected_on=detected_on,
        rule_code=rule_code,
        severity=severity,
        risk_score=max(0, min(100, int(risk_score))),
        title=title,
        description=description,
        payload=payload or {},
    )
    return True


@transaction.atomic
def detect_fraud_signals(store, date_from: date, date_to: date) -> int:
    """Detect fraud-like events using deterministic rules and stats."""
    if not _feature_enabled(store, "fraud_detection"):
        logger.info("Fraud detection skipped for store %s: feature disabled.", store)
        return 0
    from cashier.models import Payment
    from sales.models import Refund, Sale

    created = 0
    paid_statuses = [Sale.Status.PAID, Sale.Status.PARTIALLY_PAID]
    manager_threshold = Decimal(str(getattr(settings, "MAX_DISCOUNT_PERCENT_MANAGER", 50)))

    suspicious_discount_sales = Sale.objects.filter(
        store=store,
        status__in=paid_statuses,
        created_at__date__gte=date_from,
        created_at__date__lte=date_to,
        discount_percent__gt=manager_threshold,
    )
    for sale in suspicious_discount_sales:
        created += int(
            _create_fraud_event(
                store=store,
                detected_on=sale.created_at.date(),
                rule_code="HIGH_DISCOUNT_THRESHOLD",
                severity=FraudEvent.Severity.CRITICAL,
                risk_score=90,
                title=f"Remise elevee {sale.discount_percent}%",
                description=f"Vente {sale.invoice_number or sale.pk} depasse le seuil manager.",
                sale=sale,
                payload={
                    "discount_percent": str(sale.discount_percent),
                    "threshold": str(manager_threshold),
                    "total": str(sale.total),
                },
            )
        )

    baseline_start = date_from - timedelta(days=30)
    baseline_values = list(
        Sale.objects.filter(
            store=store,
            status__in=paid_statuses,
            created_at__date__gte=baseline_start,
            created_at__date__lt=date_from,
        ).values_list("total", flat=True)
    )
    if len(baseline_values) >= 10:
        baseline_series = [float(v) for v in baseline_values]
        base_mean = mean(baseline_series)
        base_std = pstdev(baseline_series)
        if base_std > 0:
            high_total_threshold = Decimal(str(base_mean + (3 * base_std)))
            outlier_sales = Sale.objects.filter(
                store=store,
                status__in=paid_statuses,
                created_at__date__gte=date_from,
                created_at__date__lte=date_to,
                total__gt=high_total_threshold,
            )
            for sale in outlier_sales:
                created += int(
                    _create_fraud_event(
                        store=store,
                        detected_on=sale.created_at.date(),
                        rule_code="SALE_AMOUNT_OUTLIER",
                        severity=FraudEvent.Severity.WARNING,
                        risk_score=75,
                        title="Montant de vente atypique",
                        description=f"Vente {sale.invoice_number or sale.pk} au-dessus du seuil statistique.",
                        sale=sale,
                        payload={
                            "sale_total": str(sale.total),
                            "threshold": str(high_total_threshold.quantize(Decimal("0.01"))),
                        },
                    )
                )

    split_rows = (
        Payment.objects.filter(
            store=store,
            created_at__date__gte=date_from,
            created_at__date__lte=date_to,
        )
        .values("sale_id")
        .annotate(lines=Count("id"), total=Coalesce(Sum("amount"), Value(Decimal("0.00"))))
        .filter(lines__gte=3)
    )
    split_map = {row["sale_id"]: row for row in split_rows}
    if split_map:
        sales = Sale.objects.filter(pk__in=list(split_map.keys()))
        for sale in sales:
            row = split_map.get(sale.pk)
            if not row:
                continue
            if _safe_decimal(row["total"]) >= _safe_decimal(sale.total):
                created += int(
                    _create_fraud_event(
                        store=store,
                        detected_on=sale.created_at.date(),
                        rule_code="SPLIT_PAYMENT_PATTERN",
                        severity=FraudEvent.Severity.WARNING,
                        risk_score=65,
                        title="Pattern de paiement fragmente",
                        description=f"{row['lines']} paiements pour une meme vente.",
                        sale=sale,
                        payload={"lines": row["lines"], "paid_total": str(row["total"]), "sale_total": str(sale.total)},
                    )
                )

    refunds = Refund.objects.filter(
        store=store,
        created_at__date__gte=date_from,
        created_at__date__lte=date_to,
    ).select_related("sale")
    for refund in refunds:
        sale = refund.sale
        if not sale:
            continue
        if sale.total > 0 and refund.amount >= (sale.total * Decimal("0.70")):
            age_hours = (refund.created_at - sale.created_at).total_seconds() / 3600
            if age_hours <= 24:
                created += int(
                    _create_fraud_event(
                        store=store,
                        detected_on=refund.created_at.date(),
                        rule_code="QUICK_HIGH_REFUND",
                        severity=FraudEvent.Severity.CRITICAL,
                        risk_score=92,
                        title="Remboursement rapide eleve",
                        description=f"Remboursement {refund.amount} dans les 24h de la vente.",
                        sale=sale,
                        payload={
                            "refund_amount": str(refund.amount),
                            "sale_total": str(sale.total),
                            "hours_since_sale": round(age_hours, 2),
                        },
                    )
                )

    logger.info(
        "Fraud signals computed for store %s (%s -> %s): %d new events",
        store,
        date_from,
        date_to,
        created,
    )
    return created


def build_strategic_dashboard(store, date_from: date, date_to: date) -> dict:
    """Build advanced KPI payload for the executive dashboard."""
    from reports.services import get_sales_report
    from sales.models import Sale
    from stock.models import ProductStock

    feature_flags = (
        store.effective_analytics_feature_flags
        if hasattr(store, "effective_analytics_feature_flags")
        else {}
    )
    module_enabled = bool(feature_flags.get("enabled", True))
    dashboard_enabled = bool(feature_flags.get("dashboard_strategic", True))

    if not (module_enabled and dashboard_enabled):
        return {
            "feature_flags": feature_flags,
            "date_from": date_from,
            "date_to": date_to,
            "revenue": Decimal("0.00"),
            "revenue_growth_pct": Decimal("0.00"),
            "orders": 0,
            "avg_basket": Decimal("0.00"),
            "net_sales": Decimal("0.00"),
            "stockout_count": 0,
            "active_sales_count": 0,
            "forecast_next_7d_qty": Decimal("0.00"),
            "abc_distribution": {},
            "reorder": {"total": 0, "high": 0, "medium": 0},
            "credit": {"scored_accounts": 0, "average_score": 0, "grade_breakdown": {}},
            "fraud": {"events": 0, "critical": 0, "unresolved": 0},
        }

    sales_report = get_sales_report(store, date_from, date_to)

    span_days = max(1, (date_to - date_from).days + 1)
    prev_end = date_from - timedelta(days=1)
    prev_start = prev_end - timedelta(days=span_days - 1)
    prev_sales = get_sales_report(store, prev_start, prev_end)

    current_revenue = _safe_decimal(sales_report.get("total_ca"))
    prev_revenue = _safe_decimal(prev_sales.get("total_ca"))
    if prev_revenue > 0:
        revenue_growth_pct = ((current_revenue - prev_revenue) / prev_revenue) * Decimal("100")
    else:
        revenue_growth_pct = Decimal("0.00")

    abc_rows = []
    if _feature_enabled(store, "abc_analysis"):
        abc_rows = list(
            ABCAnalysis.objects.filter(
                store=store,
                period_start=date_from,
                period_end=date_to,
            )
            .values("abc_class")
            .annotate(revenue=Coalesce(Sum("revenue"), Value(Decimal("0.00"))), products=Count("id"))
            .order_by("abc_class")
        )
    abc_distribution = {
        row["abc_class"]: {
            "revenue": _safe_decimal(row["revenue"]),
            "products": row["products"],
        }
        for row in abc_rows
    }

    today = date.today()
    reorder_rows = ReorderRecommendation.objects.none()
    if _feature_enabled(store, "dynamic_reorder"):
        reorder_rows = ReorderRecommendation.objects.filter(store=store, computed_for=today)

    credit_rows = CustomerCreditScore.objects.none()
    if _feature_enabled(store, "credit_scoring"):
        credit_rows = CustomerCreditScore.objects.filter(store=store, computed_for=today)

    fraud_rows = FraudEvent.objects.none()
    if _feature_enabled(store, "fraud_detection"):
        fraud_rows = FraudEvent.objects.filter(store=store, detected_on__gte=date_from, detected_on__lte=date_to)

    forecast_next_7d_qty = Decimal("0.00")
    if _feature_enabled(store, "sales_forecast"):
        forecast_rows = SalesForecast.objects.filter(
            store=store,
            forecast_date__gt=today,
            forecast_date__lte=today + timedelta(days=7),
        )
        forecast_next_7d_qty = forecast_rows.aggregate(total=Coalesce(Sum("predicted_qty"), Value(Decimal("0.00"))))["total"]

    paid_statuses = [Sale.Status.PAID, Sale.Status.PARTIALLY_PAID]
    stock_out_count = ProductStock.objects.filter(store=store, quantity__lte=0).count()
    active_sales = Sale.objects.filter(
        store=store,
        status__in=paid_statuses,
        created_at__date__gte=date_from,
        created_at__date__lte=date_to,
    ).count()

    credit_grade_breakdown = {
        row["grade"]: row["count"]
        for row in (
            credit_rows.values("grade").annotate(count=Count("id"))
        )
    }

    return {
        "feature_flags": feature_flags,
        "date_from": date_from,
        "date_to": date_to,
        "revenue": current_revenue.quantize(Decimal("0.01")),
        "revenue_growth_pct": revenue_growth_pct.quantize(Decimal("0.01")),
        "orders": sales_report.get("nb_ventes", 0),
        "avg_basket": _safe_decimal(sales_report.get("avg_basket")).quantize(Decimal("0.01")),
        "net_sales": _safe_decimal(sales_report.get("net_ca")).quantize(Decimal("0.01")),
        "stockout_count": stock_out_count,
        "active_sales_count": active_sales,
        "forecast_next_7d_qty": _safe_decimal(forecast_next_7d_qty).quantize(Decimal("0.01")),
        "abc_distribution": abc_distribution,
        "reorder": {
            "total": reorder_rows.count(),
            "high": reorder_rows.filter(urgency=ReorderRecommendation.Urgency.HIGH).count(),
            "medium": reorder_rows.filter(urgency=ReorderRecommendation.Urgency.MEDIUM).count(),
        },
        "credit": {
            "scored_accounts": credit_rows.count(),
            "average_score": int(
                round(
                    credit_rows.aggregate(avg=Coalesce(Sum("score"), Value(0)))["avg"] / max(credit_rows.count(), 1)
                )
            )
            if credit_rows.exists()
            else 0,
            "grade_breakdown": credit_grade_breakdown,
        },
        "fraud": {
            "events": fraud_rows.count(),
            "critical": fraud_rows.filter(severity=FraudEvent.Severity.CRITICAL).count(),
            "unresolved": fraud_rows.filter(is_resolved=False).count(),
        },
    }
