"""Models for the seller objectives & leaderboard module."""
from __future__ import annotations

import hashlib
from datetime import date
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone

from core.models import TimeStampedModel


class ObjectiveRule(TimeStampedModel):
    """Versioned rule defining tiers and bonus structure for a store.

    Business rule: only one active rule per store can overlap for a given date.
    Enforced in model validation.
    """

    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        related_name="objective_rules",
        verbose_name="boutique",
    )
    name = models.CharField("nom", max_length=120)
    is_active = models.BooleanField("actif", default=True)
    valid_from = models.DateField("valide du")
    valid_until = models.DateField("valide jusqu'au", null=True, blank=True)
    version = models.PositiveIntegerField("version", default=1)
    notes = models.TextField("notes", blank=True)

    class Meta:
        verbose_name = "regle d'objectif"
        verbose_name_plural = "regles d'objectif"
        ordering = ["-valid_from"]

    def __str__(self) -> str:
        return f"{self.name} v{self.version} ({self.store})"

    def clean(self) -> None:
        if self.valid_until and self.valid_until <= self.valid_from:
            raise ValidationError("La date de fin doit etre posterieure a la date de debut.")
        if not self.store_id or not self.is_active:
            return

        this_end = self.valid_until or date.max
        overlaps = (
            ObjectiveRule.objects.filter(
                store_id=self.store_id,
                is_active=True,
                valid_from__lte=this_end,
            )
            .filter(
                models.Q(valid_until__isnull=True)
                | models.Q(valid_until__gte=self.valid_from)
            )
        )
        if self.pk:
            overlaps = overlaps.exclude(pk=self.pk)
        if overlaps.exists():
            raise ValidationError(
                "Une autre regle active chevauche deja cette periode pour la boutique."
            )


class ObjectiveTier(TimeStampedModel):
    """A tier (palier) within an ObjectiveRule (Bronze, Silver, Gold, Elite)."""

    rule = models.ForeignKey(
        ObjectiveRule,
        on_delete=models.CASCADE,
        related_name="tiers",
        verbose_name="regle",
    )
    name = models.CharField("nom", max_length=60)  # ex: "Bronze", "Argent", "Or", "Elite"
    rank = models.PositiveSmallIntegerField("rang")  # 1=lowest, 4=highest
    threshold = models.DecimalField(
        "seuil (FCFA)",
        max_digits=14,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0"))],
    )
    bonus_amount = models.DecimalField(
        "bonus (FCFA)",
        max_digits=14,
        decimal_places=2,
        default=Decimal("0"),
        validators=[MinValueValidator(Decimal("0"))],
    )
    bonus_rate = models.DecimalField(
        "taux bonus (%)",
        max_digits=5,
        decimal_places=2,
        default=Decimal("0"),
        validators=[MinValueValidator(Decimal("0")), MaxValueValidator(Decimal("100"))],
        help_text="Taux applique si bonus_amount est 0.",
    )
    color = models.CharField("couleur hex", max_length=7, default="#6B7280")
    icon = models.CharField("icone", max_length=50, blank=True)

    class Meta:
        verbose_name = "palier"
        verbose_name_plural = "paliers"
        ordering = ["rank"]
        constraints = [
            models.UniqueConstraint(
                fields=["rule", "rank"],
                name="uniq_tier_rank_per_rule",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.name} ({self.rule})"


class SellerObjective(TimeStampedModel):
    """Per-seller per-period objective, optionally overriding the store rule."""

    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        related_name="seller_objectives",
    )
    seller = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="seller_objectives",
    )
    rule = models.ForeignKey(
        ObjectiveRule,
        on_delete=models.PROTECT,
        related_name="seller_objectives",
        null=True,
        blank=True,
        help_text="Laissez vide pour utiliser la regle active de la boutique.",
    )
    period = models.CharField("periode (YYYY-MM)", max_length=7)  # "2025-01"

    class Meta:
        verbose_name = "objectif vendeur"
        verbose_name_plural = "objectifs vendeurs"
        constraints = [
            models.UniqueConstraint(
                fields=["store", "seller", "period"],
                name="uniq_seller_objective_period",
            ),
        ]
        ordering = ["-period"]

    def __str__(self) -> str:
        return f"{self.seller} — {self.period}"


class SellerMonthlyStats(TimeStampedModel):
    """Aggregated monthly stats for one seller — computed by the engine."""

    class TriggerSource(models.TextChoices):
        PAYMENT = "PAYMENT", "Paiement"
        MANUAL = "MANUAL", "Manuel"
        SCHEDULED = "SCHEDULED", "Planifie"
        CLOSE = "CLOSE", "Cloture"

    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        related_name="seller_monthly_stats",
    )
    seller = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="monthly_stats",
    )
    period = models.CharField("periode (YYYY-MM)", max_length=7)

    # Raw financials
    gross_amount = models.DecimalField(
        "encaissement brut",
        max_digits=14,
        decimal_places=2,
        default=Decimal("0"),
    )
    refund_amount = models.DecimalField(
        "remboursements",
        max_digits=14,
        decimal_places=2,
        default=Decimal("0"),
    )
    sale_count = models.PositiveIntegerField("nb ventes", default=0)
    cancellation_count = models.PositiveIntegerField("nb annulations", default=0)
    avg_basket = models.DecimalField(
        "panier moyen",
        max_digits=14,
        decimal_places=2,
        default=Decimal("0"),
    )
    credit_recovered = models.DecimalField(
        "credit recouvre",
        max_digits=14,
        decimal_places=2,
        default=Decimal("0"),
    )

    # Result
    current_tier_rank = models.PositiveSmallIntegerField("rang palier", default=0)
    current_tier_name = models.CharField("nom palier", max_length=60, blank=True)
    bonus_earned = models.DecimalField(
        "bonus gagne",
        max_digits=14,
        decimal_places=2,
        default=Decimal("0"),
    )

    # Frozen snapshot of the tier thresholds at computation time (JSONB)
    tier_snapshot = models.JSONField("snapshot paliers", default=list)

    # Metadata
    is_final = models.BooleanField("cloture", default=False)
    last_trigger = models.CharField(
        "dernier declencheur",
        max_length=20,
        choices=TriggerSource.choices,
        default=TriggerSource.PAYMENT,
    )
    computed_at = models.DateTimeField("calcule le", null=True, blank=True)

    class Meta:
        verbose_name = "stats mensuelles vendeur"
        verbose_name_plural = "stats mensuelles vendeurs"
        constraints = [
            models.UniqueConstraint(
                fields=["store", "seller", "period"],
                name="uniq_seller_monthly_stats",
            ),
        ]
        ordering = ["-period"]
        indexes = [
            models.Index(fields=["store", "period"]),
            models.Index(fields=["seller", "period"]),
        ]

    @property
    def net_amount(self) -> Decimal:
        """Net encaissement = gross - refunds."""
        return self.gross_amount - self.refund_amount

    def __str__(self) -> str:
        return f"{self.seller} — {self.period} ({self.net_amount} FCFA)"


class SellerBonusHistory(TimeStampedModel):
    """Record of a bonus payment (or cancellation) for audit trail."""

    class BonusStatus(models.TextChoices):
        PENDING = "PENDING", "En attente"
        PAID = "PAID", "Verse"
        CANCELLED = "CANCELLED", "Annule"

    stats = models.ForeignKey(
        SellerMonthlyStats,
        on_delete=models.CASCADE,
        related_name="bonus_history",
    )
    amount = models.DecimalField("montant", max_digits=14, decimal_places=2)
    status = models.CharField(
        "statut",
        max_length=20,
        choices=BonusStatus.choices,
        default=BonusStatus.PENDING,
    )
    paid_at = models.DateTimeField("verse le", null=True, blank=True)
    notes = models.TextField("notes", blank=True)
    paid_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="bonus_payments_made",
    )

    class Meta:
        verbose_name = "historique bonus"
        verbose_name_plural = "historique bonus"
        ordering = ["-created_at"]


class SellerPenaltyType(TimeStampedModel):
    """Type/category of penalty configurable per store."""

    class PenaltyMode(models.TextChoices):
        DEDUCTION = "DEDUCTION", "Deduction fixe"
        HARD_CAP = "HARD_CAP", "Plafonnement de palier"

    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        related_name="penalty_types",
    )
    name = models.CharField("nom", max_length=120)
    mode = models.CharField(
        "mode",
        max_length=20,
        choices=PenaltyMode.choices,
        default=PenaltyMode.DEDUCTION,
    )
    default_amount = models.DecimalField(
        "montant par defaut",
        max_digits=14,
        decimal_places=2,
        default=Decimal("0"),
    )
    cap_tier_rank = models.PositiveSmallIntegerField(
        "palier plafond",
        null=True,
        blank=True,
        help_text="Rang maximal autorise (mode HARD_CAP).",
    )
    is_active = models.BooleanField("actif", default=True)

    class Meta:
        verbose_name = "type de penalite"
        verbose_name_plural = "types de penalites"
        ordering = ["name"]


class SellerPenalty(TimeStampedModel):
    """A penalty applied to a seller for a given period."""

    stats = models.ForeignKey(
        SellerMonthlyStats,
        on_delete=models.CASCADE,
        related_name="penalties",
    )
    penalty_type = models.ForeignKey(
        SellerPenaltyType,
        on_delete=models.PROTECT,
        related_name="penalties",
    )
    amount = models.DecimalField("montant deduction", max_digits=14, decimal_places=2)
    reason = models.TextField("raison", blank=True)
    is_void = models.BooleanField("annulee", default=False)
    voided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="voided_penalties",
    )
    voided_at = models.DateTimeField("annulee le", null=True, blank=True)
    applied_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="applied_penalties",
    )

    class Meta:
        verbose_name = "penalite"
        verbose_name_plural = "penalites"
        ordering = ["-created_at"]


class LeaderboardSettings(TimeStampedModel):
    """Per-store leaderboard display configuration."""

    class VisibilityMode(models.TextChoices):
        FULL = "FULL", "Classement complet (noms visibles)"
        TIER_AND_RANK = "TIER_AND_RANK", "Palier + rang uniquement"
        RANK_ONLY = "RANK_ONLY", "Rang uniquement"
        ANONYMOUS = "ANONYMOUS", "Anonyme"

    store = models.OneToOneField(
        "stores.Store",
        on_delete=models.CASCADE,
        related_name="leaderboard_settings",
    )
    visibility = models.CharField(
        "visibilite",
        max_length=20,
        choices=VisibilityMode.choices,
        default=VisibilityMode.FULL,
    )
    show_amounts = models.BooleanField("afficher les montants", default=True)
    show_tier = models.BooleanField("afficher le palier", default=True)
    refresh_interval_minutes = models.PositiveSmallIntegerField(
        "intervalle de raffraichissement (min)", default=60
    )

    class Meta:
        verbose_name = "parametres classement"
        verbose_name_plural = "parametres classements"


class LeaderboardSnapshot(TimeStampedModel):
    """Cached leaderboard ranking for a store and period."""

    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        related_name="leaderboard_snapshots",
    )
    period = models.CharField("periode (YYYY-MM)", max_length=7)
    data = models.JSONField("donnees classement", default=list)
    computed_at = models.DateTimeField("calcule le", auto_now=True)

    class Meta:
        verbose_name = "snapshot classement"
        verbose_name_plural = "snapshots classement"
        constraints = [
            models.UniqueConstraint(
                fields=["store", "period"],
                name="uniq_leaderboard_snapshot",
            ),
        ]
        ordering = ["-period"]


class SellerSprint(TimeStampedModel):
    """Time-boxed competition between sellers within a store."""

    class SprintStatus(models.TextChoices):
        DRAFT = "DRAFT", "Brouillon"
        ACTIVE = "ACTIVE", "En cours"
        FINISHED = "FINISHED", "Termine"
        CANCELLED = "CANCELLED", "Annule"

    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        related_name="sprints",
    )
    name = models.CharField("nom", max_length=120)
    starts_at = models.DateTimeField("debut")
    ends_at = models.DateTimeField("fin")
    status = models.CharField(
        "statut",
        max_length=20,
        choices=SprintStatus.choices,
        default=SprintStatus.DRAFT,
    )
    prize_description = models.TextField("description du prix", blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_sprints",
    )

    class Meta:
        verbose_name = "sprint"
        verbose_name_plural = "sprints"
        ordering = ["-starts_at"]

    def __str__(self) -> str:
        return f"{self.name} ({self.store})"


class SellerSprintResult(TimeStampedModel):
    """Final result for a seller in a sprint."""

    sprint = models.ForeignKey(
        SellerSprint,
        on_delete=models.CASCADE,
        related_name="results",
    )
    seller = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="sprint_results",
    )
    rank = models.PositiveSmallIntegerField("rang final")
    amount = models.DecimalField(
        "encaissement sprint",
        max_digits=14,
        decimal_places=2,
        default=Decimal("0"),
    )
    is_winner = models.BooleanField("gagnant", default=False)

    class Meta:
        verbose_name = "resultat sprint"
        verbose_name_plural = "resultats sprint"
        constraints = [
            models.UniqueConstraint(
                fields=["sprint", "seller"],
                name="uniq_sprint_result_seller",
            ),
        ]
        ordering = ["rank"]


class SellerBadge(TimeStampedModel):
    """Badge awarded to a seller for a specific achievement."""

    class BadgeType(models.TextChoices):
        BEST_MONTH = "BEST_MONTH", "Meilleur mois"
        SPRINT_WINNER = "SPRINT_WINNER", "Gagnant de sprint"
        MOST_IMPROVED = "MOST_IMPROVED", "Plus grande progression"
        TIER_ELITE = "TIER_ELITE", "Palier Elite atteint"
        CONSISTENCY = "CONSISTENCY", "Regularite (3 mois consecutifs)"
        PERFECT_MONTH = "PERFECT_MONTH", "Mois parfait (0 penalite)"
        CREDIT_CHAMPION = "CREDIT_CHAMPION", "Champion recouvrement credit"

    seller = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="badges",
    )
    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        related_name="badges",
    )
    badge_type = models.CharField(
        "type",
        max_length=30,
        choices=BadgeType.choices,
    )
    period = models.CharField("periode (YYYY-MM)", max_length=7)
    label = models.CharField("libelle", max_length=120, blank=True)
    icon = models.CharField("icone", max_length=50, default="trophy")

    class Meta:
        verbose_name = "badge"
        verbose_name_plural = "badges"
        constraints = [
            models.UniqueConstraint(
                fields=["seller", "store", "badge_type", "period"],
                name="uniq_seller_badge_period",
            ),
        ]
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.badge_type} — {self.seller} ({self.period})"
