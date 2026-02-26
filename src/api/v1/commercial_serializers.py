"""Serializers for Commercial CRM API endpoints."""
from __future__ import annotations

from datetime import datetime

from rest_framework import serializers

from commercial.models import (
    CommercialActivity,
    CommercialFollowUpTask,
    CommercialIncentivePolicy,
    CommercialIncentiveResult,
    CommercialIncentiveRun,
    CommercialIncentiveTier,
    CommercialLeadSource,
    CommercialObjectiveMonthly,
    CommercialOpportunity,
    CommercialProspect,
    CommercialRegion,
    CommercialSector,
    CommercialTag,
)
from stores.models import Store, StoreUser


def _resolve_store_from_serializer_context(serializer) -> Store | None:
    request = serializer.context.get("request")
    if not request:
        return None

    store_id = request.query_params.get("store")
    if not store_id and isinstance(getattr(request, "data", None), dict):
        store_id = request.data.get("store")
    if store_id:
        return Store.objects.filter(pk=store_id, is_active=True).select_related("enterprise").first()
    current_store = getattr(request, "current_store", None)
    if current_store and getattr(current_store, "is_active", True):
        return current_store

    user = getattr(request, "user", None)
    if getattr(user, "is_superuser", False):
        store = Store.objects.filter(is_active=True).select_related("enterprise").order_by("name").first()
        if store:
            return store

    if user and getattr(user, "is_authenticated", False):
        membership = (
            user.store_users
            .filter(store__is_active=True)
            .select_related("store__enterprise")
            .order_by("-is_default", "store_id")
            .first()
        )
        if membership:
            return membership.store
    return None


def _validate_store_membership(*, store: Store | None, user, field_name: str):
    if not store or not user:
        return
    if not StoreUser.objects.filter(store=store, user=user).exists():
        raise serializers.ValidationError({field_name: "L'utilisateur doit appartenir a la boutique."})


def _validate_enterprise_dimensions(*, store: Store | None, attrs: dict, tag_field: str = "tags"):
    if not store:
        return
    enterprise_id = store.enterprise_id

    region = attrs.get("region")
    if region and region.enterprise_id != enterprise_id:
        raise serializers.ValidationError({"region": "La region doit appartenir a la meme entreprise."})
    sector = attrs.get("sector")
    if sector and sector.enterprise_id != enterprise_id:
        raise serializers.ValidationError({"sector": "Le secteur doit appartenir a la meme entreprise."})
    source = attrs.get("source")
    if source and source.enterprise_id != enterprise_id:
        raise serializers.ValidationError({"source": "La source doit appartenir a la meme entreprise."})

    tags = attrs.get(tag_field)
    if tags:
        wrong = [str(tag.id) for tag in tags if tag.enterprise_id != enterprise_id]
        if wrong:
            raise serializers.ValidationError({"tag_ids": "Les tags doivent appartenir a la meme entreprise."})


class CommercialRegionSerializer(serializers.ModelSerializer):
    class Meta:
        model = CommercialRegion
        fields = ["id", "enterprise", "name", "code", "is_active", "created_at", "updated_at"]
        read_only_fields = ["id", "enterprise", "created_at", "updated_at"]


class CommercialSectorSerializer(serializers.ModelSerializer):
    class Meta:
        model = CommercialSector
        fields = ["id", "enterprise", "name", "is_active", "created_at", "updated_at"]
        read_only_fields = ["id", "enterprise", "created_at", "updated_at"]


class CommercialTagSerializer(serializers.ModelSerializer):
    class Meta:
        model = CommercialTag
        fields = ["id", "enterprise", "name", "color", "created_at", "updated_at"]
        read_only_fields = ["id", "enterprise", "created_at", "updated_at"]


class CommercialLeadSourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = CommercialLeadSource
        fields = ["id", "enterprise", "code", "label", "is_active", "created_at", "updated_at"]
        read_only_fields = ["id", "enterprise", "created_at", "updated_at"]


class CommercialProspectSerializer(serializers.ModelSerializer):
    owner_name = serializers.SerializerMethodField()
    tag_ids = serializers.PrimaryKeyRelatedField(
        source="tags",
        queryset=CommercialTag.objects.all(),
        many=True,
        required=False,
    )

    class Meta:
        model = CommercialProspect
        fields = [
            "id",
            "store",
            "owner",
            "owner_name",
            "created_by",
            "company_name",
            "contact_name",
            "phone",
            "email",
            "whatsapp",
            "region",
            "sector",
            "source",
            "status",
            "estimated_potential",
            "score",
            "next_follow_up_at",
            "last_activity_at",
            "converted_customer",
            "tag_ids",
            "extra",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "store", "created_by", "created_at", "updated_at", "last_activity_at"]

    def get_owner_name(self, obj):
        return obj.owner.get_full_name() if obj.owner else None

    def validate(self, attrs):
        store = self.instance.store if self.instance else _resolve_store_from_serializer_context(self)
        owner = attrs.get("owner")
        if owner:
            _validate_store_membership(store=store, user=owner, field_name="owner")
        _validate_enterprise_dimensions(store=store, attrs=attrs)
        return attrs


class CommercialOpportunitySerializer(serializers.ModelSerializer):
    owner_name = serializers.SerializerMethodField()
    prospect_name = serializers.CharField(source="prospect.company_name", read_only=True)
    tag_ids = serializers.PrimaryKeyRelatedField(
        source="tags",
        queryset=CommercialTag.objects.all(),
        many=True,
        required=False,
    )

    class Meta:
        model = CommercialOpportunity
        fields = [
            "id",
            "store",
            "prospect",
            "prospect_name",
            "owner",
            "owner_name",
            "name",
            "stage",
            "probability_pct",
            "estimated_amount",
            "estimated_margin_pct",
            "expected_close_date",
            "closed_at",
            "lost_reason",
            "lost_comment",
            "quote",
            "won_sale",
            "pipeline_order",
            "is_archived",
            "tag_ids",
            "metadata",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "store", "closed_at", "created_at", "updated_at"]

    def get_owner_name(self, obj):
        return obj.owner.get_full_name() if obj.owner else None

    def validate(self, attrs):
        store = self.instance.store if self.instance else _resolve_store_from_serializer_context(self)
        owner = attrs.get("owner")
        if owner:
            _validate_store_membership(store=store, user=owner, field_name="owner")
        _validate_enterprise_dimensions(store=store, attrs=attrs)

        prospect = attrs.get("prospect")
        if prospect and store and prospect.store_id != store.id:
            raise serializers.ValidationError({"prospect": "Le prospect doit appartenir a la meme boutique."})
        quote = attrs.get("quote")
        if quote and store and quote.store_id != store.id:
            raise serializers.ValidationError({"quote": "Le devis doit appartenir a la meme boutique."})
        won_sale = attrs.get("won_sale")
        if won_sale and store and won_sale.store_id != store.id:
            raise serializers.ValidationError({"won_sale": "La vente doit appartenir a la meme boutique."})
        return attrs


class OpportunityMoveStageSerializer(serializers.Serializer):
    ALLOWED_STAGE_TRANSITIONS = {
        CommercialOpportunity.Stage.PROSPECT: {
            CommercialOpportunity.Stage.CONTACTED,
            CommercialOpportunity.Stage.LOST,
        },
        CommercialOpportunity.Stage.CONTACTED: {
            CommercialOpportunity.Stage.RDV,
            CommercialOpportunity.Stage.LOST,
        },
        CommercialOpportunity.Stage.RDV: {
            CommercialOpportunity.Stage.QUOTE_SENT,
            CommercialOpportunity.Stage.LOST,
        },
        CommercialOpportunity.Stage.QUOTE_SENT: {
            CommercialOpportunity.Stage.NEGOTIATION,
            CommercialOpportunity.Stage.WON,
            CommercialOpportunity.Stage.LOST,
        },
        CommercialOpportunity.Stage.NEGOTIATION: {
            CommercialOpportunity.Stage.QUOTE_SENT,
            CommercialOpportunity.Stage.WON,
            CommercialOpportunity.Stage.LOST,
        },
        CommercialOpportunity.Stage.WON: set(),
        CommercialOpportunity.Stage.LOST: set(),
    }

    to_stage = serializers.ChoiceField(choices=CommercialOpportunity.Stage.choices)
    reason = serializers.CharField(required=False, allow_blank=True, default="")
    probability_pct = serializers.IntegerField(min_value=0, max_value=100, required=False)
    lost_reason = serializers.CharField(required=False, allow_blank=True, default="")
    lost_comment = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, attrs):
        current_stage = self.context.get("current_stage")
        to_stage = attrs["to_stage"]
        if not current_stage:
            return attrs
        if to_stage == current_stage:
            raise serializers.ValidationError({"to_stage": "L'opportunite est deja sur cette etape."})
        allowed = self.ALLOWED_STAGE_TRANSITIONS.get(current_stage, set())
        if to_stage not in allowed:
            raise serializers.ValidationError({"to_stage": "Transition de pipeline non autorisee."})
        if to_stage == CommercialOpportunity.Stage.LOST and not attrs.get("lost_reason", "").strip():
            raise serializers.ValidationError({"lost_reason": "Le motif de perte est obligatoire."})
        return attrs


class OpportunityLinkQuoteSerializer(serializers.Serializer):
    quote_id = serializers.UUIDField()


class ProspectQualifySerializer(serializers.Serializer):
    name = serializers.CharField(required=False, allow_blank=True, max_length=255)
    probability_pct = serializers.IntegerField(required=False, min_value=0, max_value=100, default=20)
    estimated_amount = serializers.DecimalField(
        required=False,
        max_digits=14,
        decimal_places=2,
    )
    estimated_margin_pct = serializers.DecimalField(
        required=False,
        max_digits=5,
        decimal_places=2,
        min_value=0,
        max_value=100,
    )
    expected_close_date = serializers.DateField(required=False, allow_null=True)
    pipeline_order = serializers.IntegerField(required=False, min_value=0, default=0)


class OpportunityMarkWonSerializer(serializers.Serializer):
    sale_id = serializers.UUIDField(required=False, allow_null=True)


class CommercialActivitySerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = CommercialActivity
        fields = [
            "id",
            "store",
            "prospect",
            "opportunity",
            "actor",
            "actor_name",
            "type",
            "subject",
            "notes",
            "started_at",
            "ended_at",
            "outcome",
            "next_action_at",
            "metadata",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "store", "actor", "created_at", "updated_at"]

    def get_actor_name(self, obj):
        return obj.actor.get_full_name() if obj.actor else None

    def validate(self, attrs):
        store = self.instance.store if self.instance else _resolve_store_from_serializer_context(self)
        prospect = attrs.get("prospect")
        opportunity = attrs.get("opportunity")

        if not prospect and not opportunity:
            raise serializers.ValidationError("Une activite doit etre liee a un prospect ou une opportunite.")
        if store and prospect and prospect.store_id != store.id:
            raise serializers.ValidationError({"prospect": "Le prospect doit appartenir a la meme boutique."})
        if store and opportunity and opportunity.store_id != store.id:
            raise serializers.ValidationError({"opportunity": "L'opportunite doit appartenir a la meme boutique."})
        return attrs


class CommercialFollowUpTaskSerializer(serializers.ModelSerializer):
    assigned_to_name = serializers.SerializerMethodField()

    class Meta:
        model = CommercialFollowUpTask
        fields = [
            "id",
            "store",
            "assigned_to",
            "assigned_to_name",
            "created_by",
            "prospect",
            "opportunity",
            "title",
            "description",
            "priority",
            "status",
            "due_at",
            "reminder_at",
            "completed_at",
            "metadata",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "store", "created_by", "completed_at", "created_at", "updated_at"]

    def get_assigned_to_name(self, obj):
        return obj.assigned_to.get_full_name() if obj.assigned_to else None

    def validate(self, attrs):
        store = self.instance.store if self.instance else _resolve_store_from_serializer_context(self)
        assigned_to = attrs.get("assigned_to")
        if assigned_to:
            _validate_store_membership(store=store, user=assigned_to, field_name="assigned_to")
        prospect = attrs.get("prospect")
        if store and prospect and prospect.store_id != store.id:
            raise serializers.ValidationError({"prospect": "Le prospect doit appartenir a la meme boutique."})
        opportunity = attrs.get("opportunity")
        if store and opportunity and opportunity.store_id != store.id:
            raise serializers.ValidationError({"opportunity": "L'opportunite doit appartenir a la meme boutique."})
        return attrs


class CommercialObjectiveMonthlySerializer(serializers.ModelSerializer):
    seller_name = serializers.SerializerMethodField()

    class Meta:
        model = CommercialObjectiveMonthly
        fields = [
            "id",
            "store",
            "seller",
            "seller_name",
            "period",
            "target_signed_revenue",
            "target_quoted_revenue",
            "target_win_rate",
            "target_meetings",
            "is_locked",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "store", "created_at", "updated_at"]

    def get_seller_name(self, obj):
        return obj.seller.get_full_name() if obj.seller else None

    def validate_period(self, value: str):
        if len(value) != 7 or value[4] != "-":
            raise serializers.ValidationError("Format attendu YYYY-MM.")
        try:
            datetime.strptime(value, "%Y-%m")
        except ValueError as exc:
            raise serializers.ValidationError("Periode invalide (YYYY-MM).") from exc
        return value

    def validate_target_win_rate(self, value):
        if value < 0 or value > 100:
            raise serializers.ValidationError("Le taux de transformation cible doit etre entre 0 et 100.")
        return value

    def validate(self, attrs):
        store = self.instance.store if self.instance else _resolve_store_from_serializer_context(self)
        seller = attrs.get("seller")
        if seller:
            _validate_store_membership(store=store, user=seller, field_name="seller")
        return attrs


class CommercialIncentiveTierSerializer(serializers.ModelSerializer):
    class Meta:
        model = CommercialIncentiveTier
        fields = [
            "id",
            "policy",
            "rank",
            "name",
            "min_signed_revenue",
            "max_signed_revenue",
            "fixed_bonus",
            "variable_rate_pct",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class CommercialIncentivePolicySerializer(serializers.ModelSerializer):
    tiers = CommercialIncentiveTierSerializer(many=True, read_only=True)

    class Meta:
        model = CommercialIncentivePolicy
        fields = [
            "id",
            "scope",
            "enterprise",
            "store",
            "name",
            "currency",
            "effective_from",
            "effective_to",
            "is_active",
            "min_margin_pct_for_bonus",
            "metadata",
            "tiers",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "enterprise", "store", "created_at", "updated_at"]

    def validate(self, attrs):
        effective_from = attrs.get("effective_from") or getattr(self.instance, "effective_from", None)
        effective_to = attrs.get("effective_to") if "effective_to" in attrs else getattr(self.instance, "effective_to", None)
        if effective_from and effective_to and effective_to < effective_from:
            raise serializers.ValidationError({"effective_to": "La date de fin doit etre >= a la date de debut."})
        return attrs


class CommercialIncentiveRunSerializer(serializers.ModelSerializer):
    class Meta:
        model = CommercialIncentiveRun
        fields = [
            "id",
            "store",
            "period",
            "policy",
            "status",
            "computed_by",
            "approved_by",
            "computed_at",
            "approved_at",
            "paid_at",
            "summary_json",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "store",
            "computed_by",
            "approved_by",
            "computed_at",
            "approved_at",
            "paid_at",
            "created_at",
            "updated_at",
        ]


class CommercialIncentiveResultSerializer(serializers.ModelSerializer):
    seller_name = serializers.SerializerMethodField()

    class Meta:
        model = CommercialIncentiveResult
        fields = [
            "id",
            "run",
            "seller",
            "seller_name",
            "signed_revenue",
            "quoted_revenue",
            "win_rate",
            "meeting_count",
            "avg_margin_pct",
            "tier_name",
            "base_bonus",
            "objective_bonus",
            "margin_bonus",
            "penalty",
            "final_bonus",
            "explain_json",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_seller_name(self, obj):
        return obj.seller.get_full_name() if obj.seller else None


class IncentiveTierCreateSerializer(serializers.Serializer):
    rank = serializers.IntegerField(min_value=1)
    name = serializers.CharField(max_length=60)
    min_signed_revenue = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=0)
    max_signed_revenue = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=0, required=False, allow_null=True)
    fixed_bonus = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=0, required=False, default=0)
    variable_rate_pct = serializers.DecimalField(max_digits=5, decimal_places=2, min_value=0, max_value=100, required=False, default=0)

    def validate(self, attrs):
        max_value = attrs.get("max_signed_revenue")
        min_value = attrs["min_signed_revenue"]
        if max_value is not None and max_value < min_value:
            raise serializers.ValidationError({"max_signed_revenue": "Doit etre >= min_signed_revenue."})
        return attrs


class IncentiveComputeSerializer(serializers.Serializer):
    period = serializers.RegexField(regex=r"^\d{4}-\d{2}$", required=False)
    policy = serializers.UUIDField(required=False, allow_null=True)

    def validate_period(self, value: str):
        try:
            datetime.strptime(value, "%Y-%m")
        except ValueError as exc:
            raise serializers.ValidationError("Periode invalide (YYYY-MM).") from exc
        return value
