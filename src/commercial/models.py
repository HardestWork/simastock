"""Models for the Commercial (Sales CRM) module."""
from __future__ import annotations

from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from core.models import TimeStampedModel


class CommercialTeamMembership(TimeStampedModel):
    """Manager -> seller links used to scope team visibility."""

    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        related_name="commercial_team_memberships",
    )
    manager = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="commercial_team_memberships_as_manager",
    )
    seller = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="commercial_team_memberships_as_seller",
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "commercial team membership"
        verbose_name_plural = "commercial team memberships"
        constraints = [
            models.UniqueConstraint(
                fields=["store", "manager", "seller"],
                name="uniq_commercial_team_membership",
            ),
        ]
        indexes = [
            models.Index(fields=["store", "manager", "is_active"]),
            models.Index(fields=["store", "seller", "is_active"]),
        ]

    def clean(self):
        if self.manager_id and self.seller_id and self.manager_id == self.seller_id:
            raise ValidationError("Manager and seller must be different users.")


class CommercialRegion(TimeStampedModel):
    """Commercial region dimension at enterprise scope."""

    enterprise = models.ForeignKey(
        "stores.Enterprise",
        on_delete=models.CASCADE,
        related_name="commercial_regions",
    )
    name = models.CharField(max_length=120)
    code = models.CharField(max_length=40)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["enterprise", "code"],
                name="uniq_commercial_region_code",
            ),
            models.UniqueConstraint(
                fields=["enterprise", "name"],
                name="uniq_commercial_region_name",
            ),
        ]


class CommercialSector(TimeStampedModel):
    """Business sector dimension at enterprise scope."""

    enterprise = models.ForeignKey(
        "stores.Enterprise",
        on_delete=models.CASCADE,
        related_name="commercial_sectors",
    )
    name = models.CharField(max_length=120)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["enterprise", "name"],
                name="uniq_commercial_sector_name",
            ),
        ]


class CommercialTag(TimeStampedModel):
    """Free tags used on prospects/opportunities."""

    enterprise = models.ForeignKey(
        "stores.Enterprise",
        on_delete=models.CASCADE,
        related_name="commercial_tags",
    )
    name = models.CharField(max_length=80)
    color = models.CharField(max_length=7, default="#0EA5E9")

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["enterprise", "name"],
                name="uniq_commercial_tag_name",
            ),
        ]


class CommercialLeadSource(TimeStampedModel):
    """Lead source catalog per enterprise."""

    class Code(models.TextChoices):
        MANUAL = "MANUAL", "Manual"
        FORM = "FORM", "Form"
        CSV = "CSV", "CSV import"
        API = "API", "API"

    enterprise = models.ForeignKey(
        "stores.Enterprise",
        on_delete=models.CASCADE,
        related_name="commercial_lead_sources",
    )
    code = models.CharField(max_length=20, choices=Code.choices)
    label = models.CharField(max_length=80)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["label"]
        constraints = [
            models.UniqueConstraint(
                fields=["enterprise", "code"],
                name="uniq_commercial_lead_source_code",
            ),
        ]


class CommercialProspect(TimeStampedModel):
    """B2B prospect tracked in a given store."""

    class Status(models.TextChoices):
        NEW = "NEW", "New"
        QUALIFIED = "QUALIFIED", "Qualified"
        DISQUALIFIED = "DISQUALIFIED", "Disqualified"
        CONVERTED = "CONVERTED", "Converted"

    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.PROTECT,
        related_name="commercial_prospects",
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="commercial_prospects_owned",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="commercial_prospects_created",
    )
    company_name = models.CharField(max_length=255)
    contact_name = models.CharField(max_length=255, blank=True, default="")
    phone = models.CharField(max_length=40, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    whatsapp = models.CharField(max_length=40, blank=True, default="")
    region = models.ForeignKey(
        CommercialRegion,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="prospects",
    )
    sector = models.ForeignKey(
        CommercialSector,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="prospects",
    )
    source = models.ForeignKey(
        CommercialLeadSource,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="prospects",
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.NEW, db_index=True)
    estimated_potential = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    score = models.PositiveSmallIntegerField(
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
    )
    next_follow_up_at = models.DateTimeField(null=True, blank=True, db_index=True)
    last_activity_at = models.DateTimeField(null=True, blank=True, db_index=True)
    converted_customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="commercial_prospect_sources",
    )
    tags = models.ManyToManyField(CommercialTag, related_name="prospects", blank=True)
    extra = models.JSONField(default=dict, blank=True)
    notes = models.TextField(blank=True, default="")

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["store", "status", "owner"]),
            models.Index(fields=["store", "next_follow_up_at"]),
            models.Index(fields=["store", "last_activity_at"]),
        ]

    def clean(self):
        enterprise_id = getattr(self.store, "enterprise_id", None)
        if self.region_id and enterprise_id and self.region.enterprise_id != enterprise_id:
            raise ValidationError({"region": "Region enterprise mismatch."})
        if self.sector_id and enterprise_id and self.sector.enterprise_id != enterprise_id:
            raise ValidationError({"sector": "Sector enterprise mismatch."})
        if self.source_id and enterprise_id and self.source.enterprise_id != enterprise_id:
            raise ValidationError({"source": "Lead source enterprise mismatch."})


class CommercialOpportunity(TimeStampedModel):
    """Opportunity pipeline item owned by one salesperson."""

    class Stage(models.TextChoices):
        PROSPECT = "PROSPECT", "Prospect"
        CONTACTED = "CONTACTED", "Contacted"
        RDV = "RDV", "Meeting"
        QUOTE_SENT = "QUOTE_SENT", "Quote sent"
        NEGOTIATION = "NEGOTIATION", "Negotiation"
        WON = "WON", "Won"
        LOST = "LOST", "Lost"

    STAGE_ORDER = {
        Stage.PROSPECT: 10,
        Stage.CONTACTED: 20,
        Stage.RDV: 30,
        Stage.QUOTE_SENT: 40,
        Stage.NEGOTIATION: 50,
        Stage.WON: 60,
        Stage.LOST: 70,
    }

    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.PROTECT,
        related_name="commercial_opportunities",
    )
    prospect = models.ForeignKey(
        CommercialProspect,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="opportunities",
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="commercial_opportunities_owned",
    )
    name = models.CharField(max_length=255)
    stage = models.CharField(max_length=20, choices=Stage.choices, default=Stage.PROSPECT, db_index=True)
    probability_pct = models.PositiveSmallIntegerField(
        default=20,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
    )
    estimated_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    estimated_margin_pct = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=[MinValueValidator(Decimal("0.00")), MaxValueValidator(Decimal("100.00"))],
    )
    expected_close_date = models.DateField(null=True, blank=True, db_index=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    lost_reason = models.CharField(max_length=180, blank=True, default="")
    lost_comment = models.TextField(blank=True, default="")
    quote = models.ForeignKey(
        "sales.Quote",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="commercial_opportunities",
    )
    won_sale = models.ForeignKey(
        "sales.Sale",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="commercial_opportunities",
    )
    pipeline_order = models.IntegerField(default=0)
    is_archived = models.BooleanField(default=False)
    tags = models.ManyToManyField(CommercialTag, related_name="opportunities", blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["stage", "pipeline_order", "-updated_at"]
        indexes = [
            models.Index(fields=["store", "stage", "owner"]),
            models.Index(fields=["store", "owner", "expected_close_date"]),
            models.Index(fields=["store", "pipeline_order"]),
        ]

    def clean(self):
        if self.prospect_id and self.prospect.store_id != self.store_id:
            raise ValidationError({"prospect": "Prospect must belong to the same store."})
        if self.quote_id and self.quote.store_id != self.store_id:
            raise ValidationError({"quote": "Quote must belong to the same store."})
        if self.won_sale_id and self.won_sale.store_id != self.store_id:
            raise ValidationError({"won_sale": "Sale must belong to the same store."})


class CommercialOpportunityStageHistory(TimeStampedModel):
    """Immutable stage transition log for opportunities."""

    opportunity = models.ForeignKey(
        CommercialOpportunity,
        on_delete=models.CASCADE,
        related_name="stage_history",
    )
    from_stage = models.CharField(max_length=20, choices=CommercialOpportunity.Stage.choices, blank=True, default="")
    to_stage = models.CharField(max_length=20, choices=CommercialOpportunity.Stage.choices)
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="commercial_stage_changes",
    )
    reason = models.CharField(max_length=255, blank=True, default="")
    details = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["opportunity", "created_at"]),
        ]


class CommercialActivity(TimeStampedModel):
    """Commercial activity log (call, meeting, email, whatsapp, note)."""

    class Type(models.TextChoices):
        CALL = "CALL", "Call"
        VISIT = "VISIT", "Visit"
        EMAIL = "EMAIL", "Email"
        WHATSAPP = "WHATSAPP", "WhatsApp"
        NOTE = "NOTE", "Note"
        MEETING = "MEETING", "Meeting"

    class Outcome(models.TextChoices):
        SUCCESS = "SUCCESS", "Success"
        INTERESTED = "INTERESTED", "Interested"
        NEUTRAL = "NEUTRAL", "Neutral"
        NO_ANSWER = "NO_ANSWER", "No answer"
        BLOCKED = "BLOCKED", "Blocked"

    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.PROTECT,
        related_name="commercial_activities",
    )
    prospect = models.ForeignKey(
        CommercialProspect,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="activities",
    )
    opportunity = models.ForeignKey(
        CommercialOpportunity,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="activities",
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="commercial_activities_logged",
    )
    type = models.CharField(max_length=20, choices=Type.choices)
    subject = models.CharField(max_length=255)
    notes = models.TextField(blank=True, default="")
    started_at = models.DateTimeField()
    ended_at = models.DateTimeField(null=True, blank=True)
    outcome = models.CharField(max_length=20, choices=Outcome.choices, default=Outcome.NEUTRAL)
    next_action_at = models.DateTimeField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-started_at"]
        indexes = [
            models.Index(fields=["store", "actor", "started_at"]),
            models.Index(fields=["store", "opportunity", "started_at"]),
            models.Index(fields=["store", "next_action_at"]),
        ]

    def clean(self):
        if not self.prospect_id and not self.opportunity_id:
            raise ValidationError("Activity must be linked to a prospect or an opportunity.")
        if self.prospect_id and self.prospect.store_id != self.store_id:
            raise ValidationError({"prospect": "Prospect must belong to the same store."})
        if self.opportunity_id and self.opportunity.store_id != self.store_id:
            raise ValidationError({"opportunity": "Opportunity must belong to the same store."})


class CommercialActivityAttachment(TimeStampedModel):
    """Files attached to a commercial activity."""

    activity = models.ForeignKey(
        CommercialActivity,
        on_delete=models.CASCADE,
        related_name="attachments",
    )
    file = models.FileField(upload_to="commercial/activities/")
    file_name = models.CharField(max_length=255, blank=True, default="")
    mime_type = models.CharField(max_length=100, blank=True, default="")
    size = models.PositiveIntegerField(default=0)


class CommercialFollowUpTask(TimeStampedModel):
    """Follow-up tasks and reminders for CRM execution."""

    class Priority(models.TextChoices):
        LOW = "LOW", "Low"
        MEDIUM = "MEDIUM", "Medium"
        HIGH = "HIGH", "High"

    class Status(models.TextChoices):
        TODO = "TODO", "Todo"
        IN_PROGRESS = "IN_PROGRESS", "In progress"
        DONE = "DONE", "Done"
        OVERDUE = "OVERDUE", "Overdue"
        CANCELLED = "CANCELLED", "Cancelled"

    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.PROTECT,
        related_name="commercial_followup_tasks",
    )
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="commercial_followup_tasks_assigned",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="commercial_followup_tasks_created",
    )
    prospect = models.ForeignKey(
        CommercialProspect,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="followup_tasks",
    )
    opportunity = models.ForeignKey(
        CommercialOpportunity,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="followup_tasks",
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    priority = models.CharField(max_length=10, choices=Priority.choices, default=Priority.MEDIUM)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.TODO, db_index=True)
    due_at = models.DateTimeField(db_index=True)
    reminder_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["status", "due_at"]
        indexes = [
            models.Index(fields=["store", "assigned_to", "status", "due_at"]),
            models.Index(fields=["store", "status", "due_at"]),
        ]

    def clean(self):
        if self.prospect_id and self.prospect.store_id != self.store_id:
            raise ValidationError({"prospect": "Prospect must belong to the same store."})
        if self.opportunity_id and self.opportunity.store_id != self.store_id:
            raise ValidationError({"opportunity": "Opportunity must belong to the same store."})


class CommercialImportJob(TimeStampedModel):
    """Prospect import execution metadata."""

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        RUNNING = "RUNNING", "Running"
        DONE = "DONE", "Done"
        FAILED = "FAILED", "Failed"

    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        related_name="commercial_import_jobs",
    )
    started_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="commercial_import_jobs_started",
    )
    source_file = models.CharField(max_length=255)
    mapping = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    total_rows = models.PositiveIntegerField(default=0)
    success_rows = models.PositiveIntegerField(default=0)
    error_rows = models.PositiveIntegerField(default=0)
    report_file = models.CharField(max_length=255, blank=True, default="")
    error_message = models.TextField(blank=True, default="")
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)


class CommercialImportErrorRow(TimeStampedModel):
    """Per-row import errors with raw payload."""

    job = models.ForeignKey(
        CommercialImportJob,
        on_delete=models.CASCADE,
        related_name="error_rows_detail",
    )
    row_number = models.PositiveIntegerField()
    raw_payload = models.JSONField(default=dict, blank=True)
    error_message = models.TextField()


class CommercialObjectiveMonthly(TimeStampedModel):
    """Monthly objective targets per seller."""

    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        related_name="commercial_objectives",
    )
    seller = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="commercial_objectives",
    )
    period = models.CharField(max_length=7)
    target_signed_revenue = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    target_quoted_revenue = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    target_win_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0.00"))
    target_meetings = models.PositiveIntegerField(default=0)
    is_locked = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["store", "seller", "period"],
                name="uniq_commercial_objective_monthly",
            ),
        ]
        indexes = [
            models.Index(fields=["store", "period"]),
        ]


class CommercialIncentivePolicy(TimeStampedModel):
    """Incentive policy (global or store scoped) with effective period."""

    class Scope(models.TextChoices):
        GLOBAL = "GLOBAL", "Global"
        STORE = "STORE", "Store"

    scope = models.CharField(max_length=10, choices=Scope.choices)
    enterprise = models.ForeignKey(
        "stores.Enterprise",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="commercial_incentive_policies",
    )
    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="commercial_incentive_policies",
    )
    name = models.CharField(max_length=120)
    currency = models.CharField(max_length=10, default="FCFA")
    effective_from = models.DateField()
    effective_to = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    min_margin_pct_for_bonus = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=[MinValueValidator(Decimal("0.00")), MaxValueValidator(Decimal("100.00"))],
    )
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["scope", "is_active", "effective_from"]),
            models.Index(fields=["store", "is_active", "effective_from"]),
        ]

    def clean(self):
        if self.scope == self.Scope.GLOBAL and not self.enterprise_id:
            raise ValidationError({"enterprise": "Global policy requires enterprise."})
        if self.scope == self.Scope.GLOBAL and self.store_id:
            raise ValidationError({"store": "Global policy cannot target a store."})
        if self.scope == self.Scope.STORE and not self.store_id:
            raise ValidationError({"store": "Store policy requires store."})
        if self.effective_to and self.effective_to < self.effective_from:
            raise ValidationError({"effective_to": "effective_to must be >= effective_from."})


class CommercialIncentiveTier(TimeStampedModel):
    """Revenue tiers used as base bonus."""

    policy = models.ForeignKey(
        CommercialIncentivePolicy,
        on_delete=models.CASCADE,
        related_name="tiers",
    )
    rank = models.PositiveSmallIntegerField()
    name = models.CharField(max_length=60)
    min_signed_revenue = models.DecimalField(max_digits=14, decimal_places=2)
    max_signed_revenue = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    fixed_bonus = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    variable_rate_pct = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=[MinValueValidator(Decimal("0.00")), MaxValueValidator(Decimal("100.00"))],
    )

    class Meta:
        ordering = ["rank"]
        constraints = [
            models.UniqueConstraint(fields=["policy", "rank"], name="uniq_commercial_incentive_tier_rank"),
        ]


class CommercialIncentiveRun(TimeStampedModel):
    """Monthly incentive run for a store."""

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        CALCULATED = "CALCULATED", "Calculated"
        APPROVED = "APPROVED", "Approved"
        PAID = "PAID", "Paid"

    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        related_name="commercial_incentive_runs",
    )
    period = models.CharField(max_length=7)
    policy = models.ForeignKey(
        CommercialIncentivePolicy,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="runs",
    )
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.DRAFT)
    computed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="commercial_incentive_runs_computed",
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="commercial_incentive_runs_approved",
    )
    computed_at = models.DateTimeField(null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    summary_json = models.JSONField(default=dict, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["store", "period"], name="uniq_commercial_incentive_run"),
        ]
        indexes = [
            models.Index(fields=["store", "period", "status"]),
        ]


class CommercialIncentiveResult(TimeStampedModel):
    """Final computed incentive per seller for one run."""

    run = models.ForeignKey(
        CommercialIncentiveRun,
        on_delete=models.CASCADE,
        related_name="results",
    )
    seller = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="commercial_incentive_results",
    )
    signed_revenue = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    quoted_revenue = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    win_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0.00"))
    meeting_count = models.PositiveIntegerField(default=0)
    avg_margin_pct = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0.00"))
    tier_name = models.CharField(max_length=60, blank=True, default="")
    base_bonus = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    objective_bonus = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    margin_bonus = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    penalty = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    final_bonus = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    explain_json = models.JSONField(default=dict, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["run", "seller"], name="uniq_commercial_incentive_result"),
        ]


class CommercialHealthSnapshot(TimeStampedModel):
    """Computed commercial health score per seller/month."""

    class RiskLevel(models.TextChoices):
        LOW = "LOW", "Low"
        MEDIUM = "MEDIUM", "Medium"
        HIGH = "HIGH", "High"

    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        related_name="commercial_health_snapshots",
    )
    seller = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="commercial_health_snapshots",
    )
    period = models.CharField(max_length=7)
    score_overall = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0.00"))
    score_pipeline = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0.00"))
    score_activity = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0.00"))
    score_conversion = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0.00"))
    score_margin = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0.00"))
    score_forecast = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0.00"))
    risk_level = models.CharField(max_length=10, choices=RiskLevel.choices, default=RiskLevel.MEDIUM)
    factors_json = models.JSONField(default=dict, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["store", "seller", "period"], name="uniq_commercial_health_snapshot"),
        ]


class CommercialAISignal(TimeStampedModel):
    """Actionable AI signal emitted for a seller/opportunity."""

    class Severity(models.TextChoices):
        INFO = "INFO", "Info"
        WARN = "WARN", "Warn"
        CRITICAL = "CRITICAL", "Critical"

    class Status(models.TextChoices):
        OPEN = "OPEN", "Open"
        DISMISSED = "DISMISSED", "Dismissed"
        DONE = "DONE", "Done"

    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        related_name="commercial_ai_signals",
    )
    seller = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="commercial_ai_signals",
    )
    opportunity = models.ForeignKey(
        CommercialOpportunity,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ai_signals",
    )
    signal_type = models.CharField(max_length=80)
    severity = models.CharField(max_length=10, choices=Severity.choices, default=Severity.INFO)
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    recommended_action = models.TextField(blank=True, default="")
    due_by = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.OPEN)
    source_payload = models.JSONField(default=dict, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["store", "status", "severity"]),
            models.Index(fields=["store", "due_by"]),
        ]
