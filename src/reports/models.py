"""Models for the reports app."""
from django.db import models

from core.models import TimeStampedModel


class KPISnapshot(TimeStampedModel):
    """Daily snapshot of key performance indicators for a store.

    Captured once per day (typically by the ``daily_kpi_snapshot`` Celery task)
    so that historical trends can be displayed on dashboards and reports without
    recalculating from raw data each time.
    """

    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        related_name="kpi_snapshots",
        verbose_name="boutique",
    )
    date = models.DateField("date")

    # Revenue
    total_sales = models.DecimalField(
        "total ventes",
        max_digits=14,
        decimal_places=2,
        default=0,
    )
    total_orders = models.IntegerField(
        "nombre de commandes",
        default=0,
    )
    average_basket = models.DecimalField(
        "panier moyen",
        max_digits=14,
        decimal_places=2,
        default=0,
    )
    gross_margin = models.DecimalField(
        "marge brute",
        max_digits=14,
        decimal_places=2,
        default=0,
    )

    # Deductions
    total_discounts = models.DecimalField(
        "total remises",
        max_digits=14,
        decimal_places=2,
        default=0,
    )
    total_refunds = models.DecimalField(
        "total remboursements",
        max_digits=14,
        decimal_places=2,
        default=0,
    )
    net_sales = models.DecimalField(
        "ventes nettes",
        max_digits=14,
        decimal_places=2,
        default=0,
    )

    # Outstanding
    credit_outstanding = models.DecimalField(
        "encours credit",
        max_digits=14,
        decimal_places=2,
        default=0,
    )
    stock_value = models.DecimalField(
        "valeur du stock",
        max_digits=14,
        decimal_places=2,
        default=0,
    )

    class Meta:
        verbose_name = "Snapshot KPI"
        verbose_name_plural = "Snapshots KPI"
        ordering = ["-date"]
        unique_together = [["store", "date"]]

    def __str__(self):
        return f"KPI {self.store} — {self.date}"
