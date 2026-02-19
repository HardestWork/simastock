"""Views for the cashier app."""
import json
import io
import logging
from datetime import timedelta
from decimal import Decimal, InvalidOperation
from uuid import UUID

from django.contrib import messages
from django.contrib.auth.mixins import LoginRequiredMixin, UserPassesTestMixin
from django.db.models import Q, Sum
from django.http import HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.utils import timezone
from django.views import View
from django.views.generic import DetailView, ListView

from .forms import CloseShiftForm, MultiPaymentForm, OpenShiftForm, PaymentFilterForm
from .models import CashShift, Payment
from .services import (
    close_shift,
    get_current_shift,
    normalize_payment_method,
    open_shift,
    process_payment,
)

logger = logging.getLogger("boutique")


def _wants_json_response(request) -> bool:
    """Return True when the client explicitly asks for JSON."""
    accept = (request.headers.get("Accept") or "").lower()
    requested_with = (request.headers.get("X-Requested-With") or "").lower()
    return "application/json" in accept or requested_with == "xmlhttprequest"


# ==================================================================
# Mixins
# ==================================================================

class CashierOrManagerMixin(LoginRequiredMixin, UserPassesTestMixin):
    """Restrict access to users with CASHIER or MANAGER (or ADMIN) role."""

    def test_func(self):
        user = self.request.user
        return user.role in ("CASHIER", "MANAGER", "ADMIN")

    def handle_no_permission(self):
        if not self.request.user.is_authenticated:
            return super().handle_no_permission()
        messages.error(
            self.request,
            "Vous n'avez pas les permissions necessaires pour acceder a cette page.",
        )
        return redirect("dashboard:index")


class StoreRequiredMixin:
    """Ensure ``request.current_store`` is set, otherwise redirect."""

    def dispatch(self, request, *args, **kwargs):
        if not getattr(request, "current_store", None):
            messages.warning(
                request,
                "Veuillez selectionner une boutique avant de continuer.",
            )
            return redirect("stores:store-list")
        return super().dispatch(request, *args, **kwargs)


# ==================================================================
# CashierDashboardView
# ==================================================================

class CashierDashboardView(CashierOrManagerMixin, StoreRequiredMixin, View):
    """Main cashier dashboard.

    Shows the current shift info, pending sales count, and today's
    payment statistics.
    """

    template_name = "cashier/dashboard.html"

    def get(self, request):
        store = request.current_store
        cashier = request.user

        current_shift = get_current_shift(cashier, store)

        # Count pending sales for the current store
        pending_sales_count = 0
        try:
            from sales.models import Sale
            pending_sales_count = (
                Sale.objects
                .filter(store=store, status="PENDING_PAYMENT")
                .count()
            )
        except Exception:
            logger.warning("Could not load sales.models.Sale for pending count.")

        # Today's statistics
        today_start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
        today_payments = Payment.objects.filter(
            store=store,
            created_at__gte=today_start,
        )
        today_totals = today_payments.aggregate(
            total=Sum("amount"),
            cash=Sum("amount", filter=Payment.objects.filter(method="CASH").query.where),
        )
        # Simpler aggregation by method
        today_total = today_payments.aggregate(total=Sum("amount"))["total"] or Decimal("0")
        today_by_method = {}
        for method_code, method_label in Payment.Method.choices:
            method_total = (
                today_payments
                .filter(method=method_code)
                .aggregate(total=Sum("amount"))["total"]
            ) or Decimal("0")
            today_by_method[method_label] = method_total

        context = {
            "current_shift": current_shift,
            "pending_sales_count": pending_sales_count,
            "today_total": today_total,
            "today_by_method": today_by_method,
            "store": store,
        }
        return render(request, self.template_name, context)


# ==================================================================
# PendingSalesView
# ==================================================================

class PendingSalesView(CashierOrManagerMixin, StoreRequiredMixin, ListView):
    """List sales with status PENDING_PAYMENT for the current store."""

    template_name = "cashier/pending_sales.html"
    context_object_name = "sales"
    paginate_by = 25

    def get_queryset(self):
        try:
            from sales.models import Sale
            qs = (
                Sale.objects
                .filter(
                    store=self.request.current_store,
                    status__in=["PENDING_PAYMENT", "PARTIALLY_PAID"],
                )
                .select_related("customer", "seller")
                .order_by("-submitted_at", "-created_at")
            )
            query = (self.request.GET.get("q") or "").strip()
            if query:
                qs = qs.filter(
                    Q(invoice_number__icontains=query)
                    | Q(customer__first_name__icontains=query)
                    | Q(customer__last_name__icontains=query)
                    | Q(customer__phone__icontains=query)
                    | Q(seller__first_name__icontains=query)
                    | Q(seller__last_name__icontains=query)
                )
            return qs
        except ImportError:
            logger.error("sales.models.Sale not available.")
            return []

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["store"] = self.request.current_store
        context["current_shift"] = get_current_shift(
            self.request.user,
            self.request.current_store,
        )
        context["current_query"] = (self.request.GET.get("q") or "").strip()
        context["print_document_url"] = None
        raw_sale_id = (self.request.GET.get("print_sale") or "").strip()
        document_type = (self.request.GET.get("print_document") or "").strip().lower()
        if document_type not in {"receipt", "invoice", "proforma", "quote"}:
            document_type = "receipt"
        if raw_sale_id:
            try:
                sale_id = UUID(raw_sale_id)
            except ValueError:
                sale_id = None
            if sale_id is not None:
                from sales.models import Sale
                if Sale.objects.filter(pk=sale_id, store=self.request.current_store).exists():
                    if document_type == "receipt":
                        context["print_document_url"] = reverse("sales:sale-receipt", kwargs={"pk": sale_id})
                    else:
                        invoice_url = reverse("sales:sale-invoice", kwargs={"pk": sale_id})
                        if document_type in {"proforma", "quote"}:
                            invoice_url = f"{invoice_url}?kind={document_type}"
                        context["print_document_url"] = invoice_url
        return context


# ==================================================================
# ProcessPaymentView
# ==================================================================

class ProcessPaymentView(CashierOrManagerMixin, StoreRequiredMixin, View):
    """Process payment for a specific sale.

    GET: Show sale details and payment form.
    POST: Validate and process the payment(s).
    """

    template_name = "cashier/process_payment.html"

    @staticmethod
    def _quick_amounts(amount_due: Decimal) -> list[Decimal]:
        """Return quick amount shortcuts for the payment UI."""
        presets = [
            Decimal("1000"),
            Decimal("2000"),
            Decimal("5000"),
            Decimal("10000"),
            Decimal("20000"),
            Decimal("50000"),
        ]
        if amount_due > 0:
            presets = [p for p in presets if p <= amount_due]
            if not presets:
                presets = [amount_due]
        return presets[:5]

    @staticmethod
    def _parse_payment_data_json(request):
        """Parse the JSON payload sent by the POS payment UI.

        Expected shape:
        [
          {"method": "CASH", "amount": 1000, "reference": "..."},
          ...
        ]
        """
        raw = (request.POST.get("payment_data") or "").strip()
        if not raw:
            return None, "Aucune ligne de paiement envoyee."

        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            return None, "Format de donnees de paiement invalide."

        if not isinstance(payload, list):
            return None, "Format de donnees de paiement invalide."

        payments_data = []
        for line in payload:
            if not isinstance(line, dict):
                continue
            raw_method = (
                line.get("method")
                or line.get("mode")
                or line.get("payment_method")
                or line.get("methode")
                or line.get("type")
                or ""
            )
            method = normalize_payment_method(raw_method)
            reference = (line.get("reference") or "").strip()
            notes = (line.get("notes") or "").strip()
            try:
                amount = Decimal(str(line.get("amount", "0")))
            except (InvalidOperation, TypeError, ValueError):
                return None, "Montant de paiement invalide."

            # Ignore empty lines created by the UI.
            if amount <= 0:
                continue

            if not method:
                return None, "Moyen de paiement invalide."

            payments_data.append(
                {
                    "method": method,
                    "amount": amount,
                    "reference": reference,
                    "notes": notes,
                }
            )

        if not payments_data:
            return None, "Veuillez saisir au moins un paiement valide."

        return payments_data, None

    def get(self, request, sale_id):
        from sales.models import Sale

        sale = get_object_or_404(Sale, pk=sale_id, store=request.current_store)
        current_shift = get_current_shift(request.user, request.current_store)

        if not current_shift:
            messages.warning(
                request,
                "Vous devez ouvrir une session de caisse avant de traiter des paiements.",
            )
            return redirect("cashier:shift-open")

        form = MultiPaymentForm(
            initial={"primary_amount": sale.amount_due}
        )

        # Existing payments on this sale
        existing_payments = sale.payments.all().order_by("-created_at")

        context = {
            "sale": sale,
            "form": form,
            "current_shift": current_shift,
            "existing_payments": existing_payments,
            "quick_amounts": self._quick_amounts(sale.amount_due),
        }
        return render(request, self.template_name, context)

    def post(self, request, sale_id):
        from sales.models import Sale

        sale = get_object_or_404(Sale, pk=sale_id, store=request.current_store)
        current_shift = get_current_shift(request.user, request.current_store)
        wants_json = _wants_json_response(request)

        if not current_shift:
            message = "Aucune session de caisse ouverte. Veuillez en ouvrir une."
            if wants_json:
                return JsonResponse(
                    {
                        "error": message,
                        "redirect_url": reverse("cashier:shift-open"),
                    },
                    status=400,
                )
            messages.error(request, message)
            return redirect("cashier:shift-open")

        payments_data = None
        form_error = None
        if request.POST.get("payment_data"):
            payments_data, parse_error = self._parse_payment_data_json(request)
            if parse_error:
                if wants_json:
                    return JsonResponse({"error": parse_error}, status=400)
                messages.error(request, parse_error)
                form_error = parse_error
        else:
            # Backward compatibility with classic form fields.
            form = MultiPaymentForm(request.POST)
            if form.is_valid():
                payments_data = form.get_payments_data()
            else:
                form_error = "Donnees de paiement invalides."
                if wants_json:
                    return JsonResponse({"error": form_error}, status=400)
                messages.error(request, form_error)

        if payments_data:
            change_due = Decimal("0")
            # Validate total does not exceed amount due
            total_payment = sum(p["amount"] for p in payments_data)
            if total_payment > sale.amount_due:
                # Allow overpayment only if the excess can be returned in cash.
                overflow = total_payment - sale.amount_due
                cash_total = sum(
                    Decimal(str(p.get("amount", 0)))
                    for p in payments_data
                    if p.get("method") == Payment.Method.CASH
                )
                if cash_total < overflow:
                    overpay_message = (
                        f"Le montant total ({total_payment}) depasse le montant du ({sale.amount_due})."
                    )
                    if wants_json:
                        return JsonResponse(
                            {
                                "error": overpay_message,
                                "amount_due": str(sale.amount_due),
                                "total_entered": str(total_payment),
                            },
                            status=400,
                        )
                    messages.error(
                        request,
                        overpay_message,
                    )
                    existing_payments = sale.payments.all().order_by("-created_at")
                    context = {
                        "sale": sale,
                        "form": MultiPaymentForm(initial={"primary_amount": sale.amount_due}),
                        "current_shift": current_shift,
                        "existing_payments": existing_payments,
                        "quick_amounts": self._quick_amounts(sale.amount_due),
                    }
                    return render(request, self.template_name, context)

                # Deduct overflow from CASH lines, keeping accounting exact.
                remaining_overflow = overflow
                for line in payments_data:
                    if remaining_overflow <= 0:
                        break
                    if line.get("method") != Payment.Method.CASH:
                        continue

                    line_amount = Decimal(str(line.get("amount", 0)))
                    if line_amount <= 0:
                        continue

                    deduction = min(line_amount, remaining_overflow)
                    line["amount"] = line_amount - deduction
                    remaining_overflow -= deduction

                payments_data = [
                    line
                    for line in payments_data
                    if Decimal(str(line.get("amount", 0))) > 0
                ]
                change_due = overflow

            try:
                created_payments = process_payment(
                    sale=sale,
                    payments_data=payments_data,
                    cashier=request.user,
                    shift=current_shift,
                )
                sale.refresh_from_db()
                messages.success(
                    request,
                    f"Paiement enregistre avec succes. "
                    f"{len(created_payments)} paiement(s) traite(s).",
                )
                if change_due > 0:
                    messages.info(
                        request,
                        f"Monnaie a rendre: {change_due} {request.current_store.currency}.",
                    )
                print_document = (request.POST.get("print_document") or "").strip().lower()
                print_url = None
                if print_document in {"receipt", "invoice", "proforma", "quote"}:
                    if print_document == "receipt":
                        print_url = reverse("sales:sale-receipt", kwargs={"pk": sale.pk})
                    else:
                        print_url = reverse("sales:sale-invoice", kwargs={"pk": sale.pk})
                        if print_document in {"proforma", "quote"}:
                            print_url = f"{print_url}?kind={print_document}"

                if wants_json:
                    redirect_url = reverse("cashier:pending-sales")
                    if print_document in {"receipt", "invoice", "proforma", "quote"}:
                        redirect_url = (
                            f"{redirect_url}?print_sale={sale.pk}&print_document={print_document}"
                        )
                    return JsonResponse(
                        {
                            "message": (
                                "Paiement enregistre avec succes. "
                                f"{len(created_payments)} paiement(s) traite(s)."
                            ),
                            "redirect_url": redirect_url,
                            "print_document_url": print_url,
                            "sale_id": str(sale.pk),
                            "sale_status": sale.status,
                            "payments_count": len(created_payments),
                            "change_due": str(change_due),
                        }
                    )

                if print_document in {"receipt", "invoice", "proforma", "quote"}:
                    pending_url = reverse("cashier:pending-sales")
                    return redirect(f"{pending_url}?print_sale={sale.pk}&print_document={print_document}")
                return redirect("cashier:pending-sales")

            except ValueError as e:
                if wants_json:
                    return JsonResponse({"error": str(e)}, status=400)
                messages.error(request, str(e))
            except Exception as e:
                logger.exception("Error processing payment for sale %s", sale_id)
                if wants_json:
                    return JsonResponse(
                        {"error": "Une erreur est survenue lors du traitement du paiement."},
                        status=500,
                    )
                messages.error(
                    request,
                    "Une erreur est survenue lors du traitement du paiement.",
                )

        if wants_json:
            return JsonResponse(
                {"error": form_error or "Veuillez saisir au moins un paiement valide."},
                status=400,
            )

        existing_payments = sale.payments.all().order_by("-created_at")
        form = MultiPaymentForm(initial={"primary_amount": sale.amount_due})
        context = {
            "sale": sale,
            "form": form,
            "current_shift": current_shift,
            "existing_payments": existing_payments,
            "quick_amounts": self._quick_amounts(sale.amount_due),
        }
        return render(request, self.template_name, context)


# ==================================================================
# OpenShiftView
# ==================================================================

class OpenShiftView(CashierOrManagerMixin, StoreRequiredMixin, View):
    """Open a new cash shift for the current cashier."""

    template_name = "cashier/shift_open.html"

    def get(self, request):
        store = request.current_store
        existing_shift = get_current_shift(request.user, store)
        if existing_shift:
            messages.info(
                request,
                "Vous avez deja une session de caisse ouverte.",
            )
            return redirect("cashier:dashboard")

        form = OpenShiftForm()
        return render(request, self.template_name, {"form": form})

    def post(self, request):
        store = request.current_store
        existing_shift = get_current_shift(request.user, store)
        if existing_shift:
            messages.warning(
                request,
                "Vous avez deja une session de caisse ouverte.",
            )
            return redirect("cashier:dashboard")

        form = OpenShiftForm(request.POST)
        if form.is_valid():
            try:
                shift = open_shift(
                    store=store,
                    cashier=request.user,
                    opening_float=form.cleaned_data["opening_float"],
                )
                messages.success(
                    request,
                    f"Session de caisse ouverte avec un fond de {shift.opening_float} "
                    f"{getattr(request, 'current_store', None) and request.current_store.currency or 'FCFA'}.",
                )
                return redirect("cashier:dashboard")

            except ValueError as e:
                messages.error(request, str(e))

        return render(request, self.template_name, {"form": form})


# ==================================================================
# CloseShiftView
# ==================================================================

class CloseShiftView(CashierOrManagerMixin, StoreRequiredMixin, View):
    """Close the current cash shift."""

    template_name = "cashier/shift_close.html"

    def get(self, request):
        store = request.current_store
        current_shift = get_current_shift(request.user, store)

        if not current_shift:
            messages.warning(
                request,
                "Aucune session de caisse ouverte a fermer.",
            )
            return redirect("cashier:dashboard")

        form = CloseShiftForm()

        # Pre-calculate expected values for display
        from .services import calculate_shift_totals
        totals = calculate_shift_totals(current_shift)

        context = {
            "form": form,
            "shift": current_shift,
            "totals": totals,
        }
        return render(request, self.template_name, context)

    def post(self, request):
        store = request.current_store
        current_shift = get_current_shift(request.user, store)

        if not current_shift:
            messages.error(
                request,
                "Aucune session de caisse ouverte a fermer.",
            )
            return redirect("cashier:dashboard")

        form = CloseShiftForm(request.POST)
        if form.is_valid():
            try:
                closed_shift = close_shift(
                    shift=current_shift,
                    closing_cash=form.cleaned_data["closing_cash"],
                    notes=form.cleaned_data.get("notes", ""),
                )
                variance = closed_shift.variance or Decimal("0")
                if variance == 0:
                    messages.success(
                        request,
                        "Session de caisse fermee. Aucun ecart detecte.",
                    )
                elif variance > 0:
                    messages.warning(
                        request,
                        f"Session de caisse fermee. Excedent de {variance} "
                        f"{store.currency}.",
                    )
                else:
                    messages.warning(
                        request,
                        f"Session de caisse fermee. Deficit de {abs(variance)} "
                        f"{store.currency}.",
                    )
                return redirect("cashier:shift-detail", pk=closed_shift.pk)

            except ValueError as e:
                messages.error(request, str(e))

        from .services import calculate_shift_totals
        totals = calculate_shift_totals(current_shift)
        context = {
            "form": form,
            "shift": current_shift,
            "totals": totals,
        }
        return render(request, self.template_name, context)


# ==================================================================
# ShiftListView
# ==================================================================

class ShiftListView(CashierOrManagerMixin, StoreRequiredMixin, ListView):
    """List all cash shifts for the current store."""

    model = CashShift
    template_name = "cashier/shift_list.html"
    context_object_name = "shifts"
    paginate_by = 25

    def get_queryset(self):
        qs = (
            CashShift.objects
            .filter(store=self.request.current_store)
            .select_related("cashier")
            .order_by("-opened_at")
        )

        # Filter by status
        status = self.request.GET.get("status")
        if status in ("OPEN", "CLOSED"):
            qs = qs.filter(status=status)

        # Filter by cashier (managers can see all; cashiers see only their own)
        if self.request.user.role == "CASHIER":
            qs = qs.filter(cashier=self.request.user)

        return qs

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["store"] = self.request.current_store
        context["current_status"] = self.request.GET.get("status", "")
        return context


# ==================================================================
# ShiftDetailView
# ==================================================================

class ShiftDetailView(CashierOrManagerMixin, StoreRequiredMixin, DetailView):
    """Show shift details with all payments made during the shift."""

    model = CashShift
    template_name = "cashier/shift_detail.html"
    context_object_name = "shift"

    def get_queryset(self):
        qs = CashShift.objects.filter(store=self.request.current_store)
        # Cashiers can only view their own shifts
        if self.request.user.role == "CASHIER":
            qs = qs.filter(cashier=self.request.user)
        return qs.select_related("cashier", "store")

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        shift = self.object
        context["payments"] = (
            shift.payments
            .select_related("sale", "cashier")
            .order_by("-created_at")
        )
        # Payment totals by method
        method_totals = {}
        for method_code, method_label in Payment.Method.choices:
            total = (
                shift.payments
                .filter(method=method_code)
                .aggregate(total=Sum("amount"))["total"]
            ) or Decimal("0")
            if total > 0:
                method_totals[method_label] = total
        context["method_totals"] = method_totals
        return context


# ==================================================================
# ShiftReportPDFView
# ==================================================================

class ShiftReportPDFView(CashierOrManagerMixin, StoreRequiredMixin, View):
    """Generate a PDF report for a cash shift.

    Uses ReportLab if available; otherwise falls back to a simple
    text-based response.
    """

    def get(self, request, pk):
        shift = get_object_or_404(
            CashShift.objects.select_related("cashier", "store"),
            pk=pk,
            store=request.current_store,
        )
        # Cashiers can only access their own shift reports
        if request.user.role == "CASHIER" and shift.cashier != request.user:
            messages.error(request, "Acces refuse.")
            return redirect("cashier:shift-list")

        payments = (
            shift.payments
            .select_related("sale")
            .order_by("created_at")
        )

        try:
            return self._generate_pdf(shift, payments)
        except ImportError:
            logger.warning("ReportLab not installed; generating text report.")
            return self._generate_text_report(shift, payments)

    def _generate_pdf(self, shift, payments):
        """Generate a PDF report using ReportLab."""
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import mm
        from reportlab.platypus import (
            SimpleDocTemplate,
            Table,
            TableStyle,
            Paragraph,
            Spacer,
        )
        from reportlab.lib.styles import getSampleStyleSheet

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4)
        styles = getSampleStyleSheet()
        elements = []

        # Title
        elements.append(Paragraph(
            f"Rapport de Session de Caisse",
            styles["Title"],
        ))
        elements.append(Spacer(1, 5 * mm))

        # Shift info
        info_data = [
            ["Boutique", str(shift.store)],
            ["Caissier", shift.cashier.get_full_name()],
            ["Statut", shift.get_status_display()],
            ["Ouvert le", shift.opened_at.strftime("%d/%m/%Y %H:%M")],
            ["Ferme le", shift.closed_at.strftime("%d/%m/%Y %H:%M") if shift.closed_at else "---"],
            ["Fond de caisse", f"{shift.opening_float} {shift.store.currency}"],
            ["Especes attendues", f"{shift.expected_cash} {shift.store.currency}"],
            ["Especes comptees", f"{shift.closing_cash or '---'} {shift.store.currency}"],
            ["Ecart", f"{shift.variance or '---'} {shift.store.currency}"],
            ["Total ventes", f"{shift.total_sales} {shift.store.currency}"],
        ]
        info_table = Table(info_data, colWidths=[50 * mm, 100 * mm])
        info_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (0, -1), colors.Color(0.9, 0.9, 0.9)),
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        elements.append(info_table)
        elements.append(Spacer(1, 10 * mm))

        # Totals by method
        elements.append(Paragraph("Totaux par methode", styles["Heading2"]))
        method_data = [["Methode", "Montant"]]
        for method_code, method_label in Payment.Method.choices:
            total = (
                payments
                .filter(method=method_code)
                .aggregate(total=Sum("amount"))["total"]
            ) or Decimal("0")
            if total > 0:
                method_data.append([method_label, f"{total} {shift.store.currency}"])

        if len(method_data) > 1:
            method_table = Table(method_data, colWidths=[80 * mm, 70 * mm])
            method_table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.Color(0.2, 0.4, 0.6)),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]))
            elements.append(method_table)
        elements.append(Spacer(1, 10 * mm))

        # Payments list
        elements.append(Paragraph("Detail des paiements", styles["Heading2"]))
        pay_data = [["Heure", "Vente", "Methode", "Montant", "Reference"]]
        for p in payments:
            pay_data.append([
                p.created_at.strftime("%H:%M"),
                str(p.sale_id)[:8] + "...",
                p.get_method_display(),
                f"{p.amount} {shift.store.currency}",
                p.reference or "---",
            ])

        if len(pay_data) > 1:
            pay_table = Table(
                pay_data,
                colWidths=[25 * mm, 35 * mm, 35 * mm, 35 * mm, 30 * mm],
            )
            pay_table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.Color(0.2, 0.4, 0.6)),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                ("ALIGN", (3, 0), (3, -1), "RIGHT"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]))
            elements.append(pay_table)
        else:
            elements.append(Paragraph(
                "Aucun paiement enregistre pour cette session.",
                styles["Normal"],
            ))

        # Notes
        if shift.notes:
            elements.append(Spacer(1, 10 * mm))
            elements.append(Paragraph("Notes", styles["Heading2"]))
            elements.append(Paragraph(shift.notes, styles["Normal"]))

        doc.build(elements)
        buffer.seek(0)

        response = HttpResponse(buffer.getvalue(), content_type="application/pdf")
        filename = f"rapport_caisse_{shift.opened_at:%Y%m%d_%H%M}.pdf"
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response

    def _generate_text_report(self, shift, payments):
        """Fallback: plain-text report when ReportLab is not available."""
        lines = [
            "=" * 60,
            "RAPPORT DE SESSION DE CAISSE",
            "=" * 60,
            f"Boutique:           {shift.store}",
            f"Caissier:           {shift.cashier.get_full_name()}",
            f"Statut:             {shift.get_status_display()}",
            f"Ouvert le:          {shift.opened_at:%d/%m/%Y %H:%M}",
            f"Ferme le:           {shift.closed_at:%d/%m/%Y %H:%M}" if shift.closed_at else "Ferme le:           ---",
            "-" * 60,
            f"Fond de caisse:     {shift.opening_float} {shift.store.currency}",
            f"Especes attendues:  {shift.expected_cash} {shift.store.currency}",
            f"Especes comptees:   {shift.closing_cash or '---'} {shift.store.currency}",
            f"Ecart:              {shift.variance or '---'} {shift.store.currency}",
            f"Total ventes:       {shift.total_sales} {shift.store.currency}",
            "-" * 60,
            "PAIEMENTS:",
        ]
        for p in payments:
            lines.append(
                f"  {p.created_at:%H:%M} | {p.get_method_display():<20} | "
                f"{p.amount:>12} {shift.store.currency} | Ref: {p.reference or '---'}"
            )
        if not payments:
            lines.append("  Aucun paiement.")

        if shift.notes:
            lines.extend(["", "NOTES:", shift.notes])

        lines.append("=" * 60)

        content = "\n".join(lines)
        response = HttpResponse(content, content_type="text/plain; charset=utf-8")
        filename = f"rapport_caisse_{shift.opened_at:%Y%m%d_%H%M}.txt"
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response


# ==================================================================
# PaymentListView
# ==================================================================

class PaymentListView(CashierOrManagerMixin, StoreRequiredMixin, ListView):
    """List all payments, with filtering support."""

    model = Payment
    template_name = "cashier/payment_list.html"
    context_object_name = "payments"
    paginate_by = 25

    def get_queryset(self):
        qs = (
            Payment.objects
            .filter(store=self.request.current_store)
            .select_related("sale", "cashier", "shift")
            .order_by("-created_at")
        )

        # Cashiers can only see their own payments
        if self.request.user.role == "CASHIER":
            qs = qs.filter(cashier=self.request.user)

        # Apply filters from query parameters
        self.filter_form = PaymentFilterForm(
            self.request.GET,
            store=self.request.current_store,
        )
        if not self.filter_form.is_valid():
            return qs
        params = self.filter_form.cleaned_data

        date_from = params.get("date_from")
        if date_from:
            qs = qs.filter(created_at__date__gte=date_from)

        date_to = params.get("date_to")
        if date_to:
            qs = qs.filter(created_at__date__lte=date_to)

        method = params.get("method")
        if method and method in dict(Payment.Method.choices):
            qs = qs.filter(method=method)

        cashier_id = params.get("cashier_display")
        if cashier_id and self.request.user.role != "CASHIER":
            qs = qs.filter(cashier_id=cashier_id)

        search_query = (params.get("q") or "").strip()
        if search_query:
            qs = qs.filter(
                Q(reference__icontains=search_query)
                | Q(sale__invoice_number__icontains=search_query)
                | Q(sale__customer__first_name__icontains=search_query)
                | Q(sale__customer__last_name__icontains=search_query)
                | Q(sale__customer__phone__icontains=search_query)
                | Q(cashier__first_name__icontains=search_query)
                | Q(cashier__last_name__icontains=search_query)
                | Q(cashier__email__icontains=search_query)
            )

        return qs

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        if not hasattr(self, "filter_form"):
            self.filter_form = PaymentFilterForm(
                self.request.GET,
                store=self.request.current_store,
            )
        context["filter_form"] = self.filter_form
        context["store"] = self.request.current_store

        # Total for the current filter
        qs = self.get_queryset()
        context["total_amount"] = qs.aggregate(total=Sum("amount"))["total"] or Decimal("0")
        context["payments_count"] = qs.count()
        if context["payments_count"]:
            context["average_amount"] = (
                context["total_amount"] / context["payments_count"]
            ).quantize(Decimal("0.01"))
        else:
            context["average_amount"] = Decimal("0.00")

        method_totals = qs.values("method").annotate(total=Sum("amount")).order_by()
        method_labels = dict(Payment.Method.choices)
        context["totals_by_method"] = [
            {
                "code": row["method"],
                "label": method_labels.get(row["method"], row["method"]),
                "total": row["total"] or Decimal("0"),
            }
            for row in method_totals
        ]

        return context
