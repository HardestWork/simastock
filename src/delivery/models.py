"""Delivery & Logistics models."""
import secrets

from django.conf import settings
from django.db import models

from core.models import TimeStampedModel


class DeliveryPickupLocation(TimeStampedModel):
    """Emplacement de recuperation du colis (entrepot, rayon...)."""

    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        related_name="pickup_locations",
        verbose_name="boutique",
    )
    name = models.CharField("emplacement", max_length=100)
    description = models.TextField("description", blank=True, default="")
    is_active = models.BooleanField("actif", default=True)

    class Meta:
        verbose_name = "emplacement de recuperation"
        verbose_name_plural = "emplacements de recuperation"
        ordering = ["name"]

    def __str__(self):
        return self.name


class DeliveryZone(TimeStampedModel):
    """Zone de livraison avec frais et delai estime."""

    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        related_name="delivery_zones",
        verbose_name="boutique",
    )
    name = models.CharField("nom", max_length=100)
    description = models.TextField("description", blank=True, default="")
    fee = models.DecimalField(
        "frais de livraison",
        max_digits=12,
        decimal_places=2,
        default=0,
    )
    estimated_minutes = models.PositiveIntegerField(
        "delai estime (minutes)",
        null=True,
        blank=True,
    )
    is_active = models.BooleanField("actif", default=True)

    class Meta:
        verbose_name = "zone de livraison"
        verbose_name_plural = "zones de livraison"
        ordering = ["name"]

    def __str__(self):
        return self.name


class DeliveryAgent(TimeStampedModel):
    """Agent/livreur (interne ou externe)."""

    class VehicleType(models.TextChoices):
        MOTO = "MOTO", "Moto"
        VOITURE = "VOITURE", "Voiture"
        VELO = "VELO", "Velo"
        PIETON = "PIETON", "A pied"

    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        related_name="delivery_agents",
        verbose_name="boutique",
    )
    employee = models.ForeignKey(
        "hrm.Employee",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="delivery_agent_profile",
        verbose_name="employe",
    )
    name = models.CharField("nom", max_length=100)
    phone = models.CharField("telephone", max_length=30, blank=True, default="")
    vehicle_type = models.CharField(
        "type de vehicule",
        max_length=20,
        choices=VehicleType.choices,
        default=VehicleType.MOTO,
    )
    is_active = models.BooleanField("actif", default=True)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="delivery_agent_profile",
        verbose_name="compte utilisateur",
    )

    class Meta:
        verbose_name = "livreur"
        verbose_name_plural = "livreurs"
        ordering = ["name"]

    def __str__(self):
        return self.name


class Delivery(TimeStampedModel):
    """Livraison liee a une vente."""

    class Status(models.TextChoices):
        PENDING = "PENDING", "En attente"
        PREPARING = "PREPARING", "En preparation"
        READY = "READY", "Pret"
        IN_TRANSIT = "IN_TRANSIT", "En cours"
        DELIVERED = "DELIVERED", "Livre"
        RETURNED = "RETURNED", "Retourne"
        CANCELLED = "CANCELLED", "Annule"

    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        related_name="deliveries",
        verbose_name="boutique",
    )
    sale = models.ForeignKey(
        "sales.Sale",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="deliveries",
        verbose_name="vente",
    )
    agent = models.ForeignKey(
        DeliveryAgent,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="deliveries",
        verbose_name="livreur",
    )
    zone = models.ForeignKey(
        DeliveryZone,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="deliveries",
        verbose_name="zone",
    )
    status = models.CharField(
        "statut",
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True,
    )
    delivery_address = models.TextField("adresse de livraison")
    recipient_name = models.CharField("nom du destinataire", max_length=100)
    recipient_phone = models.CharField("telephone du destinataire", max_length=30)
    scheduled_at = models.DateTimeField("prevu le", null=True, blank=True)
    picked_up_at = models.DateTimeField("recupere le", null=True, blank=True)
    delivered_at = models.DateTimeField("livre le", null=True, blank=True)
    confirmation_code = models.CharField(
        "code de confirmation",
        max_length=6,
        blank=True,
        default="",
    )
    notes = models.TextField("notes", blank=True, default="")
    metadata = models.JSONField("metadata", default=dict, blank=True)
    payout_amount = models.DecimalField(
        "montant remis au livreur",
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Montant en especes donne a l'agent. Par defaut = zone.fee.",
    )
    expense = models.ForeignKey(
        "expenses.Expense",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="deliveries",
        verbose_name="depense caisse liee",
    )
    is_broadcast = models.BooleanField(
        "diffuse a tous les livreurs",
        default=False,
        db_index=True,
        help_text="True si aucun agent n'a ete selectionne — tous les livreurs peuvent la reclamer.",
    )
    seller = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_deliveries",
        verbose_name="createur",
    )
    pickup_location = models.ForeignKey(
        DeliveryPickupLocation,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="deliveries",
        verbose_name="emplacement de recuperation",
    )
    collector_name = models.CharField(
        "nom du recuperateur",
        max_length=100,
        blank=True,
        default="",
        help_text="Personne qui vient recuperer le colis (si different du destinataire).",
    )
    collector_phone = models.CharField(
        "telephone du recuperateur",
        max_length=30,
        blank=True,
        default="",
    )
    pickup_notes = models.TextField("notes de recuperation", blank=True, default="")
    pickup_code = models.CharField(
        "code de recuperation",
        max_length=6,
        blank=True,
        default="",
        help_text="Code communique au livreur pour confirmer la recuperation du colis.",
    )
    pickup_confirmed_at = models.DateTimeField("recupere le", null=True, blank=True)
    pickup_confirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="pickup_confirmations",
        verbose_name="recupere par",
    )

    class Meta:
        verbose_name = "livraison"
        verbose_name_plural = "livraisons"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Livraison {self.pk} - {self.get_status_display()}"

    def save(self, *args, **kwargs):
        if not self.confirmation_code:
            self.confirmation_code = f"{secrets.randbelow(1000000):06d}"
        if not self.pickup_code:
            self.pickup_code = f"{secrets.randbelow(1000000):06d}"
        super().save(*args, **kwargs)


class DeliveryStatusHistory(TimeStampedModel):
    """Historique immutable des changements de statut."""

    delivery = models.ForeignKey(
        Delivery,
        on_delete=models.CASCADE,
        related_name="status_history",
        verbose_name="livraison",
    )
    from_status = models.CharField("ancien statut", max_length=20)
    to_status = models.CharField("nouveau statut", max_length=20)
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="modifie par",
    )
    reason = models.CharField("raison", max_length=200, blank=True, default="")

    class Meta:
        verbose_name = "historique statut livraison"
        verbose_name_plural = "historiques statut livraison"
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.from_status} -> {self.to_status}"


class AgentObjective(TimeStampedModel):
    """Objectif mensuel de livraisons pour un agent."""

    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        related_name="agent_objectives",
        verbose_name="boutique",
    )
    agent = models.ForeignKey(
        DeliveryAgent,
        on_delete=models.CASCADE,
        related_name="objectives",
        verbose_name="livreur",
    )
    period = models.CharField("periode", max_length=7)  # YYYY-MM
    target_count = models.PositiveIntegerField("objectif livraisons")
    bonus_amount = models.DecimalField(
        "bonus FCFA",
        max_digits=12,
        decimal_places=2,
        default=0,
    )
    notes = models.TextField("notes", blank=True)

    class Meta:
        verbose_name = "objectif livreur"
        verbose_name_plural = "objectifs livreurs"
        unique_together = [("agent", "period")]
        ordering = ["-period"]

    def __str__(self):
        return f"{self.agent.name} — {self.period} ({self.target_count} livraisons)"


class AgentMonthlyStats(TimeStampedModel):
    """Stats mensuelles calculees pour un agent."""

    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        related_name="agent_monthly_stats",
        verbose_name="boutique",
    )
    agent = models.ForeignKey(
        DeliveryAgent,
        on_delete=models.CASCADE,
        related_name="monthly_stats",
        verbose_name="livreur",
    )
    period = models.CharField("periode", max_length=7)  # YYYY-MM
    delivered_count = models.PositiveIntegerField("livrees", default=0)
    total_count = models.PositiveIntegerField("total", default=0)
    returned_count = models.PositiveIntegerField("retournees", default=0)
    bonus_earned = models.DecimalField(
        "bonus gagne",
        max_digits=12,
        decimal_places=2,
        default=0,
    )
    is_final = models.BooleanField("mois cloture", default=False)

    class Meta:
        verbose_name = "stats mensuelles livreur"
        verbose_name_plural = "stats mensuelles livreurs"
        unique_together = [("agent", "period")]
        ordering = ["-period"]

    def __str__(self):
        return f"{self.agent.name} — {self.period}"

    @property
    def success_rate(self):
        if not self.total_count:
            return 0
        return round(self.delivered_count / self.total_count * 100, 1)
