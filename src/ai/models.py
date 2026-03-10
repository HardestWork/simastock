"""Models for the AI app — conversations, messages, usage tracking, caching."""
from decimal import Decimal

from django.conf import settings
from django.db import models

from core.models import TimeStampedModel


# ---------------------------------------------------------------------------
# Feature choices (shared across models)
# ---------------------------------------------------------------------------

class AIFeature(models.TextChoices):
    ASSISTANT = "ASSISTANT", "Assistant IA"
    NL_REPORT = "NL_REPORT", "Rapport langage naturel"
    SMART_ENTRY = "SMART_ENTRY", "Saisie intelligente"
    STOCK_PREDICTION = "STOCK_PREDICTION", "Prediction de stock"
    CUSTOMER_ANALYSIS = "CUSTOMER_ANALYSIS", "Analyse client"
    PRICE_RECOMMENDATION = "PRICE_RECO", "Recommandation de prix"
    ANOMALY_DETECTION = "ANOMALY", "Detection d'anomalies"
    CREDIT_REMINDER = "CREDIT_REMINDER", "Relance credit"


# ---------------------------------------------------------------------------
# AIConversation
# ---------------------------------------------------------------------------

class AIConversation(TimeStampedModel):
    """A conversation thread between a user and the AI assistant."""

    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        related_name="ai_conversations",
        verbose_name="boutique",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="ai_conversations",
        verbose_name="utilisateur",
    )
    feature = models.CharField(
        "fonctionnalite",
        max_length=20,
        choices=AIFeature.choices,
        default=AIFeature.ASSISTANT,
    )
    title = models.CharField("titre", max_length=200, blank=True, default="")

    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        ARCHIVED = "ARCHIVED", "Archivee"

    status = models.CharField(
        "statut",
        max_length=10,
        choices=Status.choices,
        default=Status.ACTIVE,
    )
    metadata = models.JSONField("metadonnees", default=dict, blank=True)

    class Meta:
        verbose_name = "conversation IA"
        verbose_name_plural = "conversations IA"
        ordering = ["-updated_at"]

    def __str__(self):
        return f"[{self.feature}] {self.title or 'Sans titre'} — {self.user}"


# ---------------------------------------------------------------------------
# AIMessage
# ---------------------------------------------------------------------------

class AIMessage(TimeStampedModel):
    """A single message in an AI conversation."""

    class Role(models.TextChoices):
        USER = "user", "Utilisateur"
        ASSISTANT = "assistant", "Assistant"
        SYSTEM = "system", "Systeme"

    conversation = models.ForeignKey(
        AIConversation,
        on_delete=models.CASCADE,
        related_name="messages",
        verbose_name="conversation",
    )
    role = models.CharField("role", max_length=10, choices=Role.choices)
    content = models.TextField("contenu")
    tool_calls = models.JSONField("appels outils", default=list, blank=True)
    tool_results = models.JSONField("resultats outils", default=list, blank=True)
    tokens_input = models.IntegerField("tokens entree", default=0)
    tokens_output = models.IntegerField("tokens sortie", default=0)
    model = models.CharField("modele", max_length=60, blank=True, default="")
    duration_ms = models.IntegerField("duree (ms)", default=0)

    class Meta:
        verbose_name = "message IA"
        verbose_name_plural = "messages IA"
        ordering = ["created_at"]

    def __str__(self):
        preview = self.content[:60] + ("..." if len(self.content) > 60 else "")
        return f"[{self.role}] {preview}"


# ---------------------------------------------------------------------------
# AIUsageLog
# ---------------------------------------------------------------------------

class AIUsageLog(TimeStampedModel):
    """Track AI API usage per enterprise for billing and rate-limiting."""

    enterprise = models.ForeignKey(
        "stores.Enterprise",
        on_delete=models.CASCADE,
        related_name="ai_usage_logs",
        verbose_name="entreprise",
    )
    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ai_usage_logs",
        verbose_name="boutique",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="ai_usage_logs",
        verbose_name="utilisateur",
    )
    feature = models.CharField(
        "fonctionnalite",
        max_length=20,
        choices=AIFeature.choices,
    )
    model = models.CharField("modele", max_length=60)
    tokens_input = models.IntegerField("tokens entree", default=0)
    tokens_output = models.IntegerField("tokens sortie", default=0)
    estimated_cost_usd = models.DecimalField(
        "cout estime (USD)",
        max_digits=10,
        decimal_places=6,
        default=Decimal("0"),
    )
    cached = models.BooleanField("cache", default=False)

    class Meta:
        verbose_name = "log usage IA"
        verbose_name_plural = "logs usage IA"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.feature} — {self.tokens_input + self.tokens_output} tokens"


# ---------------------------------------------------------------------------
# AIResponseCache
# ---------------------------------------------------------------------------

class AIResponseCache(TimeStampedModel):
    """Cache AI responses to avoid redundant API calls."""

    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        related_name="ai_cache",
        verbose_name="boutique",
    )
    feature = models.CharField(
        "fonctionnalite",
        max_length=20,
        choices=AIFeature.choices,
    )
    cache_key = models.CharField(
        "cle de cache",
        max_length=64,
        unique=True,
        db_index=True,
    )
    response = models.TextField("reponse")
    expires_at = models.DateTimeField("expiration")

    class Meta:
        verbose_name = "cache reponse IA"
        verbose_name_plural = "cache reponses IA"

    def __str__(self):
        return f"Cache [{self.feature}] {self.cache_key[:16]}..."


# ---------------------------------------------------------------------------
# AICreditBalance — enterprise-level AI credit wallet
# ---------------------------------------------------------------------------

class AICreditBalance(TimeStampedModel):
    """AI credit balance for an enterprise. Credits are purchased and consumed."""

    enterprise = models.OneToOneField(
        "stores.Enterprise",
        on_delete=models.CASCADE,
        related_name="ai_credit_balance",
        verbose_name="entreprise",
    )
    balance = models.IntegerField(
        "solde (credits)",
        default=0,
        help_text="Nombre de credits IA restants. 1 credit ≈ 1 message assistant.",
    )

    class Meta:
        verbose_name = "solde credits IA"
        verbose_name_plural = "soldes credits IA"

    def __str__(self):
        return f"Credits IA — {self.enterprise} : {self.balance}"

    @property
    def has_credits(self):
        return self.balance > 0

    def consume(self, amount: int = 1):
        """Consume credits atomically. Raises ValueError if insufficient."""
        if amount <= 0:
            return
        from django.db.models import F
        updated = AICreditBalance.objects.filter(
            pk=self.pk, balance__gte=amount,
        ).update(balance=F("balance") - amount)
        if not updated:
            raise ValueError(
                f"Credits IA insuffisants. Solde: {self.balance}, requis: {amount}."
            )
        self.refresh_from_db(fields=["balance"])

    def add(self, amount: int):
        """Add credits atomically."""
        if amount <= 0:
            return
        from django.db.models import F
        AICreditBalance.objects.filter(pk=self.pk).update(
            balance=F("balance") + amount,
        )
        self.refresh_from_db(fields=["balance"])


# ---------------------------------------------------------------------------
# AICreditTransaction — purchase / consumption log
# ---------------------------------------------------------------------------

class AICreditTransaction(TimeStampedModel):
    """Log of credit purchases and consumptions."""

    class TransactionType(models.TextChoices):
        PURCHASE = "PURCHASE", "Achat"
        CONSUMPTION = "CONSUMPTION", "Consommation"
        BONUS = "BONUS", "Bonus"
        ADJUSTMENT = "ADJUSTMENT", "Ajustement"

    enterprise = models.ForeignKey(
        "stores.Enterprise",
        on_delete=models.CASCADE,
        related_name="ai_credit_transactions",
        verbose_name="entreprise",
    )
    transaction_type = models.CharField(
        "type",
        max_length=15,
        choices=TransactionType.choices,
    )
    amount = models.IntegerField(
        "montant (credits)",
        help_text="Positif = ajout, negatif = consommation.",
    )
    balance_after = models.IntegerField("solde apres")
    description = models.CharField("description", max_length=300, blank=True, default="")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="utilisateur",
    )
    # For purchases: reference / payment info
    payment_reference = models.CharField(
        "reference paiement",
        max_length=100,
        blank=True,
        default="",
    )
    amount_paid_fcfa = models.IntegerField(
        "montant paye (FCFA)",
        default=0,
    )

    class Meta:
        verbose_name = "transaction credits IA"
        verbose_name_plural = "transactions credits IA"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.get_transaction_type_display()} {self.amount:+d} credits"


# ---------------------------------------------------------------------------
# UserActivitySession — track user time on the app
# ---------------------------------------------------------------------------

class UserActivitySession(TimeStampedModel):
    """Track user activity sessions via heartbeat from the frontend."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="activity_sessions",
        verbose_name="utilisateur",
    )
    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        related_name="activity_sessions",
        verbose_name="boutique",
    )
    date = models.DateField("date", db_index=True)
    started_at = models.DateTimeField("debut")
    last_heartbeat = models.DateTimeField("dernier heartbeat")
    total_seconds = models.IntegerField(
        "duree totale (secondes)",
        default=0,
        help_text="Temps actif cumule pour cette session.",
    )
    page_views = models.IntegerField("pages vues", default=0)
    is_active = models.BooleanField("session active", default=True)

    class Meta:
        verbose_name = "session activite"
        verbose_name_plural = "sessions activite"
        ordering = ["-date", "-last_heartbeat"]
        indexes = [
            models.Index(fields=["user", "date"]),
            models.Index(fields=["store", "date"]),
        ]

    def __str__(self):
        return f"{self.user} — {self.date} — {self.total_seconds // 60}min"
