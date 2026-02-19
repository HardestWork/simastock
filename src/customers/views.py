"""Views for the customers app."""
from django.contrib import messages
from django.contrib.auth.mixins import LoginRequiredMixin
from django.db.models import Q, Sum
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.urls import reverse_lazy
from django.views import View
from django.views.generic import CreateView, DetailView, ListView, UpdateView

from .forms import CustomerFilterForm, CustomerForm
from .models import Customer


# ==================================================================
# Mixins
# ==================================================================


class EnterpriseFilterMixin:
    """Filter querysets to the current enterprise."""

    def get_queryset(self):
        qs = super().get_queryset()
        enterprise = getattr(self.request, "current_enterprise", None)
        if enterprise:
            qs = qs.filter(enterprise=enterprise)
        return qs


# ==================================================================
# Customer List
# ==================================================================


class CustomerListView(LoginRequiredMixin, EnterpriseFilterMixin, ListView):
    """List all customers for the current store, with search and filtering."""

    model = Customer
    template_name = "customers/customer_list.html"
    context_object_name = "customers"
    paginate_by = 25

    def get_queryset(self):
        qs = super().get_queryset()

        # Search
        search = self.request.GET.get("search", "").strip()
        if search:
            qs = qs.filter(
                Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
                | Q(phone__icontains=search)
                | Q(email__icontains=search)
                | Q(company__icontains=search)
            )

        # Active filter
        is_active = self.request.GET.get("is_active", "").strip()
        if is_active == "true":
            qs = qs.filter(is_active=True)
        elif is_active == "false":
            qs = qs.filter(is_active=False)

        return qs

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["filter_form"] = CustomerFilterForm(self.request.GET)
        context["search_query"] = self.request.GET.get("search", "")
        return context


# ==================================================================
# Customer Create
# ==================================================================


class CustomerCreateView(LoginRequiredMixin, CreateView):
    """Create a new customer in the current store."""

    model = Customer
    form_class = CustomerForm
    template_name = "customers/customer_form.html"
    success_url = reverse_lazy("customers:customer-list")

    def form_valid(self, form):
        form.instance.enterprise = getattr(self.request, "current_enterprise", None)
        response = super().form_valid(form)
        messages.success(
            self.request,
            f"Le client {self.object.full_name} a ete cree avec succes.",
        )
        return response

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["page_title"] = "Nouveau client"
        context["submit_label"] = "Creer"
        return context


# ==================================================================
# Customer Update
# ==================================================================


class CustomerUpdateView(LoginRequiredMixin, EnterpriseFilterMixin, UpdateView):
    """Edit an existing customer."""

    model = Customer
    form_class = CustomerForm
    template_name = "customers/customer_form.html"
    success_url = reverse_lazy("customers:customer-list")

    def form_valid(self, form):
        response = super().form_valid(form)
        messages.success(
            self.request,
            f"Le client {self.object.full_name} a ete mis a jour.",
        )
        return response

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["page_title"] = "Modifier le client"
        context["submit_label"] = "Enregistrer"
        return context


# ==================================================================
# Customer Detail
# ==================================================================


class CustomerDetailView(LoginRequiredMixin, EnterpriseFilterMixin, DetailView):
    """Show customer info, purchase history, and credit information."""

    model = Customer
    template_name = "customers/customer_detail.html"
    context_object_name = "customer"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        customer = self.object

        # Purchase history (most recent sales)
        context["sales"] = (
            customer.sales
            .select_related("seller")
            .order_by("-created_at")[:20]
        )

        # Total spent
        context["total_spent"] = (
            customer.sales
            .filter(status__in=["PAID", "PARTIALLY_PAID"])
            .aggregate(total=Sum("total"))["total"]
        ) or 0

        # Credit accounts
        context["credit_accounts"] = (
            customer.credit_accounts
            .select_related("store")
            .order_by("-created_at")
        )

        return context


# ==================================================================
# Customer Search (HTMX autocomplete)
# ==================================================================


class CustomerSearchView(LoginRequiredMixin, View):
    """HTMX endpoint: search customers for autocomplete in POS.

    Returns JSON results for customer lookup.
    Accepts GET parameter ``q`` for the search term.
    """

    def get(self, request):
        enterprise = getattr(request, "current_enterprise", None)
        query = request.GET.get("q", "").strip()

        if not query or len(query) < 2:
            return JsonResponse({"results": []})

        qs = Customer.objects.filter(is_active=True)
        if enterprise:
            qs = qs.filter(enterprise=enterprise)

        qs = qs.filter(
            Q(first_name__icontains=query)
            | Q(last_name__icontains=query)
            | Q(phone__icontains=query)
            | Q(email__icontains=query)
            | Q(company__icontains=query)
        )[:10]

        results = [
            {
                "id": str(c.pk),
                "full_name": c.full_name,
                "phone": c.phone,
                "email": c.email,
                "company": c.company,
            }
            for c in qs
        ]

        return JsonResponse({"results": results})
