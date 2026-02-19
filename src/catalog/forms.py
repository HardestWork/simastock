"""Forms for the catalog app."""
import uuid

from django import forms
from django.utils.text import slugify

from .models import Brand, Category, Product


# ---------------------------------------------------------------------------
# ProductForm
# ---------------------------------------------------------------------------

class ProductForm(forms.ModelForm):
    """Create / update form for a Product."""

    initial_quantity = forms.IntegerField(
        required=False,
        min_value=0,
        initial=0,
        widget=forms.NumberInput(
            attrs={
                "class": "form-control",
                "min": "0",
                "step": "1",
                "placeholder": "0",
            }
        ),
        label="Quantite initiale",
        help_text="Stock initial pour la boutique courante.",
    )
    available_quantity = forms.IntegerField(
        required=False,
        initial=0,
        disabled=True,
        widget=forms.NumberInput(
            attrs={
                "class": "form-control",
                "readonly": "readonly",
            }
        ),
        label="Quantite disponible",
    )

    class Meta:
        model = Product
        fields = [
            "name",
            "slug",
            "sku",
            "barcode",
            "category",
            "brand",
            "description",
            "cost_price",
            "selling_price",
            "is_active",
        ]
        widgets = {
            "name": forms.TextInput(attrs={
                "class": "form-control",
                "placeholder": "Nom du produit",
            }),
            "slug": forms.TextInput(attrs={
                "class": "form-control",
                "placeholder": "slug-du-produit",
            }),
            "sku": forms.TextInput(attrs={
                "class": "form-control",
                "placeholder": "REF-001",
            }),
            "barcode": forms.TextInput(attrs={
                "class": "form-control",
                "placeholder": "Code-barres",
            }),
            "category": forms.Select(attrs={"class": "form-select"}),
            "brand": forms.Select(attrs={"class": "form-select"}),
            "description": forms.Textarea(attrs={
                "class": "form-control",
                "rows": 3,
            }),
            "cost_price": forms.NumberInput(attrs={
                "class": "form-control",
                "step": "0.01",
            }),
            "selling_price": forms.NumberInput(attrs={
                "class": "form-control",
                "step": "0.01",
            }),
            "is_active": forms.CheckboxInput(attrs={"class": "form-check-input"}),
        }

    def __init__(self, *args, **kwargs):
        self.store = kwargs.pop("store", None)
        self.enterprise = getattr(self.store, "enterprise", None) if self.store else None
        super().__init__(*args, **kwargs)
        cat_qs = Category.objects.filter(is_active=True)
        brand_qs = Brand.objects.filter(is_active=True)
        if self.enterprise:
            cat_qs = cat_qs.filter(enterprise=self.enterprise)
            brand_qs = brand_qs.filter(enterprise=self.enterprise)
        self.fields["category"].queryset = cat_qs
        self.fields["brand"].queryset = brand_qs
        # The slug is generated automatically when omitted.
        self.fields["slug"].required = False
        self.fields["slug"].widget = forms.HiddenInput()
        # Barcode can also be generated when omitted.
        self.fields["barcode"].required = False

        # Product update: preload stock figures for the current store.
        if self.instance.pk and self.store is not None:
            from stock.models import ProductStock
            stock_record = (
                ProductStock.objects
                .filter(store=self.store, product=self.instance)
                .only("quantity", "reserved_qty")
                .first()
            )
            if stock_record:
                self.fields["initial_quantity"].initial = stock_record.quantity
                self.fields["available_quantity"].initial = stock_record.available_qty
            else:
                self.fields["initial_quantity"].initial = 0
                self.fields["available_quantity"].initial = 0
        else:
            try:
                initial_qty = (
                    int(self.data.get("initial_quantity", 0))
                    if self.data.get("initial_quantity") not in (None, "")
                    else 0
                )
            except (TypeError, ValueError):
                initial_qty = 0
            self.fields["available_quantity"].initial = max(initial_qty, 0)

    def _build_unique_slug(self, raw_value: str) -> str:
        base_slug = slugify(raw_value) or "produit"
        slug = base_slug
        counter = 1

        while True:
            qs = Product.objects.filter(slug=slug)
            if self.enterprise:
                qs = qs.filter(enterprise=self.enterprise)
            if self.instance.pk:
                qs = qs.exclude(pk=self.instance.pk)
            if not qs.exists():
                return slug
            slug = f"{base_slug}-{counter}"
            counter += 1

    def _build_auto_barcode(self) -> str:
        base = (self.cleaned_data.get("sku") or "").strip().upper()
        if not base:
            base = uuid.uuid4().hex[:13].upper()

        barcode = base
        counter = 1
        while True:
            qs = Product.objects.filter(barcode=barcode)
            if self.instance.pk:
                qs = qs.exclude(pk=self.instance.pk)
            if not qs.exists():
                return barcode
            barcode = f"{base}-{counter}"
            counter += 1

    def clean(self):
        cleaned_data = super().clean()
        category = cleaned_data.get("category")
        brand = cleaned_data.get("brand")

        resolved_enterprise = self.enterprise
        if resolved_enterprise is None and category is not None:
            resolved_enterprise = category.enterprise
        if resolved_enterprise is None and self.instance.pk:
            resolved_enterprise = self.instance.enterprise

        if resolved_enterprise is None:
            self.add_error(
                "category",
                "La categorie doit appartenir a une entreprise active.",
            )
        else:
            if category and category.enterprise_id != resolved_enterprise.id:
                self.add_error(
                    "category",
                    "La categorie selectionnee n'appartient pas a l'entreprise courante.",
                )
            if brand and brand.enterprise_id != resolved_enterprise.id:
                self.add_error(
                    "brand",
                    "La marque selectionnee n'appartient pas a l'entreprise courante.",
                )

        self._resolved_enterprise = resolved_enterprise

        raw_slug = (cleaned_data.get("slug") or "").strip()
        name = (cleaned_data.get("name") or "").strip()
        if raw_slug:
            cleaned_data["slug"] = self._build_unique_slug(raw_slug)
        elif self.instance.pk and self.instance.slug:
            cleaned_data["slug"] = self.instance.slug
        else:
            cleaned_data["slug"] = self._build_unique_slug(name or "produit")

        raw_barcode = (cleaned_data.get("barcode") or "").strip()
        if raw_barcode:
            cleaned_data["barcode"] = raw_barcode
        else:
            cleaned_data["barcode"] = self._build_auto_barcode()

        return cleaned_data

    def save(self, commit=True):
        product = super().save(commit=False)
        if getattr(self, "_resolved_enterprise", None) is not None:
            product.enterprise = self._resolved_enterprise
        if commit:
            product.save()
            self.save_m2m()
        return product


# ---------------------------------------------------------------------------
# ProductFilterForm
# ---------------------------------------------------------------------------

class ProductFilterForm(forms.Form):
    """Sidebar / toolbar form for filtering the product list."""

    search = forms.CharField(
        required=False,
        widget=forms.TextInput(attrs={
            "class": "form-control",
            "placeholder": "Rechercher (nom, SKU, code-barres)...",
        }),
    )
    category = forms.ModelChoiceField(
        queryset=Category.objects.none(),
        required=False,
        empty_label="Toutes les categories",
        widget=forms.Select(attrs={"class": "form-select"}),
    )
    brand = forms.ModelChoiceField(
        queryset=Brand.objects.none(),
        required=False,
        empty_label="Toutes les marques",
        widget=forms.Select(attrs={"class": "form-select"}),
    )
    is_active = forms.NullBooleanField(
        required=False,
        widget=forms.Select(
            attrs={"class": "form-select"},
            choices=[
                ("", "Tous"),
                ("true", "Actif"),
                ("false", "Inactif"),
            ],
        ),
    )

    def __init__(self, *args, enterprise=None, **kwargs):
        super().__init__(*args, **kwargs)
        cat_qs = Category.objects.filter(is_active=True)
        brand_qs = Brand.objects.filter(is_active=True)
        if enterprise:
            cat_qs = cat_qs.filter(enterprise=enterprise)
            brand_qs = brand_qs.filter(enterprise=enterprise)
        self.fields["category"].queryset = cat_qs
        self.fields["brand"].queryset = brand_qs


# ---------------------------------------------------------------------------
# ProductImportForm
# ---------------------------------------------------------------------------

class ProductImportForm(forms.Form):
    """Form for uploading an Excel file to import products."""

    file = forms.FileField(
        label="Fichier Excel (.xlsx)",
        help_text="Le fichier doit etre au format .xlsx et respecter le modele d'import.",
        widget=forms.ClearableFileInput(attrs={
            "class": "form-control",
            "accept": ".xlsx",
        }),
    )

    def clean_file(self):
        uploaded = self.cleaned_data["file"]
        filename = (uploaded.name or "").lower()
        if not filename.endswith(".xlsx"):
            raise forms.ValidationError("Le fichier doit etre au format .xlsx.")

        max_size_bytes = 5 * 1024 * 1024
        if uploaded.size and uploaded.size > max_size_bytes:
            raise forms.ValidationError("Le fichier depasse la taille maximale de 5 Mo.")

        # Some browsers may send generic content types; keep a safe allowlist.
        content_type = (getattr(uploaded, "content_type", "") or "").lower()
        allowed_types = {
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/octet-stream",
        }
        if content_type and content_type not in allowed_types:
            raise forms.ValidationError("Type de fichier invalide pour un import Excel.")

        return uploaded
