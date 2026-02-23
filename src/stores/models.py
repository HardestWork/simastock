"""Models for the stores app."""
import re
import uuid
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.db.models import F
from django.utils import timezone
from django.utils.text import slugify

from core.models import TimeStampedModel


ANALYTICS_FEATURE_KEYS = (
    "enabled",
    "dashboard_strategic",
    "abc_analysis",
    "dynamic_reorder",
    "credit_scoring",
    "sales_forecast",
    "fraud_detection",
)

FEATURE_FLAG_LABELS = {
  "sales_pos": "POS / nouvelles ventes",
  "sales_refund": "Remboursements de ventes",
  "cashier_operations": "Encaissement / caisse",
  "stock_management": "Gestion stock (niveaux, mouvements, inventaires)",
  "stock_entries": "Entrees et ajustements de stock",
  "purchases_management": "Achats (fournisseurs, commandes, receptions)",
  "credit_management": "Credits clients",
  "expenses_management": "Gestion des depenses",
  "alerts_center": "Centre d'alertes",
  "reports_center": "Rapports standards",
  "vat": "TVA (calcul & affichage)",
  "enabled": "Module analytics global",
  "dashboard_strategic": "Dashboard strategique DG",
  "abc_analysis": "Analyse ABC automatique",
  "dynamic_reorder": "Reapprovisionnement dynamique",
  "credit_scoring": "Score client credit",
  "sales_forecast": "Prevision ventes (moyenne mobile)",
  "fraud_detection": "Detection fraude/anomalies",
  "advanced_permissions": "Permissions avancees (capacites)",
}

FEATURE_FLAG_DEFAULTS = {
  "sales_pos": True,
  "sales_refund": True,
  "cashier_operations": True,
  "stock_management": True,
  "stock_entries": True,
  "purchases_management": True,
  "credit_management": True,
  "expenses_management": True,
  "alerts_center": True,
  "reports_center": True,
  # TVA should not be systematic: enable only when configured/licensed.
  "vat": False,
  "enabled": True,
  "dashboard_strategic": True,
  "abc_analysis": True,
  "dynamic_reorder": True,
  "credit_scoring": True,
  "sales_forecast": True,
  "fraud_detection": True,
  "advanced_permissions": True,
}

# Backward-compatible aliases used in existing analytics code.
ANALYTICS_FEATURE_LABELS = {
    key: FEATURE_FLAG_LABELS[key]
    for key in ANALYTICS_FEATURE_KEYS
}
ANALYTICS_FEATURE_DEFAULTS = {
    key: FEATURE_FLAG_DEFAULTS[key]
    for key in ANALYTICS_FEATURE_KEYS
}


def _normalize_feature_flags(raw_flags):
    flags = dict(FEATURE_FLAG_DEFAULTS)
    if isinstance(raw_flags, dict):
        for key in FEATURE_FLAG_DEFAULTS:
            if key in raw_flags:
                flags[key] = bool(raw_flags[key])
    return flags


def _normalize_analytics_flags(raw_flags):
    all_flags = _normalize_feature_flags(raw_flags)
    return {key: all_flags[key] for key in ANALYTICS_FEATURE_KEYS}


# ---------------------------------------------------------------------------
# Enterprise
# ---------------------------------------------------------------------------

class Enterprise(TimeStampedModel):
    """Top-level business entity that owns one or more stores."""

    name = models.CharField("nom", max_length=255)
    code = models.CharField("code", max_length=50, unique=True)
    legal_name = models.CharField("raison sociale", max_length=255, blank=True, default="")
    registration_number = models.CharField(
        "numero RCCM", max_length=100, blank=True, default="",
    )
    tax_id = models.CharField("numero contribuable", max_length=100, blank=True, default="")
    currency = models.CharField("devise", max_length=10, default="FCFA")
    vat_enabled = models.BooleanField("TVA activee", default=False)
    vat_rate = models.DecimalField(
        "taux TVA (%)", max_digits=5, decimal_places=2, default=Decimal("19.25"),
    )
    logo = models.ImageField("logo", upload_to="enterprises/logos/", blank=True, null=True)
    email = models.EmailField("email", blank=True, default="")
    phone = models.CharField("telephone", max_length=30, blank=True, default="")
    website = models.URLField("site web", blank=True, default="")
    # Invoice / billing defaults (structure-level)
    bank_details = models.TextField("coordonnees bancaires", blank=True, default="")
    invoice_header = models.CharField("titre facture", max_length=100, blank=True, default="FACTURE")
    invoice_template = models.CharField(
        "modele facture",
        max_length=20,
        choices=[("CLASSIC", "Classique"), ("MODERN", "Moderne"), ("SIMPLE", "Simple")],
        default="CLASSIC",
    )
    invoice_primary_color = models.CharField("couleur primaire", max_length=7, default="#0F4C9A")
    invoice_secondary_color = models.CharField("couleur secondaire", max_length=7, default="#21A8F6")
    offer_validity_days = models.PositiveIntegerField("validite devis (jours)", default=15)
    invoice_terms = models.TextField("conditions facture", blank=True, default="")
    invoice_footer = models.TextField("pied de page facture", blank=True, default="")

    analytics_feature_flags = models.JSONField(
        "flags analytics",
        default=dict,
        blank=True,
        help_text="Activation des briques analytics au niveau entreprise.",
    )
    can_create_stores = models.BooleanField(
        "peut creer des boutiques",
        default=True,
        help_text="Si True, l'admin de l'entreprise peut creer de nouvelles boutiques.",
    )
    subscription_start = models.DateField(
        "debut d'abonnement",
        null=True,
        blank=True,
        help_text="Date de debut de l'abonnement. Vide = actif immediatement.",
    )
    subscription_end = models.DateField(
        "fin d'abonnement",
        null=True,
        blank=True,
        help_text="Date d'expiration. Vide = pas d'expiration.",
    )
    is_active = models.BooleanField("actif", default=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "Entreprise"
        verbose_name_plural = "Entreprises"

    def __str__(self):
        return f"{self.name} ({self.code})"

    @property
    def is_expired(self) -> bool:
        """True when subscription_end is set and in the past."""
        if not self.subscription_end:
            return False
        return timezone.now().date() > self.subscription_end

    @property
    def subscription_status(self) -> str:
        """Computed status: active / expired / scheduled / inactive."""
        if not self.is_active:
            return "inactive"
        if self.is_expired:
            return "expired"
        if self.subscription_start and timezone.now().date() < self.subscription_start:
            return "scheduled"
        return "active"

    @property
    def effective_feature_flags(self):
        return _normalize_feature_flags(self.analytics_feature_flags)

    def is_feature_enabled(self, key: str) -> bool:
        flags = self.effective_feature_flags
        if key in ANALYTICS_FEATURE_DEFAULTS and key != "enabled":
            return bool(flags.get("enabled", True) and flags.get(key, True))
        return bool(flags.get(key, True))

    @property
    def effective_analytics_feature_flags(self):
        flags = self.effective_feature_flags
        return {key: flags[key] for key in ANALYTICS_FEATURE_KEYS}

    def is_analytics_feature_enabled(self, key: str) -> bool:
        return self.is_feature_enabled(key)


# ---------------------------------------------------------------------------
# EnterpriseSubscription
# ---------------------------------------------------------------------------

class EnterpriseSubscription(TimeStampedModel):
    """Subscription contract attached to an enterprise."""

    class BillingCycle(models.TextChoices):
        MONTHLY = "MONTHLY", "Mensuel"
        QUARTERLY = "QUARTERLY", "Trimestriel"
        YEARLY = "YEARLY", "Annuel"
        CUSTOM = "CUSTOM", "Personnalise"

    class Status(models.TextChoices):
        TRIAL = "TRIAL", "Essai"
        ACTIVE = "ACTIVE", "Actif"
        PAST_DUE = "PAST_DUE", "Impayee"
        CANCELED = "CANCELED", "Resilie"
        EXPIRED = "EXPIRED", "Expire"

    enterprise = models.ForeignKey(
        Enterprise,
        on_delete=models.CASCADE,
        related_name="subscriptions",
        verbose_name="entreprise",
    )
    plan_code = models.CharField("code plan", max_length=50, default="STANDARD")
    plan_name = models.CharField("nom plan", max_length=100, default="Plan Standard")
    billing_cycle = models.CharField(
        "cycle de facturation",
        max_length=20,
        choices=BillingCycle.choices,
        default=BillingCycle.MONTHLY,
    )
    amount = models.DecimalField("montant", max_digits=12, decimal_places=2, default=Decimal("0.00"))
    currency = models.CharField("devise", max_length=10, default="FCFA")
    starts_on = models.DateField("debut")
    ends_on = models.DateField("fin", null=True, blank=True)
    status = models.CharField("statut", max_length=20, choices=Status.choices, default=Status.ACTIVE)
    auto_renew = models.BooleanField("renouvellement auto", default=True)
    external_subscription_id = models.CharField(
        "identifiant abonnement externe",
        max_length=120,
        blank=True,
        default="",
    )
    metadata = models.JSONField("metadonnees", default=dict, blank=True)

    class Meta:
        ordering = ["-starts_on", "-created_at"]
        verbose_name = "Abonnement entreprise"
        verbose_name_plural = "Abonnements entreprise"
        indexes = [
            models.Index(fields=["enterprise", "status"], name="sub_ent_status_idx"),
            models.Index(fields=["ends_on"], name="sub_ends_on_idx"),
        ]

    def __str__(self):
        return f"{self.enterprise.code} - {self.plan_name} ({self.status})"

    def clean(self):
        if self.ends_on and self.ends_on < self.starts_on:
            raise ValidationError({"ends_on": "La date de fin doit etre superieure ou egale a la date de debut."})

    @property
    def is_expired(self) -> bool:
        if not self.ends_on:
            return False
        return timezone.now().date() > self.ends_on

    @property
    def is_current(self) -> bool:
        today = timezone.now().date()
        if self.status in {self.Status.CANCELED, self.Status.EXPIRED}:
            return False
        if self.starts_on > today:
            return False
        if self.ends_on and self.ends_on < today:
            return False
        return True


# ---------------------------------------------------------------------------
# Store
# ---------------------------------------------------------------------------

class Store(TimeStampedModel):
    """A physical point-of-sale location belonging to an Enterprise."""

    class InvoiceTemplate(models.TextChoices):
        CLASSIC = "CLASSIC", "Classique"
        MODERN = "MODERN", "Moderne"
        SIMPLE = "SIMPLE", "Simple"

    enterprise = models.ForeignKey(
        Enterprise,
        on_delete=models.CASCADE,
        related_name="stores",
        verbose_name="entreprise",
    )
    name = models.CharField(max_length=255)
    code = models.CharField(max_length=50, unique=True)
    address = models.TextField(blank=True, default="")
    phone = models.CharField(max_length=30, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    website = models.URLField(blank=True, default="")
    logo = models.ImageField(upload_to="stores/logos/", blank=True, null=True)
    currency = models.CharField(max_length=10, default="FCFA")
    legal_name = models.CharField(max_length=255, blank=True, default="")
    registration_number = models.CharField(max_length=100, blank=True, default="")
    tax_id = models.CharField(max_length=100, blank=True, default="")
    vat_enabled = models.BooleanField(default=False)
    vat_rate = models.DecimalField(max_digits=5, decimal_places=2, default=18)
    bank_details = models.TextField(blank=True, default="")
    invoice_header = models.CharField(max_length=100, blank=True, default="FACTURE")
    invoice_template = models.CharField(
        max_length=20,
        choices=InvoiceTemplate.choices,
        default=InvoiceTemplate.CLASSIC,
    )
    invoice_primary_color = models.CharField(max_length=7, default="#0F4C9A")
    invoice_secondary_color = models.CharField(max_length=7, default="#21A8F6")
    offer_validity_days = models.PositiveIntegerField(default=15)
    invoice_terms = models.TextField(blank=True, default="")
    invoice_footer = models.TextField(blank=True, default="")
    analytics_feature_overrides = models.JSONField(
        "surcharges flags analytics",
        default=dict,
        blank=True,
        help_text="Overrides boutique des flags analytics (true/false).",
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "Boutique"
        verbose_name_plural = "Boutiques"

    def __str__(self):
        return f"{self.name} ({self.code})"

    # ------------------------------------------------------------------
    # Enterprise-inherited properties (fallback to enterprise values)
    # ------------------------------------------------------------------

    @property
    def effective_currency(self):
        if self.enterprise_id:
            return self.enterprise.currency
        return self.currency

    @property
    def effective_vat_enabled(self):
        if self.enterprise_id:
            return self.enterprise.vat_enabled
        return self.vat_enabled

    @property
    def effective_vat_rate(self):
        if self.enterprise_id:
            return self.enterprise.vat_rate
        return self.vat_rate

    @property
    def effective_legal_name(self):
        if self.enterprise_id and self.enterprise.legal_name:
            return self.enterprise.legal_name
        return self.legal_name

    @property
    def effective_tax_id(self):
        if self.enterprise_id and self.enterprise.tax_id:
            return self.enterprise.tax_id
        return self.tax_id

    @property
    def effective_registration_number(self):
        if self.enterprise_id and self.enterprise.registration_number:
            return self.enterprise.registration_number
        return self.registration_number

    @property
    def effective_feature_flags(self):
        if self.enterprise_id:
            flags = dict(self.enterprise.effective_feature_flags)
        else:
            flags = dict(FEATURE_FLAG_DEFAULTS)

        if isinstance(self.analytics_feature_overrides, dict):
            for key in FEATURE_FLAG_DEFAULTS:
                if key in self.analytics_feature_overrides:
                    flags[key] = bool(self.analytics_feature_overrides[key])
        return flags

    def is_feature_enabled(self, key: str) -> bool:
        flags = self.effective_feature_flags
        if key in ANALYTICS_FEATURE_DEFAULTS and key != "enabled":
            return bool(flags.get("enabled", True) and flags.get(key, True))
        return bool(flags.get(key, True))

    def feature_mode(self, key: str) -> str:
        if isinstance(self.analytics_feature_overrides, dict) and key in self.analytics_feature_overrides:
            return "enabled" if bool(self.analytics_feature_overrides[key]) else "disabled"
        return "inherit"

    @property
    def effective_analytics_feature_flags(self):
        flags = self.effective_feature_flags
        return {key: flags[key] for key in ANALYTICS_FEATURE_KEYS}

    def is_analytics_feature_enabled(self, key: str) -> bool:
        return self.is_feature_enabled(key)

    def analytics_feature_mode(self, key: str) -> str:
        return self.feature_mode(key)


class StoreUser(models.Model):
    """Links a user to one or more stores."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    store = models.ForeignKey(
        Store,
        on_delete=models.CASCADE,
        related_name="store_users",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="store_users",
    )
    is_default = models.BooleanField(
        default=False,
        help_text="If True, this store is the user's default store.",
    )
    capabilities = models.JSONField(
        "capacites",
        default=list,
        blank=True,
        help_text="Liste des capacites explicites. Vide = fallback sur le role.",
    )

    class Meta:
        unique_together = [("store", "user")]
        verbose_name = "Utilisateur boutique"
        verbose_name_plural = "Utilisateurs boutique"

    def __str__(self):
        return f"{self.user} - {self.store}"

    def get_effective_capabilities(self):
        """Return effective capabilities: explicit if set, else role-based defaults."""
        from stores.capabilities import ROLE_CAPABILITY_MAP
        if self.capabilities:
            return list(self.capabilities)
        return list(ROLE_CAPABILITY_MAP.get(self.user.role, []))

    def has_capability(self, capability):
        """Check if this store-user has a given capability."""
        return capability in self.get_effective_capabilities()


class Sequence(models.Model):
    """Auto-incrementing sequence per store, prefix, and year (e.g. invoices, quotes)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    store = models.ForeignKey(
        Store,
        on_delete=models.CASCADE,
        related_name="sequences",
    )
    prefix = models.CharField(max_length=20)
    year = models.PositiveIntegerField(
        "annee",
        default=2026,
        help_text="Year for this sequence (allows per-year numbering).",
    )
    next_number = models.PositiveIntegerField(default=1)

    class Meta:
        unique_together = [("store", "prefix", "year")]
        verbose_name = "Sequence"
        verbose_name_plural = "Sequences"

    def __str__(self):
        return f"{self.store.code} - {self.prefix}-{self.year}"

    def generate_next(self):
        """Atomically increment and return the next formatted number.

        Returns a string like ``FAC-BQC-2026-000001``.  Uses an ``UPDATE ... SET
        next_number = next_number + 1`` query so that concurrent callers
        never receive the same number.
        """
        # Lock row, read current value, increment, then return locked value.
        with transaction.atomic():
            locked = Sequence.objects.select_for_update().get(pk=self.pk)
            current = locked.next_number
            Sequence.objects.filter(pk=locked.pk).update(next_number=F("next_number") + 1)
            # Keep the in-memory object synchronized with DB.
            self.next_number = current + 1
        raw_code = slugify((self.store.code or "")).upper()
        store_code = re.sub(r"[^A-Z0-9]", "", raw_code)[:10] or "STORE"
        return f"{self.prefix}-{store_code}-{self.year}-{current:06d}"


class AuditLog(models.Model):
    """Immutable log of every significant action in the system."""

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_logs",
    )
    store = models.ForeignKey(
        Store,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_logs",
    )
    action = models.CharField(max_length=100)
    entity_type = models.CharField(max_length=100, db_index=True)
    entity_id = models.CharField(max_length=255)
    before_json = models.JSONField(null=True, blank=True)
    after_json = models.JSONField(null=True, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Journal d'audit"
        verbose_name_plural = "Journaux d'audit"
        indexes = [
            models.Index(fields=["store", "created_at"], name="audit_store_created_idx"),
            models.Index(fields=["action", "created_at"], name="audit_action_created_idx"),
            models.Index(fields=["entity_type", "created_at"], name="audit_entity_created_idx"),
        ]

    def __str__(self):
        return f"[{self.created_at}] {self.action} on {self.entity_type} #{self.entity_id}"
