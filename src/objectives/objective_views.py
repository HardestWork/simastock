"""API views for the objectives module."""
from __future__ import annotations

import logging
from datetime import date

from django.utils import timezone
from rest_framework import filters, permissions, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound
from rest_framework.generics import GenericAPIView, RetrieveUpdateAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

from objectives.engine import ObjectiveCalculationEngine
from objectives.leaderboard import LeaderboardEngine
from objectives.models import (
    LeaderboardSettings,
    LeaderboardSnapshot,
    ObjectiveRule,
    SellerBadge,
    SellerMonthlyStats,
    SellerObjective,
    SellerPenalty,
    SellerPenaltyType,
    SellerSprint,
    SellerSprintResult,
)
from objectives.objective_serializers import (
    LeaderboardSettingsSerializer,
    ObjectiveRuleSerializer,
    ObjectiveRuleWriteSerializer,
    SellerBadgeSerializer,
    SellerDashboardSerializer,
    SellerHistoryItemSerializer,
    SellerMonthlyStatsSerializer,
    SellerObjectiveSerializer,
    SellerPenaltySerializer,
    SellerPenaltyTypeSerializer,
    SellerSprintSerializer,
)
from api.v1.permissions import ModuleSellerPerformanceEnabled
from stores.models import Store, StoreUser

logger = logging.getLogger(__name__)


# ────────────────────────────────────────────────────────────
# Permission helpers
# ────────────────────────────────────────────────────────────

class IsAdminOrManager(permissions.BasePermission):
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        return getattr(request.user, "role", None) in ("ADMIN", "MANAGER")


def _current_period() -> str:
    today = date.today()
    return f"{today.year}-{today.month:02d}"


def _resolve_store(request):
    """Resolve current store from middleware context or authenticated memberships.

    This keeps objectives endpoints working in cookie/JWT API mode where
    ``request.current_store`` may be absent because no Django session store is set.
    """
    user = getattr(request, "user", None)
    is_authenticated = bool(user and user.is_authenticated)

    store = getattr(request, "current_store", None)
    if store is not None and is_authenticated:
        if getattr(user, "is_superuser", False):
            return store
        if user.store_users.filter(store_id=store.id, store__is_active=True).exists():
            return store

    store_id = request.query_params.get("store")
    if not store_id:
        payload = getattr(request, "data", {}) or {}
        if isinstance(payload, dict):
            store_id = payload.get("store")
    if store_id and is_authenticated:
        qs = Store.objects.filter(pk=store_id, is_active=True).select_related("enterprise")
        if getattr(user, "is_superuser", False):
            return qs.first()
        return qs.filter(store_users__user=user).first()

    if not is_authenticated:
        return None

    membership = (
        StoreUser.objects
        .filter(user=user, store__is_active=True)
        .select_related("store__enterprise")
        .order_by("-is_default", "store_id")
        .first()
    )
    if membership:
        return membership.store

    if getattr(user, "is_superuser", False):
        return (
            Store.objects
            .filter(is_active=True)
            .select_related("enterprise")
            .order_by("name")
            .first()
        )
    return None


# ────────────────────────────────────────────────────────────
# Objective Rules
# ────────────────────────────────────────────────────────────

class ObjectiveRuleViewSet(viewsets.ModelViewSet):
    """CRUD for objective rules. Update creates a new versioned rule."""
    permission_classes = [permissions.IsAuthenticated, ModuleSellerPerformanceEnabled, IsAdminOrManager]
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ["valid_from", "version"]

    def get_queryset(self):
        store = _resolve_store(self.request)
        if store is None:
            return ObjectiveRule.objects.none()
        return ObjectiveRule.objects.filter(store=store).prefetch_related("tiers")

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return ObjectiveRuleWriteSerializer
        return ObjectiveRuleSerializer

    def perform_create(self, serializer):
        store = _resolve_store(self.request)
        if store is None:
            raise serializers.ValidationError({"store": "Boutique introuvable."})
        serializer.save(store=store)

    def perform_update(self, serializer):
        # Write serializer handles versioning (new rule + deactivate old one)
        instance = self.get_object()
        serializer.save(store=instance.store)
        # Queue recompute for current month after rule change
        from objectives.tasks import recompute_store_month
        recompute_store_month.delay(
            store_id=str(instance.store_id),
            period=_current_period(),
        )


# ────────────────────────────────────────────────────────────
# Per-seller objective overrides
# ────────────────────────────────────────────────────────────

class SellerObjectiveViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, ModuleSellerPerformanceEnabled, IsAdminOrManager]
    serializer_class = SellerObjectiveSerializer

    def get_queryset(self):
        store = _resolve_store(self.request)
        if not store:
            return SellerObjective.objects.none()
        qs = SellerObjective.objects.filter(store=store).select_related("seller", "rule")
        period = self.request.query_params.get("period")
        if period:
            qs = qs.filter(period=period)
        return qs

    def perform_create(self, serializer):
        store = _resolve_store(self.request)
        if store is None:
            raise serializers.ValidationError({"store": "Boutique introuvable."})
        serializer.save(store=store)

    def perform_update(self, serializer):
        store = _resolve_store(self.request)
        if store is None:
            raise serializers.ValidationError({"store": "Boutique introuvable."})
        serializer.save(store=store)


# ────────────────────────────────────────────────────────────
# Seller Dashboard
# ────────────────────────────────────────────────────────────

class SellerDashboardView(APIView):
    """
    GET /api/v1/objectives/seller/dashboard/?period=YYYY-MM
    Returns all data needed for the seller's objective dashboard.
    """
    permission_classes = [permissions.IsAuthenticated, ModuleSellerPerformanceEnabled]

    def get(self, request):
        store = _resolve_store(request)
        if not store:
            return Response({"detail": "Boutique introuvable."}, status=404)

        # Guard: only SALES-role users (or superusers) should have a seller dashboard.
        # Admins/managers use the admin stats view instead. This avoids creating
        # spurious SellerMonthlyStats rows for non-seller accounts.
        if not request.user.is_superuser:
            membership = StoreUser.objects.filter(
                store=store, user=request.user
            ).first()
            if not membership or getattr(request.user, "role", None) != "SALES":
                return Response(
                    {"detail": "Tableau de bord vendeur reserve aux utilisateurs avec le role Vendeur."},
                    status=403,
                )

        period = request.query_params.get("period") or _current_period()

        # Check whether an active objective rule exists for this store
        has_active_rule = ObjectiveRule.objects.filter(store=store, is_active=True).exists()

        # On-demand compute if stats are missing or stale
        stats, _ = SellerMonthlyStats.objects.get_or_create(
            store=store,
            seller=request.user,
            period=period,
        )
        if stats.computed_at is None:
            engine = ObjectiveCalculationEngine(store_id=str(store.id))
            result = engine.compute_for_seller(
                seller_id=str(request.user.id),
                period=period,
                trigger="MANUAL",
            )
            if result:
                stats = result

        # Projection
        engine = ObjectiveCalculationEngine(store_id=str(store.id))
        projection = engine.compute_projection(stats, period)

        # Ranking from last snapshot
        ranking = None
        snapshot = LeaderboardSnapshot.objects.filter(
            store=store, period=period
        ).first()
        if snapshot and snapshot.data:
            for entry in snapshot.data:
                if entry["seller_id"] == str(request.user.id):
                    ranking = {
                        "rank": entry["rank"],
                        "total_sellers": len(snapshot.data),
                        "rank_change": entry.get("rank_change", 0),
                    }
                    break

                # Compute score 360, risk, profile
        engine2 = ObjectiveCalculationEngine(store_id=str(store.id))
        score_360 = engine2.compute_score_360(stats, period)
        risk = engine2.compute_risk_score(str(request.user.id), period)
        profile = engine2.compute_seller_profile(stats, risk["risk_score"])

        serializer = SellerDashboardSerializer(
            stats,
            context={
                "request": request,
                "projection": projection,
                "ranking": ranking,
                "has_active_rule": has_active_rule,
                "score_360": score_360,
                "risk": risk,
                "profile": profile,
            },
        )
        return Response(serializer.data)


# ────────────────────────────────────────────────────────────
# Seller History
# ────────────────────────────────────────────────────────────

class SellerHistoryView(APIView):
    """
    GET /api/v1/objectives/seller/history/?year=YYYY
    Returns monthly stats for a full year for the requesting seller.
    """
    permission_classes = [permissions.IsAuthenticated, ModuleSellerPerformanceEnabled]

    def get(self, request):
        store = _resolve_store(request)
        if not store:
            return Response({"detail": "Boutique introuvable."}, status=404)

        year = request.query_params.get("year", str(date.today().year))
        qs = SellerMonthlyStats.objects.filter(
            store=store,
            seller=request.user,
            period__startswith=year,
        ).order_by("period")

        # Enrich with leaderboard rank
        snapshots = {
            s.period: s.data
            for s in LeaderboardSnapshot.objects.filter(
                store=store, period__startswith=year
            )
        }

        items = []
        for stats in qs:
            rank = None
            snap_data = snapshots.get(stats.period, [])
            for entry in snap_data:
                if entry["seller_id"] == str(request.user.id):
                    rank = entry["rank"]
                    break
            items.append(
                {
                    "period": stats.period,
                    "net_amount": stats.net_amount,
                    "sale_count": stats.sale_count,
                    "current_tier_rank": stats.current_tier_rank,
                    "current_tier_name": stats.current_tier_name,
                    "bonus_earned": stats.bonus_earned,
                    "rank": rank,
                    "is_final": stats.is_final,
                }
            )
        serializer = SellerHistoryItemSerializer(items, many=True)
        return Response(serializer.data)


# ────────────────────────────────────────────────────────────
# Leaderboard
# ────────────────────────────────────────────────────────────

class LeaderboardView(APIView):
    """
    GET /api/v1/objectives/leaderboard/?period=YYYY-MM
    Returns ranked leaderboard, respecting visibility settings.
    """
    permission_classes = [permissions.IsAuthenticated, ModuleSellerPerformanceEnabled]

    def get(self, request):
        store = _resolve_store(request)
        if not store:
            return Response({"detail": "Boutique introuvable."}, status=404)

        period = request.query_params.get("period") or _current_period()

        # Fetch or refresh snapshot
        lb_engine = LeaderboardEngine(store_id=str(store.id))
        settings_obj, _ = LeaderboardSettings.objects.get_or_create(store=store)

        snapshot = lb_engine.get_cached_snapshot(
            period=period,
            max_age_minutes=settings_obj.refresh_interval_minutes,
        )
        if not snapshot:
            snapshot = lb_engine.compute_snapshot(period=period)

        data = snapshot.data or []
        visibility = settings_obj.visibility
        me_id = str(request.user.id)

        # Apply visibility masking
        masked = []
        for entry in data:
            item = dict(entry)
            item["is_me"] = entry["seller_id"] == me_id

            if visibility == "ANONYMOUS":
                item["seller_name"] = f"Vendeur #{entry['rank']}"
                item["seller_id"] = ""
            elif visibility == "RANK_ONLY":
                item["seller_name"] = f"Vendeur #{entry['rank']}"
                item["seller_id"] = "" if not item["is_me"] else item["seller_id"]
            elif visibility == "TIER_AND_RANK":
                if not item["is_me"]:
                    item["seller_name"] = f"Vendeur #{entry['rank']}"
                    item["seller_id"] = ""

            if not settings_obj.show_amounts:
                item.pop("net_amount", None)
                item.pop("bonus_earned", None)
            if not settings_obj.show_tier:
                item.pop("current_tier_rank", None)
                item.pop("current_tier_name", None)

            masked.append(item)

        return Response(
            {
                "period": period,
                "settings": LeaderboardSettingsSerializer(settings_obj).data,
                "entries": masked,
                "computed_at": snapshot.computed_at.isoformat(),
            }
        )


class LeaderboardSettingsView(RetrieveUpdateAPIView):
    """GET/PATCH /api/v1/objectives/leaderboard/settings/"""
    permission_classes = [permissions.IsAuthenticated, ModuleSellerPerformanceEnabled, IsAdminOrManager]
    serializer_class = LeaderboardSettingsSerializer

    def get_object(self):
        store = _resolve_store(self.request)
        if store is None:
            raise NotFound("Boutique introuvable.")
        obj, _ = LeaderboardSettings.objects.get_or_create(store=store)
        return obj

    def perform_update(self, serializer):
        store = _resolve_store(self.request)
        if store is None:
            raise serializers.ValidationError({"store": "Boutique introuvable."})
        serializer.save(store=store)


# ────────────────────────────────────────────────────────────
# Penalties
# ────────────────────────────────────────────────────────────

class SellerPenaltyTypeViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, ModuleSellerPerformanceEnabled, IsAdminOrManager]
    serializer_class = SellerPenaltyTypeSerializer

    def get_queryset(self):
        store = _resolve_store(self.request)
        if not store:
            return SellerPenaltyType.objects.none()
        return SellerPenaltyType.objects.filter(store=store)

    def perform_create(self, serializer):
        store = _resolve_store(self.request)
        if store is None:
            raise serializers.ValidationError({"store": "Boutique introuvable."})
        serializer.save(store=store)


class SellerPenaltyViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, ModuleSellerPerformanceEnabled, IsAdminOrManager]
    serializer_class = SellerPenaltySerializer

    def get_queryset(self):
        store = _resolve_store(self.request)
        if not store:
            return SellerPenalty.objects.none()
        qs = SellerPenalty.objects.filter(
            stats__store=store
        ).select_related("penalty_type", "stats__seller")
        period = self.request.query_params.get("period")
        if period:
            qs = qs.filter(stats__period=period)
        seller_id = self.request.query_params.get("seller_id")
        if seller_id:
            qs = qs.filter(stats__seller_id=seller_id)
        return qs

    def perform_create(self, serializer):
        # Guards: stats and penalty_type must belong to the current store
        store = _resolve_store(self.request)
        if store is None:
            raise serializers.ValidationError({"store": "Boutique introuvable."})
        stats = serializer.validated_data.get("stats")
        penalty_type = serializer.validated_data.get("penalty_type")
        if stats and str(stats.store_id) != str(store.id):
            raise serializers.ValidationError(
                {"stats": "Les stats ne correspondent pas a la boutique courante."}
            )
        if penalty_type and str(penalty_type.store_id) != str(store.id):
            raise serializers.ValidationError(
                {"penalty_type": "Le type de penalite ne correspond pas a la boutique courante."}
            )
        serializer.save(applied_by=self.request.user)

    def perform_update(self, serializer):
        store = _resolve_store(self.request)
        if store is None:
            raise serializers.ValidationError({"store": "Boutique introuvable."})
        stats = serializer.validated_data.get("stats") or serializer.instance.stats
        penalty_type = serializer.validated_data.get("penalty_type") or serializer.instance.penalty_type
        if str(stats.store_id) != str(store.id):
            raise serializers.ValidationError(
                {"stats": "Les stats ne correspondent pas a la boutique courante."}
            )
        if str(penalty_type.store_id) != str(store.id):
            raise serializers.ValidationError(
                {"penalty_type": "Le type de penalite ne correspond pas a la boutique courante."}
            )
        serializer.save()

    @action(detail=True, methods=["post"])
    def void(self, request, pk=None):
        penalty = self.get_object()
        if penalty.is_void:
            return Response({"detail": "Penalite deja annulee."}, status=400)
        penalty.is_void = True
        penalty.voided_by = request.user
        penalty.voided_at = timezone.now()
        penalty.save(update_fields=["is_void", "voided_by", "voided_at"])
        # Trigger recompute
        from objectives.tasks import recompute_seller_objective
        recompute_seller_objective.delay(
            store_id=str(penalty.stats.store_id),
            seller_id=str(penalty.stats.seller_id),
            period=penalty.stats.period,
        )
        return Response({"detail": "Penalite annulee."})


# ────────────────────────────────────────────────────────────
# Admin Stats
# ────────────────────────────────────────────────────────────

class SellerStatsAdminView(APIView):
    """
    GET /api/v1/objectives/admin/stats/?period=YYYY-MM
    Returns all sellers stats for a period (admin/manager view).
    """
    permission_classes = [permissions.IsAuthenticated, ModuleSellerPerformanceEnabled, IsAdminOrManager]

    def get(self, request):
        store = _resolve_store(request)
        if not store:
            return Response({"detail": "Boutique introuvable."}, status=404)

        period = request.query_params.get("period") or _current_period()
        qs = SellerMonthlyStats.objects.filter(
            store=store, period=period
        ).select_related("seller").order_by("-gross_amount")

        serializer = SellerMonthlyStatsSerializer(qs, many=True)
        return Response(serializer.data)


# ────────────────────────────────────────────────────────────
# Manual Recompute
# ────────────────────────────────────────────────────────────

class RecomputeView(APIView):
    """
    POST /api/v1/objectives/recompute/
    Body: {"period": "YYYY-MM", "seller_id": "<uuid>"} (seller_id optional)
    """
    permission_classes = [permissions.IsAuthenticated, ModuleSellerPerformanceEnabled, IsAdminOrManager]

    def post(self, request):
        store = _resolve_store(request)
        if not store:
            return Response({"detail": "Boutique introuvable."}, status=404)

        period = request.data.get("period") or _current_period()
        seller_id = request.data.get("seller_id")

        from objectives.tasks import recompute_seller_objective, recompute_store_month

        if seller_id:
            recompute_seller_objective.delay(
                store_id=str(store.id),
                seller_id=seller_id,
                period=period,
            )
            return Response({"detail": f"Recalcul lance pour le vendeur {seller_id}."})
        else:
            recompute_store_month.delay(store_id=str(store.id), period=period)
            return Response({"detail": f"Recalcul lance pour toute la boutique ({period})."})


# ────────────────────────────────────────────────────────────
# Badges
# ────────────────────────────────────────────────────────────

class MyBadgesView(APIView):
    """GET /api/v1/objectives/seller/badges/"""
    permission_classes = [permissions.IsAuthenticated, ModuleSellerPerformanceEnabled]

    def get(self, request):
        store = _resolve_store(request)
        if not store:
            return Response({"detail": "Boutique introuvable."}, status=404)
        badges = SellerBadge.objects.filter(
            seller=request.user, store=store
        ).order_by("-created_at")
        return Response(SellerBadgeSerializer(badges, many=True).data)


# ────────────────────────────────────────────────────────────
# Sprints
# ────────────────────────────────────────────────────────────

class SprintViewSet(viewsets.ModelViewSet):
    serializer_class = SellerSprintSerializer

    def get_permissions(self):
        # Read-only actions available to all authenticated users
        if self.action in ("list", "retrieve", "current"):
            return [permissions.IsAuthenticated(), ModuleSellerPerformanceEnabled()]
        return [permissions.IsAuthenticated(), ModuleSellerPerformanceEnabled(), IsAdminOrManager()]

    def get_queryset(self):
        store = _resolve_store(self.request)
        if not store:
            return SellerSprint.objects.none()
        return SellerSprint.objects.filter(store=store).prefetch_related("results__seller")

    def perform_create(self, serializer):
        store = _resolve_store(self.request)
        if store is None:
            raise serializers.ValidationError({"store": "Boutique introuvable."})
        serializer.save(
            store=store,
            created_by=self.request.user,
        )

    @action(detail=False, methods=["get"])
    def current(self, request):
        """Return the currently ACTIVE sprint with live rankings."""
        store = _resolve_store(request)
        sprint = SellerSprint.objects.filter(
            store=store, status="ACTIVE"
        ).first()
        if not sprint:
            return Response({"detail": "Aucun sprint actif."}, status=404)

        # Build live rankings from payment data since sprint start
        from cashier.models import Payment
        from django.db.models import Sum, Count
        from sales.models import Sale
        rankings = (
            Payment.objects.filter(
                store=store,
                created_at__gte=sprint.starts_at,
                created_at__lte=sprint.ends_at,
                sale__status__in=[Sale.Status.PAID, Sale.Status.PARTIALLY_PAID],
            )
            .values("sale__seller_id", "sale__seller__first_name", "sale__seller__last_name")
            .annotate(total=Sum("amount"), count=Count("id"))
            .order_by("-total")
        )

        me_id = str(request.user.id)
        entries = [
            {
                "rank": idx + 1,
                "seller_id": str(r["sale__seller_id"]),
                "seller_name": f"{r['sale__seller__first_name']} {r['sale__seller__last_name']}".strip(),
                "total": str(r["total"]),
                "sale_count": r["count"],
                "is_me": str(r["sale__seller_id"]) == me_id,
            }
            for idx, r in enumerate(rankings)
        ]

        data = SellerSprintSerializer(sprint).data
        data["live_rankings"] = entries
        return Response(data)


# ────────────────────────────────────────────────────────────
# Multi-period ranking
# ────────────────────────────────────────────────────────────

class SellerMultiPeriodRankingView(APIView):
    permission_classes = [permissions.IsAuthenticated, ModuleSellerPerformanceEnabled]

    def get(self, request):
        store = _resolve_store(request)
        if not store:
            return Response({"detail": "Boutique introuvable."}, status=404)
        period = request.query_params.get("period") or _current_period()
        engine = ObjectiveCalculationEngine(store_id=str(store.id))
        data = engine.compute_multi_period_ranking(period, str(request.user.id))
        return Response(data)


# ────────────────────────────────────────────────────────────
# Credit quality per seller
# ────────────────────────────────────────────────────────────

class SellerCreditQualityView(APIView):
    permission_classes = [permissions.IsAuthenticated, ModuleSellerPerformanceEnabled]

    def get(self, request):
        store = _resolve_store(request)
        if not store:
            return Response({"detail": "Boutique introuvable."}, status=404)
        period = request.query_params.get("period") or _current_period()
        year, month = int(period[:4]), int(period[5:7])

        from credits.models import CreditLedgerEntry, PaymentSchedule
        from django.db.models import Sum, Count, Avg
        from datetime import date

        seller_sale_ids = list(
            __import__("sales.models", fromlist=["Sale"]).Sale.objects.filter(
                store=store,
                seller=request.user,
                created_at__year=year,
                created_at__month=month,
            ).values_list("id", flat=True)
        )

        issued_agg = CreditLedgerEntry.objects.filter(
            sale_id__in=seller_sale_ids,
            entry_type="SALE_ON_CREDIT",
        ).aggregate(total=Sum("amount"))
        credit_issued = float(issued_agg["total"] or 0)

        from credits.models import CustomerAccount
        account_ids = CreditLedgerEntry.objects.filter(
            sale_id__in=seller_sale_ids,
        ).values_list("account_id", flat=True).distinct()
        recovered_agg = CreditLedgerEntry.objects.filter(
            account_id__in=account_ids,
            entry_type="CREDIT_PAYMENT",
            created_at__year=year,
            created_at__month=month,
        ).aggregate(total=Sum("amount"))
        credit_recovered_ledger = abs(float(recovered_agg["total"] or 0))

        overdue_qs = PaymentSchedule.objects.filter(
            sale_id__in=seller_sale_ids,
            status="OVERDUE",
        )
        overdue_agg = overdue_qs.aggregate(
            total=Sum("amount_due"),
            count=Count("id"),
        )
        overdue_amount = float(overdue_agg["total"] or 0)
        overdue_count = overdue_agg["count"] or 0

        today = date.today()
        avg_days_overdue = 0.0
        if overdue_count > 0:
            days_list = [
                max(0, (today - ps.due_date).days)
                for ps in overdue_qs.select_related()[:20]
            ]
            avg_days_overdue = sum(days_list) / max(len(days_list), 1)

        recovery_rate = (credit_recovered_ledger / credit_issued * 100) if credit_issued > 0 else 0.0

        top_debtors = []
        from credits.models import CustomerAccount as CA
        for ps in overdue_qs.select_related("account__customer").order_by("-amount_due")[:5]:
            customer = ps.account.customer if ps.account else None
            top_debtors.append({
                "customer_name": customer.full_name if customer else "Inconnu",
                "overdue": str(ps.amount_due - ps.amount_paid),
            })

        return Response({
            "credit_issued": str(round(credit_issued, 2)),
            "credit_recovered": str(round(credit_recovered_ledger, 2)),
            "recovery_rate": round(recovery_rate, 1),
            "overdue_count": overdue_count,
            "overdue_amount": str(round(overdue_amount, 2)),
            "avg_days_overdue": round(avg_days_overdue, 1),
            "top_debtors": top_debtors,
        })


# ────────────────────────────────────────────────────────────
# Product mix per seller
# ────────────────────────────────────────────────────────────

class SellerProductMixView(APIView):
    permission_classes = [permissions.IsAuthenticated, ModuleSellerPerformanceEnabled]

    def get(self, request):
        store = _resolve_store(request)
        if not store:
            return Response({"detail": "Boutique introuvable."}, status=404)
        period = request.query_params.get("period") or _current_period()
        year, month = int(period[:4]), int(period[5:7])

        from sales.models import SaleItem, Sale
        from django.db.models import Sum, Count

        items_qs = SaleItem.objects.filter(
            sale__store=store,
            sale__seller=request.user,
            sale__created_at__year=year,
            sale__created_at__month=month,
            sale__status__in=[Sale.Status.PAID, Sale.Status.PARTIALLY_PAID],
        ).select_related("product__category")

        cat_agg = (
            items_qs
            .values("product__category__name")
            .annotate(revenue=Sum("line_total"), count=Count("id"))
            .order_by("-revenue")
        )
        total_revenue_agg = items_qs.aggregate(total=Sum("line_total"), total_items=Sum("quantity"))
        total_rev = float(total_revenue_agg["total"] or 0)
        total_items = int(total_revenue_agg["total_items"] or 0)

        by_category = []
        for row in cat_agg:
            cat_name = row["product__category__name"] or "Sans categorie"
            rev = float(row["revenue"] or 0)
            by_category.append({
                "category": cat_name,
                "revenue": str(round(rev, 2)),
                "pct": round(rev / total_rev * 100, 1) if total_rev > 0 else 0,
                "count": row["count"],
            })

        top_prods = (
            items_qs
            .values("product_name")
            .annotate(revenue=Sum("line_total"), quantity=Sum("quantity"))
            .order_by("-revenue")[:5]
        )
        top_products = [
            {
                "product_name": p["product_name"],
                "revenue": str(round(float(p["revenue"] or 0), 2)),
                "quantity": int(p["quantity"] or 0),
            }
            for p in top_prods
        ]

        return Response({
            "by_category": by_category,
            "top_products": top_products,
            "total_items": total_items,
            "total_revenue": str(round(total_rev, 2)),
        })


# ────────────────────────────────────────────────────────────
# Coaching missions
# ────────────────────────────────────────────────────────────

class SellerCoachingView(APIView):
    permission_classes = [permissions.IsAuthenticated, ModuleSellerPerformanceEnabled]

    def get(self, request):
        store = _resolve_store(request)
        if not store:
            return Response({"detail": "Boutique introuvable."}, status=404)
        period = request.query_params.get("period") or _current_period()

        from objectives.models import SellerMonthlyStats
        stats, _ = SellerMonthlyStats.objects.get_or_create(
            store=store,
            seller=request.user,
            period=period,
        )

        engine = ObjectiveCalculationEngine(store_id=str(store.id))
        missions = engine.compute_coaching_missions(
            seller_id=str(request.user.id),
            period=period,
            stats=stats,
        )

        from cashier.models import Payment
        from django.db.models import Sum
        from datetime import date
        today = date.today()
        today_agg = Payment.objects.filter(
            store=store,
            sale__seller=request.user,
            created_at__date=today,
        ).aggregate(total=Sum("amount"))
        net_today = str(today_agg["total"] or 0)

        return Response({
            "period": period,
            "morning_missions": missions,
            "evening_summary": {
                "net_today": net_today,
                "missions_done": 0,
                "missions_total": len(missions),
            },
        })
