"""API views for the Communication Client module."""
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from api.v1.permissions import ModuleCommunicationEnabled
from communications.models import Campaign, MessageLog, MessageTemplate
from communications.services import resolve_segment, render_template
from communications.tasks import process_campaign


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _user_enterprise_id(user):
    from stores.models import StoreUser
    su = StoreUser.objects.filter(user=user).select_related("store__enterprise").first()
    return su.store.enterprise_id if su else None


def _current_store_id(request):
    store = getattr(request, "current_store", None)
    return store.id if store else None


# ---------------------------------------------------------------------------
# Serializers
# ---------------------------------------------------------------------------


class MessageTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = MessageTemplate
        fields = [
            "id", "enterprise", "name", "channel", "subject", "body",
            "trigger_event", "is_active", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "enterprise", "created_at", "updated_at"]


class MessageLogSerializer(serializers.ModelSerializer):
    customer_name = serializers.SerializerMethodField()
    template_name = serializers.CharField(source="template.name", read_only=True, default=None)

    def get_customer_name(self, obj):
        if obj.customer:
            return f"{obj.customer.first_name} {obj.customer.last_name}".strip()
        return None

    class Meta:
        model = MessageLog
        fields = [
            "id", "store", "customer", "customer_name", "template", "template_name",
            "channel", "recipient_contact", "subject", "body_rendered",
            "status", "error_message", "sent_at", "created_at",
        ]
        read_only_fields = fields


class CampaignSerializer(serializers.ModelSerializer):
    template_name = serializers.CharField(source="template.name", read_only=True, default=None)

    class Meta:
        model = Campaign
        fields = [
            "id", "enterprise", "store", "name", "channel", "template", "template_name",
            "segment_filter", "status", "scheduled_at", "completed_at",
            "total_recipients", "sent_count", "failed_count",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "enterprise", "status", "completed_at",
            "total_recipients", "sent_count", "failed_count",
            "created_at", "updated_at",
        ]


# ---------------------------------------------------------------------------
# ViewSets
# ---------------------------------------------------------------------------


class MessageTemplateViewSet(viewsets.ModelViewSet):
    serializer_class = MessageTemplateSerializer
    permission_classes = [IsAuthenticated, ModuleCommunicationEnabled]
    filterset_fields = ["channel", "trigger_event", "is_active"]
    search_fields = ["name"]

    def get_queryset(self):
        eid = _user_enterprise_id(self.request.user)
        if not eid:
            return MessageTemplate.objects.none()
        return MessageTemplate.objects.filter(enterprise_id=eid)

    def perform_create(self, serializer):
        eid = _user_enterprise_id(self.request.user)
        serializer.save(enterprise_id=eid)


class MessageLogViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = MessageLogSerializer
    permission_classes = [IsAuthenticated, ModuleCommunicationEnabled]
    filterset_fields = ["channel", "status", "customer"]
    search_fields = ["recipient_contact", "body_rendered"]
    ordering_fields = ["created_at", "sent_at"]

    def get_queryset(self):
        store_id = _current_store_id(self.request)
        if not store_id:
            return MessageLog.objects.none()
        return (
            MessageLog.objects.filter(store_id=store_id)
            .select_related("customer", "template")
        )


class CampaignViewSet(viewsets.ModelViewSet):
    serializer_class = CampaignSerializer
    permission_classes = [IsAuthenticated, ModuleCommunicationEnabled]
    filterset_fields = ["status", "channel"]
    search_fields = ["name"]

    def get_queryset(self):
        eid = _user_enterprise_id(self.request.user)
        if not eid:
            return Campaign.objects.none()
        return Campaign.objects.filter(enterprise_id=eid).select_related("template")

    def perform_create(self, serializer):
        eid = _user_enterprise_id(self.request.user)
        serializer.save(enterprise_id=eid)

    @action(detail=True, methods=["post"])
    def launch(self, request, pk=None):
        """Launch a campaign — starts async message sending."""
        campaign = self.get_object()
        if campaign.status != Campaign.Status.DRAFT:
            return Response(
                {"detail": "Seule une campagne en brouillon peut etre lancee."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        campaign.status = Campaign.Status.SENDING
        campaign.save(update_fields=["status"])
        process_campaign.delay(str(campaign.pk))

        return Response(CampaignSerializer(campaign).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        """Cancel a campaign."""
        campaign = self.get_object()
        if campaign.status in (Campaign.Status.COMPLETED, Campaign.Status.CANCELLED):
            return Response(
                {"detail": "Campagne deja terminee ou annulee."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        campaign.status = Campaign.Status.CANCELLED
        campaign.save(update_fields=["status"])
        return Response(CampaignSerializer(campaign).data)

    @action(detail=True, methods=["get"])
    def preview(self, request, pk=None):
        """Preview: count recipients matching segment filter."""
        campaign = self.get_object()
        eid = _user_enterprise_id(request.user)
        from stores.models import Enterprise
        enterprise = Enterprise.objects.get(pk=eid)
        customers = resolve_segment(enterprise, campaign.segment_filter)
        if campaign.store_id:
            customers = customers.filter(sales__store_id=campaign.store_id).distinct()

        # Render a sample message
        sample = customers.first()
        sample_body = None
        if sample and campaign.template:
            context = {
                "client_name": f"{sample.first_name} {sample.last_name}".strip(),
                "phone": sample.phone or "",
                "email": sample.email or "",
            }
            sample_body = render_template(campaign.template.body, context)

        return Response({
            "recipient_count": customers.count(),
            "sample_message": sample_body,
        })
