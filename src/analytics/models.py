"""Models for intelligent analytics across sales, stock, credit and fraud."""
from decimal import Decimal

from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone

from core.models import TimeStampedModel


class ABCAnalysis(TimeStampedModel):
    """ABC classification snapshot for one product on a period."""

    class ABCClass(models.TextChoices):
        A = "A", "A"
        B = "B", "B"
        C = "C", "C"

    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        related_name="abc_analyses",
    )
    product = models.ForeignKey(
        "catalog.Product",
        on_delete=models.CASCADE,
        related_name="abc_analyses",
    )
    period_start = models.DateField()
    period_end = models.DateField()
    quantity_sold = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    revenue = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    revenue_share = models.DecimalField(max_digits=7, decimal_places=4, default=Decimal("0.0000"))
    cumulative_share = models.DecimalField(max_digits=7, decimal_places=4, default=Decimal("0.0000"))
    abc_class = models.CharField(max_length=1, choices=ABCClass.choices, db_index=True)

    class Meta:
        unique_together = [["store", "product", "period_start", "period_end"]]
        ordering = ["store", "abc_class", "-revenue"]

    def __str__(self):
        return f"{self.store} {self.product} {self.abc_class}"


class ReorderRecommendation(TimeStampedModel):
    """Dynamic reorder signal computed from real sales."""

    class Urgency(models.TextChoices):
        LOW = "LOW", "Faible"
        MEDIUM = "MEDIUM", "Moyenne"
        HIGH = "HIGH", "Elevee"

    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        related_name="reorder_recommendations",
    )
    product = models.ForeignKey(
        "catalog.Product",
        on_delete=models.CASCADE,
        related_name="reorder_recommendations",
    )
    computed_for = models.DateField(db_index=True)
    avg_daily_sales = models.DecimalField(max_digits=12, decimal_places=4, default=Decimal("0.0000"))
    lead_time_days = models.PositiveIntegerField(default=7)
    safety_days = models.PositiveIntegerField(default=3)
    reorder_point = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    current_available = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    suggested_order_qty = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    days_of_cover = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    urgency = models.CharField(max_length=10, choices=Urgency.choices, default=Urgency.LOW, db_index=True)

    class Meta:
        unique_together = [["store", "product", "computed_for"]]
        ordering = ["store", "-computed_for", "-suggested_order_qty"]

    def __str__(self):
        return f"{self.store} {self.product} {self.suggested_order_qty}"


class CustomerCreditScore(TimeStampedModel):
    """Risk scoring snapshot for a customer credit account."""

    class Grade(models.TextChoices):
        A = "A", "Excellent"
        B = "B", "Bon"
        C = "C", "Moyen"
        D = "D", "Risque"
        E = "E", "Critique"

    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        related_name="credit_scores",
    )
    account = models.ForeignKey(
        "credits.CustomerAccount",
        on_delete=models.CASCADE,
        related_name="credit_scores",
    )
    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.CASCADE,
        related_name="credit_scores",
    )
    computed_for = models.DateField(db_index=True)
    score = models.PositiveSmallIntegerField(default=0)
    grade = models.CharField(max_length=1, choices=Grade.choices, db_index=True)
    utilization_rate = models.DecimalField(max_digits=7, decimal_places=4, default=Decimal("0.0000"))
    payment_ratio = models.DecimalField(max_digits=7, decimal_places=4, default=Decimal("1.0000"))
    overdue_ratio = models.DecimalField(max_digits=7, decimal_places=4, default=Decimal("0.0000"))
    overdue_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    balance = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    recommended_limit = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))

    class Meta:
        unique_together = [["store", "account", "computed_for"]]
        ordering = ["store", "-computed_for", "score"]

    def __str__(self):
        return f"{self.store} {self.customer} {self.grade} ({self.score})"


class SalesForecast(TimeStampedModel):
    """Simple demand forecast per product using moving averages."""

    class Method(models.TextChoices):
        MOVING_AVG = "MOVING_AVG", "Moyenne mobile"

    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        related_name="sales_forecasts",
    )
    product = models.ForeignKey(
        "catalog.Product",
        on_delete=models.CASCADE,
        related_name="sales_forecasts",
    )
    forecast_date = models.DateField(db_index=True)
    method = models.CharField(max_length=20, choices=Method.choices, default=Method.MOVING_AVG)
    predicted_qty = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    ma_7d = models.DecimalField(max_digits=12, decimal_places=4, default=Decimal("0.0000"))
    ma_30d = models.DecimalField(max_digits=12, decimal_places=4, default=Decimal("0.0000"))
    confidence = models.DecimalField(max_digits=7, decimal_places=4, default=Decimal("0.0000"))

    class Meta:
        unique_together = [["store", "product", "forecast_date", "method"]]
        ordering = ["store", "forecast_date", "-predicted_qty"]

    def __str__(self):
        return f"{self.store} {self.product} {self.forecast_date}"


class FraudEvent(TimeStampedModel):
    """Fraud or anomaly signal detected by rules/statistics."""

    class Severity(models.TextChoices):
        INFO = "INFO", "Info"
        WARNING = "WARNING", "Warning"
        CRITICAL = "CRITICAL", "Critical"

    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        related_name="fraud_events",
    )
    sale = models.ForeignKey(
        "sales.Sale",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="fraud_events",
    )
    payment = models.ForeignKey(
        "cashier.Payment",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="fraud_events",
    )
    detected_on = models.DateField(db_index=True)
    rule_code = models.CharField(max_length=60, db_index=True)
    severity = models.CharField(max_length=10, choices=Severity.choices, default=Severity.INFO, db_index=True)
    risk_score = models.PositiveSmallIntegerField(default=0)
    title = models.CharField(max_length=180)
    description = models.TextField(blank=True, default="")
    payload = models.JSONField(default=dict, blank=True)
    is_resolved = models.BooleanField(default=False, db_index=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="resolved_fraud_events",
    )

    class Meta:
        ordering = ["-detected_on", "-risk_score", "-created_at"]
        indexes = [
            models.Index(fields=["store", "detected_on"]),
            models.Index(fields=["store", "is_resolved"]),
            models.Index(fields=["store", "severity"]),
        ]

    def __str__(self):
        return f"{self.store} {self.rule_code} {self.severity}"


class CustomerAnalyticsRuleSet(TimeStampedModel):
    """Versioned scoring/threshold rules for customer intelligence."""

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Brouillon"
        ACTIVE = "ACTIVE", "Actif"
        ARCHIVED = "ARCHIVED", "Archive"

    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        related_name="customer_analytics_rulesets",
    )
    version = models.PositiveIntegerField(default=1)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT, db_index=True)
    effective_from = models.DateField(default=timezone.localdate, db_index=True)
    effective_to = models.DateField(null=True, blank=True)
    weights = models.JSONField(default=dict, blank=True)
    thresholds = models.JSONField(default=dict, blank=True)
    margin_proxy = models.JSONField(default=dict, blank=True)
    dormant_days = models.PositiveSmallIntegerField(default=45)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="customer_analytics_rulesets_created",
    )
    notes = models.TextField(blank=True, default="")

    class Meta:
        ordering = ["store_id", "-version"]
        unique_together = [["store", "version"]]
        constraints = [
            models.UniqueConstraint(
                fields=["store"],
                condition=Q(status="ACTIVE"),
                name="uniq_active_customer_ruleset_per_store",
            )
        ]
        indexes = [
            models.Index(fields=["store", "status", "-effective_from"]),
        ]

    def __str__(self):
        return f"{self.store} v{self.version} ({self.status})"


class CustomerMetricDaily(TimeStampedModel):
    """Daily customer metrics snapshot (store-scoped)."""

    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        related_name="customer_metrics_daily",
    )
    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.CASCADE,
        related_name="analytics_metrics_daily",
    )
    metric_date = models.DateField(db_index=True)
    paid_amount = models.DecimalField(max_digits=16, decimal_places=2, default=Decimal("0.00"))
    paid_orders_count = models.PositiveIntegerField(default=0)
    refund_amount = models.DecimalField(max_digits=16, decimal_places=2, default=Decimal("0.00"))
    discount_amount = models.DecimalField(max_digits=16, decimal_places=2, default=Decimal("0.00"))
    credit_issued_amount = models.DecimalField(max_digits=16, decimal_places=2, default=Decimal("0.00"))
    credit_collected_amount = models.DecimalField(max_digits=16, decimal_places=2, default=Decimal("0.00"))
    credit_overdue_amount = models.DecimalField(max_digits=16, decimal_places=2, default=Decimal("0.00"))
    strategic_amount = models.DecimalField(max_digits=16, decimal_places=2, default=Decimal("0.00"))
    profit_estimated = models.DecimalField(max_digits=16, decimal_places=2, default=Decimal("0.00"))
    last_payment_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["store_id", "-metric_date", "customer_id"]
        unique_together = [["store", "customer", "metric_date"]]
        indexes = [
            models.Index(fields=["store", "metric_date"]),
            models.Index(fields=["store", "customer", "metric_date"]),
        ]

    def __str__(self):
        return f"{self.store} {self.customer} {self.metric_date}"


class CustomerMetricMonthly(TimeStampedModel):
    """Monthly customer metrics snapshot (store-scoped)."""

    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        related_name="customer_metrics_monthly",
    )
    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.CASCADE,
        related_name="analytics_metrics_monthly",
    )
    period_month = models.DateField(db_index=True, help_text="Premier jour du mois.")
    paid_amount = models.DecimalField(max_digits=16, decimal_places=2, default=Decimal("0.00"))
    paid_orders_count = models.PositiveIntegerField(default=0)
    active_weeks_count = models.PositiveIntegerField(default=0)
    refund_amount = models.DecimalField(max_digits=16, decimal_places=2, default=Decimal("0.00"))
    discount_amount = models.DecimalField(max_digits=16, decimal_places=2, default=Decimal("0.00"))
    strategic_amount = models.DecimalField(max_digits=16, decimal_places=2, default=Decimal("0.00"))
    profit_estimated = models.DecimalField(max_digits=16, decimal_places=2, default=Decimal("0.00"))
    credit_overdue_amount = models.DecimalField(max_digits=16, decimal_places=2, default=Decimal("0.00"))
    credit_overdue_count = models.PositiveIntegerField(default=0)
    recovery_ratio = models.DecimalField(max_digits=7, decimal_places=4, default=Decimal("0.0000"))
    top_index = models.DecimalField(max_digits=10, decimal_places=4, default=Decimal("0.0000"))
    last_payment_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["store_id", "-period_month", "customer_id"]
        unique_together = [["store", "customer", "period_month"]]
        indexes = [
            models.Index(fields=["store", "period_month"]),
            models.Index(fields=["store", "customer", "period_month"]),
        ]

    def __str__(self):
        return f"{self.store} {self.customer} {self.period_month:%Y-%m}"


class CustomerScoreSnapshot(TimeStampedModel):
    """Versioned customer score snapshot."""

    class PeriodType(models.TextChoices):
        ROLLING_90D = "ROLLING_90D", "Fenetre glissante 90 jours"
        MONTHLY = "MONTHLY", "Mensuel"

    class Segment(models.TextChoices):
        VIP = "VIP", "VIP"
        REGULAR = "REGULAR", "Regulier"
        OCCASIONAL = "OCCASIONAL", "Occasionnel"
        DORMANT = "DORMANT", "Dormant"
        RISK = "RISK", "Risque"

    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        related_name="customer_score_snapshots",
    )
    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.CASCADE,
        related_name="analytics_score_snapshots",
    )
    as_of_date = models.DateField(db_index=True)
    period_type = models.CharField(max_length=20, choices=PeriodType.choices, default=PeriodType.ROLLING_90D)
    ruleset = models.ForeignKey(
        CustomerAnalyticsRuleSet,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="score_snapshots",
    )
    score_total = models.PositiveSmallIntegerField(default=0)
    recency_score = models.PositiveSmallIntegerField(default=0)
    frequency_score = models.PositiveSmallIntegerField(default=0)
    monetary_score = models.PositiveSmallIntegerField(default=0)
    credit_score = models.PositiveSmallIntegerField(default=0)
    discount_behavior_score = models.PositiveSmallIntegerField(default=0)
    segment = models.CharField(max_length=20, choices=Segment.choices, default=Segment.OCCASIONAL, db_index=True)
    features = models.JSONField(default=dict, blank=True)
    explain = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ["store_id", "-as_of_date", "-score_total"]
        unique_together = [["store", "customer", "as_of_date", "period_type", "ruleset"]]
        indexes = [
            models.Index(fields=["store", "as_of_date", "-score_total"]),
            models.Index(fields=["store", "segment", "as_of_date"]),
        ]

    def __str__(self):
        return f"{self.store} {self.customer} {self.score_total}"


class CustomerSegmentSnapshot(TimeStampedModel):
    """Snapshot of segment and tags for one customer and date."""

    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        related_name="customer_segment_snapshots",
    )
    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.CASCADE,
        related_name="analytics_segment_snapshots",
    )
    as_of_date = models.DateField(db_index=True)
    segment = models.CharField(max_length=20, db_index=True)
    tags = models.JSONField(default=list, blank=True)
    strategy = models.JSONField(default=list, blank=True)
    ruleset = models.ForeignKey(
        CustomerAnalyticsRuleSet,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="segment_snapshots",
    )

    class Meta:
        ordering = ["store_id", "-as_of_date", "customer_id"]
        unique_together = [["store", "customer", "as_of_date", "ruleset"]]
        indexes = [
            models.Index(fields=["store", "segment", "as_of_date"]),
        ]


class CustomerTopMonthly(TimeStampedModel):
    """Monthly top-clients ranking snapshot."""

    class Badge(models.TextChoices):
        BRONZE = "BRONZE", "Bronze"
        SILVER = "SILVER", "Silver"
        GOLD = "GOLD", "Gold"

    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        related_name="customer_top_monthly",
    )
    period_month = models.DateField(db_index=True, help_text="Premier jour du mois.")
    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.CASCADE,
        related_name="analytics_top_monthly",
    )
    rank = models.PositiveIntegerField()
    top_score = models.DecimalField(max_digits=10, decimal_places=4, default=Decimal("0.0000"))
    badge = models.CharField(max_length=10, choices=Badge.choices, default=Badge.BRONZE)
    explain = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ["store_id", "period_month", "rank"]
        unique_together = [["store", "period_month", "rank"], ["store", "period_month", "customer"]]
        indexes = [
            models.Index(fields=["store", "period_month", "rank"]),
        ]


class CustomerIntelligenceAlert(TimeStampedModel):
    """Operational customer alert generated by intelligence rules."""

    class AlertType(models.TextChoices):
        DORMANT = "DORMANT", "Dormant"
        CHURN = "CHURN", "Risque churn"
        CREDIT_RISK = "CREDIT_RISK", "Risque credit"
        NEXT_ORDER = "NEXT_ORDER", "Prochaine commande"

    class Severity(models.TextChoices):
        LOW = "LOW", "Faible"
        MEDIUM = "MEDIUM", "Moyenne"
        HIGH = "HIGH", "Elevee"
        CRITICAL = "CRITICAL", "Critique"

    class Status(models.TextChoices):
        OPEN = "OPEN", "Ouverte"
        ACK = "ACK", "Accusee"
        CLOSED = "CLOSED", "Fermee"

    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        related_name="customer_intelligence_alerts",
    )
    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.CASCADE,
        related_name="intelligence_alerts",
    )
    alert_type = models.CharField(max_length=20, choices=AlertType.choices, db_index=True)
    severity = models.CharField(max_length=10, choices=Severity.choices, default=Severity.MEDIUM, db_index=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.OPEN, db_index=True)
    triggered_at = models.DateTimeField(default=timezone.now, db_index=True)
    context = models.JSONField(default=dict, blank=True)
    assigned_seller = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="assigned_customer_intelligence_alerts",
    )

    class Meta:
        ordering = ["-triggered_at", "-created_at"]
        indexes = [
            models.Index(fields=["store", "alert_type", "status", "triggered_at"]),
        ]


class CustomerRecommendationCache(TimeStampedModel):
    """Persisted cache for product recommendations per customer."""

    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        related_name="customer_recommendation_cache",
    )
    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.CASCADE,
        related_name="recommendation_cache_entries",
    )
    as_of_date = models.DateField(db_index=True)
    window_days = models.PositiveSmallIntegerField(default=90)
    limit = models.PositiveSmallIntegerField(default=5)
    include_only_in_stock = models.BooleanField(default=False)
    payload = models.JSONField(default=dict, blank=True)
    generated_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        ordering = ["-generated_at", "-created_at"]
        unique_together = [
            [
                "store",
                "customer",
                "as_of_date",
                "window_days",
                "limit",
                "include_only_in_stock",
            ]
        ]
        indexes = [
            models.Index(fields=["store", "customer", "as_of_date"]),
            models.Index(fields=["store", "as_of_date", "generated_at"]),
        ]
