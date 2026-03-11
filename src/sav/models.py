"""SAV (Service Apres-Vente) models."""
import secrets

from django.conf import settings
from django.db import models

from core.models import TimeStampedModel


class SAVTicket(TimeStampedModel):
    """Dossier SAV principal."""

    class Status(models.TextChoices):
        RECEIVED = "RECEIVED", "Recu"
        DIAGNOSING = "DIAGNOSING", "En diagnostic"
        AWAITING_CLIENT = "AWAITING_CLIENT", "Attente validation client"
        IN_REPAIR = "IN_REPAIR", "En reparation"
        AWAITING_PART = "AWAITING_PART", "En attente piece"
        REPAIRED = "REPAIRED", "Repare"
        NOT_REPAIRABLE = "NOT_REPAIRABLE", "Non reparable"
        READY = "READY", "Pret a restituer"
        RETURNED = "RETURNED", "Restitue"
        CLOSED = "CLOSED", "Cloture"
        REFUSED = "REFUSED", "Refuse par client"

    class WarrantyStatus(models.TextChoices):
        UNDER = "UNDER", "Sous garantie"
        OUT = "OUT", "Hors garantie"
        UNKNOWN = "UNKNOWN", "A verifier"

    class ProductCondition(models.TextChoices):
        GOOD = "GOOD", "Bon etat"
        SCRATCHED = "SCRATCHED", "Rayures"
        DAMAGED = "DAMAGED", "Endommage"
        BROKEN = "BROKEN", "Casse"

    class Priority(models.TextChoices):
        LOW = "LOW", "Basse"
        MEDIUM = "MEDIUM", "Moyenne"
        HIGH = "HIGH", "Haute"
        URGENT = "URGENT", "Urgente"

    # Identity
    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        related_name="sav_tickets",
        verbose_name="boutique",
    )
    reference = models.CharField(
        "reference SAV",
        max_length=20,
        unique=True,
        db_index=True,
    )
    status = models.CharField(
        "statut",
        max_length=20,
        choices=Status.choices,
        default=Status.RECEIVED,
        db_index=True,
    )
    priority = models.CharField(
        "priorite",
        max_length=10,
        choices=Priority.choices,
        default=Priority.MEDIUM,
    )

    # Client
    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sav_tickets",
        verbose_name="client",
    )
    customer_name = models.CharField("nom client", max_length=150)
    customer_phone = models.CharField("telephone client", max_length=30)
    customer_email = models.EmailField("email client", blank=True, default="")

    # Product
    product = models.ForeignKey(
        "catalog.Product",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sav_tickets",
        verbose_name="produit catalogue",
    )
    brand_name = models.CharField("marque", max_length=100)
    model_name = models.CharField("modele", max_length=150)
    serial_number = models.CharField(
        "numero de serie / IMEI",
        max_length=100,
        blank=True,
        default="",
    )
    product_condition = models.CharField(
        "etat visuel",
        max_length=20,
        choices=ProductCondition.choices,
        default=ProductCondition.GOOD,
    )
    warranty_status = models.CharField(
        "statut garantie",
        max_length=10,
        choices=WarrantyStatus.choices,
        default=WarrantyStatus.UNKNOWN,
    )
    warranty_end_date = models.DateField(
        "fin de garantie",
        null=True,
        blank=True,
    )

    # Issue
    declared_issue = models.TextField("panne declaree")
    accessories = models.TextField(
        "accessoires remis",
        blank=True,
        default="",
        help_text="Chargeur, cable, boite, etc.",
    )

    # Assignment
    received_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="sav_received",
        verbose_name="recu par",
    )
    technician = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sav_assigned",
        verbose_name="technicien",
    )

    # Key dates
    diagnosed_at = models.DateTimeField("diagnostique le", null=True, blank=True)
    repair_started_at = models.DateTimeField("reparation commencee le", null=True, blank=True)
    repaired_at = models.DateTimeField("repare le", null=True, blank=True)
    returned_at = models.DateTimeField("restitue le", null=True, blank=True)
    closed_at = models.DateTimeField("cloture le", null=True, blank=True)

    # Return
    return_code = models.CharField(
        "code de restitution",
        max_length=6,
        blank=True,
        default="",
    )
    returned_to = models.CharField(
        "restitue a",
        max_length=150,
        blank=True,
        default="",
    )
    return_notes = models.TextField("notes de restitution", blank=True, default="")

    # Financials
    is_paid_repair = models.BooleanField("reparation payante", default=False)
    total_cost = models.DecimalField(
        "cout total",
        max_digits=12,
        decimal_places=2,
        default=0,
    )
    sale = models.ForeignKey(
        "sales.Sale",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sav_tickets",
        verbose_name="vente/facture liee",
    )

    notes = models.TextField("notes internes", blank=True, default="")
    metadata = models.JSONField("metadata", default=dict, blank=True)

    class Meta:
        verbose_name = "dossier SAV"
        verbose_name_plural = "dossiers SAV"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.reference} — {self.brand_name} {self.model_name}"

    def save(self, *args, **kwargs):
        if not self.reference:
            from django.utils import timezone

            year = timezone.localdate().year
            last = (
                SAVTicket.objects.filter(reference__startswith=f"SAV-{year}-")
                .order_by("-reference")
                .values_list("reference", flat=True)
                .first()
            )
            if last:
                seq = int(last.split("-")[-1]) + 1
            else:
                seq = 1
            self.reference = f"SAV-{year}-{seq:05d}"
        if not self.return_code:
            self.return_code = f"{secrets.randbelow(1000000):06d}"
        super().save(*args, **kwargs)


class SAVPhoto(TimeStampedModel):
    """Photos du produit SAV."""

    class Phase(models.TextChoices):
        RECEPTION = "RECEPTION", "Reception"
        DIAGNOSTIC = "DIAGNOSTIC", "Diagnostic"
        REPAIR = "REPAIR", "Reparation"
        RETURN = "RETURN", "Restitution"

    ticket = models.ForeignKey(
        SAVTicket,
        on_delete=models.CASCADE,
        related_name="photos",
        verbose_name="dossier SAV",
    )
    image = models.ImageField("photo", upload_to="sav/photos/%Y/%m/")
    caption = models.CharField("legende", max_length=200, blank=True, default="")
    phase = models.CharField(
        "phase",
        max_length=20,
        choices=Phase.choices,
        default=Phase.RECEPTION,
    )

    class Meta:
        verbose_name = "photo SAV"
        verbose_name_plural = "photos SAV"
        ordering = ["created_at"]

    def __str__(self):
        return f"Photo {self.pk} — {self.ticket.reference}"


class SAVDiagnosis(TimeStampedModel):
    """Rapport de diagnostic technique."""

    ticket = models.OneToOneField(
        SAVTicket,
        on_delete=models.CASCADE,
        related_name="diagnosis",
        verbose_name="dossier SAV",
    )
    technician = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="sav_diagnoses",
        verbose_name="technicien",
    )
    diagnosis = models.TextField("diagnostic")
    probable_cause = models.TextField("cause probable", blank=True, default="")
    proposed_solution = models.TextField("solution proposee", blank=True, default="")
    estimated_cost = models.DecimalField(
        "cout estime",
        max_digits=12,
        decimal_places=2,
        default=0,
    )
    estimated_days = models.PositiveIntegerField("delai estime (jours)", default=1)
    is_repairable = models.BooleanField("reparable", default=True)
    notes = models.TextField("notes", blank=True, default="")

    class Meta:
        verbose_name = "diagnostic SAV"
        verbose_name_plural = "diagnostics SAV"

    def __str__(self):
        return f"Diagnostic — {self.ticket.reference}"


class SAVDiagnosisPart(TimeStampedModel):
    """Piece necessaire identifiee au diagnostic."""

    diagnosis = models.ForeignKey(
        SAVDiagnosis,
        on_delete=models.CASCADE,
        related_name="parts_needed",
        verbose_name="diagnostic",
    )
    product = models.ForeignKey(
        "catalog.Product",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sav_diagnosis_parts",
        verbose_name="produit catalogue",
    )
    description = models.CharField("description", max_length=200)
    quantity = models.PositiveIntegerField("quantite", default=1)
    unit_cost = models.DecimalField(
        "cout unitaire",
        max_digits=12,
        decimal_places=2,
        default=0,
    )
    in_stock = models.BooleanField("en stock", default=False)

    class Meta:
        verbose_name = "piece diagnostic"
        verbose_name_plural = "pieces diagnostic"

    def __str__(self):
        return self.description


class SAVQuote(TimeStampedModel):
    """Devis SAV pour reparation payante."""

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Brouillon"
        SENT = "SENT", "Envoye"
        ACCEPTED = "ACCEPTED", "Accepte"
        REFUSED = "REFUSED", "Refuse"
        EXPIRED = "EXPIRED", "Expire"

    ticket = models.ForeignKey(
        SAVTicket,
        on_delete=models.CASCADE,
        related_name="quotes",
        verbose_name="dossier SAV",
    )
    reference = models.CharField(
        "reference devis",
        max_length=30,
        unique=True,
    )
    status = models.CharField(
        "statut",
        max_length=10,
        choices=Status.choices,
        default=Status.DRAFT,
    )
    parts_total = models.DecimalField("total pieces", max_digits=12, decimal_places=2, default=0)
    labor_cost = models.DecimalField("main d'oeuvre", max_digits=12, decimal_places=2, default=0)
    total = models.DecimalField("total", max_digits=12, decimal_places=2, default=0)
    valid_until = models.DateField("valide jusqu'au")
    accepted_at = models.DateTimeField("accepte le", null=True, blank=True)
    refused_at = models.DateTimeField("refuse le", null=True, blank=True)
    client_notes = models.TextField("notes client", blank=True, default="")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="sav_quotes_created",
        verbose_name="cree par",
    )

    class Meta:
        verbose_name = "devis SAV"
        verbose_name_plural = "devis SAV"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.reference} — {self.ticket.reference}"

    def save(self, *args, **kwargs):
        if not self.reference:
            from django.utils import timezone

            year = timezone.localdate().year
            last = (
                SAVQuote.objects.filter(reference__startswith=f"DEVIS-SAV-{year}-")
                .order_by("-reference")
                .values_list("reference", flat=True)
                .first()
            )
            seq = int(last.split("-")[-1]) + 1 if last else 1
            self.reference = f"DEVIS-SAV-{year}-{seq:05d}"
        super().save(*args, **kwargs)


class SAVQuoteLine(TimeStampedModel):
    """Ligne de devis SAV."""

    class LineType(models.TextChoices):
        PART = "PART", "Piece"
        LABOR = "LABOR", "Main d'oeuvre"
        OTHER = "OTHER", "Autre"

    quote = models.ForeignKey(
        SAVQuote,
        on_delete=models.CASCADE,
        related_name="lines",
        verbose_name="devis",
    )
    description = models.CharField("description", max_length=200)
    quantity = models.PositiveIntegerField("quantite", default=1)
    unit_price = models.DecimalField("prix unitaire", max_digits=12, decimal_places=2)
    line_type = models.CharField(
        "type",
        max_length=10,
        choices=LineType.choices,
        default=LineType.PART,
    )

    class Meta:
        verbose_name = "ligne devis SAV"
        verbose_name_plural = "lignes devis SAV"

    def __str__(self):
        return self.description

    @property
    def line_total(self):
        return self.quantity * self.unit_price


class SAVRepairAction(TimeStampedModel):
    """Action de reparation enregistree."""

    ticket = models.ForeignKey(
        SAVTicket,
        on_delete=models.CASCADE,
        related_name="repair_actions",
        verbose_name="dossier SAV",
    )
    technician = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="sav_repair_actions",
        verbose_name="technicien",
    )
    description = models.TextField("description")
    duration_minutes = models.PositiveIntegerField("duree (minutes)", null=True, blank=True)
    notes = models.TextField("notes", blank=True, default="")

    class Meta:
        verbose_name = "action reparation"
        verbose_name_plural = "actions reparation"
        ordering = ["created_at"]

    def __str__(self):
        return f"Action — {self.ticket.reference}"


class SAVPartUsed(TimeStampedModel):
    """Piece utilisee lors de la reparation."""

    ticket = models.ForeignKey(
        SAVTicket,
        on_delete=models.CASCADE,
        related_name="parts_used",
        verbose_name="dossier SAV",
    )
    repair_action = models.ForeignKey(
        SAVRepairAction,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="parts_used",
        verbose_name="action de reparation",
    )
    product = models.ForeignKey(
        "catalog.Product",
        on_delete=models.SET_NULL,
        null=True,
        related_name="sav_parts_used",
        verbose_name="produit",
    )
    quantity = models.PositiveIntegerField("quantite", default=1)
    unit_cost = models.DecimalField("cout unitaire", max_digits=12, decimal_places=2, default=0)
    movement = models.ForeignKey(
        "stock.InventoryMovement",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sav_parts",
        verbose_name="mouvement stock",
    )

    class Meta:
        verbose_name = "piece utilisee SAV"
        verbose_name_plural = "pieces utilisees SAV"

    def __str__(self):
        return f"{self.product} x{self.quantity}"


class SAVStatusHistory(TimeStampedModel):
    """Historique des changements de statut."""

    ticket = models.ForeignKey(
        SAVTicket,
        on_delete=models.CASCADE,
        related_name="status_history",
        verbose_name="dossier SAV",
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
        verbose_name = "historique statut SAV"
        verbose_name_plural = "historiques statut SAV"
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.from_status} -> {self.to_status}"
