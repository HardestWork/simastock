"""API views for the SAV (Service Apres-Vente) module."""
from decimal import Decimal

from django.db import transaction
from django.db.models import Avg, Count, Q
from django.utils import timezone
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsManagerOrAdmin
from api.v1.views import _user_store_ids
from sav.models import (
    SAVDiagnosis,
    SAVDiagnosisPart,
    SAVPartUsed,
    SAVPhoto,
    SAVQuote,
    SAVQuoteLine,
    SAVRepairAction,
    SAVStatusHistory,
    SAVTicket,
)
from stores.models import StoreUser


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_user_store(user):
    su = (
        StoreUser.objects.filter(user=user, store__is_active=True)
        .order_by("-is_default")
        .select_related("store")
        .first()
    )
    if not su:
        raise ValidationError({"detail": "Aucune boutique trouvee."})
    return su.store


# ---------------------------------------------------------------------------
# Serializers
# ---------------------------------------------------------------------------


class SAVStatusHistorySerializer(serializers.ModelSerializer):
    changed_by_name = serializers.SerializerMethodField()

    def get_changed_by_name(self, obj):
        if obj.changed_by:
            n = f"{obj.changed_by.first_name} {obj.changed_by.last_name}".strip()
            return n or obj.changed_by.email
        return None

    class Meta:
        model = SAVStatusHistory
        fields = ["id", "from_status", "to_status", "changed_by", "changed_by_name", "reason", "created_at"]
        read_only_fields = fields


class SAVPhotoSerializer(serializers.ModelSerializer):
    class Meta:
        model = SAVPhoto
        fields = ["id", "ticket", "image", "caption", "phase", "created_at"]
        read_only_fields = ["id", "created_at"]


class SAVDiagnosisPartSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True, default=None)

    class Meta:
        model = SAVDiagnosisPart
        fields = ["id", "product", "product_name", "description", "quantity", "unit_cost", "in_stock"]
        read_only_fields = ["id"]


class SAVDiagnosisSerializer(serializers.ModelSerializer):
    technician_name = serializers.SerializerMethodField()
    parts_needed = SAVDiagnosisPartSerializer(many=True, read_only=True)

    def get_technician_name(self, obj):
        if obj.technician:
            n = f"{obj.technician.first_name} {obj.technician.last_name}".strip()
            return n or obj.technician.email
        return None

    class Meta:
        model = SAVDiagnosis
        fields = [
            "id", "ticket", "technician", "technician_name",
            "diagnosis", "probable_cause", "proposed_solution",
            "estimated_cost", "estimated_days", "is_repairable",
            "notes", "parts_needed", "created_at",
        ]
        read_only_fields = ["id", "ticket", "created_at"]


class SAVQuoteLineSerializer(serializers.ModelSerializer):
    line_total = serializers.DecimalField(read_only=True, max_digits=12, decimal_places=2)

    class Meta:
        model = SAVQuoteLine
        fields = ["id", "description", "quantity", "unit_price", "line_type", "line_total"]
        read_only_fields = ["id"]


class SAVQuoteSerializer(serializers.ModelSerializer):
    lines = SAVQuoteLineSerializer(many=True, read_only=True)
    created_by_name = serializers.SerializerMethodField()

    def get_created_by_name(self, obj):
        if obj.created_by:
            n = f"{obj.created_by.first_name} {obj.created_by.last_name}".strip()
            return n or obj.created_by.email
        return None

    class Meta:
        model = SAVQuote
        fields = [
            "id", "ticket", "reference", "status",
            "parts_total", "labor_cost", "total",
            "valid_until", "accepted_at", "refused_at",
            "client_notes", "created_by", "created_by_name",
            "lines", "created_at",
        ]
        read_only_fields = ["id", "reference", "created_at"]


class SAVRepairActionSerializer(serializers.ModelSerializer):
    technician_name = serializers.SerializerMethodField()

    def get_technician_name(self, obj):
        if obj.technician:
            n = f"{obj.technician.first_name} {obj.technician.last_name}".strip()
            return n or obj.technician.email
        return None

    class Meta:
        model = SAVRepairAction
        fields = ["id", "ticket", "technician", "technician_name", "description", "duration_minutes", "notes", "created_at"]
        read_only_fields = ["id", "created_at"]


class SAVPartUsedSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True, default=None)

    class Meta:
        model = SAVPartUsed
        fields = ["id", "ticket", "repair_action", "product", "product_name", "quantity", "unit_cost", "movement", "created_at"]
        read_only_fields = ["id", "movement", "created_at"]


class SAVTicketSerializer(serializers.ModelSerializer):
    status_history = SAVStatusHistorySerializer(many=True, read_only=True)
    photos = SAVPhotoSerializer(many=True, read_only=True)
    diagnosis = SAVDiagnosisSerializer(read_only=True)
    quotes = SAVQuoteSerializer(many=True, read_only=True)
    repair_actions = SAVRepairActionSerializer(many=True, read_only=True)
    parts_used = SAVPartUsedSerializer(many=True, read_only=True)
    received_by_name = serializers.SerializerMethodField()
    technician_name = serializers.SerializerMethodField()
    customer_display = serializers.SerializerMethodField()
    product_name = serializers.CharField(source="product.name", read_only=True, default=None)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    priority_display = serializers.CharField(source="get_priority_display", read_only=True)
    warranty_display = serializers.CharField(source="get_warranty_status_display", read_only=True)
    condition_display = serializers.CharField(source="get_product_condition_display", read_only=True)

    def _user_name(self, user):
        if not user:
            return None
        n = f"{user.first_name} {user.last_name}".strip()
        return n or user.email

    def get_received_by_name(self, obj):
        return self._user_name(obj.received_by)

    def get_technician_name(self, obj):
        return self._user_name(obj.technician)

    def get_customer_display(self, obj):
        return obj.customer_name

    class Meta:
        model = SAVTicket
        fields = [
            "id", "store", "reference", "status", "status_display",
            "priority", "priority_display",
            # Client
            "customer", "customer_name", "customer_phone", "customer_email", "customer_display",
            # Product
            "product", "product_name", "brand_name", "model_name", "serial_number",
            "product_condition", "condition_display",
            "warranty_status", "warranty_display", "warranty_end_date",
            # Issue
            "declared_issue", "accessories",
            # Assignment
            "received_by", "received_by_name", "technician", "technician_name",
            # Dates
            "diagnosed_at", "repair_started_at", "repaired_at", "returned_at", "closed_at",
            # Return
            "return_code", "returned_to", "return_notes",
            # Financials
            "is_paid_repair", "total_cost", "sale",
            # Notes
            "notes", "metadata",
            # Nested
            "status_history", "photos", "diagnosis", "quotes",
            "repair_actions", "parts_used",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "store", "reference", "return_code",
            "received_by", "received_by_name",
            "status_history", "photos", "diagnosis", "quotes",
            "repair_actions", "parts_used",
            "created_at", "updated_at",
        ]


class SAVTicketCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = SAVTicket
        fields = [
            "customer", "customer_name", "customer_phone", "customer_email",
            "product", "brand_name", "model_name", "serial_number",
            "product_condition", "warranty_status", "warranty_end_date",
            "declared_issue", "accessories",
            "technician", "priority", "notes",
        ]
        extra_kwargs = {
            "customer": {"required": False, "allow_null": True},
            "product": {"required": False, "allow_null": True},
            "customer_email": {"required": False},
            "serial_number": {"required": False},
            "warranty_end_date": {"required": False, "allow_null": True},
            "accessories": {"required": False},
            "technician": {"required": False, "allow_null": True},
            "notes": {"required": False},
        }


# ---------------------------------------------------------------------------
# ViewSets
# ---------------------------------------------------------------------------


class SAVTicketViewSet(viewsets.ModelViewSet):
    """CRUD + workflow actions for SAV tickets."""

    permission_classes = [IsAuthenticated]
    filterset_fields = ["status", "priority", "technician", "warranty_status"]
    search_fields = ["reference", "customer_name", "customer_phone", "brand_name", "model_name", "serial_number"]
    ordering_fields = ["created_at", "priority", "status"]

    def get_serializer_class(self):
        if self.action == "create":
            return SAVTicketCreateSerializer
        return SAVTicketSerializer

    def get_queryset(self):
        store_ids = _user_store_ids(self.request.user)
        return (
            SAVTicket.objects.filter(store_id__in=store_ids)
            .select_related("customer", "product", "received_by", "technician", "sale")
            .prefetch_related("status_history", "photos", "quotes__lines", "repair_actions", "parts_used__product")
        )

    def perform_create(self, serializer):
        serializer.save(
            store=_get_user_store(self.request.user),
            received_by=self.request.user,
            status=SAVTicket.Status.RECEIVED,
        )

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        out = SAVTicketSerializer(serializer.instance, context={"request": request}).data
        return Response(out, status=status.HTTP_201_CREATED)

    # ---- Workflow actions ----

    @action(detail=True, methods=["post"], url_path="update-status")
    def update_status(self, request, pk=None):
        """Change SAV ticket status."""
        ticket = self.get_object()
        new_status = request.data.get("status")
        reason = request.data.get("reason", "")

        if new_status not in SAVTicket.Status.values:
            return Response({"detail": f"Statut invalide: {new_status}"}, status=400)

        old_status = ticket.status
        ticket.status = new_status

        now = timezone.now()
        if new_status == SAVTicket.Status.DIAGNOSING and not ticket.diagnosed_at:
            ticket.diagnosed_at = now
        elif new_status == SAVTicket.Status.IN_REPAIR and not ticket.repair_started_at:
            ticket.repair_started_at = now
        elif new_status in (SAVTicket.Status.REPAIRED, SAVTicket.Status.READY):
            ticket.repaired_at = ticket.repaired_at or now
        elif new_status == SAVTicket.Status.RETURNED:
            ticket.returned_at = now
        elif new_status == SAVTicket.Status.CLOSED:
            ticket.closed_at = now

        ticket.save()

        SAVStatusHistory.objects.create(
            ticket=ticket,
            from_status=old_status,
            to_status=new_status,
            changed_by=request.user,
            reason=reason,
        )

        # Notify client on key changes
        if new_status in (SAVTicket.Status.READY, SAVTicket.Status.NOT_REPAIRABLE) and ticket.customer_phone:
            self._notify_client(ticket, new_status)

        return Response(SAVTicketSerializer(ticket, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="assign-technician")
    def assign_technician(self, request, pk=None):
        """Assign a technician to a SAV ticket."""
        ticket = self.get_object()
        tech_id = request.data.get("technician")
        if not tech_id:
            return Response({"detail": "ID technicien requis."}, status=400)

        from accounts.models import User
        try:
            tech = User.objects.get(pk=tech_id)
        except User.DoesNotExist:
            return Response({"detail": "Technicien introuvable."}, status=404)

        ticket.technician = tech
        if ticket.status == SAVTicket.Status.RECEIVED:
            old = ticket.status
            ticket.status = SAVTicket.Status.DIAGNOSING
            ticket.diagnosed_at = ticket.diagnosed_at or timezone.now()
            ticket.save()
            SAVStatusHistory.objects.create(
                ticket=ticket, from_status=old,
                to_status=SAVTicket.Status.DIAGNOSING,
                changed_by=request.user,
                reason=f"Technicien assigne: {tech.get_full_name() or tech.email}",
            )
        else:
            ticket.save(update_fields=["technician"])

        return Response(SAVTicketSerializer(ticket, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def diagnose(self, request, pk=None):
        """Submit diagnosis for a ticket."""
        ticket = self.get_object()

        diagnosis_data = {
            "diagnosis": request.data.get("diagnosis", ""),
            "probable_cause": request.data.get("probable_cause", ""),
            "proposed_solution": request.data.get("proposed_solution", ""),
            "estimated_cost": request.data.get("estimated_cost", 0),
            "estimated_days": request.data.get("estimated_days", 1),
            "is_repairable": request.data.get("is_repairable", True),
            "notes": request.data.get("notes", ""),
        }

        if not diagnosis_data["diagnosis"]:
            return Response({"detail": "Le diagnostic est requis."}, status=400)

        diag, created = SAVDiagnosis.objects.update_or_create(
            ticket=ticket,
            defaults={**diagnosis_data, "technician": request.user},
        )

        # Save parts needed
        parts = request.data.get("parts_needed", [])
        if parts:
            diag.parts_needed.all().delete()
            for p in parts:
                SAVDiagnosisPart.objects.create(
                    diagnosis=diag,
                    product_id=p.get("product"),
                    description=p.get("description", ""),
                    quantity=p.get("quantity", 1),
                    unit_cost=p.get("unit_cost", 0),
                    in_stock=p.get("in_stock", False),
                )

        # Update ticket status
        old = ticket.status
        if not diag.is_repairable:
            ticket.status = SAVTicket.Status.NOT_REPAIRABLE
        elif ticket.warranty_status == SAVTicket.WarrantyStatus.OUT or Decimal(str(diagnosis_data["estimated_cost"])) > 0:
            ticket.is_paid_repair = True
            ticket.status = SAVTicket.Status.AWAITING_CLIENT
        else:
            ticket.status = SAVTicket.Status.IN_REPAIR
            ticket.repair_started_at = ticket.repair_started_at or timezone.now()

        ticket.diagnosed_at = ticket.diagnosed_at or timezone.now()
        ticket.save()

        if old != ticket.status:
            SAVStatusHistory.objects.create(
                ticket=ticket, from_status=old, to_status=ticket.status,
                changed_by=request.user, reason="Diagnostic soumis",
            )

        return Response(SAVTicketSerializer(ticket, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="add-repair-action")
    def add_repair_action(self, request, pk=None):
        """Add a repair action to a ticket."""
        ticket = self.get_object()
        desc = request.data.get("description", "")
        if not desc:
            return Response({"detail": "Description requise."}, status=400)

        action_obj = SAVRepairAction.objects.create(
            ticket=ticket,
            technician=request.user,
            description=desc,
            duration_minutes=request.data.get("duration_minutes"),
            notes=request.data.get("notes", ""),
        )

        # Update status to IN_REPAIR if needed
        if ticket.status not in (SAVTicket.Status.IN_REPAIR, SAVTicket.Status.AWAITING_PART):
            old = ticket.status
            ticket.status = SAVTicket.Status.IN_REPAIR
            ticket.repair_started_at = ticket.repair_started_at or timezone.now()
            ticket.save()
            SAVStatusHistory.objects.create(
                ticket=ticket, from_status=old, to_status=ticket.status,
                changed_by=request.user, reason="Action de reparation ajoutee",
            )

        return Response(SAVRepairActionSerializer(action_obj).data, status=201)

    @action(detail=True, methods=["post"], url_path="use-part")
    def use_part(self, request, pk=None):
        """Register a part used and decrement stock."""
        ticket = self.get_object()
        product_id = request.data.get("product")
        qty = int(request.data.get("quantity", 1))

        if not product_id:
            return Response({"detail": "Produit requis."}, status=400)

        movement = None
        try:
            from stock.services import adjust_stock
            from stock.models import InventoryMovement
            from catalog.models import Product

            prod = Product.objects.get(pk=product_id)
            movement = adjust_stock(
                store=ticket.store,
                product=prod,
                qty_delta=-qty,
                movement_type=InventoryMovement.MovementType.OUT,
                reason=f"SAV #{ticket.reference} — piece reparation",
                reference=ticket.reference,
                actor=request.user,
            )
        except Exception:
            pass

        part = SAVPartUsed.objects.create(
            ticket=ticket,
            repair_action_id=request.data.get("repair_action"),
            product_id=product_id,
            quantity=qty,
            unit_cost=request.data.get("unit_cost", 0),
            movement=movement,
        )

        return Response(SAVPartUsedSerializer(part).data, status=201)

    @action(detail=True, methods=["post"], url_path="confirm-return")
    def confirm_return(self, request, pk=None):
        """Confirm product return to client."""
        ticket = self.get_object()
        code = request.data.get("code", "").strip()

        if code != ticket.return_code:
            return Response({"detail": "Code de restitution invalide."}, status=400)

        old = ticket.status
        ticket.status = SAVTicket.Status.RETURNED
        ticket.returned_at = timezone.now()
        ticket.returned_to = request.data.get("returned_to", ticket.customer_name)
        ticket.return_notes = request.data.get("return_notes", "")
        ticket.save()

        SAVStatusHistory.objects.create(
            ticket=ticket, from_status=old, to_status=ticket.status,
            changed_by=request.user,
            reason=f"Restitue a {ticket.returned_to}",
        )

        return Response(SAVTicketSerializer(ticket, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="upload-photo")
    def upload_photo(self, request, pk=None):
        """Upload a photo for the SAV ticket."""
        ticket = self.get_object()
        image = request.FILES.get("image")
        if not image:
            return Response({"detail": "Image requise."}, status=400)

        photo = SAVPhoto.objects.create(
            ticket=ticket,
            image=image,
            caption=request.data.get("caption", ""),
            phase=request.data.get("phase", SAVPhoto.Phase.RECEPTION),
        )
        return Response(SAVPhotoSerializer(photo).data, status=201)

    @action(detail=False, methods=["get"])
    def dashboard(self, request):
        """SAV dashboard KPIs."""
        store_ids = _user_store_ids(request.user)
        qs = SAVTicket.objects.filter(store_id__in=store_ids)

        today = timezone.localdate()
        month_qs = qs.filter(created_at__year=today.year, created_at__month=today.month)

        # Average repair time (received → repaired) in days
        from django.db.models import F, ExpressionWrapper, DurationField
        repaired = qs.filter(repaired_at__isnull=False)
        avg_repair = None
        if repaired.exists():
            avg_duration = repaired.annotate(
                repair_duration=ExpressionWrapper(
                    F("repaired_at") - F("created_at"),
                    output_field=DurationField(),
                )
            ).aggregate(avg=Avg("repair_duration"))["avg"]
            if avg_duration:
                avg_repair = round(avg_duration.total_seconds() / 86400, 1)

        # Repair rate
        total_closed = qs.filter(status__in=[SAVTicket.Status.CLOSED, SAVTicket.Status.RETURNED, SAVTicket.Status.REPAIRED, SAVTicket.Status.READY]).count()
        total_not_repairable = qs.filter(status=SAVTicket.Status.NOT_REPAIRABLE).count()
        repair_rate = round(total_closed / max(total_closed + total_not_repairable, 1) * 100, 1)

        # Top issues (from declared_issue keywords — simple approach)
        active_statuses = [
            SAVTicket.Status.RECEIVED, SAVTicket.Status.DIAGNOSING,
            SAVTicket.Status.IN_REPAIR, SAVTicket.Status.AWAITING_PART,
            SAVTicket.Status.AWAITING_CLIENT,
        ]

        return Response({
            "month_received": month_qs.count(),
            "total_active": qs.filter(status__in=active_statuses).count(),
            "by_status": {
                "received": qs.filter(status=SAVTicket.Status.RECEIVED).count(),
                "diagnosing": qs.filter(status=SAVTicket.Status.DIAGNOSING).count(),
                "awaiting_client": qs.filter(status=SAVTicket.Status.AWAITING_CLIENT).count(),
                "in_repair": qs.filter(status=SAVTicket.Status.IN_REPAIR).count(),
                "awaiting_part": qs.filter(status=SAVTicket.Status.AWAITING_PART).count(),
                "repaired": qs.filter(status=SAVTicket.Status.REPAIRED).count(),
                "ready": qs.filter(status=SAVTicket.Status.READY).count(),
                "not_repairable": total_not_repairable,
            },
            "avg_repair_days": avg_repair,
            "repair_rate": repair_rate,
            "top_brands": list(
                month_qs.values("brand_name")
                .annotate(count=Count("id"))
                .order_by("-count")[:5]
            ),
        })

    # ---- Helpers ----

    def _notify_client(self, ticket, new_status):
        try:
            from communications.services import send_message
            if new_status == SAVTicket.Status.READY:
                body = (
                    f"Bonjour {ticket.customer_name}, votre appareil {ticket.brand_name} {ticket.model_name} "
                    f"est pret. Ref: {ticket.reference}. Presentez-vous en boutique."
                )
            elif new_status == SAVTicket.Status.NOT_REPAIRABLE:
                body = (
                    f"Bonjour {ticket.customer_name}, apres diagnostic votre {ticket.brand_name} {ticket.model_name} "
                    f"n'est malheureusement pas reparable. Ref: {ticket.reference}. Contactez-nous."
                )
            else:
                return
            send_message(store=ticket.store, channel="SMS", recipient=ticket.customer_phone, body=body)
        except Exception:
            pass


class SAVQuoteViewSet(viewsets.ModelViewSet):
    """CRUD for SAV quotes."""

    permission_classes = [IsAuthenticated]
    serializer_class = SAVQuoteSerializer

    def get_queryset(self):
        store_ids = _user_store_ids(self.request.user)
        return SAVQuote.objects.filter(ticket__store_id__in=store_ids).select_related("ticket", "created_by").prefetch_related("lines")

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=["post"])
    def accept(self, request, pk=None):
        quote = self.get_object()
        quote.status = SAVQuote.Status.ACCEPTED
        quote.accepted_at = timezone.now()
        quote.save(update_fields=["status", "accepted_at"])

        # Move ticket to IN_REPAIR
        ticket = quote.ticket
        old = ticket.status
        ticket.status = SAVTicket.Status.IN_REPAIR
        ticket.repair_started_at = ticket.repair_started_at or timezone.now()
        ticket.total_cost = quote.total
        ticket.save()

        SAVStatusHistory.objects.create(
            ticket=ticket, from_status=old, to_status=ticket.status,
            changed_by=request.user, reason=f"Devis {quote.reference} accepte",
        )

        return Response(SAVQuoteSerializer(quote).data)

    @action(detail=True, methods=["post"])
    def refuse(self, request, pk=None):
        quote = self.get_object()
        quote.status = SAVQuote.Status.REFUSED
        quote.refused_at = timezone.now()
        quote.save(update_fields=["status", "refused_at"])

        ticket = quote.ticket
        old = ticket.status
        ticket.status = SAVTicket.Status.REFUSED
        ticket.save(update_fields=["status"])

        SAVStatusHistory.objects.create(
            ticket=ticket, from_status=old, to_status=ticket.status,
            changed_by=request.user, reason=f"Devis {quote.reference} refuse par client",
        )

        return Response(SAVQuoteSerializer(quote).data)
