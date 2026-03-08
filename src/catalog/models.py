"""Models for the catalog app (products, categories, brands)."""
from decimal import Decimal

from django.db import models
from django.urls import reverse
from django.utils.text import slugify

from core.models import TimeStampedModel


# ---------------------------------------------------------------------------
# Category
# ---------------------------------------------------------------------------

class Category(TimeStampedModel):
    """Product category with optional tree structure via self-referencing FK."""

    enterprise = models.ForeignKey(
        "stores.Enterprise",
        on_delete=models.CASCADE,
        related_name="categories",
        verbose_name="entreprise",
    )
    name = models.CharField("nom", max_length=255)
    slug = models.SlugField("slug", max_length=255)
    description = models.TextField("description", blank=True, default="")
    parent = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="children",
        verbose_name="categorie parente",
    )
    is_active = models.BooleanField("actif", default=True)

    class Meta:
        verbose_name = "categorie"
        verbose_name_plural = "categories"
        ordering = ["name"]
        unique_together = [["enterprise", "slug"]]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name) or 'cat'
        super().save(*args, **kwargs)

    def get_absolute_url(self):
        return reverse("catalog:product-list") + f"?category={self.pk}"


# ---------------------------------------------------------------------------
# Brand
# ---------------------------------------------------------------------------

class Brand(TimeStampedModel):
    """Product brand / manufacturer."""

    enterprise = models.ForeignKey(
        "stores.Enterprise",
        on_delete=models.CASCADE,
        related_name="brands",
        verbose_name="entreprise",
    )
    name = models.CharField("nom", max_length=255)
    slug = models.SlugField("slug", max_length=255)
    logo = models.ImageField(
        "logo",
        upload_to="brands/",
        blank=True,
        null=True,
    )
    is_active = models.BooleanField("actif", default=True)

    class Meta:
        verbose_name = "marque"
        verbose_name_plural = "marques"
        ordering = ["name"]
        unique_together = [["enterprise", "slug"]]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name) or 'brand'
        super().save(*args, **kwargs)


# ---------------------------------------------------------------------------
# Product
# ---------------------------------------------------------------------------

class Product(TimeStampedModel):
    """Core product model for electronic equipment & network accessories."""

    class ProductType(models.TextChoices):
        PRODUCT = "PRODUCT", "Produit"
        SERVICE = "SERVICE", "Service"

    enterprise = models.ForeignKey(
        "stores.Enterprise",
        on_delete=models.CASCADE,
        related_name="products",
        verbose_name="entreprise",
    )
    category = models.ForeignKey(
        Category,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="products",
        verbose_name="categorie",
    )
    brand = models.ForeignKey(
        Brand,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="products",
        verbose_name="marque",
    )
    name = models.CharField("nom", max_length=255)
    slug = models.SlugField("slug", max_length=255)
    sku = models.CharField(
        "SKU",
        max_length=50,
        db_index=True,
        help_text="Reference interne unique du produit.",
    )
    barcode = models.CharField(
        "code-barres",
        max_length=100,
        blank=True,
        default="",
        db_index=True,
    )
    description = models.TextField("description", blank=True, default="")
    product_type = models.CharField(
        "type",
        max_length=20,
        choices=ProductType.choices,
        default=ProductType.PRODUCT,
        db_index=True,
    )
    track_stock = models.BooleanField(
        "suivi du stock",
        default=True,
        help_text="Desactive automatiquement pour les services.",
    )
    cost_price = models.DecimalField(
        "prix d'achat",
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    selling_price = models.DecimalField(
        "prix de vente",
        max_digits=12,
        decimal_places=2,
    )
    is_active = models.BooleanField("actif", default=True, db_index=True)

    class Meta:
        verbose_name = "produit"
        verbose_name_plural = "produits"
        ordering = ["name"]
        unique_together = [["enterprise", "slug"], ["enterprise", "sku"]]

    def __str__(self):
        return f"{self.name} ({self.sku})"

    def save(self, *args, **kwargs):
        if self.product_type == self.ProductType.SERVICE:
            self.track_stock = False
        if not self.slug:
            self.slug = slugify(self.name) or 'product'
        super().save(*args, **kwargs)

    # ------------------------------------------------------------------
    # Computed properties
    # ------------------------------------------------------------------

    @property
    def margin(self) -> Decimal:
        """Absolute margin: selling_price - cost_price."""
        return self.selling_price - self.cost_price

    @property
    def margin_percent(self) -> Decimal:
        """Margin expressed as a percentage of the selling price."""
        if self.selling_price:
            return (self.margin / self.selling_price) * Decimal("100")
        return Decimal("0.00")


# ---------------------------------------------------------------------------
# ProductImage
# ---------------------------------------------------------------------------

class ProductImage(TimeStampedModel):
    """Image attached to a product."""

    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name="images",
        verbose_name="produit",
    )
    image = models.ImageField("image", upload_to="products/")
    is_primary = models.BooleanField("image principale", default=False)
    sort_order = models.IntegerField("ordre", default=0)

    class Meta:
        verbose_name = "image produit"
        verbose_name_plural = "images produit"
        ordering = ["sort_order"]

    def __str__(self):
        return f"Image {self.sort_order} - {self.product.name}"


# ---------------------------------------------------------------------------
# ProductSpec
# ---------------------------------------------------------------------------

class ProductSpec(TimeStampedModel):
    """Key/value specification for a product (e.g. RAM=8Go, Stockage=256Go)."""

    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name="specs",
        verbose_name="produit",
    )
    key = models.CharField("cle", max_length=100, help_text='Ex: "RAM", "Stockage"')
    value = models.CharField("valeur", max_length=255)

    class Meta:
        verbose_name = "specification produit"
        verbose_name_plural = "specifications produit"
        unique_together = [("product", "key")]
        ordering = ["key"]

    def __str__(self):
        return f"{self.key}: {self.value}"


# ---------------------------------------------------------------------------
# ProductVariant
# ---------------------------------------------------------------------------

class ProductVariant(TimeStampedModel):
    """A variant of a product (e.g. size, color, weight). Optional."""

    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name="variants",
        verbose_name="produit",
    )
    name = models.CharField(
        "nom de la variante",
        max_length=100,
        help_text='Ex: "Rouge / L", "Bleu / XL", "500g"',
    )
    sku = models.CharField(
        "SKU variante",
        max_length=50,
        blank=True,
        default="",
        db_index=True,
    )
    barcode = models.CharField(
        "code-barres",
        max_length=100,
        blank=True,
        default="",
        db_index=True,
    )
    cost_price = models.DecimalField(
        "prix d'achat",
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Laisse vide pour utiliser le prix du produit parent.",
    )
    selling_price = models.DecimalField(
        "prix de vente",
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Laisse vide pour utiliser le prix du produit parent.",
    )
    is_active = models.BooleanField("actif", default=True)

    class Meta:
        verbose_name = "variante produit"
        verbose_name_plural = "variantes produit"
        ordering = ["name"]
        unique_together = [["product", "name"]]

    def __str__(self):
        return f"{self.product.name} — {self.name}"

    @property
    def effective_selling_price(self) -> Decimal:
        """Returns variant price if set, otherwise falls back to product price."""
        return self.selling_price if self.selling_price is not None else self.product.selling_price

    @property
    def effective_cost_price(self) -> Decimal:
        return self.cost_price if self.cost_price is not None else self.product.cost_price


# ---------------------------------------------------------------------------
# Pricing Policies
# ---------------------------------------------------------------------------

class PricingPolicy(TimeStampedModel):
    """A set of pricing rules that can override catalog prices for specific conditions."""

    enterprise = models.ForeignKey(
        "stores.Enterprise",
        on_delete=models.CASCADE,
        related_name="pricing_policies",
        verbose_name="entreprise",
    )
    name = models.CharField("nom", max_length=100)
    priority = models.PositiveIntegerField(
        "priorite", default=0,
        help_text="Plus la valeur est elevee, plus la politique est appliquee en premier.",
    )
    valid_from = models.DateField("valable du", null=True, blank=True)
    valid_until = models.DateField("valable jusqu'au", null=True, blank=True)
    is_active = models.BooleanField("actif", default=True)
    customer_tier = models.CharField(
        "niveau client",
        max_length=10,
        choices=[("BRONZE", "Bronze"), ("SILVER", "Argent"), ("GOLD", "Or"), ("PLATINUM", "Platine")],
        null=True,
        blank=True,
        help_text="Laisser vide pour appliquer a tous les niveaux.",
    )
    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="pricing_policies",
        verbose_name="boutique",
        help_text="Laisser vide pour appliquer a toutes les boutiques.",
    )

    class Meta:
        ordering = ["-priority", "name"]
        verbose_name = "Politique de prix"
        verbose_name_plural = "Politiques de prix"

    def __str__(self):
        return f"{self.name} (priorite {self.priority})"


class PricingRule(TimeStampedModel):
    """An individual pricing rule within a policy."""

    class DiscountType(models.TextChoices):
        PERCENT = "PERCENT", "Pourcentage"
        FIXED = "FIXED", "Montant fixe"
        FIXED_PRICE = "FIXED_PRICE", "Prix fixe"

    policy = models.ForeignKey(
        PricingPolicy,
        on_delete=models.CASCADE,
        related_name="rules",
        verbose_name="politique",
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="pricing_rules",
        verbose_name="produit",
        help_text="Laisser vide pour appliquer a tous les produits.",
    )
    category = models.ForeignKey(
        Category,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="pricing_rules",
        verbose_name="categorie",
        help_text="Appliquer a toute une categorie si produit non specifie.",
    )
    min_qty = models.PositiveIntegerField(
        "quantite minimum", default=1,
        help_text="Quantite minimale pour declencher la remise volume.",
    )
    discount_type = models.CharField(
        "type de remise", max_length=15, choices=DiscountType.choices,
    )
    discount_value = models.DecimalField(
        "valeur remise", max_digits=12, decimal_places=2,
        help_text="%, montant fixe ou prix final selon le type.",
    )

    class Meta:
        ordering = ["-min_qty"]
        verbose_name = "Regle de prix"
        verbose_name_plural = "Regles de prix"

    def __str__(self):
        target = str(self.product or self.category or "tous produits")
        return f"{self.get_discount_type_display()} {self.discount_value} sur {target}"
