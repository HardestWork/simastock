"""Views for the catalog app."""
import logging

from django import forms as django_forms
from django.contrib import messages
from django.contrib.auth.mixins import LoginRequiredMixin
from django.db.models import Count, Q, Sum
from django.db import transaction
from django.shortcuts import redirect
from django.urls import reverse_lazy
from django.utils.text import slugify
from django.views import View
from django.views.generic import (
    CreateView,
    DetailView,
    FormView,
    ListView,
    UpdateView,
)

from .forms import ProductFilterForm, ProductForm, ProductImportForm
from .models import Brand, Category, Product
from .services import IMPORT_COLUMNS, export_products_to_excel, import_products_from_excel

logger = logging.getLogger("boutique")


# =========================================================================
# Helpers
# =========================================================================

class BootstrapFormMixin:
    """Mixin that adds Bootstrap CSS classes to auto-generated form widgets."""

    def get_form(self, form_class=None):
        form = super().get_form(form_class)
        for field_name in form.fields:
            widget = form.fields[field_name].widget
            if hasattr(widget, "attrs"):
                if isinstance(widget, django_forms.CheckboxInput):
                    css = "form-check-input"
                elif isinstance(widget, django_forms.Select):
                    css = "form-select"
                else:
                    css = "form-control"
                widget.attrs.setdefault("class", css)
        return form


def _get_enterprise(request):
    """Return the enterprise from the current store, or None."""
    store = getattr(request, "current_store", None)
    return getattr(store, "enterprise", None) if store else None


def _unique_category_slug(name: str, enterprise=None, exclude_pk=None) -> str:
    """Generate a unique slug for categories, scoped to enterprise."""
    base_slug = slugify(name) or "categorie"
    slug = base_slug
    counter = 1
    while True:
        qs = Category.objects.filter(slug=slug)
        if enterprise:
            qs = qs.filter(enterprise=enterprise)
        if exclude_pk:
            qs = qs.exclude(pk=exclude_pk)
        if not qs.exists():
            return slug
        slug = f"{base_slug}-{counter}"
        counter += 1


# =========================================================================
# Product views
# =========================================================================

class ProductListView(LoginRequiredMixin, ListView):
    """List products with filtering by category, brand and search."""

    model = Product
    template_name = "catalog/product_list.html"
    context_object_name = "products"
    paginate_by = 25

    def get_template_names(self):
        if (
            self.request.headers.get("HX-Request")
            and self.request.headers.get("HX-Boosted") != "true"
        ):
            return ["catalog/partials/product_table.html"]
        return [self.template_name]

    def get_queryset(self):
        qs = super().get_queryset().select_related("category", "brand")
        enterprise = _get_enterprise(self.request)
        if enterprise:
            qs = qs.filter(enterprise=enterprise)

        # --- Filters ---
        category = self.request.GET.get("category")
        if category:
            qs = qs.filter(category_id=category)

        brand = self.request.GET.get("brand")
        if brand:
            qs = qs.filter(brand_id=brand)

        search = self.request.GET.get("search", "").strip()
        if search:
            qs = qs.filter(
                Q(name__icontains=search)
                | Q(sku__icontains=search)
                | Q(barcode__icontains=search)
            )

        is_active = self.request.GET.get("is_active")
        if is_active == "true":
            qs = qs.filter(is_active=True)
        elif is_active == "false":
            qs = qs.filter(is_active=False)

        return qs

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        enterprise = _get_enterprise(self.request)
        cat_qs = Category.objects.filter(is_active=True)
        brand_qs = Brand.objects.filter(is_active=True)
        if enterprise:
            cat_qs = cat_qs.filter(enterprise=enterprise)
            brand_qs = brand_qs.filter(enterprise=enterprise)
        ctx["filter_form"] = ProductFilterForm(self.request.GET, enterprise=enterprise)
        ctx["categories"] = cat_qs.order_by("name")
        ctx["brands"] = brand_qs.order_by("name")
        query_params = self.request.GET.copy()
        query_params.pop("page", None)
        ctx["query_string"] = query_params.urlencode()
        return ctx


class ProductCreateView(LoginRequiredMixin, CreateView):
    """Create a new product."""

    model = Product
    form_class = ProductForm
    template_name = "catalog/product_form.html"
    success_url = reverse_lazy("catalog:product-list")

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs["store"] = getattr(self.request, "current_store", None)
        return kwargs

    def form_valid(self, form):
        current_store = getattr(self.request, "current_store", None)
        enterprise = _get_enterprise(self.request)
        if enterprise:
            form.instance.enterprise = enterprise
        initial_quantity = int(form.cleaned_data.get("initial_quantity") or 0)

        with transaction.atomic():
            response = super().form_valid(form)
            if current_store is not None:
                from stock.models import InventoryMovement, ProductStock

                stock_record, _ = ProductStock.objects.get_or_create(
                    store=current_store,
                    product=self.object,
                    defaults={
                        "quantity": 0,
                        "reserved_qty": 0,
                    },
                )
                if initial_quantity > 0:
                    stock_record.quantity = initial_quantity
                    stock_record.reserved_qty = 0
                    stock_record.save(update_fields=["quantity", "reserved_qty", "updated_at"])
                    InventoryMovement.objects.create(
                        store=current_store,
                        product=self.object,
                        movement_type=InventoryMovement.MovementType.IN,
                        quantity=initial_quantity,
                        reference=f"INIT-{self.object.sku}",
                        reason="Stock initial lors de la creation du produit.",
                        actor=self.request.user,
                    )

        messages.success(self.request, "Produit cree avec succes.")
        return response


class ProductUpdateView(LoginRequiredMixin, UpdateView):
    """Edit an existing product."""

    model = Product
    form_class = ProductForm
    template_name = "catalog/product_form.html"
    success_url = reverse_lazy("catalog:product-list")

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs["store"] = getattr(self.request, "current_store", None)
        return kwargs

    def form_valid(self, form):
        messages.success(self.request, "Produit mis a jour avec succes.")
        return super().form_valid(form)


class ProductDetailView(LoginRequiredMixin, DetailView):
    """Show full details for a single product."""

    model = Product
    template_name = "catalog/product_detail.html"
    context_object_name = "product"

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .select_related("category", "brand")
            .prefetch_related("images", "specs")
        )

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        product = self.object
        current_store = getattr(self.request, "current_store", None)

        from stock.models import InventoryMovement, ProductStock

        stock_record = None
        recent_movements = []
        if current_store is not None:
            stock_record = (
                ProductStock.objects
                .filter(store=current_store, product=product)
                .first()
            )
            recent_movements = (
                InventoryMovement.objects
                .filter(store=current_store, product=product)
                .select_related("actor")
                .order_by("-created_at")[:10]
            )

        totals = (
            ProductStock.objects
            .filter(product=product)
            .aggregate(
                total_qty=Sum("quantity"),
                total_reserved=Sum("reserved_qty"),
            )
        )
        total_qty = totals["total_qty"] or 0
        total_reserved = totals["total_reserved"] or 0

        context["stock_record"] = stock_record
        context["recent_movements"] = recent_movements
        context["global_total_qty"] = total_qty
        context["global_available_qty"] = total_qty - total_reserved
        return context


# =========================================================================
# Category views
# =========================================================================

class CategoryListView(LoginRequiredMixin, ListView):
    """List all categories."""

    model = Category
    template_name = "catalog/category_list.html"
    context_object_name = "categories"
    paginate_by = 25

    def get_template_names(self):
        if (
            self.request.headers.get("HX-Request")
            and self.request.headers.get("HX-Boosted") != "true"
        ):
            return ["catalog/partials/category_table.html"]
        return [self.template_name]

    def get_queryset(self):
        qs = (
            super()
            .get_queryset()
            .select_related("parent")
            .annotate(products_count=Count("products"))
            .order_by("name")
        )
        enterprise = _get_enterprise(self.request)
        if enterprise:
            qs = qs.filter(enterprise=enterprise)

        search = (self.request.GET.get("search") or "").strip()
        if search:
            qs = qs.filter(
                Q(name__icontains=search)
                | Q(slug__icontains=search)
                | Q(parent__name__icontains=search)
            )

        status = (self.request.GET.get("status") or "").strip().lower()
        if status == "active":
            qs = qs.filter(is_active=True)
        elif status == "inactive":
            qs = qs.filter(is_active=False)

        return qs

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        query_params = self.request.GET.copy()
        query_params.pop("page", None)
        context["query_string"] = query_params.urlencode()
        return context


class CategoryCreateView(LoginRequiredMixin, BootstrapFormMixin, CreateView):
    """Create a new category."""

    model = Category
    fields = ["name", "slug", "description", "parent", "is_active"]
    template_name = "catalog/category_form.html"
    success_url = reverse_lazy("catalog:category-list")

    def get_form(self, form_class=None):
        form = super().get_form(form_class)
        form.fields["slug"].required = False
        form.fields["slug"].help_text = "Laisser vide pour generation automatique."
        enterprise = _get_enterprise(self.request)
        if enterprise:
            form.fields["parent"].queryset = Category.objects.filter(
                enterprise=enterprise, is_active=True,
            ).order_by("name")
        return form

    def form_valid(self, form):
        enterprise = _get_enterprise(self.request)
        if enterprise:
            form.instance.enterprise = enterprise
        raw_slug = (form.cleaned_data.get("slug") or "").strip()
        if raw_slug:
            form.instance.slug = _unique_category_slug(raw_slug, enterprise=enterprise)
        else:
            form.instance.slug = _unique_category_slug(
                form.cleaned_data.get("name") or "categorie", enterprise=enterprise,
            )
        messages.success(self.request, "Categorie creee avec succes.")
        return super().form_valid(form)


class CategoryUpdateView(LoginRequiredMixin, BootstrapFormMixin, UpdateView):
    """Edit an existing category."""

    model = Category
    fields = ["name", "slug", "description", "parent", "is_active"]
    template_name = "catalog/category_form.html"
    success_url = reverse_lazy("catalog:category-list")

    def get_form(self, form_class=None):
        form = super().get_form(form_class)
        form.fields["slug"].required = False
        form.fields["slug"].help_text = "Laisser vide pour conserver ou regenerer automatiquement."
        enterprise = _get_enterprise(self.request)
        parent_qs = Category.objects.exclude(pk=self.object.pk)
        if enterprise:
            parent_qs = parent_qs.filter(enterprise=enterprise)
        form.fields["parent"].queryset = parent_qs.order_by("name")
        return form

    def form_valid(self, form):
        enterprise = _get_enterprise(self.request)
        raw_slug = (form.cleaned_data.get("slug") or "").strip()
        if raw_slug:
            form.instance.slug = _unique_category_slug(raw_slug, enterprise=enterprise, exclude_pk=form.instance.pk)
        elif self.object.slug:
            form.instance.slug = self.object.slug
        else:
            form.instance.slug = _unique_category_slug(
                form.cleaned_data.get("name") or "categorie",
                enterprise=enterprise,
                exclude_pk=form.instance.pk,
            )
        messages.success(self.request, "Categorie mise a jour avec succes.")
        return super().form_valid(form)


# =========================================================================
# Brand views
# =========================================================================

class BrandListView(LoginRequiredMixin, ListView):
    """List all brands."""

    model = Brand
    template_name = "catalog/brand_list.html"
    context_object_name = "brands"
    paginate_by = 25

    def get_queryset(self):
        qs = super().get_queryset()
        enterprise = _get_enterprise(self.request)
        if enterprise:
            qs = qs.filter(enterprise=enterprise)
        return qs


class BrandCreateView(LoginRequiredMixin, BootstrapFormMixin, CreateView):
    """Create a new brand."""

    model = Brand
    fields = ["name", "slug", "logo", "is_active"]
    template_name = "catalog/brand_form.html"
    success_url = reverse_lazy("catalog:brand-list")

    def form_valid(self, form):
        enterprise = _get_enterprise(self.request)
        if enterprise:
            form.instance.enterprise = enterprise
        messages.success(self.request, "Marque creee avec succes.")
        return super().form_valid(form)


class BrandUpdateView(LoginRequiredMixin, BootstrapFormMixin, UpdateView):
    """Edit an existing brand."""

    model = Brand
    fields = ["name", "slug", "logo", "is_active"]
    template_name = "catalog/brand_form.html"
    success_url = reverse_lazy("catalog:brand-list")

    def form_valid(self, form):
        messages.success(self.request, "Marque mise a jour avec succes.")
        return super().form_valid(form)


# =========================================================================
# Import / Export views
# =========================================================================

class ProductImportView(LoginRequiredMixin, FormView):
    """Upload an Excel file to bulk-import products."""

    template_name = "catalog/product_import.html"
    form_class = ProductImportForm
    success_url = reverse_lazy("catalog:product-list")

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["import_columns"] = IMPORT_COLUMNS
        return context

    def form_valid(self, form):
        uploaded_file = form.cleaned_data["file"]
        enterprise = _get_enterprise(self.request)
        try:
            result = import_products_from_excel(uploaded_file, enterprise=enterprise)
            messages.success(
                self.request,
                f"Import termine : {result['created']} cree(s), "
                f"{result['updated']} mis a jour, "
                f"{result['errors']} erreur(s).",
            )
            if result.get("error_details"):
                for detail in result["error_details"][:10]:
                    messages.warning(self.request, detail)
        except Exception as exc:
            logger.exception("Erreur lors de l'import des produits.")
            messages.error(self.request, f"Erreur lors de l'import : {exc}")
        return redirect(self.success_url)


class ProductExportView(LoginRequiredMixin, View):
    """Download all (or filtered) products as an Excel file."""

    def get(self, request, *args, **kwargs):
        qs = Product.objects.select_related("category", "brand").all()
        enterprise = _get_enterprise(request)
        if enterprise:
            qs = qs.filter(enterprise=enterprise)

        # Apply same filters as the list view
        category = request.GET.get("category")
        if category:
            qs = qs.filter(category_id=category)

        brand = request.GET.get("brand")
        if brand:
            qs = qs.filter(brand_id=brand)

        search = request.GET.get("search", "").strip()
        if search:
            qs = qs.filter(
                Q(name__icontains=search)
                | Q(sku__icontains=search)
                | Q(barcode__icontains=search)
            )

        is_active = request.GET.get("is_active")
        if is_active == "true":
            qs = qs.filter(is_active=True)
        elif is_active == "false":
            qs = qs.filter(is_active=False)

        return export_products_to_excel(qs)
