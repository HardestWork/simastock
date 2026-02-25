"""Customer Intelligence services (MVP).

This module provides store-scoped, explainable analytics for:
- Top clients of the month
- Customer score (0..100)
- Dormant customers
"""
from __future__ import annotations

from collections import defaultdict
from calendar import monthrange
from datetime import date, timedelta
from decimal import Decimal
from statistics import pstdev

from django.db import transaction
from django.db.models import (
    Count,
    DecimalField,
    ExpressionWrapper,
    F,
    Max,
    Q,
    Sum,
    Value,
)
from django.db.models.functions import Coalesce, TruncWeek
from django.utils import timezone

from analytics.models import (
    CustomerAnalyticsRuleSet,
    CustomerIntelligenceAlert,
    CustomerMetricMonthly,
    CustomerRecommendationCache,
    CustomerScoreSnapshot,
    CustomerSegmentSnapshot,
    CustomerTopMonthly,
)
from cashier.models import Payment
from catalog.models import Product
from credits.models import CustomerAccount, PaymentSchedule
from customers.models import Customer
from sales.models import Refund, Sale, SaleItem

DEFAULT_WEIGHTS = {
    "recency": Decimal("0.25"),
    "frequency": Decimal("0.20"),
    "monetary": Decimal("0.25"),
    "credit": Decimal("0.20"),
    "discount_behavior": Decimal("0.10"),
}

DEFAULT_TOP_WEIGHTS = {
    "encashment": Decimal("0.45"),
    "frequency": Decimal("0.20"),
    "regularity": Decimal("0.15"),
    "credit_discipline": Decimal("0.15"),
    "strategic_bonus": Decimal("0.05"),
}

DEFAULT_THRESHOLDS = {
    "recency_max_days": 90,
    "freq_target_90d": 8,
    "monetary_target_90d": "1500000",
    "discount_ratio_bad": "0.20",
    "dormant_days": 45,
    "vip_score": 80,
    "regular_score": 60,
    "occasional_score": 40,
}


def _d(value, default: str = "0.00") -> Decimal:
    if value is None:
        return Decimal(default)
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def _clamp(v: Decimal, vmin: Decimal = Decimal("0"), vmax: Decimal = Decimal("100")) -> Decimal:
    return max(vmin, min(vmax, v))


def month_bounds(period_month: date) -> tuple[date, date]:
    start = period_month.replace(day=1)
    last_day = monthrange(start.year, start.month)[1]
    end = start.replace(day=last_day)
    return start, end


@transaction.atomic
def get_or_create_active_ruleset(store, actor=None, as_of: date | None = None) -> CustomerAnalyticsRuleSet:
    today = as_of or timezone.localdate()
    active = (
        CustomerAnalyticsRuleSet.objects
        .filter(
            store=store,
            status=CustomerAnalyticsRuleSet.Status.ACTIVE,
            effective_from__lte=today,
        )
        .filter(Q(effective_to__isnull=True) | Q(effective_to__gte=today))
        .order_by("-version")
        .first()
    )
    if active:
        return active

    latest_version = (
        CustomerAnalyticsRuleSet.objects
        .filter(store=store)
        .aggregate(m=Max("version"))
        .get("m")
        or 0
    )
    CustomerAnalyticsRuleSet.objects.filter(
        store=store,
        status=CustomerAnalyticsRuleSet.Status.ACTIVE,
    ).update(status=CustomerAnalyticsRuleSet.Status.ARCHIVED)

    return CustomerAnalyticsRuleSet.objects.create(
        store=store,
        version=latest_version + 1,
        status=CustomerAnalyticsRuleSet.Status.ACTIVE,
        effective_from=today,
        weights={
            "score": {k: str(v) for k, v in DEFAULT_WEIGHTS.items()},
            "top": {k: str(v) for k, v in DEFAULT_TOP_WEIGHTS.items()},
        },
        thresholds=DEFAULT_THRESHOLDS,
        margin_proxy={},
        dormant_days=DEFAULT_THRESHOLDS["dormant_days"],
        created_by=actor,
        notes="Regles MVP auto-creees.",
    )


def _weights(ruleset: CustomerAnalyticsRuleSet) -> dict:
    data = ruleset.weights if isinstance(ruleset.weights, dict) else {}
    score_data = data.get("score") if isinstance(data.get("score"), dict) else {}
    top_data = data.get("top") if isinstance(data.get("top"), dict) else {}
    return {
        "score": {
            "recency": _d(score_data.get("recency"), "0.25"),
            "frequency": _d(score_data.get("frequency"), "0.20"),
            "monetary": _d(score_data.get("monetary"), "0.25"),
            "credit": _d(score_data.get("credit"), "0.20"),
            "discount_behavior": _d(score_data.get("discount_behavior"), "0.10"),
        },
        "top": {
            "encashment": _d(top_data.get("encashment"), "0.45"),
            "frequency": _d(top_data.get("frequency"), "0.20"),
            "regularity": _d(top_data.get("regularity"), "0.15"),
            "credit_discipline": _d(top_data.get("credit_discipline"), "0.15"),
            "strategic_bonus": _d(top_data.get("strategic_bonus"), "0.05"),
        },
    }


def _thresholds(ruleset: CustomerAnalyticsRuleSet) -> dict:
    t = ruleset.thresholds if isinstance(ruleset.thresholds, dict) else {}
    return {
        "recency_max_days": int(t.get("recency_max_days", 90)),
        "freq_target_90d": int(t.get("freq_target_90d", 8)),
        "monetary_target_90d": _d(t.get("monetary_target_90d", "1500000"), "1500000"),
        "discount_ratio_bad": _d(t.get("discount_ratio_bad", "0.20"), "0.20"),
        "dormant_days": int(t.get("dormant_days", ruleset.dormant_days or 45)),
        "vip_score": int(t.get("vip_score", 80)),
        "regular_score": int(t.get("regular_score", 60)),
        "occasional_score": int(t.get("occasional_score", 40)),
    }


def _strategic_field_exists() -> bool:
    return any(field.name == "is_strategic" for field in Product._meta.get_fields())


def _credit_discipline_for_customer(store, customer_id, end_date: date) -> dict:
    sched = (
        PaymentSchedule.objects
        .filter(account__store=store, account__customer_id=customer_id, due_date__lte=end_date)
        .aggregate(
            total_due=Coalesce(Sum("amount_due"), Value(Decimal("0.00"))),
            total_paid=Coalesce(Sum("amount_paid"), Value(Decimal("0.00"))),
            overdue_count=Count(
                "id",
                filter=Q(due_date__lt=end_date) & ~Q(status=PaymentSchedule.Status.PAID),
            ),
            overdue_amount=Coalesce(
                Sum(
                    F("amount_due") - F("amount_paid"),
                    filter=Q(due_date__lt=end_date) & ~Q(status=PaymentSchedule.Status.PAID),
                    output_field=DecimalField(max_digits=18, decimal_places=2),
                ),
                Value(Decimal("0.00")),
            ),
        )
    )
    total_due = _d(sched["total_due"])
    total_paid = _d(sched["total_paid"])
    recovery_ratio = (total_paid / total_due) if total_due > 0 else Decimal("1.0")
    overdue_amount = _d(sched["overdue_amount"])
    overdue_count = int(sched["overdue_count"] or 0)
    return {
        "total_due": total_due,
        "total_paid": total_paid,
        "recovery_ratio": recovery_ratio,
        "overdue_amount": overdue_amount,
        "overdue_count": overdue_count,
    }


def _badge_from_score(score_pct: Decimal) -> str:
    if score_pct >= Decimal("80"):
        return CustomerTopMonthly.Badge.GOLD
    if score_pct >= Decimal("60"):
        return CustomerTopMonthly.Badge.SILVER
    return CustomerTopMonthly.Badge.BRONZE


def _segment_from_score(score_total: int, recency_days: int, credit_score: int, thresholds: dict) -> str:
    if recency_days >= thresholds["dormant_days"]:
        return CustomerScoreSnapshot.Segment.DORMANT
    if score_total >= thresholds["vip_score"] and credit_score >= 60:
        return CustomerScoreSnapshot.Segment.VIP
    if score_total >= thresholds["regular_score"]:
        return CustomerScoreSnapshot.Segment.REGULAR
    if score_total >= thresholds["occasional_score"]:
        return CustomerScoreSnapshot.Segment.OCCASIONAL
    return CustomerScoreSnapshot.Segment.RISK


def _upsert_open_alert(*, store, customer, alert_type: str, severity: str, context: dict, assigned_seller=None) -> None:
    """Keep at most one OPEN alert per customer/type and refresh its payload."""
    base_qs = CustomerIntelligenceAlert.objects.filter(
        store=store,
        customer=customer,
        alert_type=alert_type,
    ).order_by("-triggered_at", "-created_at")

    open_alert = base_qs.filter(status=CustomerIntelligenceAlert.Status.OPEN).first()
    if open_alert:
        open_alert.severity = severity
        open_alert.triggered_at = timezone.now()
        open_alert.context = context
        if assigned_seller:
            open_alert.assigned_seller = assigned_seller
        open_alert.save(update_fields=["severity", "triggered_at", "context", "assigned_seller", "updated_at"])
        base_qs.filter(status=CustomerIntelligenceAlert.Status.OPEN).exclude(pk=open_alert.pk).update(
            status=CustomerIntelligenceAlert.Status.CLOSED,
            updated_at=timezone.now(),
        )
        return

    CustomerIntelligenceAlert.objects.create(
        store=store,
        customer=customer,
        alert_type=alert_type,
        severity=severity,
        status=CustomerIntelligenceAlert.Status.OPEN,
        triggered_at=timezone.now(),
        context=context,
        assigned_seller=assigned_seller,
    )


def _close_open_alert(*, store, customer, alert_type: str) -> None:
    CustomerIntelligenceAlert.objects.filter(
        store=store,
        customer=customer,
        alert_type=alert_type,
        status=CustomerIntelligenceAlert.Status.OPEN,
    ).update(status=CustomerIntelligenceAlert.Status.CLOSED, updated_at=timezone.now())


def refresh_top_clients_month(
    *,
    store,
    period_month: date,
    limit: int = 10,
    actor=None,
) -> list[dict]:
    """Compute and persist monthly top customers for one store."""
    ruleset = get_or_create_active_ruleset(store, actor=actor, as_of=period_month)
    weights = _weights(ruleset)["top"]
    start_date, end_date = month_bounds(period_month)

    payments_rows = list(
        Payment.objects
        .filter(
            store=store,
            sale__customer_id__isnull=False,
            created_at__date__gte=start_date,
            created_at__date__lte=end_date,
        )
        .values("sale__customer_id")
        .annotate(
            paid_amount=Coalesce(Sum("amount"), Value(Decimal("0.00"))),
            paid_orders=Count("sale_id", distinct=True),
            last_payment_at=Max("created_at"),
        )
    )
    if not payments_rows:
        CustomerTopMonthly.objects.filter(store=store, period_month=start_date).delete()
        return []

    weekly_rows = list(
        Payment.objects
        .filter(
            store=store,
            sale__customer_id__isnull=False,
            created_at__date__gte=start_date,
            created_at__date__lte=end_date,
        )
        .annotate(week=TruncWeek("created_at"))
        .values("sale__customer_id")
        .annotate(active_weeks=Count("week", distinct=True))
    )
    weekly_map = {str(r["sale__customer_id"]): int(r["active_weeks"] or 0) for r in weekly_rows}

    customer_ids = [r["sale__customer_id"] for r in payments_rows if r["sale__customer_id"]]

    refund_map = {
        str(r["sale__customer_id"]): _d(r["amount"])
        for r in Refund.objects.filter(
            store=store,
            sale__customer_id__in=customer_ids,
            created_at__date__gte=start_date,
            created_at__date__lte=end_date,
        )
        .values("sale__customer_id")
        .annotate(amount=Coalesce(Sum("amount"), Value(Decimal("0.00"))))
    }
    discount_map = {
        str(r["customer_id"]): _d(r["amount"])
        for r in Sale.objects.filter(
            store=store,
            customer_id__in=customer_ids,
            status__in=[Sale.Status.PAID, Sale.Status.PARTIALLY_PAID, Sale.Status.REFUNDED],
            created_at__date__gte=start_date,
            created_at__date__lte=end_date,
        )
        .values("customer_id")
        .annotate(amount=Coalesce(Sum("discount_amount"), Value(Decimal("0.00"))))
    }

    margin_expr = ExpressionWrapper(
        F("line_total") - (F("cost_price") * F("quantity")),
        output_field=DecimalField(max_digits=18, decimal_places=2),
    )
    profit_map = {
        str(r["sale__customer_id"]): _d(r["amount"])
        for r in SaleItem.objects.filter(
            sale__store=store,
            sale__customer_id__in=customer_ids,
            sale__status__in=[Sale.Status.PAID, Sale.Status.PARTIALLY_PAID, Sale.Status.REFUNDED],
            sale__created_at__date__gte=start_date,
            sale__created_at__date__lte=end_date,
        )
        .values("sale__customer_id")
        .annotate(amount=Coalesce(Sum(margin_expr), Value(Decimal("0.00"))))
    }

    strategic_map = {}
    if _strategic_field_exists():
        strategic_map = {
            str(r["sale__customer_id"]): _d(r["amount"])
            for r in SaleItem.objects.filter(
                sale__store=store,
                sale__customer_id__in=customer_ids,
                sale__status__in=[Sale.Status.PAID, Sale.Status.PARTIALLY_PAID, Sale.Status.REFUNDED],
                sale__created_at__date__gte=start_date,
                sale__created_at__date__lte=end_date,
                product__is_strategic=True,
            )
            .values("sale__customer_id")
            .annotate(amount=Coalesce(Sum("line_total"), Value(Decimal("0.00"))))
        }

    customer_map = {
        str(c.id): c
        for c in Customer.objects.filter(id__in=customer_ids)
    }

    rows = []
    max_paid = Decimal("0.00")
    max_orders = 0
    max_weeks = 0
    max_overdue = Decimal("0.00")
    for row in payments_rows:
        customer_id = str(row["sale__customer_id"])
        credit = _credit_discipline_for_customer(store, row["sale__customer_id"], end_date)
        paid_amount_net = _d(row["paid_amount"]) - _d(refund_map.get(customer_id))
        paid_orders = int(row["paid_orders"] or 0)
        active_weeks = int(weekly_map.get(customer_id, 0))

        max_paid = max(max_paid, paid_amount_net)
        max_orders = max(max_orders, paid_orders)
        max_weeks = max(max_weeks, active_weeks)
        max_overdue = max(max_overdue, credit["overdue_amount"])

        rows.append(
            {
                "customer_id": customer_id,
                "customer": customer_map.get(customer_id),
                "paid_amount_net": paid_amount_net,
                "paid_orders": paid_orders,
                "active_weeks": active_weeks,
                "last_payment_at": row["last_payment_at"],
                "credit": credit,
                "refund_amount": _d(refund_map.get(customer_id)),
                "discount_amount": _d(discount_map.get(customer_id)),
                "profit_estimated": _d(profit_map.get(customer_id)),
                "strategic_amount": _d(strategic_map.get(customer_id)),
            }
        )

    for row in rows:
        encashment_norm = (row["paid_amount_net"] / max_paid) if max_paid > 0 else Decimal("0")
        frequency_norm = Decimal(str(row["paid_orders"])) / Decimal(str(max_orders or 1))
        regularity_norm = Decimal(str(row["active_weeks"])) / Decimal(str(max_weeks or 1))

        recovery_ratio = row["credit"]["recovery_ratio"]
        overdue_norm = (row["credit"]["overdue_amount"] / max_overdue) if max_overdue > 0 else Decimal("0")
        credit_discipline_norm = _clamp((Decimal("1") - overdue_norm) * Decimal("0.6") + recovery_ratio * Decimal("0.4"), Decimal("0"), Decimal("1"))

        strategic_bonus = Decimal("1") if row["strategic_amount"] > 0 else Decimal("0")

        top_norm = (
            weights["encashment"] * encashment_norm
            + weights["frequency"] * frequency_norm
            + weights["regularity"] * regularity_norm
            + weights["credit_discipline"] * credit_discipline_norm
            + weights["strategic_bonus"] * strategic_bonus
        )
        row["top_norm"] = _clamp(top_norm, Decimal("0"), Decimal("1"))
        row["top_score"] = (row["top_norm"] * Decimal("100")).quantize(Decimal("0.01"))

        CustomerMetricMonthly.objects.update_or_create(
            store=store,
            customer_id=row["customer_id"],
            period_month=start_date,
            defaults={
                "paid_amount": row["paid_amount_net"],
                "paid_orders_count": row["paid_orders"],
                "active_weeks_count": row["active_weeks"],
                "refund_amount": row["refund_amount"],
                "discount_amount": row["discount_amount"],
                "strategic_amount": row["strategic_amount"],
                "profit_estimated": row["profit_estimated"],
                "credit_overdue_amount": row["credit"]["overdue_amount"],
                "credit_overdue_count": row["credit"]["overdue_count"],
                "recovery_ratio": row["credit"]["recovery_ratio"].quantize(Decimal("0.0001")),
                "top_index": row["top_norm"].quantize(Decimal("0.0001")),
                "last_payment_at": row["last_payment_at"],
            },
        )

    rows.sort(key=lambda x: x["top_norm"], reverse=True)
    rows = rows[: max(1, int(limit))]

    CustomerTopMonthly.objects.filter(store=store, period_month=start_date).delete()
    top_objects = []
    payload = []
    for idx, row in enumerate(rows, start=1):
        c = row["customer"]
        explain = [
            f"Encaissement: {row['paid_amount_net']}",
            f"Commandes payees: {row['paid_orders']}",
            f"Semaines actives: {row['active_weeks']}",
            f"Recouvrement: {(row['credit']['recovery_ratio'] * Decimal('100')).quantize(Decimal('0.1'))}%",
        ]
        badge = _badge_from_score(row["top_score"])
        top_objects.append(
            CustomerTopMonthly(
                store=store,
                period_month=start_date,
                customer_id=row["customer_id"],
                rank=idx,
                top_score=row["top_norm"].quantize(Decimal("0.0001")),
                badge=badge,
                explain=explain,
            )
        )
        payload.append(
            {
                "rank": idx,
                "customer_id": row["customer_id"],
                "customer_name": c.full_name if c else row["customer_id"],
                "customer_phone": c.phone if c else "",
                "top_score": str(row["top_score"]),
                "badge": badge,
                "paid_amount": str(row["paid_amount_net"].quantize(Decimal("0.01"))),
                "paid_orders": row["paid_orders"],
                "active_weeks": row["active_weeks"],
                "recovery_ratio": str((row["credit"]["recovery_ratio"] * Decimal("100")).quantize(Decimal("0.01"))),
                "why": explain,
            }
        )

    if top_objects:
        CustomerTopMonthly.objects.bulk_create(top_objects)
    return payload


def compute_customer_score(*, store, customer, as_of: date | None = None, actor=None) -> dict:
    """Compute and persist customer score snapshot (rolling 90d)."""
    as_of_date = as_of or timezone.localdate()
    ruleset = get_or_create_active_ruleset(store, actor=actor, as_of=as_of_date)
    thresholds = _thresholds(ruleset)
    weights = _weights(ruleset)["score"]

    window_start = as_of_date - timedelta(days=89)

    pay_agg = (
        Payment.objects
        .filter(
            store=store,
            sale__customer=customer,
            created_at__date__gte=window_start,
            created_at__date__lte=as_of_date,
        )
        .aggregate(
            paid_amount=Coalesce(Sum("amount"), Value(Decimal("0.00"))),
            paid_orders=Count("sale_id", distinct=True),
            last_payment_at=Max("created_at"),
        )
    )
    refund_amount = (
        Refund.objects
        .filter(
            store=store,
            sale__customer=customer,
            created_at__date__gte=window_start,
            created_at__date__lte=as_of_date,
        )
        .aggregate(v=Coalesce(Sum("amount"), Value(Decimal("0.00"))))
        .get("v")
        or Decimal("0.00")
    )
    sale_agg = (
        Sale.objects
        .filter(
            store=store,
            customer=customer,
            status__in=[Sale.Status.PAID, Sale.Status.PARTIALLY_PAID, Sale.Status.REFUNDED],
            created_at__date__gte=window_start,
            created_at__date__lte=as_of_date,
        )
        .aggregate(
            gross_sales=Coalesce(Sum("total"), Value(Decimal("0.00"))),
            discount_amount=Coalesce(Sum("discount_amount"), Value(Decimal("0.00"))),
        )
    )

    monetary = _d(pay_agg["paid_amount"]) - _d(refund_amount)
    paid_orders = int(pay_agg["paid_orders"] or 0)
    last_payment_at = pay_agg["last_payment_at"]
    if last_payment_at:
        recency_days = max(0, (as_of_date - last_payment_at.date()).days)
    else:
        recency_days = thresholds["recency_max_days"] * 2

    gross_sales = _d(sale_agg["gross_sales"])
    discount_amount = _d(sale_agg["discount_amount"])
    discount_ratio = (discount_amount / gross_sales) if gross_sales > 0 else Decimal("0")

    credit = _credit_discipline_for_customer(store, customer.id, as_of_date)
    overdue_ratio = Decimal("0")
    if credit["total_due"] > 0:
        overdue_ratio = credit["overdue_amount"] / credit["total_due"]

    recency_score = _clamp(
        Decimal("100") * (Decimal("1") - (Decimal(str(recency_days)) / Decimal(str(max(1, thresholds["recency_max_days"]))))),
    )
    frequency_score = _clamp(
        Decimal("100") * (Decimal(str(paid_orders)) / Decimal(str(max(1, thresholds["freq_target_90d"])))),
    )
    monetary_score = _clamp(
        Decimal("100") * (monetary / thresholds["monetary_target_90d"]) if thresholds["monetary_target_90d"] > 0 else Decimal("0"),
    )
    credit_score = _clamp(
        Decimal("100") - (
            _clamp(overdue_ratio, Decimal("0"), Decimal("1")) * Decimal("55")
            + (Decimal("1") - _clamp(credit["recovery_ratio"], Decimal("0"), Decimal("1"))) * Decimal("45")
        ),
    )
    discount_behavior_score = _clamp(
        Decimal("100") - (
            (discount_ratio / thresholds["discount_ratio_bad"]) * Decimal("100")
            if thresholds["discount_ratio_bad"] > 0
            else Decimal("0")
        ),
    )

    weighted = (
        weights["recency"] * recency_score
        + weights["frequency"] * frequency_score
        + weights["monetary"] * monetary_score
        + weights["credit"] * credit_score
        + weights["discount_behavior"] * discount_behavior_score
    )
    score_total = int(_clamp(weighted).quantize(Decimal("1")))

    sub_scores = {
        "recency": int(recency_score.quantize(Decimal("1"))),
        "frequency": int(frequency_score.quantize(Decimal("1"))),
        "monetary": int(monetary_score.quantize(Decimal("1"))),
        "credit": int(credit_score.quantize(Decimal("1"))),
        "discount_behavior": int(discount_behavior_score.quantize(Decimal("1"))),
    }
    segment = _segment_from_score(score_total, recency_days, sub_scores["credit"], thresholds)

    contributions = [
        ("recency", (weights["recency"] * recency_score) - (weights["recency"] * Decimal("50"))),
        ("frequency", (weights["frequency"] * frequency_score) - (weights["frequency"] * Decimal("50"))),
        ("monetary", (weights["monetary"] * monetary_score) - (weights["monetary"] * Decimal("50"))),
        ("credit", (weights["credit"] * credit_score) - (weights["credit"] * Decimal("50"))),
        ("discount_behavior", (weights["discount_behavior"] * discount_behavior_score) - (weights["discount_behavior"] * Decimal("50"))),
    ]
    contributions.sort(key=lambda x: abs(x[1]), reverse=True)
    explain = [
        {
            "feature": name,
            "impact": f"{'+' if value >= 0 else ''}{value.quantize(Decimal('0.1'))}",
        }
        for name, value in contributions[:3]
    ]

    features = {
        "recency_days": recency_days,
        "paid_orders_90d": paid_orders,
        "monetary_90d": str(monetary.quantize(Decimal("0.01"))),
        "discount_ratio_90d": str(discount_ratio.quantize(Decimal("0.0001"))),
        "credit_overdue_amount": str(credit["overdue_amount"].quantize(Decimal("0.01"))),
        "credit_recovery_ratio": str(credit["recovery_ratio"].quantize(Decimal("0.0001"))),
    }

    snapshot, _ = CustomerScoreSnapshot.objects.update_or_create(
        store=store,
        customer=customer,
        as_of_date=as_of_date,
        period_type=CustomerScoreSnapshot.PeriodType.ROLLING_90D,
        ruleset=ruleset,
        defaults={
            "score_total": score_total,
            "recency_score": sub_scores["recency"],
            "frequency_score": sub_scores["frequency"],
            "monetary_score": sub_scores["monetary"],
            "credit_score": sub_scores["credit"],
            "discount_behavior_score": sub_scores["discount_behavior"],
            "segment": segment,
            "features": features,
            "explain": explain,
        },
    )

    tags = []
    if discount_ratio >= Decimal("0.20"):
        tags.append("CHASSEUR_PROMO")
    if sub_scores["credit"] < 45:
        tags.append("CREDIT_RISQUE")
    if sub_scores["monetary"] >= 70 and sub_scores["discount_behavior"] < 55:
        tags.append("GROS_VOLUME_FAIBLE_MARGE")

    strategy = []
    if segment == CustomerScoreSnapshot.Segment.VIP:
        strategy.append("Prioriser suivi proactif et offre premium.")
    if segment == CustomerScoreSnapshot.Segment.DORMANT:
        strategy.append("Relance immediate avec proposition ciblee.")
    if "CREDIT_RISQUE" in tags:
        strategy.append("Demander acompte avant nouvelle vente a credit.")

    CustomerSegmentSnapshot.objects.update_or_create(
        store=store,
        customer=customer,
        as_of_date=as_of_date,
        ruleset=ruleset,
        defaults={
            "segment": segment,
            "tags": tags,
            "strategy": strategy,
        },
    )

    return {
        "customer_id": str(customer.id),
        "customer_name": customer.full_name,
        "store_id": str(store.id),
        "as_of": str(as_of_date),
        "ruleset_version": ruleset.version,
        "score_total": snapshot.score_total,
        "subscores": sub_scores,
        "segment": segment,
        "features": features,
        "explain": explain,
    }


def list_dormant_customers(
    *,
    store,
    as_of: date | None = None,
    days: int | None = None,
    actor=None,
) -> list[dict]:
    """List dormant customers sorted by priority score."""
    as_of_date = as_of or timezone.localdate()
    ruleset = get_or_create_active_ruleset(store, actor=actor, as_of=as_of_date)
    dormant_days = int(days or _thresholds(ruleset)["dormant_days"])
    cutoff = as_of_date - timedelta(days=dormant_days)

    customer_ids = list(
        Sale.objects.filter(store=store, customer_id__isnull=False)
        .exclude(customer__is_default=True)
        .values_list("customer_id", flat=True)
        .distinct()
    )
    if not customer_ids:
        return []

    last_payment_rows = (
        Payment.objects
        .filter(store=store, sale__customer_id__in=customer_ids)
        .values("sale__customer_id")
        .annotate(last_payment_at=Max("created_at"))
    )
    last_payment_map = {str(r["sale__customer_id"]): r["last_payment_at"] for r in last_payment_rows}

    customers = list(Customer.objects.filter(id__in=customer_ids, is_default=False))
    result = []
    for customer in customers:
        last_payment_at = last_payment_map.get(str(customer.id))
        if not last_payment_at:
            days_without = dormant_days + 1
        else:
            days_without = (as_of_date - last_payment_at.date()).days
        if days_without < dormant_days:
            continue

        score_payload = compute_customer_score(store=store, customer=customer, as_of=as_of_date, actor=actor)
        priority_score = score_payload["score_total"] + min(20, int(days_without / 3))
        reason = f"Aucun paiement valide depuis {days_without} jours."
        whatsapp_preview = (
            f"Bonjour {customer.full_name}, nous n'avons pas eu de commande recente "
            f"depuis {days_without} jours. Nous avons des offres adaptees a vos besoins. "
            "Puis-je vous appeler aujourd'hui ?"
        )

        _upsert_open_alert(
            store=store,
            customer=customer,
            alert_type=CustomerIntelligenceAlert.AlertType.DORMANT,
            severity=(
                CustomerIntelligenceAlert.Severity.HIGH
                if days_without >= dormant_days * 2
                else CustomerIntelligenceAlert.Severity.MEDIUM
            ),
            context={
                "days_without_payment": days_without,
                "cutoff": str(cutoff),
                "suggested_channel": "WHATSAPP",
                "message_preview": whatsapp_preview,
            },
        )

        result.append(
            {
                "customer_id": str(customer.id),
                "customer_name": customer.full_name,
                "customer_phone": customer.phone,
                "days_without_payment": days_without,
                "priority_score": priority_score,
                "segment": score_payload["segment"],
                "score_total": score_payload["score_total"],
                "reason": reason,
                "whatsapp_preview": whatsapp_preview,
            }
        )

    result.sort(key=lambda r: (r["priority_score"], r["days_without_payment"]), reverse=True)
    return result


def _credit_recommendation_from_risk(*, risk_score: int, account: CustomerAccount | None) -> dict:
    balance = _d(getattr(account, "balance", Decimal("0.00")), "0.00")
    credit_limit = _d(getattr(account, "credit_limit", Decimal("0.00")), "0.00")

    if risk_score >= 80:
        return {
            "action": "BLOCK_CREDIT",
            "label": "Bloquer les ventes a credit",
            "recommended_deposit_percent": 100,
            "recommended_limit": str(max(balance, Decimal("0.00")).quantize(Decimal("0.01"))),
            "reason": "Risque eleve avec impayes anciens et/ou dette en hausse.",
        }
    if risk_score >= 65:
        return {
            "action": "REDUCE_LIMIT_AND_DEPOSIT",
            "label": "Reduire le plafond et exiger un acompte",
            "recommended_deposit_percent": 60,
            "recommended_limit": str((credit_limit * Decimal("0.50")).quantize(Decimal("0.01"))),
            "reason": "Risque important, limiter l'exposition au credit.",
        }
    if risk_score >= 45:
        return {
            "action": "DEPOSIT_REQUIRED",
            "label": "Exiger un acompte avant tout credit",
            "recommended_deposit_percent": 35,
            "recommended_limit": str(max(credit_limit, balance).quantize(Decimal("0.01"))),
            "reason": "Signaux de risque moderes, encadrer les nouvelles ventes a credit.",
        }
    return {
        "action": "ALLOW_CREDIT",
        "label": "Autoriser le credit",
        "recommended_deposit_percent": 0,
        "recommended_limit": str(max(credit_limit, balance).quantize(Decimal("0.01"))),
        "reason": "Comportement credit globalement sain.",
    }


def compute_credit_risk_for_customer(*, store, customer, as_of: date | None = None, actor=None) -> dict:
    """Compute explainable credit risk score (0..100, higher is riskier)."""
    as_of_date = as_of or timezone.localdate()
    account = (
        CustomerAccount.objects
        .filter(store=store, customer=customer, is_active=True)
        .select_related("customer")
        .first()
    )

    if not account:
        _close_open_alert(
            store=store,
            customer=customer,
            alert_type=CustomerIntelligenceAlert.AlertType.CREDIT_RISK,
        )
        recommendation = _credit_recommendation_from_risk(risk_score=0, account=None)
        return {
            "customer_id": str(customer.id),
            "customer_name": customer.full_name,
            "store_id": str(store.id),
            "as_of": str(as_of_date),
            "credit_risk_score": 0,
            "risk_level": "LOW",
            "features": {
                "overdue_amount": "0.00",
                "overdue_count": 0,
                "overdue_age_days": 0,
                "recovery_ratio": "1.0000",
                "debt_growth_ratio_30d": "0.0000",
                "balance": "0.00",
                "credit_limit": "0.00",
            },
            "explain": [],
            "recommendation": recommendation,
        }

    sched_qs = PaymentSchedule.objects.filter(account=account, due_date__lte=as_of_date)
    sched_agg = sched_qs.aggregate(
        total_due=Coalesce(Sum("amount_due"), Value(Decimal("0.00"))),
        total_paid=Coalesce(Sum("amount_paid"), Value(Decimal("0.00"))),
        total_count=Count("id"),
        overdue_count=Count(
            "id",
            filter=Q(due_date__lt=as_of_date)
            & ~Q(status=PaymentSchedule.Status.PAID)
            & Q(amount_due__gt=F("amount_paid")),
        ),
        overdue_amount=Coalesce(
            Sum(
                F("amount_due") - F("amount_paid"),
                filter=Q(due_date__lt=as_of_date)
                & ~Q(status=PaymentSchedule.Status.PAID)
                & Q(amount_due__gt=F("amount_paid")),
                output_field=DecimalField(max_digits=18, decimal_places=2),
            ),
            Value(Decimal("0.00")),
        ),
    )
    oldest_due = (
        sched_qs.filter(
            due_date__lt=as_of_date,
            amount_due__gt=F("amount_paid"),
        )
        .exclude(status=PaymentSchedule.Status.PAID)
        .order_by("due_date")
        .values_list("due_date", flat=True)
        .first()
    )
    overdue_age_days = (as_of_date - oldest_due).days if oldest_due else 0

    total_due = _d(sched_agg["total_due"])
    total_paid = _d(sched_agg["total_paid"])
    total_count = int(sched_agg["total_count"] or 0)
    overdue_count = int(sched_agg["overdue_count"] or 0)
    overdue_amount = _d(sched_agg["overdue_amount"])
    recovery_ratio = (total_paid / total_due) if total_due > 0 else Decimal("1")
    overdue_ratio = (Decimal(str(overdue_count)) / Decimal(str(total_count))) if total_count > 0 else Decimal("0")

    balance_now = _d(account.balance)
    balance_30d = (
        account.ledger_entries
        .filter(created_at__date__lte=as_of_date - timedelta(days=30))
        .order_by("-created_at")
        .values_list("balance_after", flat=True)
        .first()
    )
    balance_30d = _d(balance_30d, default=str(balance_now))
    debt_growth = balance_now - balance_30d
    debt_growth_ratio = (debt_growth / max(balance_30d, Decimal("1"))) if debt_growth > 0 else Decimal("0")

    overdue_amount_target = max(_d(account.credit_limit), Decimal("500000"))
    overdue_amount_norm = _clamp(overdue_amount / overdue_amount_target, Decimal("0"), Decimal("1"))
    overdue_age_norm = _clamp(Decimal(str(overdue_age_days)) / Decimal("120"), Decimal("0"), Decimal("1"))
    overdue_ratio_norm = _clamp(overdue_ratio, Decimal("0"), Decimal("1"))
    recovery_penalty_norm = _clamp(Decimal("1") - recovery_ratio, Decimal("0"), Decimal("1"))
    growth_norm = _clamp(debt_growth_ratio, Decimal("0"), Decimal("1"))

    points = {
        "overdue_amount": overdue_amount_norm * Decimal("35"),
        "overdue_age": overdue_age_norm * Decimal("25"),
        "overdue_ratio": overdue_ratio_norm * Decimal("20"),
        "recovery_gap": recovery_penalty_norm * Decimal("15"),
        "debt_growth": growth_norm * Decimal("5"),
    }
    risk_decimal = sum(points.values(), Decimal("0"))
    risk_score = int(_clamp(risk_decimal, Decimal("0"), Decimal("100")).quantize(Decimal("1")))

    if risk_score >= 80:
        risk_level = "CRITICAL"
        severity = CustomerIntelligenceAlert.Severity.CRITICAL
    elif risk_score >= 65:
        risk_level = "HIGH"
        severity = CustomerIntelligenceAlert.Severity.HIGH
    elif risk_score >= 45:
        risk_level = "MEDIUM"
        severity = CustomerIntelligenceAlert.Severity.MEDIUM
    else:
        risk_level = "LOW"
        severity = CustomerIntelligenceAlert.Severity.LOW

    explain = []
    for key, value in sorted(points.items(), key=lambda x: x[1], reverse=True)[:3]:
        explain.append({"feature": key, "impact_points": str(value.quantize(Decimal("0.1")))})

    recommendation = _credit_recommendation_from_risk(risk_score=risk_score, account=account)
    features = {
        "overdue_amount": str(overdue_amount.quantize(Decimal("0.01"))),
        "overdue_count": overdue_count,
        "overdue_age_days": overdue_age_days,
        "recovery_ratio": str(recovery_ratio.quantize(Decimal("0.0001"))),
        "debt_growth_ratio_30d": str(debt_growth_ratio.quantize(Decimal("0.0001"))),
        "balance": str(balance_now.quantize(Decimal("0.01"))),
        "credit_limit": str(_d(account.credit_limit).quantize(Decimal("0.01"))),
    }

    if risk_score >= 45:
        _upsert_open_alert(
            store=store,
            customer=customer,
            alert_type=CustomerIntelligenceAlert.AlertType.CREDIT_RISK,
            severity=severity,
            context={
                "credit_risk_score": risk_score,
                "risk_level": risk_level,
                "features": features,
                "recommendation": recommendation,
            },
        )
    else:
        _close_open_alert(
            store=store,
            customer=customer,
            alert_type=CustomerIntelligenceAlert.AlertType.CREDIT_RISK,
        )

    return {
        "customer_id": str(customer.id),
        "customer_name": customer.full_name,
        "store_id": str(store.id),
        "as_of": str(as_of_date),
        "credit_risk_score": risk_score,
        "risk_level": risk_level,
        "features": features,
        "explain": explain,
        "recommendation": recommendation,
    }


def list_credit_risk_customers(
    *,
    store,
    as_of: date | None = None,
    min_risk_score: int = 0,
    limit: int = 50,
    actor=None,
) -> list[dict]:
    as_of_date = as_of or timezone.localdate()
    rows = []
    accounts = (
        CustomerAccount.objects
        .filter(store=store, is_active=True, customer__is_default=False)
        .select_related("customer")
    )
    for account in accounts:
        payload = compute_credit_risk_for_customer(
            store=store,
            customer=account.customer,
            as_of=as_of_date,
            actor=actor,
        )
        if payload["credit_risk_score"] < int(min_risk_score):
            continue
        rows.append(payload)

    rows.sort(key=lambda x: x["credit_risk_score"], reverse=True)
    return rows[: max(1, int(limit))]


def _build_product_stock_map(*, store, product_ids: list[str]) -> dict:
    if not product_ids:
        return {}
    from stock.models import ProductStock

    stock_rows = ProductStock.objects.filter(
        store=store,
        product_id__in=product_ids,
    ).values("product_id", "quantity", "reserved_qty")
    return {
        str(row["product_id"]): int(row["quantity"] or 0) - int(row["reserved_qty"] or 0)
        for row in stock_rows
    }


def get_customer_product_recommendations(
    *,
    store,
    customer,
    as_of: date | None = None,
    window_days: int = 90,
    limit: int = 5,
    include_only_in_stock: bool = True,
    force_refresh: bool = False,
    actor=None,
) -> dict:
    """Heuristic recommendations: co-occurrence + next best category + refill."""
    as_of_date = as_of or timezone.localdate()
    window_days = max(7, min(int(window_days), 365))
    limit = max(1, min(int(limit), 20))

    if not force_refresh:
        cached = CustomerRecommendationCache.objects.filter(
            store=store,
            customer=customer,
            as_of_date=as_of_date,
            window_days=window_days,
            limit=limit,
            include_only_in_stock=include_only_in_stock,
        ).order_by("-generated_at").first()
        if cached and isinstance(cached.payload, dict):
            return cached.payload

    paid_statuses = [Sale.Status.PAID, Sale.Status.PARTIALLY_PAID, Sale.Status.REFUNDED]
    analysis_start = as_of_date - timedelta(days=window_days - 1)
    lookback_1y = as_of_date - timedelta(days=365)

    customer_sales_ids = list(
        Sale.objects.filter(
            store=store,
            customer=customer,
            status__in=paid_statuses,
            created_at__date__gte=lookback_1y,
            created_at__date__lte=as_of_date,
        ).values_list("id", flat=True)
    )
    if not customer_sales_ids:
        payload = {
            "customer_id": str(customer.id),
            "customer_name": customer.full_name,
            "store_id": str(store.id),
            "as_of": str(as_of_date),
            "window_days": window_days,
            "limit": limit,
            "include_only_in_stock": include_only_in_stock,
            "items": [],
            "explain": ["Aucun historique d'achat exploitable pour ce client."],
        }
        CustomerRecommendationCache.objects.update_or_create(
            store=store,
            customer=customer,
            as_of_date=as_of_date,
            window_days=window_days,
            limit=limit,
            include_only_in_stock=include_only_in_stock,
            defaults={"payload": payload, "generated_at": timezone.now()},
        )
        return payload

    purchased_product_ids = list(
        SaleItem.objects.filter(sale_id__in=customer_sales_ids)
        .values_list("product_id", flat=True)
        .distinct()
    )
    recent_anchor_ids = list(
        SaleItem.objects.filter(
            sale_id__in=customer_sales_ids,
            sale__created_at__date__gte=analysis_start,
        )
        .values_list("product_id", flat=True)
        .distinct()
    ) or purchased_product_ids[:10]

    candidates: dict[str, dict] = defaultdict(lambda: {"score": Decimal("0"), "source": "MIXED", "reasons": []})

    def _add_candidate(product_id, score: Decimal, source: str, reason: str):
        pid = str(product_id)
        entry = candidates[pid]
        if score > entry["score"]:
            entry["score"] = score
            entry["source"] = source
        if reason not in entry["reasons"]:
            entry["reasons"].append(reason)

    if recent_anchor_ids:
        anchor_sale_ids = list(
            SaleItem.objects.filter(
                sale__store=store,
                sale__status__in=paid_statuses,
                sale__created_at__date__gte=analysis_start,
                sale__created_at__date__lte=as_of_date,
                product_id__in=recent_anchor_ids,
            )
            .values_list("sale_id", flat=True)
            .distinct()
        )
        co_rows = (
            SaleItem.objects.filter(
                sale_id__in=anchor_sale_ids,
                sale__store=store,
                sale__status__in=paid_statuses,
            )
            .exclude(product_id__in=purchased_product_ids)
            .values("product_id")
            .annotate(
                co_orders=Count("sale_id", distinct=True),
                qty=Coalesce(Sum("quantity"), Value(0)),
            )
            .order_by("-co_orders", "-qty")
        )
        for row in co_rows:
            co_orders = int(row["co_orders"] or 0)
            qty = int(row["qty"] or 0)
            if co_orders <= 0:
                continue
            score = Decimal(str(co_orders * 20 + qty * 2))
            _add_candidate(
                row["product_id"],
                score=score,
                source="FREQUENTLY_BOUGHT_TOGETHER",
                reason=f"Souvent achete avec vos produits recents ({co_orders} commandes).",
            )

    top_category_ids = list(
        SaleItem.objects.filter(
            sale_id__in=customer_sales_ids,
            product__category_id__isnull=False,
        )
        .values("product__category_id")
        .annotate(qty=Coalesce(Sum("quantity"), Value(0)))
        .order_by("-qty")
        .values_list("product__category_id", flat=True)[:3]
    )
    if top_category_ids:
        category_rows = (
            SaleItem.objects.filter(
                sale__store=store,
                sale__status__in=paid_statuses,
                sale__created_at__date__gte=analysis_start,
                sale__created_at__date__lte=as_of_date,
                product__category_id__in=top_category_ids,
            )
            .exclude(product_id__in=purchased_product_ids)
            .values("product_id", "product__category__name")
            .annotate(orders=Count("sale_id", distinct=True), qty=Coalesce(Sum("quantity"), Value(0)))
            .order_by("-orders", "-qty")
        )
        for row in category_rows:
            orders = int(row["orders"] or 0)
            qty = int(row["qty"] or 0)
            if orders <= 0:
                continue
            score = Decimal(str(orders * 12 + qty))
            _add_candidate(
                row["product_id"],
                score=score,
                source="NEXT_BEST_CATEGORY",
                reason=f"Categorie porteuse pour ce client: {row['product__category__name'] or 'N/A'}.",
            )

    history_rows = list(
        SaleItem.objects.filter(
            sale__store=store,
            sale__customer=customer,
            sale__status__in=paid_statuses,
            sale__created_at__date__gte=lookback_1y,
            sale__created_at__date__lte=as_of_date,
        )
        .values("product_id", "sale__created_at")
        .order_by("product_id", "sale__created_at")
    )
    by_product_dates: dict[str, list[date]] = defaultdict(list)
    for row in history_rows:
        pid = str(row["product_id"])
        purchase_day = row["sale__created_at"].date()
        if not by_product_dates[pid] or by_product_dates[pid][-1] != purchase_day:
            by_product_dates[pid].append(purchase_day)
    for pid, purchase_dates in by_product_dates.items():
        if len(purchase_dates) < 2:
            continue
        intervals = [
            (purchase_dates[idx] - purchase_dates[idx - 1]).days
            for idx in range(1, len(purchase_dates))
            if (purchase_dates[idx] - purchase_dates[idx - 1]).days > 0
        ]
        if not intervals:
            continue
        avg_interval = sum(intervals) / len(intervals)
        next_due = purchase_dates[-1] + timedelta(days=max(1, round(avg_interval)))
        days_gap = (next_due - as_of_date).days
        if -7 <= days_gap <= 21:
            score = Decimal("90") - Decimal(str(abs(days_gap))) * Decimal("1.5")
            _add_candidate(
                pid,
                score=max(Decimal("10"), score),
                source="REFILL_RENEWAL",
                reason=f"Cycle moyen de rachat detecte ({round(avg_interval, 1)} jours).",
            )

    candidate_ids = list(candidates.keys())
    products = {
        str(p.id): p
        for p in Product.objects.filter(
            id__in=candidate_ids,
            enterprise_id=store.enterprise_id,
            is_active=True,
        ).select_related("category")
    }
    stock_map = _build_product_stock_map(store=store, product_ids=candidate_ids)

    items = []
    for pid, payload in sorted(candidates.items(), key=lambda x: x[1]["score"], reverse=True):
        product = products.get(pid)
        if not product:
            continue
        available = stock_map.get(pid, 0)
        if include_only_in_stock and getattr(product, "track_stock", True) and available <= 0:
            continue
        items.append(
            {
                "product_id": pid,
                "sku": product.sku,
                "name": product.name,
                "category": product.category.name if product.category else None,
                "selling_price": str(_d(product.selling_price).quantize(Decimal("0.01"))),
                "score": int(_clamp(payload["score"]).quantize(Decimal("1"))),
                "source": payload["source"],
                "reasons": payload["reasons"][:2],
                "available_stock": available if getattr(product, "track_stock", True) else None,
            }
        )
        if len(items) >= limit:
            break

    response_payload = {
        "customer_id": str(customer.id),
        "customer_name": customer.full_name,
        "store_id": str(store.id),
        "as_of": str(as_of_date),
        "window_days": window_days,
        "limit": limit,
        "include_only_in_stock": include_only_in_stock,
        "items": items,
        "explain": [
            "Source FBT: co-occurrence des produits sur ventes payees.",
            "Source categorie: extrapolation sur categories frequentes du client.",
            "Source refill: cycle de rachat estime depuis l'historique.",
        ],
    }

    CustomerRecommendationCache.objects.update_or_create(
        store=store,
        customer=customer,
        as_of_date=as_of_date,
        window_days=window_days,
        limit=limit,
        include_only_in_stock=include_only_in_stock,
        defaults={"payload": response_payload, "generated_at": timezone.now()},
    )
    return response_payload


def predict_next_order_for_customer(*, store, customer, as_of: date | None = None, actor=None) -> dict:
    """Heuristic next-order prediction based on historical purchase intervals."""
    as_of_date = as_of or timezone.localdate()
    paid_rows = list(
        Payment.objects.filter(
            store=store,
            sale__customer=customer,
            created_at__date__lte=as_of_date,
        )
        .values("sale_id")
        .annotate(paid_at=Max("created_at"))
        .order_by("paid_at")
    )
    purchase_dates = [row["paid_at"].date() for row in paid_rows if row.get("paid_at")]

    predicted_date = None
    probability = "LOW"
    avg_interval_days = None
    interval_std = None
    intervals = []
    if len(purchase_dates) == 1:
        predicted_date = purchase_dates[-1] + timedelta(days=30)
    elif len(purchase_dates) >= 2:
        intervals = [
            max(1, (purchase_dates[idx] - purchase_dates[idx - 1]).days)
            for idx in range(1, len(purchase_dates))
        ]
        avg_interval_days = sum(intervals) / len(intervals)
        interval_std = pstdev(intervals) if len(intervals) > 1 else 0.0
        predicted_date = purchase_dates[-1] + timedelta(days=max(1, round(avg_interval_days)))

        regularity_ratio = (interval_std / avg_interval_days) if avg_interval_days else 1.0
        if regularity_ratio <= 0.25:
            probability = "HIGH"
        elif regularity_ratio <= 0.60:
            probability = "MEDIUM"
        else:
            probability = "LOW"

    days_until = None
    if predicted_date:
        days_until = (predicted_date - as_of_date).days

    if predicted_date and days_until is not None and -2 <= days_until <= 7 and probability in {"HIGH", "MEDIUM"}:
        _upsert_open_alert(
            store=store,
            customer=customer,
            alert_type=CustomerIntelligenceAlert.AlertType.NEXT_ORDER,
            severity=(
                CustomerIntelligenceAlert.Severity.HIGH
                if probability == "HIGH"
                else CustomerIntelligenceAlert.Severity.MEDIUM
            ),
            context={
                "predicted_next_purchase_date": str(predicted_date),
                "days_until_prediction": days_until,
                "probability": probability,
                "avg_interval_days": round(avg_interval_days or 0.0, 2),
                "purchase_count": len(purchase_dates),
            },
        )
    else:
        _close_open_alert(
            store=store,
            customer=customer,
            alert_type=CustomerIntelligenceAlert.AlertType.NEXT_ORDER,
        )

    if not predicted_date:
        recommendation = "Historique insuffisant: poursuivre la qualification commerciale."
    elif days_until is not None and days_until <= 7:
        recommendation = "Client a relancer cette semaine."
    else:
        recommendation = "Suivi normal, relance preventive proche de la date estimee."

    return {
        "customer_id": str(customer.id),
        "customer_name": customer.full_name,
        "store_id": str(store.id),
        "as_of": str(as_of_date),
        "predicted_next_purchase_date": str(predicted_date) if predicted_date else None,
        "days_until_prediction": days_until,
        "probability": probability,
        "avg_interval_days": round(avg_interval_days, 2) if avg_interval_days is not None else None,
        "interval_std_days": round(interval_std, 2) if interval_std is not None else None,
        "purchase_count": len(purchase_dates),
        "recommendation": recommendation,
    }


def _churn_payload_for_customer(
    *,
    store,
    customer,
    as_of_date: date,
    window_days: int,
    drop_threshold_pct: Decimal,
) -> dict | None:
    curr_start = as_of_date - timedelta(days=window_days - 1)
    prev_end = curr_start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=window_days - 1)

    curr = (
        Payment.objects.filter(
            store=store,
            sale__customer=customer,
            created_at__date__gte=curr_start,
            created_at__date__lte=as_of_date,
        )
        .aggregate(
            amount=Coalesce(Sum("amount"), Value(Decimal("0.00"))),
            orders=Count("sale_id", distinct=True),
        )
    )
    prev = (
        Payment.objects.filter(
            store=store,
            sale__customer=customer,
            created_at__date__gte=prev_start,
            created_at__date__lte=prev_end,
        )
        .aggregate(
            amount=Coalesce(Sum("amount"), Value(Decimal("0.00"))),
            orders=Count("sale_id", distinct=True),
        )
    )
    curr_amount = _d(curr["amount"])
    prev_amount = _d(prev["amount"])
    curr_orders = int(curr["orders"] or 0)
    prev_orders = int(prev["orders"] or 0)

    if prev_amount <= 0 and prev_orders <= 0:
        _close_open_alert(
            store=store,
            customer=customer,
            alert_type=CustomerIntelligenceAlert.AlertType.CHURN,
        )
        return None

    revenue_drop_pct = Decimal("0")
    if prev_amount > 0:
        revenue_drop_pct = _clamp(((prev_amount - curr_amount) / prev_amount) * Decimal("100"), Decimal("0"), Decimal("100"))

    frequency_drop_pct = Decimal("0")
    if prev_orders > 0:
        frequency_drop_pct = _clamp(
            (Decimal(str(prev_orders - curr_orders)) / Decimal(str(prev_orders))) * Decimal("100"),
            Decimal("0"),
            Decimal("100"),
        )

    if revenue_drop_pct < drop_threshold_pct and frequency_drop_pct < drop_threshold_pct:
        _close_open_alert(
            store=store,
            customer=customer,
            alert_type=CustomerIntelligenceAlert.AlertType.CHURN,
        )
        return None

    risk_decimal = (revenue_drop_pct * Decimal("0.70")) + (frequency_drop_pct * Decimal("0.30"))
    risk_score = int(_clamp(risk_decimal, Decimal("0"), Decimal("100")).quantize(Decimal("1")))
    if risk_score >= 75:
        severity = CustomerIntelligenceAlert.Severity.HIGH
    elif risk_score >= 55:
        severity = CustomerIntelligenceAlert.Severity.MEDIUM
    else:
        severity = CustomerIntelligenceAlert.Severity.LOW

    actions = ["Relance proactive avec argumentaire personnalise."]
    if revenue_drop_pct >= Decimal("40"):
        actions.append("Proposer une offre ciblee pour relancer le panier.")
    if frequency_drop_pct >= Decimal("40"):
        actions.append("Planifier un appel de suivi hebdomadaire.")

    payload = {
        "customer_id": str(customer.id),
        "customer_name": customer.full_name,
        "customer_phone": customer.phone,
        "store_id": str(store.id),
        "window_days": window_days,
        "current_period": {"start": str(curr_start), "end": str(as_of_date)},
        "previous_period": {"start": str(prev_start), "end": str(prev_end)},
        "current_paid_amount": str(curr_amount.quantize(Decimal("0.01"))),
        "previous_paid_amount": str(prev_amount.quantize(Decimal("0.01"))),
        "current_orders": curr_orders,
        "previous_orders": prev_orders,
        "revenue_drop_pct": str(revenue_drop_pct.quantize(Decimal("0.01"))),
        "frequency_drop_pct": str(frequency_drop_pct.quantize(Decimal("0.01"))),
        "churn_risk_score": risk_score,
        "actions": actions,
    }

    _upsert_open_alert(
        store=store,
        customer=customer,
        alert_type=CustomerIntelligenceAlert.AlertType.CHURN,
        severity=severity,
        context=payload,
    )
    return payload


def list_churn_risk_customers(
    *,
    store,
    as_of: date | None = None,
    window_days: int = 30,
    drop_threshold_pct: Decimal | int | str = Decimal("30"),
    limit: int = 50,
    actor=None,
) -> list[dict]:
    as_of_date = as_of or timezone.localdate()
    window_days = max(7, min(int(window_days), 90))
    drop_threshold = _d(drop_threshold_pct, "30")
    prev_start = as_of_date - timedelta(days=(2 * window_days) - 1)

    customer_ids = list(
        Payment.objects.filter(
            store=store,
            sale__customer_id__isnull=False,
            sale__customer__is_default=False,
            created_at__date__gte=prev_start,
            created_at__date__lte=as_of_date,
        )
        .values_list("sale__customer_id", flat=True)
        .distinct()
    )
    customers = {
        str(c.id): c
        for c in Customer.objects.filter(id__in=customer_ids)
    }

    rows = []
    for customer_id in customer_ids:
        customer = customers.get(str(customer_id))
        if not customer:
            continue
        payload = _churn_payload_for_customer(
            store=store,
            customer=customer,
            as_of_date=as_of_date,
            window_days=window_days,
            drop_threshold_pct=drop_threshold,
        )
        if payload:
            rows.append(payload)

    rows.sort(
        key=lambda r: (
            int(r["churn_risk_score"]),
            _d(r["revenue_drop_pct"], "0"),
        ),
        reverse=True,
    )
    return rows[: max(1, int(limit))]


def refresh_customer_intelligence_for_customer(
    *,
    store,
    customer,
    as_of: date | None = None,
    actor=None,
    force_recommendations_refresh: bool = True,
) -> dict:
    """Incremental recompute for one customer after a business event."""
    as_of_date = as_of or timezone.localdate()
    score = compute_customer_score(store=store, customer=customer, as_of=as_of_date, actor=actor)
    credit = compute_credit_risk_for_customer(store=store, customer=customer, as_of=as_of_date, actor=actor)
    next_order = predict_next_order_for_customer(store=store, customer=customer, as_of=as_of_date, actor=actor)
    recommendations = get_customer_product_recommendations(
        store=store,
        customer=customer,
        as_of=as_of_date,
        window_days=90,
        limit=5,
        include_only_in_stock=True,
        force_refresh=force_recommendations_refresh,
        actor=actor,
    )
    churn = _churn_payload_for_customer(
        store=store,
        customer=customer,
        as_of_date=as_of_date,
        window_days=30,
        drop_threshold_pct=Decimal("30"),
    )
    return {
        "customer_id": str(customer.id),
        "as_of": str(as_of_date),
        "score_total": score.get("score_total"),
        "credit_risk_score": credit.get("credit_risk_score"),
        "next_order_date": next_order.get("predicted_next_purchase_date"),
        "recommendation_count": len(recommendations.get("items", [])),
        "churn_risk_score": churn.get("churn_risk_score") if churn else None,
    }


def upsert_ruleset(*, store, actor, payload: dict) -> CustomerAnalyticsRuleSet:
    """Create and activate a new ruleset version for one store."""
    latest_version = (
        CustomerAnalyticsRuleSet.objects
        .filter(store=store)
        .aggregate(m=Max("version"))
        .get("m")
        or 0
    )
    CustomerAnalyticsRuleSet.objects.filter(
        store=store,
        status=CustomerAnalyticsRuleSet.Status.ACTIVE,
    ).update(status=CustomerAnalyticsRuleSet.Status.ARCHIVED)

    weights = payload.get("weights") if isinstance(payload.get("weights"), dict) else {}
    thresholds = payload.get("thresholds") if isinstance(payload.get("thresholds"), dict) else {}
    margin_proxy = payload.get("margin_proxy") if isinstance(payload.get("margin_proxy"), dict) else {}
    dormant_days = int(payload.get("dormant_days", DEFAULT_THRESHOLDS["dormant_days"]))

    return CustomerAnalyticsRuleSet.objects.create(
        store=store,
        version=latest_version + 1,
        status=CustomerAnalyticsRuleSet.Status.ACTIVE,
        effective_from=timezone.localdate(),
        weights=weights or {
            "score": {k: str(v) for k, v in DEFAULT_WEIGHTS.items()},
            "top": {k: str(v) for k, v in DEFAULT_TOP_WEIGHTS.items()},
        },
        thresholds=thresholds or DEFAULT_THRESHOLDS,
        margin_proxy=margin_proxy,
        dormant_days=max(1, dormant_days),
        created_by=actor,
        notes=str(payload.get("notes", "")),
    )
