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
    is_active = models.BooleanField("actif", default=True)

    class Meta:
        verbose_name = "produit"
        verbose_name_plural = "produits"
        ordering = ["name"]
        unique_together = [["enterprise", "slug"], ["enterprise", "sku"]]

    def __str__(self):
        return f"{self.name} ({self.sku})"

    def save(self, *args, **kwargs):
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
