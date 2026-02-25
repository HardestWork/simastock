"""Models for the customers app."""
from django.conf import settings
from django.db import models
from django.db.models import Q

from core.models import TimeStampedModel


class Customer(TimeStampedModel):
    """A customer belonging to an enterprise (shared across all stores)."""

    enterprise = models.ForeignKey(
        "stores.Enterprise",
        on_delete=models.CASCADE,
        related_name="customers",
        verbose_name="entreprise",
    )
    first_name = models.CharField("prenom", max_length=100)
    last_name = models.CharField("nom", max_length=100)
    phone = models.CharField(
        "telephone",
        max_length=20,
        db_index=True,
    )
    email = models.EmailField("e-mail", blank=True, default="")
    address = models.TextField("adresse", blank=True, default="")
    company = models.CharField(
        "entreprise",
        max_length=200,
        blank=True,
        default="",
    )
    tax_id = models.CharField(
        "numero fiscal",
        max_length=50,
        blank=True,
        default="",
    )
    is_default = models.BooleanField(
        "client par defaut",
        default=False,
        help_text="Client generique utilise quand aucun client n'est selectionne (ex: Client comptant).",
        db_index=True,
    )
    is_active = models.BooleanField("actif", default=True)
    notes = models.TextField("notes", blank=True, default="")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="customers_created",
        verbose_name="ajouté par",
    )

    class Meta:
        verbose_name = "client"
        verbose_name_plural = "clients"
        ordering = ["last_name", "first_name"]
        constraints = [
            models.UniqueConstraint(
                fields=["enterprise"],
                condition=Q(is_default=True),
                name="uniq_default_customer_per_enterprise",
            )
        ]

    @property
    def full_name(self):
        """Return the customer's full name."""
        return f"{self.first_name} {self.last_name}".strip()

    def __str__(self):
        return self.full_name or self.phone
