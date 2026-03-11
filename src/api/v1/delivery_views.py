"""API views for the Delivery & Logistics module."""
from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response

from api.v1.permissions import IsManagerOrAdmin, ModuleDeliveryEnabled
from api.v1.views import _user_store_ids
from delivery.models import (
    AgentMonthlyStats,
    AgentObjective,
    Delivery,
    DeliveryAgent,
    DeliveryPickupLocation,
    DeliveryStatusHistory,
    DeliveryZone,
)
from stores.models import StoreUser


# ---------------------------------------------------------------------------
# Permission helpers
# ---------------------------------------------------------------------------


class _NotDeliveryRole(BasePermission):
    """Deny access to users with the DELIVERY role (pure delivery agents).

    Store operations (creating deliveries, marking ready, changing status)
    must be performed by store staff, not by delivery agents themselves.
    """

    message = "Les livreurs ne peuvent pas effectuer cette action."

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if getattr(request.user, "is_superuser", False):
            return True
        return getattr(request.user, "role", None) != "DELIVERY"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_user_store(user):
    """Return the user's default (or first) active store, or raise ValidationError."""
    su = (
        StoreUser.objects
        .filter(user=user, store__is_active=True)
        .order_by("-is_default")
        .select_related("store")
        .first()
    )
    if not su:
        raise ValidationError({"detail": "Aucune boutique trouvée pour cet utilisateur."})
    return su.store


def _recompute_agent_stats(agent, period, store):
    """Recompute AgentMonthlyStats for a given agent and period.

    Wrapped in an atomic block with select_for_update to prevent a race
    condition when two concurrent requests (e.g. simultaneous deliveries)
    both trigger a recompute for the same agent+period.
    """
    year, month = period.split("-")
    qs = Delivery.objects.filter(agent=agent, created_at__year=year, created_at__month=month)
    delivered = qs.filter(status=Delivery.Status.DELIVERED).count()
    returned = qs.filter(status=Delivery.Status.RETURNED).count()
    total = qs.count()
    obj = AgentObjective.objects.filter(agent=agent, period=period).first()
    bonus = obj.bonus_amount if (obj and delivered >= obj.target_count) else 0
    with transaction.atomic():
        stats, _ = AgentMonthlyStats.objects.select_for_update().get_or_create(
            agent=agent,
            period=period,
            defaults={"store": store},
        )
        stats.store = store
        stats.delivered_count = delivered
        stats.total_count = total
        stats.returned_count = returned
        stats.bonus_earned = bonus
        stats.save(update_fields=["store", "delivered_count", "total_count", "returned_count", "bonus_earned"])


def _send_delivery_notification(delivery, channel, recipient, body):
    """Helper to send a delivery notification via the communications module."""
    try:
        from communications.services import send_message
        send_message(store=delivery.store, channel=channel, recipient=recipient, body=body)
    except Exception:
        pass  # Never block delivery workflow on notification failure


def _broadcast_to_agents(delivery):
    """Notifie tous les agents actifs du store d'une livraison disponible."""
    agents = DeliveryAgent.objects.filter(store=delivery.store, is_active=True).exclude(phone="")
    pickup = (
        (delivery.pickup_location.name if delivery.pickup_location else None)
        or delivery.pickup_notes
        or "Voir responsable"
    )
    payout_display = str(delivery.payout_amount) if delivery.payout_amount else (
        str(delivery.zone.fee) if delivery.zone else "-"
    )
    body = (
        f"Nouvelle livraison disponible !\n"
        f"Recuperation : {pickup}\n"
        f"Destination : {delivery.delivery_address}\n"
        f"Destinataire : {delivery.recipient_name} ({delivery.recipient_phone})\n"
        f"Montant : {payout_display} FCFA\n"
        f"Code : {delivery.confirmation_code}"
    )
    for agent in agents:
        _send_delivery_notification(delivery, "SMS", agent.phone, body)


# ---------------------------------------------------------------------------
# Serializers
# ---------------------------------------------------------------------------


class DeliveryPickupLocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeliveryPickupLocation
        fields = ["id", "store", "name", "description", "is_active", "created_at"]
        read_only_fields = ["id", "store", "created_at"]


class DeliveryZoneSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeliveryZone
        fields = [
            "id", "store", "name", "description", "fee",
            "estimated_minutes", "is_active", "created_at",
        ]
        read_only_fields = ["id", "store", "created_at"]


class DeliveryAgentSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.full_name", read_only=True, default=None)

    class Meta:
        model = DeliveryAgent
        fields = [
            "id", "store", "employee", "employee_name", "name", "phone",
            "vehicle_type", "is_active", "user", "created_at",
        ]
        read_only_fields = ["id", "store", "created_at"]
        extra_kwargs = {
            "employee": {"required": False, "allow_null": True},
            "user": {"required": False, "allow_null": True},
        }


class DeliveryStatusHistorySerializer(serializers.ModelSerializer):
    changed_by_email = serializers.CharField(source="changed_by.email", read_only=True, default=None)

    class Meta:
        model = DeliveryStatusHistory
        fields = ["id", "from_status", "to_status", "changed_by", "changed_by_email", "reason", "created_at"]
        read_only_fields = ["id", "created_at"]


class DeliverySerializer(serializers.ModelSerializer):
    agent_name = serializers.CharField(source="agent.name", read_only=True, default=None)
    agent_phone = serializers.CharField(source="agent.phone", read_only=True, default=None)
    zone_name = serializers.CharField(source="zone.name", read_only=True, default=None)
    zone_fee = serializers.DecimalField(source="zone.fee", read_only=True, default=None, max_digits=12, decimal_places=2)
    sale_invoice = serializers.CharField(source="sale.invoice_number", read_only=True, default=None)
    status_history = DeliveryStatusHistorySerializer(many=True, read_only=True)
    expense_number = serializers.CharField(source="expense.expense_number", read_only=True, default=None)
    pickup_location_name = serializers.CharField(source="pickup_location.name", read_only=True, default=None)
    seller_name = serializers.SerializerMethodField()
    sale_items_summary = serializers.SerializerMethodField()
    pickup_confirmed_by_name = serializers.SerializerMethodField()
    # pickup_code is hidden from DELIVERY role — it must be communicated verbally by store staff
    pickup_code = serializers.SerializerMethodField()

    def _is_delivery_role(self):
        request = self.context.get("request")
        if request and hasattr(request, "user"):
            return getattr(request.user, "role", None) == "DELIVERY"
        return False

    def get_pickup_code(self, obj):
        if self._is_delivery_role():
            return None
        return obj.pickup_code

    def get_seller_name(self, obj):
        if obj.seller:
            name = f"{obj.seller.first_name} {obj.seller.last_name}".strip()
            return name or obj.seller.email
        return None

    def get_sale_items_summary(self, obj):
        if not obj.sale_id:
            return []
        return [
            {"name": item.product_name, "quantity": item.quantity}
            for item in obj.sale.items.select_related().only(
                "product_name", "quantity"
            )
        ]

    def get_pickup_confirmed_by_name(self, obj):
        if obj.pickup_confirmed_by:
            return obj.pickup_confirmed_by.get_full_name() or obj.pickup_confirmed_by.email
        return None

    class Meta:
        model = Delivery
        fields = [
            "id", "store", "sale", "sale_invoice", "agent", "agent_name", "agent_phone",
            "zone", "zone_name", "zone_fee", "status",
            "delivery_address", "recipient_name", "recipient_phone",
            "scheduled_at", "picked_up_at", "delivered_at",
            "confirmation_code", "notes", "metadata",
            "payout_amount", "expense", "expense_number",
            "is_broadcast", "seller", "seller_name",
            "pickup_location", "pickup_location_name", "pickup_notes",
            "pickup_code", "pickup_confirmed_at", "pickup_confirmed_by", "pickup_confirmed_by_name",
            "sale_items_summary",
            "status_history", "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "confirmation_code", "expense", "expense_number",
            "is_broadcast", "seller", "seller_name",
            "agent_phone", "pickup_location_name", "sale_items_summary",
            "pickup_code", "pickup_confirmed_at", "pickup_confirmed_by", "pickup_confirmed_by_name",
            "status_history", "created_at", "updated_at",
        ]


class DeliveryCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Delivery
        fields = [
            "sale", "agent", "zone",
            "delivery_address", "recipient_name", "recipient_phone",
            "scheduled_at", "notes", "payout_amount",
            "pickup_location", "pickup_notes",
        ]
        extra_kwargs = {
            "sale": {"required": False, "allow_null": True},
            "agent": {"required": False, "allow_null": True},
            "zone": {"required": False, "allow_null": True},
            "scheduled_at": {"required": False, "allow_null": True},
            "notes": {"required": False},
            "payout_amount": {"required": False, "allow_null": True},
            "pickup_location": {"required": False, "allow_null": True},
            "pickup_notes": {"required": False},
        }


class AgentObjectiveSerializer(serializers.ModelSerializer):
    agent_name = serializers.CharField(source="agent.name", read_only=True)

    class Meta:
        model = AgentObjective
        fields = [
            "id", "store", "agent", "agent_name", "period",
            "target_count", "bonus_amount", "notes", "created_at",
        ]
        read_only_fields = ["id", "store", "created_at"]


class AgentMonthlyStatsSerializer(serializers.ModelSerializer):
    agent_name = serializers.CharField(source="agent.name", read_only=True)
    success_rate = serializers.FloatField(read_only=True)

    class Meta:
        model = AgentMonthlyStats
        fields = [
            "id", "store", "agent", "agent_name", "period",
            "delivered_count", "total_count", "returned_count",
            "bonus_earned", "success_rate", "is_final", "created_at",
        ]
        read_only_fields = ["id", "store", "created_at"]


# ---------------------------------------------------------------------------
# ViewSets
# ---------------------------------------------------------------------------


class DeliveryZoneViewSet(viewsets.ModelViewSet):
    serializer_class = DeliveryZoneSerializer

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAuthenticated(), ModuleDeliveryEnabled(), IsManagerOrAdmin()]
        return [IsAuthenticated(), ModuleDeliveryEnabled()]

    def get_queryset(self):
        store_ids = _user_store_ids(self.request.user)
        return DeliveryZone.objects.filter(store_id__in=store_ids)

    def perform_create(self, serializer):
        serializer.save(store=_get_user_store(self.request.user))


class DeliveryAgentViewSet(viewsets.ModelViewSet):
    serializer_class = DeliveryAgentSerializer

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAuthenticated(), ModuleDeliveryEnabled(), IsManagerOrAdmin()]
        return [IsAuthenticated(), ModuleDeliveryEnabled()]

    def get_queryset(self):
        store_ids = _user_store_ids(self.request.user)
        return DeliveryAgent.objects.filter(store_id__in=store_ids).select_related("employee")

    def perform_create(self, serializer):
        serializer.save(store=_get_user_store(self.request.user))

    @action(detail=False, methods=["get"])
    def stats(self, request):
        """Return delivery stats per agent for a given period."""
        store_ids = _user_store_ids(request.user)
        period = request.query_params.get("period")  # YYYY-MM optional

        qs = Delivery.objects.filter(store_id__in=store_ids, agent__isnull=False)
        if period:
            try:
                year, month = period.split("-")
                qs = qs.filter(created_at__year=int(year), created_at__month=int(month))
            except (ValueError, AttributeError):
                return Response({"detail": "Format de période invalide. Utilisez YYYY-MM."}, status=400)

        rows = (
            qs.values("agent", "agent__name", "agent__phone", "agent__vehicle_type")
            .annotate(
                total=Count("id"),
                delivered=Count("id", filter=Q(status=Delivery.Status.DELIVERED)),
                returned=Count("id", filter=Q(status=Delivery.Status.RETURNED)),
                cancelled=Count("id", filter=Q(status=Delivery.Status.CANCELLED)),
            )
            .order_by("-delivered")
        )

        obj_map = {}
        stats_map = {}
        if period:
            obj_map = {
                o.agent_id: o
                for o in AgentObjective.objects.filter(store_id__in=store_ids, period=period)
            }
            stats_map = {
                s.agent_id: s
                for s in AgentMonthlyStats.objects.filter(store_id__in=store_ids, period=period)
            }

        result = []
        for r in rows:
            total = r["total"] or 1
            item = {
                "agent_id": str(r["agent"]),
                "agent_name": r["agent__name"],
                "agent_phone": r["agent__phone"],
                "vehicle_type": r["agent__vehicle_type"],
                "total": r["total"],
                "delivered": r["delivered"],
                "returned": r["returned"],
                "cancelled": r["cancelled"],
                "success_rate": round(r["delivered"] / total * 100, 1),
                "objective": None,
                "bonus_earned": "0",
            }
            obj = obj_map.get(r["agent"])
            if obj:
                item["objective"] = {
                    "id": str(obj.id),
                    "target_count": obj.target_count,
                    "bonus_amount": str(obj.bonus_amount),
                    "achieved": r["delivered"] >= obj.target_count,
                }
            st = stats_map.get(r["agent"])
            if st:
                item["bonus_earned"] = str(st.bonus_earned)
            result.append(item)

        return Response(result)


class DeliveryViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, ModuleDeliveryEnabled]
    filterset_fields = ["status", "agent", "zone", "sale"]
    search_fields = ["recipient_name", "recipient_phone", "delivery_address", "sale__invoice_number"]
    ordering_fields = ["created_at", "scheduled_at", "status"]

    def get_permissions(self):
        # Mark-ready is for store staff only (not delivery agents)
        if self.action == "mark_ready":
            return [IsAuthenticated(), ModuleDeliveryEnabled(), _NotDeliveryRole()]
        # Update-status is restricted to store staff (stocker, manager, admin, sales)
        # Delivery agents must use confirm_pickup / confirm_delivery instead
        if self.action == "update_status":
            return [IsAuthenticated(), ModuleDeliveryEnabled(), _NotDeliveryRole()]
        # Creating/editing/deleting deliveries is for store staff (not pure delivery agents)
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAuthenticated(), ModuleDeliveryEnabled(), _NotDeliveryRole()]
        return [IsAuthenticated(), ModuleDeliveryEnabled()]

    def get_serializer_class(self):
        if self.action == "create":
            return DeliveryCreateSerializer
        return DeliverySerializer

    def get_queryset(self):
        store_ids = _user_store_ids(self.request.user)
        qs = (
            Delivery.objects.filter(store_id__in=store_ids)
            .select_related("agent", "zone", "sale", "pickup_location", "seller")
            .prefetch_related("status_history")
        )
        # DELIVERY role users see only their own deliveries + broadcast ones
        if getattr(self.request.user, "role", None) == "DELIVERY":
            try:
                agent = DeliveryAgent.objects.get(user=self.request.user)
                qs = qs.filter(Q(agent=agent) | Q(is_broadcast=True, agent__isnull=True))
            except DeliveryAgent.DoesNotExist:
                qs = qs.none()
        return qs

    def perform_create(self, serializer):
        store = _get_user_store(self.request.user)
        agent = serializer.validated_data.get("agent")
        is_broadcast = not bool(agent)
        instance = serializer.save(
            store=store,
            status=Delivery.Status.PENDING,
            seller=self.request.user,
            is_broadcast=is_broadcast,
        )
        # Auto-populate payout_amount from zone.fee if not provided
        if instance.payout_amount is None and instance.zone_id:
            instance.payout_amount = instance.zone.fee
            instance.save(update_fields=["payout_amount"])
        # Broadcast to all active agents if no agent selected
        if is_broadcast:
            _broadcast_to_agents(instance)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        # Return full representation with DeliverySerializer
        out = DeliverySerializer(serializer.instance).data
        return Response(out, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="update-status")
    def update_status(self, request, pk=None):
        """Change delivery status and log history."""
        delivery = self.get_object()
        new_status = request.data.get("status")
        reason = request.data.get("reason", "")

        if new_status not in Delivery.Status.values:
            return Response(
                {"detail": f"Statut invalide: {new_status}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Block status change on broadcast delivery without an agent
        if delivery.is_broadcast and delivery.agent is None:
            return Response(
                {"detail": "Cette livraison est en attente d'un livreur. Impossible de changer le statut."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        old_status = delivery.status
        delivery.status = new_status

        now = timezone.now()
        if new_status == Delivery.Status.IN_TRANSIT:
            delivery.picked_up_at = delivery.picked_up_at or now
        elif new_status == Delivery.Status.DELIVERED:
            delivery.delivered_at = delivery.delivered_at or now

        delivery.save()

        DeliveryStatusHistory.objects.create(
            delivery=delivery,
            from_status=old_status,
            to_status=new_status,
            changed_by=request.user,
            reason=reason,
        )

        # Auto-notify recipient on key status changes
        if new_status in (Delivery.Status.IN_TRANSIT, Delivery.Status.DELIVERED) and delivery.recipient_phone:
            try:
                from communications.models import MessageTemplate
                from communications.services import render_template
                tpl = MessageTemplate.objects.filter(
                    enterprise=delivery.store.enterprise,
                    trigger_event=MessageTemplate.TriggerEvent.DELIVERY_STATUS,
                    is_active=True,
                ).first()
                ctx = {
                    "recipient_name": delivery.recipient_name,
                    "delivery_address": delivery.delivery_address,
                    "confirmation_code": delivery.confirmation_code,
                    "store_name": delivery.store.name,
                }
                if tpl:
                    body = render_template(tpl.body, ctx)
                    channel = tpl.channel
                elif new_status == Delivery.Status.IN_TRANSIT:
                    body = (
                        f"Bonjour {delivery.recipient_name}, votre colis est en route vers "
                        f"{delivery.delivery_address}. Code de confirmation: {delivery.confirmation_code}"
                    )
                    channel = "SMS"
                else:
                    body = (
                        f"Bonjour {delivery.recipient_name}, votre colis a ete livre. "
                        f"Merci pour votre confiance — {delivery.store.name}"
                    )
                    channel = "SMS"
                _send_delivery_notification(delivery, channel, delivery.recipient_phone, body)
            except Exception:
                pass  # Never block delivery workflow

        # Recompute agent stats if status changed to DELIVERED or RETURNED
        if (
            new_status in (Delivery.Status.DELIVERED, Delivery.Status.RETURNED)
            and delivery.agent_id
        ):
            try:
                period = delivery.created_at.strftime("%Y-%m")
                _recompute_agent_stats(delivery.agent, period, delivery.store)
            except Exception:
                pass

        return Response(DeliverySerializer(delivery).data)

    @action(detail=True, methods=["post"], url_path="confirm-delivery")
    def confirm_delivery(self, request, pk=None):
        """Confirm delivery with recipient's confirmation code."""
        delivery = self.get_object()
        code = request.data.get("code", "")

        if code != delivery.confirmation_code:
            return Response(
                {"detail": "Code de confirmation invalide."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        old_status = delivery.status
        delivery.status = Delivery.Status.DELIVERED
        delivery.delivered_at = timezone.now()
        delivery.save()

        DeliveryStatusHistory.objects.create(
            delivery=delivery,
            from_status=old_status,
            to_status=Delivery.Status.DELIVERED,
            changed_by=request.user if request.user.is_authenticated else None,
            reason="Confirme par le destinataire",
        )

        # Recompute agent stats
        if delivery.agent_id:
            try:
                period = delivery.created_at.strftime("%Y-%m")
                _recompute_agent_stats(delivery.agent, period, delivery.store)
            except Exception:
                pass

        return Response(DeliverySerializer(delivery).data)

    @action(detail=True, methods=["post"], url_path="notify-agent")
    def notify_agent(self, request, pk=None):
        """Send a manual notification to the delivery agent."""
        delivery = self.get_object()
        if not delivery.agent:
            return Response({"detail": "Aucun agent assigné à cette livraison."}, status=status.HTTP_400_BAD_REQUEST)
        if not delivery.agent.phone:
            return Response({"detail": "L'agent n'a pas de numéro de téléphone."}, status=status.HTTP_400_BAD_REQUEST)

        channel = request.data.get("channel", "SMS")
        if channel not in ("SMS", "WHATSAPP", "EMAIL"):
            return Response({"detail": "Canal invalide. Utilisez SMS, WHATSAPP ou EMAIL."}, status=400)

        body = request.data.get("message") or (
            f"Livraison #{delivery.confirmation_code} — "
            f"Destinataire: {delivery.recipient_name} ({delivery.recipient_phone}) — "
            f"Adresse: {delivery.delivery_address}"
        )

        try:
            from communications.services import send_message
            log = send_message(
                store=delivery.store,
                channel=channel,
                recipient=delivery.agent.phone,
                body=body,
            )
            return Response({"detail": "Notification envoyée.", "log_id": str(log.id)})
        except Exception as exc:
            return Response({"detail": f"Erreur lors de l'envoi: {exc}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=["post"], url_path="mark-ready")
    def mark_ready(self, request, pk=None):
        """Stocker marque le colis pret a etre recupere (PENDING/PREPARING → READY)."""
        delivery = self.get_object()
        if delivery.status not in (Delivery.Status.PENDING, Delivery.Status.PREPARING):
            return Response(
                {"detail": "Statut invalide pour marquer pret."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        old_status = delivery.status
        delivery.status = Delivery.Status.READY
        delivery.save(update_fields=["status"])
        DeliveryStatusHistory.objects.create(
            delivery=delivery,
            from_status=old_status,
            to_status=Delivery.Status.READY,
            changed_by=request.user,
            reason="Colis pret pour recuperation",
        )
        return Response(DeliverySerializer(delivery).data)

    @action(detail=True, methods=["post"], url_path="confirm-pickup")
    def confirm_pickup(self, request, pk=None):
        """Livreur confirme la recuperation du colis avec le pickup_code."""
        delivery = self.get_object()

        if delivery.status not in (
            Delivery.Status.PENDING,
            Delivery.Status.PREPARING,
            Delivery.Status.READY,
        ):
            return Response(
                {"detail": "Cette livraison ne peut pas etre recuperee dans son etat actuel."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        code = request.data.get("code", "").strip()
        if code != delivery.pickup_code:
            return Response(
                {"detail": "Code de recuperation invalide."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            old_status = delivery.status
            delivery.status = Delivery.Status.IN_TRANSIT
            delivery.picked_up_at = timezone.now()
            delivery.pickup_confirmed_at = timezone.now()
            delivery.pickup_confirmed_by = request.user
            delivery.save(update_fields=[
                "status", "picked_up_at", "pickup_confirmed_at", "pickup_confirmed_by",
            ])

            DeliveryStatusHistory.objects.create(
                delivery=delivery,
                from_status=old_status,
                to_status=Delivery.Status.IN_TRANSIT,
                changed_by=request.user,
                reason=f"Recuperation confirmee par {request.user.get_full_name() or request.user.email}",
            )

            # Decrementation stock pour chaque article de la vente liee
            if delivery.sale_id:
                try:
                    from stock.services import adjust_stock
                    from stock.models import InventoryMovement
                    for item in delivery.sale.items.select_related("product"):
                        try:
                            adjust_stock(
                                store=delivery.store,
                                product=item.product,
                                qty_delta=-item.quantity,
                                movement_type=InventoryMovement.MovementType.OUT,
                                reason=f"Livraison #{delivery.confirmation_code} — recuperation livreur",
                                reference=delivery.sale.invoice_number or str(delivery.sale_id),
                                actor=request.user,
                            )
                        except Exception:
                            pass
                except Exception:
                    pass

            # Depense caisse si non encore creee
            if not delivery.expense_id:
                payout = delivery.payout_amount or (delivery.zone.fee if delivery.zone else None)
                if payout and payout > 0:
                    try:
                        from django.utils import timezone as tz
                        from expenses.models import ExpenseCategory, Wallet as ExpenseWallet
                        from expenses.services import create_expense
                        cat, _ = ExpenseCategory.objects.get_or_create(
                            enterprise=delivery.store.enterprise,
                            name="Frais de livraison",
                            defaults={"type": "VARIABLE"},
                        )
                        wallet = ExpenseWallet.objects.filter(
                            store=delivery.store,
                            type=ExpenseWallet.WalletType.CASH,
                            is_active=True,
                        ).first()
                        if wallet:
                            expense = create_expense(
                                store=delivery.store,
                                category=cat,
                                wallet=wallet,
                                amount=payout,
                                description=f"Livraison #{delivery.confirmation_code} — {delivery.recipient_name}",
                                expense_date=tz.localdate(),
                                created_by=request.user,
                            )
                            delivery.expense = expense
                            delivery.save(update_fields=["expense"])
                            from cashier.services import _decrement_shift_expected_cash
                            _decrement_shift_expected_cash(delivery.store, payout)
                    except Exception:
                        pass

        return Response(DeliverySerializer(delivery).data)

    @action(detail=False, methods=["get"])
    def available(self, request):
        """Livraisons broadcast sans agent — visibles par tous les livreurs."""
        store_ids = _user_store_ids(request.user)
        qs = (
            Delivery.objects.filter(store_id__in=store_ids, is_broadcast=True, agent__isnull=True)
            .select_related("zone", "pickup_location", "seller")
            .prefetch_related("status_history")
            .order_by("created_at")
        )
        return Response(DeliverySerializer(qs, many=True).data)

    @action(detail=True, methods=["post"])
    def claim(self, request, pk=None):
        """Un livreur (role DELIVERY) reclame une livraison broadcast."""
        delivery = self.get_object()

        # Resolve agent profile from logged-in user
        try:
            agent = DeliveryAgent.objects.get(user=request.user, store=delivery.store, is_active=True)
        except DeliveryAgent.DoesNotExist:
            return Response(
                {"detail": "Aucun profil livreur actif associe a ce compte dans cette boutique."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            locked = Delivery.objects.select_for_update().get(pk=delivery.pk)
            if locked.agent_id:
                return Response(
                    {"detail": "Cette livraison a deja ete prise en charge par un autre livreur."},
                    status=status.HTTP_409_CONFLICT,
                )
            if not locked.is_broadcast:
                return Response(
                    {"detail": "Cette livraison n'est pas disponible pour reclamation."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            old_status = locked.status
            locked.agent = agent
            locked.is_broadcast = False
            locked.status = Delivery.Status.PREPARING
            locked.save(update_fields=["agent", "is_broadcast", "status"])
            DeliveryStatusHistory.objects.create(
                delivery=locked,
                from_status=old_status,
                to_status=Delivery.Status.PREPARING,
                changed_by=request.user,
                reason=f"Reclame par {agent.name}",
            )

        # Notify seller
        if locked.seller:
            try:
                from alerts.models import Alert
                Alert.objects.create(
                    store=locked.store,
                    alert_type=Alert.Type.DELIVERY_LATE,
                    severity=Alert.Severity.INFO,
                    title=f"Livraison #{locked.confirmation_code} prise en charge",
                    message=f"Le livreur {agent.name} a reclame la livraison pour {locked.recipient_name}.",
                    payload={"delivery_id": str(locked.pk), "agent_id": str(agent.pk)},
                )
            except Exception:
                pass
            if getattr(locked.seller, "phone", ""):
                _send_delivery_notification(
                    locked, "SMS", locked.seller.phone,
                    f"Livraison #{locked.confirmation_code} prise en charge par {agent.name}.",
                )

        return Response(DeliverySerializer(locked).data)

    @action(detail=True, methods=["post"])
    def escalate(self, request, pk=None):
        """Signale un retard — cree une alerte DELIVERY_LATE et notifie le vendeur."""
        delivery = self.get_object()
        reason = request.data.get("reason", "Livraison en retard — action requise")

        try:
            from alerts.models import Alert
            Alert.objects.create(
                store=delivery.store,
                alert_type=Alert.Type.DELIVERY_LATE,
                severity=Alert.Severity.WARNING,
                title=f"Livraison #{delivery.confirmation_code} en retard",
                message=reason,
                payload={
                    "delivery_id": str(delivery.pk),
                    "escalated_by": str(request.user.pk),
                },
            )
        except Exception:
            pass

        if delivery.seller and getattr(delivery.seller, "phone", ""):
            _send_delivery_notification(
                delivery, "SMS", delivery.seller.phone,
                f"RETARD livraison #{delivery.confirmation_code}: {reason}",
            )

        return Response({"detail": "Alerte de retard creee."})

    @action(detail=False, methods=["get"])
    def dashboard(self, request):
        """Return delivery stats for today."""
        store_ids = _user_store_ids(request.user)
        today = timezone.localdate()
        qs = Delivery.objects.filter(store_id__in=store_ids, created_at__date=today)

        return Response({
            "date": today.isoformat(),
            "total": qs.count(),
            "pending": qs.filter(status=Delivery.Status.PENDING).count(),
            "preparing": qs.filter(status=Delivery.Status.PREPARING).count(),
            "in_transit": qs.filter(status=Delivery.Status.IN_TRANSIT).count(),
            "delivered": qs.filter(status=Delivery.Status.DELIVERED).count(),
            "returned": qs.filter(status=Delivery.Status.RETURNED).count(),
            "cancelled": qs.filter(status=Delivery.Status.CANCELLED).count(),
            "broadcast": qs.filter(is_broadcast=True, agent__isnull=True).count(),
        })

    @action(detail=True, methods=["get"], url_path="print-label")
    def print_label(self, request, pk=None):
        """Generate a printable shipping label (A5 landscape) for a delivery."""
        delivery = self.get_object()
        from core.pdf import generate_delivery_label_pdf
        return generate_delivery_label_pdf(delivery, delivery.store)


class AgentObjectiveViewSet(viewsets.ModelViewSet):
    serializer_class = AgentObjectiveSerializer

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAuthenticated(), ModuleDeliveryEnabled(), IsManagerOrAdmin()]
        return [IsAuthenticated(), ModuleDeliveryEnabled()]

    def get_queryset(self):
        store_ids = _user_store_ids(self.request.user)
        qs = AgentObjective.objects.filter(store_id__in=store_ids).select_related("agent")
        if period := self.request.query_params.get("period"):
            qs = qs.filter(period=period)
        return qs

    def perform_create(self, serializer):
        store = _get_user_store(self.request.user)
        obj = serializer.save(store=store)
        _recompute_agent_stats(obj.agent, obj.period, store)

    def perform_update(self, serializer):
        obj = serializer.save()
        _recompute_agent_stats(obj.agent, obj.period, obj.store)

    def perform_destroy(self, instance):
        agent, period, store = instance.agent, instance.period, instance.store
        instance.delete()
        _recompute_agent_stats(agent, period, store)


class DeliveryPickupLocationViewSet(viewsets.ModelViewSet):
    serializer_class = DeliveryPickupLocationSerializer

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAuthenticated(), ModuleDeliveryEnabled(), IsManagerOrAdmin()]
        return [IsAuthenticated(), ModuleDeliveryEnabled()]

    def get_queryset(self):
        store_ids = _user_store_ids(self.request.user)
        qs = DeliveryPickupLocation.objects.filter(store_id__in=store_ids)
        if self.request.query_params.get("active_only"):
            qs = qs.filter(is_active=True)
        return qs

    def perform_create(self, serializer):
        serializer.save(store=_get_user_store(self.request.user))
