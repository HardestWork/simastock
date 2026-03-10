"""API views for the AI app."""
import json
import logging

from django.http import StreamingHttpResponse
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView

from .models import (
    AIConversation, AIMessage, AIUsageLog,
    AICreditBalance, AICreditTransaction, UserActivitySession,
)
from .services.assistant import chat, stream_chat

logger = logging.getLogger("boutique")

MAX_MESSAGE_LENGTH = 2000  # chars — prevents token abuse


class AIChatThrottle(UserRateThrottle):
    """Strict rate limit for AI chat endpoints (costly API calls)."""
    scope = "ai_chat"


class AICreditThrottle(UserRateThrottle):
    """Rate limit for credit operations."""
    scope = "ai_credit"


# ---------------------------------------------------------------------------
# Chat endpoint (non-streaming)
# ---------------------------------------------------------------------------

class AIChatView(APIView):
    """Send a message to the AI assistant and get a complete response."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [AIChatThrottle]

    def post(self, request):
        store = getattr(request, "current_store", None)
        if not store:
            return Response(
                {"detail": "Aucune boutique selectionnee."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        message = request.data.get("message", "").strip()
        if not message:
            return Response(
                {"detail": "Le message est requis."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if len(message) > MAX_MESSAGE_LENGTH:
            return Response(
                {"detail": f"Le message ne peut pas depasser {MAX_MESSAGE_LENGTH} caracteres."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        conversation_id = request.data.get("conversation_id")

        try:
            result = chat(
                user=request.user,
                store=store,
                message=message,
                conversation_id=conversation_id,
            )
            return Response(result)
        except Exception as e:
            logger.exception("AI chat error: %s", e)
            return Response(
                {"detail": "Une erreur est survenue avec l'assistant IA. Veuillez reessayer."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


# ---------------------------------------------------------------------------
# Chat endpoint (streaming via SSE)
# ---------------------------------------------------------------------------

class AIChatStreamView(APIView):
    """Stream a chat response via Server-Sent Events."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [AIChatThrottle]

    def post(self, request):
        store = getattr(request, "current_store", None)
        if not store:
            return Response(
                {"detail": "Aucune boutique selectionnee."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        message = request.data.get("message", "").strip()
        if not message:
            return Response(
                {"detail": "Le message est requis."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if len(message) > MAX_MESSAGE_LENGTH:
            return Response(
                {"detail": f"Le message ne peut pas depasser {MAX_MESSAGE_LENGTH} caracteres."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        conversation_id = request.data.get("conversation_id")

        def event_stream():
            try:
                yield from stream_chat(
                    user=request.user,
                    store=store,
                    message=message,
                    conversation_id=conversation_id,
                )
            except Exception as e:
                logger.exception("AI stream error: %s", e)
                yield f'data: {json.dumps({"type": "error", "detail": "Une erreur est survenue. Veuillez reessayer."})}\n\n'

        response = StreamingHttpResponse(
            event_stream(),
            content_type="text/event-stream",
        )
        response["Cache-Control"] = "no-cache"
        response["X-Accel-Buffering"] = "no"
        return response


# ---------------------------------------------------------------------------
# Conversations list
# ---------------------------------------------------------------------------

class AIConversationListView(APIView):
    """List the user's AI conversations."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        store = getattr(request, "current_store", None)
        if not store:
            return Response({"results": []})

        conversations = (
            AIConversation.objects.filter(
                user=request.user,
                store=store,
                status=AIConversation.Status.ACTIVE,
            )
            .order_by("-updated_at")[:30]
        )

        return Response({
            "results": [
                {
                    "id": str(c.pk),
                    "title": c.title or "Sans titre",
                    "feature": c.feature,
                    "updated_at": c.updated_at.isoformat(),
                    "message_count": c.messages.count(),
                }
                for c in conversations
            ],
        })


# ---------------------------------------------------------------------------
# Conversation detail (messages)
# ---------------------------------------------------------------------------

class AIConversationDetailView(APIView):
    """Get all messages in a conversation."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            conversation = AIConversation.objects.get(
                pk=pk,
                user=request.user,
            )
        except AIConversation.DoesNotExist:
            return Response(
                {"detail": "Conversation introuvable."},
                status=status.HTTP_404_NOT_FOUND,
            )

        messages = conversation.messages.order_by("created_at")

        return Response({
            "id": str(conversation.pk),
            "title": conversation.title,
            "feature": conversation.feature,
            "status": conversation.status,
            "messages": [
                {
                    "id": str(m.pk),
                    "role": m.role,
                    "content": m.content,
                    "created_at": m.created_at.isoformat(),
                }
                for m in messages
            ],
        })

    def delete(self, request, pk):
        """Archive a conversation."""
        try:
            conversation = AIConversation.objects.get(pk=pk, user=request.user)
        except AIConversation.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        conversation.status = AIConversation.Status.ARCHIVED
        conversation.save(update_fields=["status", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Usage stats (admin only)
# ---------------------------------------------------------------------------

class AIUsageView(APIView):
    """Get AI usage statistics for the enterprise."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        if getattr(user, "role", "") not in ("ADMIN", "MANAGER"):
            return Response(
                {"detail": "Acces reserve aux administrateurs."},
                status=status.HTTP_403_FORBIDDEN,
            )

        enterprise = getattr(request, "current_enterprise", None)
        if not enterprise:
            return Response({"detail": "Aucune entreprise."}, status=400)

        from django.db.models import Sum, Count
        from django.utils import timezone
        from datetime import timedelta

        now = timezone.now()
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        logs = AIUsageLog.objects.filter(
            enterprise=enterprise,
            created_at__gte=month_start,
        )

        agg = logs.aggregate(
            total_requests=Count("id"),
            total_tokens_in=Sum("tokens_input"),
            total_tokens_out=Sum("tokens_output"),
            total_cost=Sum("estimated_cost_usd"),
        )

        by_feature = (
            logs.values("feature")
            .annotate(
                count=Count("id"),
                tokens=Sum("tokens_input") + Sum("tokens_output"),
                cost=Sum("estimated_cost_usd"),
            )
            .order_by("-count")
        )

        return Response({
            "period": "month",
            "total_requests": agg["total_requests"] or 0,
            "total_tokens": (agg["total_tokens_in"] or 0) + (agg["total_tokens_out"] or 0),
            "estimated_cost_usd": str(agg["total_cost"] or 0),
            "by_feature": [
                {
                    "feature": f["feature"],
                    "requests": f["count"],
                    "tokens": f["tokens"],
                    "cost_usd": str(f["cost"]),
                }
                for f in by_feature
            ],
        })


# ---------------------------------------------------------------------------
# AI Credits — balance and transactions
# ---------------------------------------------------------------------------

class AICreditBalanceView(APIView):
    """Get AI credit balance for the current enterprise."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        enterprise = getattr(request, "current_enterprise", None)
        if not enterprise:
            return Response({"balance": 0, "has_credits": False})

        balance, _ = AICreditBalance.objects.get_or_create(
            enterprise=enterprise,
            defaults={"balance": 0},
        )
        return Response({
            "balance": balance.balance,
            "has_credits": balance.has_credits,
        })


class AICreditAddView(APIView):
    """Add AI credits to an enterprise (admin only)."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [AICreditThrottle]

    def post(self, request):
        user = request.user
        if getattr(user, "role", "") not in ("ADMIN",):
            return Response(
                {"detail": "Seul l'administrateur peut ajouter des credits."},
                status=status.HTTP_403_FORBIDDEN,
            )

        enterprise = getattr(request, "current_enterprise", None)
        if not enterprise:
            return Response({"detail": "Aucune entreprise."}, status=400)

        amount = request.data.get("amount", 0)
        try:
            amount = int(amount)
        except (TypeError, ValueError):
            return Response({"detail": "Montant invalide."}, status=400)

        if amount <= 0:
            return Response({"detail": "Le montant doit etre positif."}, status=400)

        payment_reference = request.data.get("payment_reference", "")
        amount_paid_fcfa = int(request.data.get("amount_paid_fcfa", 0))
        description = request.data.get("description", f"Achat de {amount} credits IA")

        balance, _ = AICreditBalance.objects.get_or_create(
            enterprise=enterprise,
            defaults={"balance": 0},
        )
        balance.add(amount)

        AICreditTransaction.objects.create(
            enterprise=enterprise,
            transaction_type=AICreditTransaction.TransactionType.PURCHASE,
            amount=amount,
            balance_after=balance.balance,
            description=description,
            user=user,
            payment_reference=payment_reference,
            amount_paid_fcfa=amount_paid_fcfa,
        )

        return Response({
            "balance": balance.balance,
            "message": f"{amount} credits ajoutes.",
        })


class AICreditTransactionListView(APIView):
    """List AI credit transactions for the enterprise."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        enterprise = getattr(request, "current_enterprise", None)
        if not enterprise:
            return Response({"results": []})

        transactions = AICreditTransaction.objects.filter(
            enterprise=enterprise,
        ).order_by("-created_at")[:50]

        return Response({
            "results": [
                {
                    "id": str(t.pk),
                    "type": t.transaction_type,
                    "amount": t.amount,
                    "balance_after": t.balance_after,
                    "description": t.description,
                    "payment_reference": t.payment_reference,
                    "amount_paid_fcfa": t.amount_paid_fcfa,
                    "created_at": t.created_at.isoformat(),
                }
                for t in transactions
            ],
        })


# ---------------------------------------------------------------------------
# User Activity Tracking — heartbeat + daily summary
# ---------------------------------------------------------------------------

class ActivityHeartbeatView(APIView):
    """Record a heartbeat from the frontend to track user activity."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        store = getattr(request, "current_store", None)
        if not store:
            return Response({"ok": True})

        from django.utils import timezone
        now = timezone.now()
        today = now.date()
        user = request.user

        # Get or create today's session
        session = UserActivitySession.objects.filter(
            user=user,
            store=store,
            date=today,
            is_active=True,
        ).first()

        heartbeat_interval = 60  # seconds between heartbeats

        if session:
            # Update existing session
            elapsed = (now - session.last_heartbeat).total_seconds()
            # Only count time if heartbeat is within 3 minutes (not a stale session)
            if elapsed <= 180:
                session.total_seconds += int(min(elapsed, heartbeat_interval))
            session.last_heartbeat = now
            session.page_views += 1
            session.save(update_fields=["last_heartbeat", "total_seconds", "page_views", "updated_at"])
        else:
            # Close any stale sessions
            UserActivitySession.objects.filter(
                user=user, store=store, is_active=True,
            ).update(is_active=False)

            # Create new session
            session = UserActivitySession.objects.create(
                user=user,
                store=store,
                date=today,
                started_at=now,
                last_heartbeat=now,
                total_seconds=0,
                page_views=1,
                is_active=True,
            )

        return Response({
            "ok": True,
            "session_minutes": session.total_seconds // 60,
        })


class ActivitySummaryView(APIView):
    """Get daily activity summary for all users in a store (manager/admin)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        if getattr(user, "role", "") not in ("ADMIN", "MANAGER"):
            return Response(
                {"detail": "Acces reserve aux managers."},
                status=status.HTTP_403_FORBIDDEN,
            )

        store = getattr(request, "current_store", None)
        if not store:
            return Response({"results": []})

        from django.utils import timezone
        from django.db.models import Sum, Count

        date_str = request.query_params.get("date")
        if date_str:
            from datetime import date as dt_date
            try:
                target_date = dt_date.fromisoformat(date_str)
            except ValueError:
                target_date = timezone.now().date()
        else:
            target_date = timezone.now().date()

        sessions = (
            UserActivitySession.objects.filter(
                store=store,
                date=target_date,
            )
            .values("user__id", "user__first_name", "user__last_name", "user__email", "user__role")
            .annotate(
                total_time=Sum("total_seconds"),
                total_pages=Sum("page_views"),
                session_count=Count("id"),
            )
            .order_by("-total_time")
        )

        return Response({
            "date": target_date.isoformat(),
            "results": [
                {
                    "user_id": str(s["user__id"]),
                    "user_name": f"{s['user__first_name']} {s['user__last_name']}".strip() or s["user__email"],
                    "role": s["user__role"],
                    "total_minutes": (s["total_time"] or 0) // 60,
                    "total_seconds": s["total_time"] or 0,
                    "page_views": s["total_pages"] or 0,
                    "sessions": s["session_count"],
                }
                for s in sessions
            ],
        })
