"""Models for intelligent analytics across sales, stock, credit and fraud."""
from decimal import Decimal

from django.conf import settings
from django.db import models

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

