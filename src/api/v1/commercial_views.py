"""ViewSets and endpoints for Commercial CRM module."""
from __future__ import annotations

import csv
import logging
from datetime import date, datetime, timedelta
from io import BytesIO, StringIO
from decimal import Decimal

from django.db import transaction
from django.db.models import Avg, Case, IntegerField, Q, Sum, Value, When
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from api.v1.commercial_serializers import (
    CommercialActivitySerializer,
    CommercialFollowUpTaskSerializer,
    CommercialIncentivePolicySerializer,
    CommercialIncentiveResultSerializer,
    CommercialIncentiveRunSerializer,
    IncentiveComputeSerializer,
    IncentiveTierCreateSerializer,
    CommercialLeadSourceSerializer,
    OpportunityMarkWonSerializer,
    CommercialObjectiveMonthlySerializer,
    CommercialOpportunitySerializer,
    CommercialProspectSerializer,
    CommercialRegionSerializer,
    CommercialSectorSerializer,
    CommercialTagSerializer,
    ProspectQualifySerializer,
    OpportunityLinkQuoteSerializer,
    OpportunityMoveStageSerializer,
)
from api.v1.pagination import StandardResultsSetPagination
from api.v1.permissions import (
    CanApproveCommercialBonus,
    CanExportCommercial,
    CanLogCommercialActivity,
    CanManageLeads,
    CanManageOpportunities,
    CanViewCommercialTeam,
    FeatureCommercialExportsEnabled,
    FeatureCommercialIncentivesEnabled,
    FeatureCommercialPipelineEnabled,
    IsManagerOrAdmin,
    ModuleCommercialEnabled,
)
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
    CommercialOpportunityStageHistory,
    CommercialProspect,
    CommercialRegion,
    CommercialSector,
    CommercialTag,
    CommercialTeamMembership,
)
from sales.models import Quote, Sale
from stores.models import Store, StoreUser
from stores.services import create_audit_log

logger = logging.getLogger("boutique")


def _resolve_store(request):
    store_id = request.query_params.get("store")
    if not store_id and isinstance(request.data, dict):
        store_id = request.data.get("store")
    if store_id:
        store = Store.objects.filter(pk=store_id, is_active=True).first()
        if not store:
            raise ValidationError({"store": "Boutique introuvable."})
        if not request.user.is_superuser and not request.user.store_users.filter(store=store).exists():
            raise PermissionDenied("Vous n'avez pas acces a cette boutique.")
        return store

    current_store = getattr(request, "current_store", None)
    if current_store:
        return current_store

    if request.user.is_superuser:
        store = Store.objects.filter(is_active=True).order_by("name").first()
        if store:
            return store

    membership = (
        request.user.store_users
        .filter(store__is_active=True)
        .select_related("store")
        .order_by("-is_default", "store_id")
        .first()
    )
    if membership:
        return membership.store
    raise PermissionDenied("Aucune boutique active disponible pour cet utilisateur.")


def _scope_q_for_user(user, store, owner_field: str):
    if getattr(user, "is_superuser", False) or getattr(user, "role", None) == "ADMIN":
        return Q()
    if getattr(user, "role", None) == "MANAGER":
        team_ids = list(
            CommercialTeamMembership.objects.filter(
                store=store, manager=user, is_active=True
            ).values_list("seller_id", flat=True)
        )
        team_ids.append(user.id)
        return Q(**{f"{owner_field}__in": team_ids})
    return Q(**{owner_field: user.id})


def _is_manager_or_admin(user):
    return bool(getattr(user, "is_superuser", False) or getattr(user, "role", None) in ("ADMIN", "MANAGER"))


def _visible_seller_ids_for_user(user, store):
    if getattr(user, "is_superuser", False) or getattr(user, "role", None) == "ADMIN":
        return None
    if getattr(user, "role", None) == "MANAGER":
        seller_ids = list(
            CommercialTeamMembership.objects.filter(
                store=store,
                manager=user,
                is_active=True,
            ).values_list("seller_id", flat=True)
        )
        seller_ids.append(user.id)
        return sorted(set(seller_ids))
    return [user.id]


def _check_owner_assignable(request, store, owner):
    if request.user.is_superuser:
        return
    if not StoreUser.objects.filter(store=store, user=owner).exists():
        raise ValidationError({"owner": "Le proprietaire doit appartenir a la boutique."})


def _get_period_bounds(period: str):
    start, end = _month_bounds(period)
    return start, end, end - timedelta(days=1)


def _policy_is_effective_for_period(policy, *, period_start, period_end):
    if policy.effective_from and policy.effective_from > period_end:
        return False
    if policy.effective_to and policy.effective_to < period_start:
        return False
    return True


def _is_eligible_incentive_seller(store, membership: StoreUser):
    if membership.user.role not in ("SALES", "COMMERCIAL"):
        return False
    if store.is_feature_enabled("advanced_permissions"):
        return (
            membership.has_capability("CAN_MANAGE_OPPORTUNITIES")
            or membership.has_capability("CAN_MANAGE_LEADS")
        )
    return True


class _EnterpriseScopedMetadataViewSet(viewsets.ModelViewSet):
    """Base for region/sector/tag/source metadata."""

    permission_classes = [IsAuthenticated, ModuleCommercialEnabled, FeatureCommercialPipelineEnabled]
    pagination_class = StandardResultsSetPagination

    def get_permissions(self):
        base = [IsAuthenticated(), ModuleCommercialEnabled(), FeatureCommercialPipelineEnabled()]
        if self.action in ("create", "update", "partial_update", "destroy"):
            return base + [IsManagerOrAdmin()]
        return base + [CanManageLeads()]

    def get_queryset(self):
        store = _resolve_store(self.request)
        return super().get_queryset().filter(enterprise_id=store.enterprise_id)

    def perform_create(self, serializer):
        store = _resolve_store(self.request)
        obj = serializer.save(enterprise_id=store.enterprise_id)
        create_audit_log(
            actor=self.request.user,
            store=store,
            action=f"COMMERCIAL_META_{obj.__class__.__name__.upper()}_CREATE",
            entity_type=obj.__class__.__name__,
            entity_id=str(obj.id),
            after={"name": getattr(obj, "name", None), "label": getattr(obj, "label", None)},
        )

    def perform_update(self, serializer):
        store = _resolve_store(self.request)
        instance = self.get_object()
        before = {"name": getattr(instance, "name", None), "label": getattr(instance, "label", None)}
        obj = serializer.save(enterprise_id=instance.enterprise_id)
        create_audit_log(
            actor=self.request.user,
            store=store,
            action=f"COMMERCIAL_META_{obj.__class__.__name__.upper()}_UPDATE",
            entity_type=obj.__class__.__name__,
            entity_id=str(obj.id),
            before=before,
            after={"name": getattr(obj, "name", None), "label": getattr(obj, "label", None)},
        )

    def perform_destroy(self, instance):
        store = _resolve_store(self.request)
        create_audit_log(
            actor=self.request.user,
            store=store,
            action=f"COMMERCIAL_META_{instance.__class__.__name__.upper()}_DELETE",
            entity_type=instance.__class__.__name__,
            entity_id=str(instance.id),
            before={"name": getattr(instance, "name", None), "label": getattr(instance, "label", None)},
        )
        super().perform_destroy(instance)


class CommercialRegionViewSet(_EnterpriseScopedMetadataViewSet):
    serializer_class = CommercialRegionSerializer
    queryset = CommercialRegion.objects.all().order_by("name")
    filterset_fields = ["is_active"]
    search_fields = ["name", "code"]


class CommercialSectorViewSet(_EnterpriseScopedMetadataViewSet):
    serializer_class = CommercialSectorSerializer
    queryset = CommercialSector.objects.all().order_by("name")
    filterset_fields = ["is_active"]
    search_fields = ["name"]


class CommercialTagViewSet(_EnterpriseScopedMetadataViewSet):
    serializer_class = CommercialTagSerializer
    queryset = CommercialTag.objects.all().order_by("name")
    search_fields = ["name"]


class CommercialLeadSourceViewSet(_EnterpriseScopedMetadataViewSet):
    serializer_class = CommercialLeadSourceSerializer
    queryset = CommercialLeadSource.objects.all().order_by("label")
    filterset_fields = ["is_active", "code"]
    search_fields = ["label"]


class CommercialProspectViewSet(viewsets.ModelViewSet):
    """CRUD + qualify action for prospects."""

    serializer_class = CommercialProspectSerializer
    queryset = CommercialProspect.objects.select_related("store", "owner", "region", "sector", "source")
    pagination_class = StandardResultsSetPagination
    filterset_fields = ["status", "owner", "region", "sector", "source"]
    search_fields = ["company_name", "contact_name", "phone", "email"]
    ordering_fields = ["created_at", "score", "next_follow_up_at", "company_name"]

    def get_permissions(self):
        base = [IsAuthenticated(), ModuleCommercialEnabled(), FeatureCommercialPipelineEnabled()]
        if self.action == "qualify":
            return base + [CanManageOpportunities()]
        return base + [CanManageLeads()]

    def get_queryset(self):
        store = _resolve_store(self.request)
        qs = self.queryset.filter(store=store)
        qs = qs.filter(_scope_q_for_user(self.request.user, store, "owner_id"))
        owner = self.request.query_params.get("owner")
        if owner and (self.request.user.role in ("ADMIN", "MANAGER") or self.request.user.is_superuser):
            qs = qs.filter(owner_id=owner)
        return qs

    def perform_create(self, serializer):
        store = _resolve_store(self.request)
        owner = serializer.validated_data.get("owner") or self.request.user
        _check_owner_assignable(self.request, store, owner)
        prospect = serializer.save(store=store, created_by=self.request.user, owner=owner)
        create_audit_log(
            actor=self.request.user,
            store=store,
            action="COMMERCIAL_PROSPECT_CREATE",
            entity_type="CommercialProspect",
            entity_id=str(prospect.id),
            after={"company_name": prospect.company_name, "owner_id": str(prospect.owner_id)},
        )

    def perform_update(self, serializer):
        prospect = self.get_object()
        store = prospect.store
        owner = serializer.validated_data.get("owner", prospect.owner)
        _check_owner_assignable(self.request, store, owner)
        before = {
            "owner_id": str(prospect.owner_id),
            "status": prospect.status,
            "company_name": prospect.company_name,
        }
        updated = serializer.save(store=prospect.store, owner=owner)
        create_audit_log(
            actor=self.request.user,
            store=store,
            action="COMMERCIAL_PROSPECT_UPDATE",
            entity_type="CommercialProspect",
            entity_id=str(updated.id),
            before=before,
            after={
                "owner_id": str(updated.owner_id),
                "status": updated.status,
                "company_name": updated.company_name,
            },
        )

    def perform_destroy(self, instance):
        create_audit_log(
            actor=self.request.user,
            store=instance.store,
            action="COMMERCIAL_PROSPECT_DELETE",
            entity_type="CommercialProspect",
            entity_id=str(instance.id),
            before={"company_name": instance.company_name, "owner_id": str(instance.owner_id)},
        )
        super().perform_destroy(instance)

    @action(detail=True, methods=["post"])
    def qualify(self, request, pk=None):
        prospect = self.get_object()
        if prospect.status == CommercialProspect.Status.DISQUALIFIED:
            raise ValidationError({"detail": "Prospect disqualifie."})
        existing_opportunity = (
            CommercialOpportunity.objects.filter(prospect=prospect)
            .order_by("-created_at")
            .first()
        )
        if prospect.status in (
            CommercialProspect.Status.QUALIFIED,
            CommercialProspect.Status.CONVERTED,
        ) or existing_opportunity:
            raise ValidationError(
                {
                    "detail": "Ce prospect est deja qualifie.",
                    **(
                        {"opportunity_id": str(existing_opportunity.id)}
                        if existing_opportunity
                        else {}
                    ),
                }
            )

        payload_serializer = ProspectQualifySerializer(data=request.data if isinstance(request.data, dict) else {})
        payload_serializer.is_valid(raise_exception=True)
        payload = payload_serializer.validated_data

        owner = prospect.owner
        with transaction.atomic():
            opportunity = CommercialOpportunity.objects.create(
                store=prospect.store,
                prospect=prospect,
                owner=owner,
                name=payload.get("name") or f"Opportunity - {prospect.company_name}",
                stage=CommercialOpportunity.Stage.PROSPECT,
                probability_pct=payload.get("probability_pct", 20),
                estimated_amount=payload.get("estimated_amount") or prospect.estimated_potential,
                estimated_margin_pct=payload.get("estimated_margin_pct") or Decimal("0.00"),
                expected_close_date=payload.get("expected_close_date"),
                pipeline_order=payload.get("pipeline_order", 0),
            )
            opportunity.tags.set(prospect.tags.all())
            prospect.status = CommercialProspect.Status.QUALIFIED
            prospect.save(update_fields=["status", "updated_at"])
            CommercialOpportunityStageHistory.objects.create(
                opportunity=opportunity,
                from_stage="",
                to_stage=CommercialOpportunity.Stage.PROSPECT,
                changed_by=request.user,
                reason="Qualified from prospect",
            )
        create_audit_log(
            actor=request.user,
            store=prospect.store,
            action="COMMERCIAL_PROSPECT_QUALIFY",
            entity_type="CommercialProspect",
            entity_id=str(prospect.id),
            after={"opportunity_id": str(opportunity.id)},
        )
        return Response(CommercialOpportunitySerializer(opportunity).data, status=status.HTTP_201_CREATED)


class CommercialOpportunityViewSet(viewsets.ModelViewSet):
    """CRUD + pipeline actions for opportunities."""

    serializer_class = CommercialOpportunitySerializer
    queryset = CommercialOpportunity.objects.select_related("store", "owner", "prospect", "quote", "won_sale")
    pagination_class = StandardResultsSetPagination
    filterset_fields = ["stage", "owner", "prospect", "is_archived"]
    search_fields = ["name"]
    ordering_fields = ["created_at", "updated_at", "estimated_amount", "probability_pct", "expected_close_date", "pipeline_order"]

    def get_permissions(self):
        base = [IsAuthenticated(), ModuleCommercialEnabled(), FeatureCommercialPipelineEnabled()]
        return base + [CanManageOpportunities()]

    def get_queryset(self):
        store = _resolve_store(self.request)
        qs = self.queryset.filter(store=store)
        return qs.filter(_scope_q_for_user(self.request.user, store, "owner_id"))

    def perform_create(self, serializer):
        store = _resolve_store(self.request)
        owner = serializer.validated_data.get("owner") or self.request.user
        _check_owner_assignable(self.request, store, owner)
        opportunity = serializer.save(store=store, owner=owner)
        CommercialOpportunityStageHistory.objects.create(
            opportunity=opportunity,
            from_stage="",
            to_stage=opportunity.stage,
            changed_by=self.request.user,
            reason="Opportunity created",
        )
        create_audit_log(
            actor=self.request.user,
            store=store,
            action="COMMERCIAL_OPPORTUNITY_CREATE",
            entity_type="CommercialOpportunity",
            entity_id=str(opportunity.id),
            after={"stage": opportunity.stage, "owner_id": str(opportunity.owner_id)},
        )

    def perform_update(self, serializer):
        opportunity = self.get_object()
        store = opportunity.store
        owner = serializer.validated_data.get("owner", opportunity.owner)
        _check_owner_assignable(self.request, store, owner)
        before = {
            "stage": opportunity.stage,
            "owner_id": str(opportunity.owner_id),
            "estimated_amount": str(opportunity.estimated_amount),
            "probability_pct": opportunity.probability_pct,
        }
        updated = serializer.save(store=opportunity.store, owner=owner)
        create_audit_log(
            actor=self.request.user,
            store=store,
            action="COMMERCIAL_OPPORTUNITY_UPDATE",
            entity_type="CommercialOpportunity",
            entity_id=str(updated.id),
            before=before,
            after={
                "stage": updated.stage,
                "owner_id": str(updated.owner_id),
                "estimated_amount": str(updated.estimated_amount),
                "probability_pct": updated.probability_pct,
            },
        )

    def perform_destroy(self, instance):
        create_audit_log(
            actor=self.request.user,
            store=instance.store,
            action="COMMERCIAL_OPPORTUNITY_DELETE",
            entity_type="CommercialOpportunity",
            entity_id=str(instance.id),
            before={"stage": instance.stage, "owner_id": str(instance.owner_id), "name": instance.name},
        )
        super().perform_destroy(instance)

    @action(detail=True, methods=["post"], url_path="move-stage")
    def move_stage(self, request, pk=None):
        opportunity = self.get_object()
        serializer = OpportunityMoveStageSerializer(
            data=request.data,
            context={"current_stage": opportunity.stage},
        )
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        old_stage = opportunity.stage
        new_stage = data["to_stage"]
        opportunity.stage = new_stage
        if "probability_pct" in data:
            opportunity.probability_pct = data["probability_pct"]
        if new_stage == CommercialOpportunity.Stage.LOST:
            opportunity.lost_reason = data.get("lost_reason", "")
            opportunity.lost_comment = data.get("lost_comment", "")
            opportunity.probability_pct = data.get("probability_pct", 0)
            opportunity.closed_at = timezone.now()
        elif new_stage == CommercialOpportunity.Stage.WON:
            opportunity.probability_pct = data.get("probability_pct", 100)
            opportunity.closed_at = timezone.now()
        else:
            opportunity.lost_reason = ""
            opportunity.lost_comment = ""
            opportunity.closed_at = None
        opportunity.save()

        CommercialOpportunityStageHistory.objects.create(
            opportunity=opportunity,
            from_stage=old_stage,
            to_stage=new_stage,
            changed_by=request.user,
            reason=data.get("reason", ""),
        )
        create_audit_log(
            actor=request.user,
            store=opportunity.store,
            action="COMMERCIAL_OPPORTUNITY_MOVE_STAGE",
            entity_type="CommercialOpportunity",
            entity_id=str(opportunity.id),
            before={"stage": old_stage},
            after={"stage": new_stage},
        )
        return Response(self.get_serializer(opportunity).data)

    @action(detail=True, methods=["post"], url_path="link-quote")
    def link_quote(self, request, pk=None):
        opportunity = self.get_object()
        serializer = OpportunityLinkQuoteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        quote = Quote.objects.filter(pk=serializer.validated_data["quote_id"]).first()
        if not quote:
            raise ValidationError({"quote_id": "Devis introuvable."})
        if quote.store_id != opportunity.store_id:
            raise ValidationError({"quote_id": "Le devis doit appartenir a la meme boutique."})

        old_stage = opportunity.stage
        old_quote_id = opportunity.quote_id
        opportunity.quote = quote
        if CommercialOpportunity.STAGE_ORDER[opportunity.stage] < CommercialOpportunity.STAGE_ORDER[CommercialOpportunity.Stage.QUOTE_SENT]:
            opportunity.stage = CommercialOpportunity.Stage.QUOTE_SENT
        opportunity.save(update_fields=["quote", "stage", "updated_at"])

        if old_stage != opportunity.stage:
            CommercialOpportunityStageHistory.objects.create(
                opportunity=opportunity,
                from_stage=old_stage,
                to_stage=opportunity.stage,
                changed_by=request.user,
                reason="Quote linked",
            )
        create_audit_log(
            actor=request.user,
            store=opportunity.store,
            action="COMMERCIAL_OPPORTUNITY_LINK_QUOTE",
            entity_type="CommercialOpportunity",
            entity_id=str(opportunity.id),
            before={"quote_id": str(old_quote_id) if old_quote_id else None, "stage": old_stage},
            after={"quote_id": str(quote.id), "stage": opportunity.stage},
        )
        return Response(self.get_serializer(opportunity).data)

    @action(detail=True, methods=["post"], url_path="mark-won")
    def mark_won(self, request, pk=None):
        opportunity = self.get_object()
        payload_serializer = OpportunityMarkWonSerializer(data=request.data if isinstance(request.data, dict) else {})
        payload_serializer.is_valid(raise_exception=True)
        sale_id = payload_serializer.validated_data.get("sale_id")
        sale = None
        if sale_id:
            sale = Sale.objects.filter(pk=sale_id).first()
            if not sale:
                raise ValidationError({"sale_id": "Vente introuvable."})
            if sale.store_id != opportunity.store_id:
                raise ValidationError({"sale_id": "La vente doit appartenir a la meme boutique."})

        old_stage = opportunity.stage
        opportunity.stage = CommercialOpportunity.Stage.WON
        opportunity.probability_pct = 100
        opportunity.won_sale = sale
        opportunity.closed_at = timezone.now()
        opportunity.save(update_fields=["stage", "probability_pct", "won_sale", "closed_at", "updated_at"])
        CommercialOpportunityStageHistory.objects.create(
            opportunity=opportunity,
            from_stage=old_stage,
            to_stage=CommercialOpportunity.Stage.WON,
            changed_by=request.user,
            reason="Marked as won",
        )
        create_audit_log(
            actor=request.user,
            store=opportunity.store,
            action="COMMERCIAL_OPPORTUNITY_MARK_WON",
            entity_type="CommercialOpportunity",
            entity_id=str(opportunity.id),
            before={"stage": old_stage, "won_sale_id": None},
            after={"stage": opportunity.stage, "won_sale_id": str(sale.id) if sale else None},
        )
        return Response(self.get_serializer(opportunity).data)


class CommercialActivityViewSet(viewsets.ModelViewSet):
    """CRUD for activities."""

    serializer_class = CommercialActivitySerializer
    queryset = CommercialActivity.objects.select_related("store", "actor", "prospect", "opportunity")
    pagination_class = StandardResultsSetPagination
    filterset_fields = ["type", "actor", "prospect", "opportunity", "outcome"]
    search_fields = ["subject", "notes"]
    ordering_fields = ["started_at", "created_at"]

    def get_permissions(self):
        return [IsAuthenticated(), ModuleCommercialEnabled(), FeatureCommercialPipelineEnabled(), CanLogCommercialActivity()]

    def get_queryset(self):
        store = _resolve_store(self.request)
        qs = self.queryset.filter(store=store)
        return qs.filter(_scope_q_for_user(self.request.user, store, "actor_id"))

    def perform_create(self, serializer):
        store = _resolve_store(self.request)
        activity = serializer.save(store=store, actor=self.request.user)
        if activity.prospect_id:
            CommercialProspect.objects.filter(pk=activity.prospect_id).update(last_activity_at=activity.started_at)
        create_audit_log(
            actor=self.request.user,
            store=store,
            action="COMMERCIAL_ACTIVITY_CREATE",
            entity_type="CommercialActivity",
            entity_id=str(activity.id),
            after={"type": activity.type, "prospect_id": str(activity.prospect_id) if activity.prospect_id else None},
        )

    def perform_update(self, serializer):
        activity = self.get_object()
        before = {
            "type": activity.type,
            "prospect_id": str(activity.prospect_id) if activity.prospect_id else None,
            "opportunity_id": str(activity.opportunity_id) if activity.opportunity_id else None,
        }
        updated = serializer.save(store=activity.store, actor=activity.actor)
        if updated.prospect_id:
            CommercialProspect.objects.filter(pk=updated.prospect_id).update(last_activity_at=updated.started_at)
        create_audit_log(
            actor=self.request.user,
            store=updated.store,
            action="COMMERCIAL_ACTIVITY_UPDATE",
            entity_type="CommercialActivity",
            entity_id=str(updated.id),
            before=before,
            after={
                "type": updated.type,
                "prospect_id": str(updated.prospect_id) if updated.prospect_id else None,
                "opportunity_id": str(updated.opportunity_id) if updated.opportunity_id else None,
            },
        )

    def perform_destroy(self, instance):
        create_audit_log(
            actor=self.request.user,
            store=instance.store,
            action="COMMERCIAL_ACTIVITY_DELETE",
            entity_type="CommercialActivity",
            entity_id=str(instance.id),
            before={"type": instance.type},
        )
        super().perform_destroy(instance)


class CommercialFollowUpTaskViewSet(viewsets.ModelViewSet):
    """CRUD for follow-up tasks."""

    serializer_class = CommercialFollowUpTaskSerializer
    queryset = CommercialFollowUpTask.objects.select_related("store", "assigned_to", "prospect", "opportunity")
    pagination_class = StandardResultsSetPagination
    filterset_fields = ["status", "priority", "assigned_to", "prospect", "opportunity"]
    search_fields = ["title", "description"]
    ordering_fields = ["due_at", "created_at", "updated_at"]

    def get_permissions(self):
        return [IsAuthenticated(), ModuleCommercialEnabled(), FeatureCommercialPipelineEnabled(), CanLogCommercialActivity()]

    def get_queryset(self):
        store = _resolve_store(self.request)
        qs = self.queryset.filter(store=store)
        return qs.filter(_scope_q_for_user(self.request.user, store, "assigned_to_id"))

    def perform_create(self, serializer):
        store = _resolve_store(self.request)
        task = serializer.save(store=store, created_by=self.request.user)
        create_audit_log(
            actor=self.request.user,
            store=store,
            action="COMMERCIAL_TASK_CREATE",
            entity_type="CommercialFollowUpTask",
            entity_id=str(task.id),
            after={"status": task.status, "assigned_to": str(task.assigned_to_id)},
        )

    def perform_update(self, serializer):
        task = self.get_object()
        before = {"status": task.status, "assigned_to": str(task.assigned_to_id), "due_at": task.due_at.isoformat()}
        updated = serializer.save(store=task.store, created_by=task.created_by)
        create_audit_log(
            actor=self.request.user,
            store=task.store,
            action="COMMERCIAL_TASK_UPDATE",
            entity_type="CommercialFollowUpTask",
            entity_id=str(updated.id),
            before=before,
            after={
                "status": updated.status,
                "assigned_to": str(updated.assigned_to_id),
                "due_at": updated.due_at.isoformat(),
            },
        )

    def perform_destroy(self, instance):
        create_audit_log(
            actor=self.request.user,
            store=instance.store,
            action="COMMERCIAL_TASK_DELETE",
            entity_type="CommercialFollowUpTask",
            entity_id=str(instance.id),
            before={"status": instance.status, "assigned_to": str(instance.assigned_to_id)},
        )
        super().perform_destroy(instance)

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        task = self.get_object()
        if task.status == CommercialFollowUpTask.Status.DONE:
            return Response(self.get_serializer(task).data)
        old_status = task.status
        task.status = CommercialFollowUpTask.Status.DONE
        task.completed_at = timezone.now()
        task.save(update_fields=["status", "completed_at", "updated_at"])
        create_audit_log(
            actor=request.user,
            store=task.store,
            action="COMMERCIAL_TASK_COMPLETE",
            entity_type="CommercialFollowUpTask",
            entity_id=str(task.id),
            before={"status": old_status},
            after={"status": task.status, "completed_at": task.completed_at.isoformat()},
        )
        return Response(self.get_serializer(task).data)


def _month_bounds(period: str):
    try:
        parsed = datetime.strptime(period, "%Y-%m")
    except ValueError as exc:
        raise ValidationError({"period": "Periode invalide (YYYY-MM)."}) from exc
    year, month = parsed.year, parsed.month
    start = date(year, month, 1)
    if month == 12:
        end = date(year + 1, 1, 1)
    else:
        end = date(year, month + 1, 1)
    return start, end


def _current_period():
    today = timezone.localdate()
    return f"{today.year}-{today.month:02d}"


class CommercialObjectiveMonthlyViewSet(viewsets.ModelViewSet):
    """Targets per seller/month."""

    serializer_class = CommercialObjectiveMonthlySerializer
    queryset = CommercialObjectiveMonthly.objects.select_related("store", "seller")
    pagination_class = StandardResultsSetPagination
    filterset_fields = ["seller", "period", "is_locked"]
    ordering_fields = ["period", "seller", "created_at"]

    def get_permissions(self):
        base = [
            IsAuthenticated(),
            ModuleCommercialEnabled(),
            FeatureCommercialPipelineEnabled(),
            CanManageOpportunities(),
        ]
        if self.action in ("create", "update", "partial_update", "destroy"):
            return base + [CanViewCommercialTeam()]
        return base

    def get_queryset(self):
        store = _resolve_store(self.request)
        qs = self.queryset.filter(store=store).order_by("-period", "-created_at")
        return qs.filter(_scope_q_for_user(self.request.user, store, "seller_id"))

    def perform_create(self, serializer):
        store = _resolve_store(self.request)
        row = serializer.save(store=store)
        create_audit_log(
            actor=self.request.user,
            store=store,
            action="COMMERCIAL_OBJECTIVE_CREATE",
            entity_type="CommercialObjectiveMonthly",
            entity_id=str(row.id),
            after={"seller_id": str(row.seller_id), "period": row.period},
        )

    def perform_update(self, serializer):
        row = self.get_object()
        before = {
            "target_signed_revenue": str(row.target_signed_revenue),
            "target_quoted_revenue": str(row.target_quoted_revenue),
            "target_win_rate": str(row.target_win_rate),
            "target_meetings": row.target_meetings,
        }
        updated = serializer.save(store=row.store)
        create_audit_log(
            actor=self.request.user,
            store=row.store,
            action="COMMERCIAL_OBJECTIVE_UPDATE",
            entity_type="CommercialObjectiveMonthly",
            entity_id=str(updated.id),
            before=before,
            after={
                "target_signed_revenue": str(updated.target_signed_revenue),
                "target_quoted_revenue": str(updated.target_quoted_revenue),
                "target_win_rate": str(updated.target_win_rate),
                "target_meetings": updated.target_meetings,
            },
        )

    def perform_destroy(self, instance):
        create_audit_log(
            actor=self.request.user,
            store=instance.store,
            action="COMMERCIAL_OBJECTIVE_DELETE",
            entity_type="CommercialObjectiveMonthly",
            entity_id=str(instance.id),
            before={"seller_id": str(instance.seller_id), "period": instance.period},
        )
        super().perform_destroy(instance)


class CommercialIncentivePolicyViewSet(viewsets.ModelViewSet):
    """CRUD for incentive policies."""

    serializer_class = CommercialIncentivePolicySerializer
    queryset = CommercialIncentivePolicy.objects.select_related("enterprise", "store").prefetch_related("tiers")
    pagination_class = StandardResultsSetPagination
    filterset_fields = ["scope", "is_active"]
    ordering_fields = ["effective_from", "created_at"]

    def get_permissions(self):
        return [
            IsAuthenticated(),
            ModuleCommercialEnabled(),
            FeatureCommercialIncentivesEnabled(),
            CanApproveCommercialBonus(),
        ]

    def get_queryset(self):
        store = _resolve_store(self.request)
        return self.queryset.filter(Q(store=store) | Q(scope=CommercialIncentivePolicy.Scope.GLOBAL, enterprise=store.enterprise))

    def perform_create(self, serializer):
        store = _resolve_store(self.request)
        scope = serializer.validated_data["scope"]
        if scope == CommercialIncentivePolicy.Scope.STORE:
            policy = serializer.save(store=store, enterprise=store.enterprise)
        else:
            policy = serializer.save(enterprise=store.enterprise, store=None)
        create_audit_log(
            actor=self.request.user,
            store=store,
            action="COMMERCIAL_INCENTIVE_POLICY_CREATE",
            entity_type="CommercialIncentivePolicy",
            entity_id=str(policy.id),
            after={"scope": policy.scope, "name": policy.name, "is_active": policy.is_active},
        )

    def perform_update(self, serializer):
        policy = self.get_object()
        store = _resolve_store(self.request)
        before = {
            "name": policy.name,
            "scope": policy.scope,
            "effective_from": policy.effective_from.isoformat(),
            "effective_to": policy.effective_to.isoformat() if policy.effective_to else None,
            "is_active": policy.is_active,
        }
        if policy.scope == CommercialIncentivePolicy.Scope.STORE:
            updated = serializer.save(scope=policy.scope, store=policy.store, enterprise=policy.enterprise)
        else:
            updated = serializer.save(scope=policy.scope, store=None, enterprise=policy.enterprise)
        create_audit_log(
            actor=self.request.user,
            store=store,
            action="COMMERCIAL_INCENTIVE_POLICY_UPDATE",
            entity_type="CommercialIncentivePolicy",
            entity_id=str(updated.id),
            before=before,
            after={
                "name": updated.name,
                "scope": updated.scope,
                "effective_from": updated.effective_from.isoformat(),
                "effective_to": updated.effective_to.isoformat() if updated.effective_to else None,
                "is_active": updated.is_active,
            },
        )

    def perform_destroy(self, instance):
        store = _resolve_store(self.request)
        create_audit_log(
            actor=self.request.user,
            store=store,
            action="COMMERCIAL_INCENTIVE_POLICY_DELETE",
            entity_type="CommercialIncentivePolicy",
            entity_id=str(instance.id),
            before={"scope": instance.scope, "name": instance.name},
        )
        super().perform_destroy(instance)

    @action(detail=True, methods=["post"], url_path="tiers")
    def add_tier(self, request, pk=None):
        policy = self.get_object()
        payload = IncentiveTierCreateSerializer(data=request.data if isinstance(request.data, dict) else {})
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        tier = CommercialIncentiveTier.objects.create(
            policy=policy,
            rank=data["rank"],
            name=data["name"],
            min_signed_revenue=data["min_signed_revenue"],
            max_signed_revenue=data.get("max_signed_revenue"),
            fixed_bonus=data["fixed_bonus"],
            variable_rate_pct=data["variable_rate_pct"],
        )
        create_audit_log(
            actor=request.user,
            store=policy.store or _resolve_store(request),
            action="COMMERCIAL_INCENTIVE_TIER_CREATE",
            entity_type="CommercialIncentiveTier",
            entity_id=str(tier.id),
            after={"policy_id": str(policy.id), "name": tier.name, "rank": tier.rank},
        )
        return Response(
            {
                "id": str(tier.id),
                "policy": str(policy.id),
                "rank": tier.rank,
                "name": tier.name,
                "min_signed_revenue": str(tier.min_signed_revenue),
                "max_signed_revenue": str(tier.max_signed_revenue) if tier.max_signed_revenue is not None else None,
                "fixed_bonus": str(tier.fixed_bonus),
                "variable_rate_pct": str(tier.variable_rate_pct),
            },
            status=status.HTTP_201_CREATED,
        )


class CommercialIncentiveRunViewSet(viewsets.ModelViewSet):
    """Run/approve monthly incentive computation."""

    serializer_class = CommercialIncentiveRunSerializer
    queryset = CommercialIncentiveRun.objects.select_related("store", "policy", "computed_by", "approved_by")
    pagination_class = StandardResultsSetPagination
    filterset_fields = ["period", "status"]
    ordering_fields = ["period", "updated_at", "created_at"]

    def get_permissions(self):
        base = [IsAuthenticated(), ModuleCommercialEnabled(), FeatureCommercialIncentivesEnabled()]
        if self.action in ("list", "retrieve", "results"):
            return base + [CanManageOpportunities()]
        return base + [CanApproveCommercialBonus()]

    def get_queryset(self):
        store = _resolve_store(self.request)
        qs = self.queryset.filter(store=store)
        visible_seller_ids = _visible_seller_ids_for_user(self.request.user, store)
        if visible_seller_ids is None:
            return qs
        return qs.filter(results__seller_id__in=visible_seller_ids).distinct()

    def perform_create(self, serializer):
        store = _resolve_store(self.request)
        run = serializer.save(store=store)
        create_audit_log(
            actor=self.request.user,
            store=store,
            action="COMMERCIAL_INCENTIVE_RUN_CREATE",
            entity_type="CommercialIncentiveRun",
            entity_id=str(run.id),
            after={"period": run.period, "status": run.status},
        )

    def perform_update(self, serializer):
        run = self.get_object()
        before = {"status": run.status, "policy_id": str(run.policy_id) if run.policy_id else None}
        updated = serializer.save(store=run.store)
        create_audit_log(
            actor=self.request.user,
            store=run.store,
            action="COMMERCIAL_INCENTIVE_RUN_UPDATE",
            entity_type="CommercialIncentiveRun",
            entity_id=str(updated.id),
            before=before,
            after={"status": updated.status, "policy_id": str(updated.policy_id) if updated.policy_id else None},
        )

    def perform_destroy(self, instance):
        create_audit_log(
            actor=self.request.user,
            store=instance.store,
            action="COMMERCIAL_INCENTIVE_RUN_DELETE",
            entity_type="CommercialIncentiveRun",
            entity_id=str(instance.id),
            before={"period": instance.period, "status": instance.status},
        )
        super().perform_destroy(instance)

    @action(detail=False, methods=["post"], url_path="compute")
    def compute(self, request):
        store = _resolve_store(request)
        payload_serializer = IncentiveComputeSerializer(data=request.data if isinstance(request.data, dict) else {})
        payload_serializer.is_valid(raise_exception=True)
        period = payload_serializer.validated_data.get("period") or _current_period()
        policy_id = payload_serializer.validated_data.get("policy")
        period_start, period_end_exclusive, period_end = _get_period_bounds(period)

        policy_base_q = Q(store=store) | Q(
            scope=CommercialIncentivePolicy.Scope.GLOBAL,
            enterprise=store.enterprise,
        )
        if policy_id:
            policy = CommercialIncentivePolicy.objects.filter(pk=policy_id).filter(policy_base_q).first()
            if not policy:
                raise ValidationError({"policy": "Policy introuvable pour cette boutique/entreprise."})
        else:
            policy = (
                CommercialIncentivePolicy.objects.filter(policy_base_q, is_active=True)
                .filter(
                    effective_from__lte=period_end,
                )
                .filter(Q(effective_to__isnull=True) | Q(effective_to__gte=period_start))
                .annotate(
                    scope_priority=Case(
                        When(scope=CommercialIncentivePolicy.Scope.STORE, then=Value(1)),
                        default=Value(0),
                        output_field=IntegerField(),
                    )
                )
                .order_by("-scope_priority", "-effective_from", "-created_at")
                .first()
            )
        if not policy:
            raise ValidationError({"policy": "Aucune policy active trouvee."})
        if not _policy_is_effective_for_period(policy, period_start=period_start, period_end=period_end):
            raise ValidationError({"policy": "La policy selectionnee n'est pas applicable a cette periode."})

        with transaction.atomic():
            run, _created = CommercialIncentiveRun.objects.get_or_create(
                store=store,
                period=period,
                defaults={"policy": policy},
            )
            if run.status in (CommercialIncentiveRun.Status.APPROVED, CommercialIncentiveRun.Status.PAID):
                raise ValidationError({"detail": "Run deja approuve/paye."})
            run.policy = policy
            run.status = CommercialIncentiveRun.Status.CALCULATED
            run.computed_by = request.user
            run.computed_at = timezone.now()
            run.save(update_fields=["policy", "status", "computed_by", "computed_at", "updated_at"])

            CommercialIncentiveResult.objects.filter(run=run).delete()
            memberships = list(
                StoreUser.objects.filter(store=store, user__is_active=True)
                .select_related("user")
                .distinct()
            )
            eligible_memberships = [m for m in memberships if _is_eligible_incentive_seller(store, m)]
            if not eligible_memberships:
                raise ValidationError({"detail": "Aucun commercial eligible pour le calcul des primes."})

            tiers = list(policy.tiers.order_by("rank"))
            margin_bonus_rate_pct = Decimal(str(policy.metadata.get("margin_bonus_rate_pct", "10")))
            objective_bonus_rate_pct = Decimal(str(policy.metadata.get("objective_bonus_rate_pct", "15")))
            objective_min_achievement_pct = Decimal(str(policy.metadata.get("objective_min_achievement_pct", "80")))

            for membership in eligible_memberships:
                seller = membership.user
                closed_qs = CommercialOpportunity.objects.filter(
                    store=store,
                    owner=seller,
                    closed_at__date__gte=period_start,
                    closed_at__date__lt=period_end_exclusive,
                )
                won_qs = closed_qs.filter(stage=CommercialOpportunity.Stage.WON)
                signed_revenue = sum(
                    (row.won_sale.total if row.won_sale_id else row.estimated_amount)
                    for row in won_qs.select_related("won_sale")
                ) or Decimal("0.00")
                quoted_revenue = (
                    CommercialOpportunity.objects.filter(
                        store=store,
                        owner=seller,
                        stage__in=[
                            CommercialOpportunity.Stage.QUOTE_SENT,
                            CommercialOpportunity.Stage.NEGOTIATION,
                            CommercialOpportunity.Stage.WON,
                        ],
                        updated_at__date__gte=period_start,
                        updated_at__date__lt=period_end_exclusive,
                    )
                    .aggregate(total=Sum("estimated_amount"))
                    .get("total")
                    or Decimal("0.00")
                )
                closed_count = closed_qs.count()
                won_count = won_qs.count()
                win_rate = Decimal("0.00")
                if closed_count > 0:
                    win_rate = (Decimal(won_count) / Decimal(closed_count) * Decimal("100")).quantize(Decimal("0.01"))
                meeting_count = CommercialActivity.objects.filter(
                    store=store,
                    actor=seller,
                    type__in=[CommercialActivity.Type.MEETING, CommercialActivity.Type.VISIT],
                    started_at__date__gte=period_start,
                    started_at__date__lt=period_end_exclusive,
                ).count()
                avg_margin = won_qs.aggregate(avg=Avg("estimated_margin_pct")).get("avg") or Decimal("0.00")

                selected_tier = None
                for tier in tiers:
                    if signed_revenue >= tier.min_signed_revenue and (
                        tier.max_signed_revenue is None or signed_revenue <= tier.max_signed_revenue
                    ):
                        selected_tier = tier
                base_bonus = Decimal("0.00")
                if selected_tier:
                    base_bonus = selected_tier.fixed_bonus + (
                        signed_revenue * selected_tier.variable_rate_pct / Decimal("100")
                    )
                base_bonus = base_bonus.quantize(Decimal("0.01"))

                objective = CommercialObjectiveMonthly.objects.filter(
                    store=store,
                    seller=seller,
                    period=period,
                ).first()
                objective_ratio_components = []
                if objective:
                    if objective.target_signed_revenue > 0:
                        objective_ratio_components.append(
                            min(Decimal("100"), signed_revenue * Decimal("100") / objective.target_signed_revenue)
                        )
                    if objective.target_quoted_revenue > 0:
                        objective_ratio_components.append(
                            min(Decimal("100"), quoted_revenue * Decimal("100") / objective.target_quoted_revenue)
                        )
                    if objective.target_win_rate > 0:
                        objective_ratio_components.append(
                            min(Decimal("100"), win_rate * Decimal("100") / objective.target_win_rate)
                        )
                    if objective.target_meetings > 0:
                        objective_ratio_components.append(
                            min(Decimal("100"), Decimal(meeting_count) * Decimal("100") / Decimal(objective.target_meetings))
                        )

                objective_achievement_pct = Decimal("0.00")
                if objective_ratio_components:
                    objective_achievement_pct = (
                        sum(objective_ratio_components) / Decimal(len(objective_ratio_components))
                    ).quantize(Decimal("0.01"))
                objective_bonus = Decimal("0.00")
                if objective_achievement_pct >= objective_min_achievement_pct:
                    objective_bonus = (base_bonus * objective_bonus_rate_pct / Decimal("100")).quantize(Decimal("0.01"))

                margin_bonus = Decimal("0.00")
                if avg_margin >= policy.min_margin_pct_for_bonus:
                    margin_bonus = (base_bonus * margin_bonus_rate_pct / Decimal("100")).quantize(Decimal("0.01"))

                final_bonus = (base_bonus + objective_bonus + margin_bonus).quantize(Decimal("0.01"))
                CommercialIncentiveResult.objects.create(
                    run=run,
                    seller=seller,
                    signed_revenue=signed_revenue,
                    quoted_revenue=quoted_revenue,
                    win_rate=win_rate,
                    meeting_count=meeting_count,
                    avg_margin_pct=avg_margin,
                    tier_name=selected_tier.name if selected_tier else "",
                    base_bonus=base_bonus,
                    objective_bonus=objective_bonus,
                    margin_bonus=margin_bonus,
                    penalty=Decimal("0.00"),
                    final_bonus=final_bonus,
                    explain_json={
                        "tier": selected_tier.name if selected_tier else None,
                        "signed_revenue": str(signed_revenue),
                        "quoted_revenue": str(quoted_revenue),
                        "win_rate_pct": str(win_rate),
                        "meeting_count": meeting_count,
                        "avg_margin_pct": str(avg_margin),
                        "objective_achievement_pct": str(objective_achievement_pct),
                        "objective_bonus_rate_pct": str(objective_bonus_rate_pct),
                        "objective_min_achievement_pct": str(objective_min_achievement_pct),
                        "margin_bonus_rate_pct": str(margin_bonus_rate_pct),
                    },
                )

            run.summary_json = {
                "results_count": run.results.count(),
                "eligible_sellers_count": len(eligible_memberships),
            }
            run.save(update_fields=["summary_json", "updated_at"])
        create_audit_log(
            actor=request.user,
            store=store,
            action="COMMERCIAL_INCENTIVE_RUN_COMPUTE",
            entity_type="CommercialIncentiveRun",
            entity_id=str(run.id),
            after={"period": run.period, "policy_id": str(policy.id), "status": run.status},
        )
        return Response(self.get_serializer(run).data)

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        run = self.get_object()
        if run.status != CommercialIncentiveRun.Status.CALCULATED:
            raise ValidationError({"detail": "Le run doit etre calcule avant approbation."})
        run.status = CommercialIncentiveRun.Status.APPROVED
        run.approved_by = request.user
        run.approved_at = timezone.now()
        run.save(update_fields=["status", "approved_by", "approved_at", "updated_at"])
        create_audit_log(
            actor=request.user,
            store=run.store,
            action="COMMERCIAL_INCENTIVE_RUN_APPROVE",
            entity_type="CommercialIncentiveRun",
            entity_id=str(run.id),
            before={"status": CommercialIncentiveRun.Status.CALCULATED},
            after={"status": run.status},
        )
        return Response(self.get_serializer(run).data)

    @action(detail=True, methods=["get"], url_path="results")
    def results(self, request, pk=None):
        run = self.get_object()
        rows = CommercialIncentiveResult.objects.filter(run=run).select_related("seller")
        visible_seller_ids = _visible_seller_ids_for_user(request.user, run.store)
        if visible_seller_ids is not None:
            rows = rows.filter(seller_id__in=visible_seller_ids)
        rows = rows.order_by("-final_bonus")
        serializer = CommercialIncentiveResultSerializer(rows, many=True)
        return Response(serializer.data)


class CommercialExportsViewSet(viewsets.ViewSet):
    """Export placeholders for commercial datasets."""

    def get_permissions(self):
        return [
            IsAuthenticated(),
            ModuleCommercialEnabled(),
            FeatureCommercialExportsEnabled(),
            CanExportCommercial(),
        ]

    def list(self, request):
        return Response(
            {
                "exports": [
                    {"key": "pipeline_csv", "url": "pipeline-csv"},
                    {"key": "performance_pdf", "url": "performance-pdf"},
                ]
            }
        )

    @action(detail=False, methods=["get"], url_path="pipeline-csv")
    def pipeline_csv(self, request):
        store = _resolve_store(request)
        qs = (
            CommercialOpportunity.objects.filter(store=store)
            .filter(_scope_q_for_user(request.user, store, "owner_id"))
            .select_related("owner", "prospect", "quote", "won_sale")
            .order_by("stage", "pipeline_order", "-updated_at")
        )
        if request.query_params.get("stage"):
            qs = qs.filter(stage=request.query_params["stage"])

        csv_buffer = StringIO()
        writer = csv.writer(csv_buffer)
        writer.writerow(
            [
                "opportunity_id",
                "name",
                "stage",
                "owner",
                "prospect",
                "probability_pct",
                "estimated_amount",
                "expected_close_date",
                "quote_id",
                "won_sale_id",
                "updated_at",
            ]
        )
        for row in qs:
            writer.writerow(
                [
                    str(row.id),
                    row.name,
                    row.stage,
                    row.owner.get_full_name() if row.owner else "",
                    row.prospect.company_name if row.prospect else "",
                    row.probability_pct,
                    str(row.estimated_amount),
                    row.expected_close_date.isoformat() if row.expected_close_date else "",
                    str(row.quote_id) if row.quote_id else "",
                    str(row.won_sale_id) if row.won_sale_id else "",
                    row.updated_at.isoformat(),
                ]
            )
        filename = f"commercial-pipeline-{store.code}-{timezone.localdate().isoformat()}.csv"
        response = HttpResponse(csv_buffer.getvalue(), content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response

    @action(detail=False, methods=["get"], url_path="performance-pdf")
    def performance_pdf(self, request):
        store = _resolve_store(request)
        period = request.query_params.get("period") or _current_period()
        try:
            _month_bounds(period)
        except ValidationError:
            raise

        run = (
            CommercialIncentiveRun.objects.filter(store=store, period=period)
            .order_by("-updated_at", "-created_at")
            .first()
        )
        if not run:
            raise ValidationError({"period": "Aucun run de primes pour cette periode."})

        rows = CommercialIncentiveResult.objects.filter(run=run).select_related("seller").order_by("-final_bonus")
        visible_seller_ids = _visible_seller_ids_for_user(request.user, store)
        if visible_seller_ids is not None:
            rows = rows.filter(seller_id__in=visible_seller_ids)

        try:
            from reportlab.lib import colors
            from reportlab.lib.pagesizes import A4
            from reportlab.lib.units import mm
            from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
            from reportlab.lib.styles import getSampleStyleSheet
        except Exception:
            logger.warning("ReportLab unavailable for commercial performance PDF; fallback to text.")
            lines = [
                f"Performance commerciale - {store.name}",
                f"Periode: {period}",
                f"Run: {run.id}",
                "",
            ]
            for result in rows:
                lines.append(
                    f"- {result.seller.get_full_name() if result.seller else result.seller_id}: "
                    f"CA signe={result.signed_revenue} bonus={result.final_bonus}"
                )
            response = HttpResponse("\n".join(lines), content_type="text/plain; charset=utf-8")
            response["Content-Disposition"] = f'attachment; filename="commercial-performance-{period}.txt"'
            return response

        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=12 * mm,
            leftMargin=12 * mm,
            topMargin=12 * mm,
            bottomMargin=12 * mm,
        )
        styles = getSampleStyleSheet()
        story = [
            Paragraph(f"Performance Commerciale - {store.name}", styles["Title"]),
            Paragraph(f"Periode: {period}", styles["Normal"]),
            Paragraph(f"Policy: {run.policy.name if run.policy else 'N/A'}", styles["Normal"]),
            Spacer(1, 8),
        ]

        data = [["Commercial", "CA signe", "CA devis", "Tx transfo", "Marge moy.", "Bonus final"]]
        for result in rows:
            data.append(
                [
                    result.seller.get_full_name() if result.seller else str(result.seller_id),
                    str(result.signed_revenue),
                    str(result.quoted_revenue),
                    f"{result.win_rate}%",
                    f"{result.avg_margin_pct}%",
                    str(result.final_bonus),
                ]
            )

        table = Table(data, repeatRows=1)
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0F172A")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
                    ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#94A3B8")),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
                ]
            )
        )
        story.append(table)
        doc.build(story)
        buffer.seek(0)

        filename = f"commercial-performance-{store.code}-{period}.pdf"
        response = HttpResponse(buffer.getvalue(), content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response
