"""Views for the credits app."""
from django.contrib import messages
from django.contrib.auth.mixins import LoginRequiredMixin
from django.db.models import F, Q
from django.http import HttpResponseForbidden
from django.shortcuts import get_object_or_404, redirect
from django.urls import reverse
from django.utils import timezone
from django.views import View
from django.views.generic import CreateView, DetailView, ListView

from core.pdf import generate_credit_payment_receipt_pdf

from .forms import CreditFilterForm, CreditPaymentForm, CustomerAccountForm, PaymentScheduleForm
from .models import CustomerAccount, CreditLedgerEntry, PaymentSchedule
from .services import record_credit_payment


# ==================================================================
# Mixins
# ==================================================================


class StoreFilterMixin:
    """Filter querysets to the current store."""

    def get_queryset(self):
        qs = super().get_queryset()
        store = getattr(self.request, "current_store", None)
        if store:
            qs = qs.filter(store=store)
        return qs


# ==================================================================
# Account List
# ==================================================================


class AccountListView(LoginRequiredMixin, StoreFilterMixin, ListView):
    """List all credit accounts for the current store."""

    model = CustomerAccount
    template_name = "credits/account_list.html"
    context_object_name = "accounts"
    paginate_by = 25

    def get_queryset(self):
        qs = super().get_queryset().select_related("customer", "store")

        # Search
        search = self.request.GET.get("search", "").strip()
        if search:
            qs = qs.filter(
                Q(customer__first_name__icontains=search)
                | Q(customer__last_name__icontains=search)
                | Q(customer__phone__icontains=search)
            )

        # Status filter
        status = self.request.GET.get("status", "").strip()
        if status == "active":
            qs = qs.filter(is_active=True)
        elif status == "inactive":
            qs = qs.filter(is_active=False)
        elif status == "over_limit":
            qs = qs.filter(is_active=True, balance__gt=F("credit_limit"))

        return qs

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["filter_form"] = CreditFilterForm(self.request.GET)
        return context


# ==================================================================
# Account Detail
# ==================================================================


class AccountDetailView(LoginRequiredMixin, StoreFilterMixin, DetailView):
    """Account details with ledger history and schedules."""

    model = CustomerAccount
    template_name = "credits/account_detail.html"
    context_object_name = "account"

    def get_queryset(self):
        return super().get_queryset().select_related("customer", "store")

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        account = self.object

        # Ledger entries (most recent first)
        context["ledger_entries"] = (
            account.ledger_entries
            .select_related("created_by", "sale")
            .order_by("-created_at")[:50]
        )

        # Payment schedules
        context["schedules"] = (
            account.schedules
            .order_by("due_date")
        )

        # Payment form
        context["payment_form"] = CreditPaymentForm()

        return context


# ==================================================================
# Account Create
# ==================================================================


class AccountCreateView(LoginRequiredMixin, CreateView):
    """Create a credit account for a customer."""

    model = CustomerAccount
    form_class = CustomerAccountForm
    template_name = "credits/account_form.html"

    def get_form(self, form_class=None):
        form = super().get_form(form_class)
        return form

    def form_valid(self, form):
        store = self.request.current_store
        form.instance.store = store

        # Get the customer from POST data or query param
        from customers.models import Customer
        customer_id = self.request.POST.get("customer") or self.request.GET.get("customer")
        if customer_id:
            customer = get_object_or_404(
                Customer,
                pk=customer_id,
                enterprise=store.enterprise,
            )
            form.instance.customer = customer
        else:
            messages.error(self.request, "Veuillez selectionner un client.")
            return self.form_invalid(form)

        # Check if account already exists
        if CustomerAccount.objects.filter(store=store, customer=customer).exists():
            messages.warning(
                self.request,
                f"Un compte credit existe deja pour {customer.full_name}.",
            )
            existing = CustomerAccount.objects.get(store=store, customer=customer)
            return redirect(reverse("credits:account-detail", kwargs={"pk": existing.pk}))

        response = super().form_valid(form)
        messages.success(
            self.request,
            f"Compte credit cree pour {self.object.customer.full_name}.",
        )
        return response

    def get_success_url(self):
        return reverse("credits:account-detail", kwargs={"pk": self.object.pk})

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["page_title"] = "Creer un compte credit"
        context["submit_label"] = "Creer"

        # Pre-selected customer
        from customers.models import Customer
        customer_id = self.request.GET.get("customer")
        if customer_id:
            store = self.request.current_store
            context["selected_customer"] = Customer.objects.filter(
                pk=customer_id,
                enterprise=store.enterprise,
            ).first()

        return context


# ==================================================================
# Credit Payment
# ==================================================================


class CreditPaymentView(LoginRequiredMixin, View):
    """Record a payment against a customer's credit balance."""

    def post(self, request, pk):
        store = getattr(request, "current_store", None)
        account = get_object_or_404(
            CustomerAccount,
            pk=pk,
            store=store,
        )
        form = CreditPaymentForm(request.POST)

        if form.is_valid():
            amount = form.cleaned_data["amount"]
            reference = form.cleaned_data.get("reference", "")

            try:
                entry = record_credit_payment(
                    account=account,
                    amount=amount,
                    reference=reference,
                    actor=request.user,
                )
                messages.success(
                    request,
                    f"Paiement de {amount} enregistre. "
                    f"Nouveau solde: {entry.balance_after}.",
                )
                if request.POST.get("print_receipt") in {"1", "true", "True", "on", "yes"}:
                    return redirect(
                        reverse(
                            "credits:credit-payment-receipt",
                            kwargs={"pk": account.pk, "entry_id": entry.pk},
                        )
                    )
            except ValueError as e:
                messages.error(request, str(e))

        else:
            messages.error(request, "Formulaire invalide. Veuillez corriger les erreurs.")

        return redirect(reverse("credits:account-detail", kwargs={"pk": pk}))


class CreditRepayAllView(LoginRequiredMixin, View):
    """Repay the full outstanding credit balance in one click."""

    def post(self, request, pk):
        store = getattr(request, "current_store", None)
        account = get_object_or_404(
            CustomerAccount,
            pk=pk,
            store=store,
        )

        if not account.is_active:
            messages.error(request, "Ce compte credit est inactif.")
            return redirect(reverse("credits:account-detail", kwargs={"pk": pk}))

        if account.balance <= 0:
            messages.info(request, "Ce compte n'a pas de solde a rembourser.")
            return redirect(reverse("credits:account-detail", kwargs={"pk": pk}))

        amount = account.balance
        reference = f"REMBOURSEMENT-TOTAL-{timezone.now().strftime('%Y%m%d%H%M%S')}"

        try:
            entry = record_credit_payment(
                account=account,
                amount=amount,
                reference=reference,
                actor=request.user,
            )
            messages.success(
                request,
                f"Remboursement total de {amount} effectue. "
                f"Nouveau solde: {entry.balance_after}.",
            )
            if request.POST.get("print_receipt") in {"1", "true", "True", "on", "yes"}:
                return redirect(
                    reverse(
                        "credits:credit-payment-receipt",
                        kwargs={"pk": account.pk, "entry_id": entry.pk},
                    )
                )
        except ValueError as e:
            messages.error(request, str(e))

        return redirect(reverse("credits:account-detail", kwargs={"pk": pk}))


class CreditPaymentReceiptView(LoginRequiredMixin, View):
    """Generate a printable receipt/facture for a credit reimbursement."""

    def get(self, request, pk, entry_id):
        store = getattr(request, "current_store", None)
        account = get_object_or_404(
            CustomerAccount.objects.select_related("customer", "store"),
            pk=pk,
            store=store,
        )
        entry = get_object_or_404(
            CreditLedgerEntry.objects.select_related("account", "created_by", "sale"),
            pk=entry_id,
            account=account,
            entry_type=CreditLedgerEntry.EntryType.CREDIT_PAYMENT,
        )

        if not account.is_active:
            return HttpResponseForbidden("Compte credit inactif.")

        try:
            return generate_credit_payment_receipt_pdf(
                account=account,
                entry=entry,
                store=store,
            )
        except Exception:
            messages.error(
                request,
                "Impossible de generer la facture de remboursement.",
            )
            return redirect(reverse("credits:account-detail", kwargs={"pk": account.pk}))


# ==================================================================
# Ledger
# ==================================================================


class LedgerView(LoginRequiredMixin, ListView):
    """Full ledger for a specific credit account."""

    model = CreditLedgerEntry
    template_name = "credits/ledger.html"
    context_object_name = "entries"
    paginate_by = 50

    def get_queryset(self):
        store = getattr(self.request, "current_store", None)
        self.account = get_object_or_404(
            CustomerAccount,
            pk=self.kwargs["pk"],
            store=store,
        )
        return (
            self.account.ledger_entries
            .select_related("created_by", "sale")
            .order_by("-created_at")
        )

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["account"] = self.account
        return context


# ==================================================================
# Payment Schedules
# ==================================================================


class ScheduleListView(LoginRequiredMixin, ListView):
    """List all payment schedules for a specific account."""

    model = PaymentSchedule
    template_name = "credits/schedule_list.html"
    context_object_name = "schedules"
    paginate_by = 25

    def get_queryset(self):
        store = getattr(self.request, "current_store", None)
        self.account = get_object_or_404(
            CustomerAccount,
            pk=self.kwargs["pk"],
            store=store,
        )
        return self.account.schedules.order_by("due_date")

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["account"] = self.account
        return context


class ScheduleCreateView(LoginRequiredMixin, CreateView):
    """Create a new payment schedule for an account."""

    model = PaymentSchedule
    form_class = PaymentScheduleForm
    template_name = "credits/schedule_form.html"

    def dispatch(self, request, *args, **kwargs):
        store = getattr(request, "current_store", None)
        self.account = get_object_or_404(
            CustomerAccount,
            pk=self.kwargs["pk"],
            store=store,
        )
        return super().dispatch(request, *args, **kwargs)

    def form_valid(self, form):
        form.instance.account = self.account

        # Optionally link to a sale
        sale_id = self.request.POST.get("sale")
        if sale_id:
            from sales.models import Sale
            sale = Sale.objects.filter(
                pk=sale_id,
                store=self.account.store,
            ).first()
            if sale:
                form.instance.sale = sale

        response = super().form_valid(form)
        messages.success(
            self.request,
            f"Echeance du {self.object.due_date} creee pour {self.object.amount_due}.",
        )
        return response

    def get_success_url(self):
        return reverse("credits:schedule-list", kwargs={"pk": self.account.pk})

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["account"] = self.account
        context["page_title"] = "Nouvelle echeance"
        context["submit_label"] = "Creer"
        return context


# ==================================================================
# Overdue List
# ==================================================================


class OverdueListView(LoginRequiredMixin, ListView):
    """List all overdue payment schedules for the current store."""

    model = PaymentSchedule
    template_name = "credits/overdue_list.html"
    context_object_name = "schedules"
    paginate_by = 25

    def get_queryset(self):
        store = getattr(self.request, "current_store", None)
        today = timezone.now().date()
        qs = PaymentSchedule.objects.filter(
            due_date__lt=today,
            status__in=[
                PaymentSchedule.Status.PENDING,
                PaymentSchedule.Status.PARTIAL,
                PaymentSchedule.Status.OVERDUE,
            ],
        ).select_related("account__customer", "account__store", "sale")

        if store:
            qs = qs.filter(account__store=store)

        return qs.order_by("due_date")
