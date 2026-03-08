"""Communication Client models — templates, message logs, campaigns."""
from django.db import models

from core.models import TimeStampedModel


class MessageTemplate(TimeStampedModel):
    """Modele de message reutilisable avec placeholders ({{client_name}}, etc.)."""

    class Channel(models.TextChoices):
        SMS = "SMS", "SMS"
        WHATSAPP = "WHATSAPP", "WhatsApp"
        EMAIL = "EMAIL", "Email"

    class TriggerEvent(models.TextChoices):
        MANUAL = "MANUAL", "Manuel"
        SALE_COMPLETED = "SALE_COMPLETED", "Vente payee"
        PAYMENT_RECEIVED = "PAYMENT_RECEIVED", "Paiement recu"
        CREDIT_DUE = "CREDIT_DUE", "Echeance credit"
        DELIVERY_STATUS = "DELIVERY_STATUS", "Statut livraison"

    enterprise = models.ForeignKey(
        "stores.Enterprise",
        on_delete=models.CASCADE,
        related_name="message_templates",
        verbose_name="entreprise",
    )
    name = models.CharField("nom", max_length=100)
    channel = models.CharField(
        "canal",
        max_length=20,
        choices=Channel.choices,
    )
    subject = models.CharField("sujet", max_length=200, blank=True, default="")
    body = models.TextField(
        "contenu",
        help_text="Placeholders: {{client_name}}, {{invoice_number}}, {{amount}}, {{store_name}}",
    )
    trigger_event = models.CharField(
        "evenement declencheur",
        max_length=30,
        choices=TriggerEvent.choices,
        default=TriggerEvent.MANUAL,
    )
    is_active = models.BooleanField("actif", default=True)

    class Meta:
        verbose_name = "modele de message"
        verbose_name_plural = "modeles de message"
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.get_channel_display()})"


class MessageLog(TimeStampedModel):
    """Log immutable de chaque message envoye."""

    class Status(models.TextChoices):
        PENDING = "PENDING", "En attente"
        SENT = "SENT", "Envoye"
        DELIVERED = "DELIVERED", "Delivre"
        FAILED = "FAILED", "Echoue"

    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        related_name="message_logs",
        verbose_name="boutique",
    )
    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="message_logs",
        verbose_name="client",
    )
    template = models.ForeignKey(
        MessageTemplate,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="logs",
        verbose_name="modele",
    )
    channel = models.CharField("canal", max_length=20)
    recipient_contact = models.CharField("contact destinataire", max_length=100)
    subject = models.CharField("sujet", max_length=200, blank=True, default="")
    body_rendered = models.TextField("contenu rendu")
    status = models.CharField(
        "statut",
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )
    error_message = models.TextField("message d'erreur", blank=True, default="")
    sent_at = models.DateTimeField("envoye le", null=True, blank=True)
    metadata = models.JSONField("metadata", default=dict, blank=True)

    class Meta:
        verbose_name = "log de message"
        verbose_name_plural = "logs de messages"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.channel} -> {self.recipient_contact} ({self.status})"


class Campaign(TimeStampedModel):
    """Campagne de communication envoyee a un segment de clients."""

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Brouillon"
        SCHEDULED = "SCHEDULED", "Programmee"
        SENDING = "SENDING", "En cours d'envoi"
        COMPLETED = "COMPLETED", "Terminee"
        CANCELLED = "CANCELLED", "Annulee"

    enterprise = models.ForeignKey(
        "stores.Enterprise",
        on_delete=models.CASCADE,
        related_name="campaigns",
        verbose_name="entreprise",
    )
    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="campaigns",
        verbose_name="boutique",
        help_text="Vide = toutes les boutiques de l'entreprise.",
    )
    name = models.CharField("nom", max_length=150)
    channel = models.CharField("canal", max_length=20)
    template = models.ForeignKey(
        MessageTemplate,
        on_delete=models.PROTECT,
        related_name="campaigns",
        verbose_name="modele",
    )
    segment_filter = models.JSONField(
        "filtre de segment",
        default=dict,
        blank=True,
        help_text='Ex: {"min_purchases": 3, "inactive_days": 30}',
    )
    status = models.CharField(
        "statut",
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
    )
    scheduled_at = models.DateTimeField("programmee le", null=True, blank=True)
    completed_at = models.DateTimeField("terminee le", null=True, blank=True)
    total_recipients = models.PositiveIntegerField("total destinataires", default=0)
    sent_count = models.PositiveIntegerField("envoyes", default=0)
    failed_count = models.PositiveIntegerField("echoues", default=0)

    class Meta:
        verbose_name = "campagne"
        verbose_name_plural = "campagnes"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} ({self.get_status_display()})"
