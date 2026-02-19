"""Views for the sales app."""
import json
from decimal import Decimal, InvalidOperation
import logging

from django.conf import settings
from django.contrib import messages
from django.contrib.auth.mixins import LoginRequiredMixin
from django.core.serializers.json import DjangoJSONEncoder
from django.db.models import F, IntegerField, OuterRef, Q, Subquery, Value
from django.db.models.functions import Coalesce
from django.http import (
    HttpResponse,
    HttpResponseBadRequest,
    HttpResponseForbidden,
    JsonResponse,
)
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.views import View
from django.views.generic import DetailView, ListView

from catalog.models import Product
from core.pdf import generate_invoice_pdf, generate_receipt_pdf
from customers.models import Customer
from sales.forms import (
    RefundForm,
    SaleFilterForm,
    SaleForm,
    SaleItemForm,
    SaleSubmitForm,
)
from sales.models import Refund, Sale
from sales.services import (
    add_item_to_sale,
    cancel_sale,
    create_refund,
    create_sale,
    recalculate_sale,
    remove_item_from_sale,
    submit_sale_to_cashier,
    update_item_quantity,
)

logger = logging.getLogger("boutique")

# ---------------------------------------------------------------------------
# Role checking helpers
# ---------------------------------------------------------------------------

MANAGER_ROLES = {"MANAGER", "ADMIN"}
SALES_ROLES = {"SALES", "MANAGER", "ADMIN"}


def _has_role(user, allowed_roles):
    """Return True if the user's role is in the set of allowed_roles."""
    return getattr(user, "role", None) in allowed_roles


def _can_edit_draft_sale(user, sale) -> bool:
    """Allow only sale owner or manager/admin to edit a draft sale."""
    return sale.status == Sale.Status.DRAFT and (
        sale.seller_id == user.pk or _has_role(user, MANAGER_ROLES)
    )


def _max_discount_for_user(user) -> int:
    """Return the max discount percentage allowed for the current user."""
    if _has_role(user, MANAGER_ROLES):
        return getattr(settings, "MAX_DISCOUNT_PERCENT_MANAGER", 50)
    return getattr(settings, "MAX_DISCOUNT_PERCENT_SALES", 10)


def _parse_print_document(value: str) -> str | None:
    """Normalize requested printable document type."""
    candidate = (value or "").strip().lower()
    if candidate in {"receipt", "invoice", "proforma", "quote"}:
        return candidate
    return None


def _build_print_document_url(sale_pk, document_type: str) -> str:
    """Build the printable URL according to the requested document type."""
    if document_type == "receipt":
        return reverse("sales:sale-receipt", kwargs={"pk": sale_pk})
    if document_type in {"invoice", "proforma", "quote"}:
        base = reverse("sales:sale-invoice", kwargs={"pk": sale_pk})
        if document_type in {"proforma", "quote"}:
            return f"{base}?kind={document_type}"
        return base
    return ""


def _wants_json_response(request) -> bool:
    """Return True when the client explicitly asks for JSON."""
    accept = (request.headers.get("Accept") or "").lower()
    requested_with = (request.headers.get("X-Requested-With") or "").lower()
    return "application/json" in accept or requested_with == "xmlhttprequest"


def _build_sale_snapshot(sale: Sale, user) -> dict:
    """Build a compact JSON snapshot of a sale for the POS single-page UI."""
    items = list(sale.items.select_related("product").all())
    product_ids = [item.product_id for item in items]
    available_by_product = {}
    if product_ids:
        from stock.models import ProductStock

        available_by_product = {
            row["product_id"]: int(row["available_qty"])
            for row in (
                ProductStock.objects
                .filter(store=sale.store, product_id__in=product_ids)
                .annotate(available_qty=F("quantity") - F("reserved_qty"))
                .values("product_id", "available_qty")
            )
        }

    is_owner = sale.seller_id == user.pk
    is_manager = _has_role(user, MANAGER_ROLES)

    return {
        "id": str(sale.pk),
        "status": sale.status,
        "status_label": sale.get_status_display(),
        "invoice_number": sale.invoice_number or "",
        "currency": getattr(sale.store, "currency", "FCFA"),
        "customer": (
            {
                "id": str(sale.customer_id),
                "full_name": sale.customer.full_name,
                "phone": sale.customer.phone,
                "email": sale.customer.email,
            }
            if sale.customer_id
            else None
        ),
        "items": [
            {
                "id": str(item.pk),
                "product_id": str(item.product_id),
                "product_name": item.product_name,
                "unit_price": str(item.unit_price),
                "quantity": int(item.quantity),
                "line_total": str(item.line_total),
                "available_stock": int(available_by_product.get(item.product_id, 0)),
            }
            for item in items
        ],
        "item_count": len(items),
        "subtotal": str(sale.subtotal),
        "discount_amount": str(sale.discount_amount),
        "discount_percent": str(sale.discount_percent),
        "tax_amount": str(sale.tax_amount),
        "total": str(sale.total),
        "amount_due": str(sale.amount_due),
        "notes": sale.notes or "",
        "can_edit": bool(sale.status == Sale.Status.DRAFT and (is_owner or is_manager)),
        "can_submit": bool(sale.can_submit() and (is_owner or is_manager)),
        "max_discount": int(_max_discount_for_user(user)),
    }


def _json_sale_response(sale: Sale, user, *, message: str = "", status: int = 200, **extra):
    payload = {"sale": _build_sale_snapshot(sale, user)}
    if message:
        payload["message"] = message
    payload.update(extra)
    return JsonResponse(payload, status=status)


def _apply_sale_filters(qs, filter_form: SaleFilterForm, *, allow_seller: bool = True):
    """Apply sale list filters from ``SaleFilterForm`` to a queryset."""
    if not filter_form.is_valid():
        return qs

    data = filter_form.cleaned_data
    if data.get("date_from"):
        qs = qs.filter(created_at__date__gte=data["date_from"])
    if data.get("date_to"):
        qs = qs.filter(created_at__date__lte=data["date_to"])
    if data.get("status"):
        qs = qs.filter(status=data["status"])
    if allow_seller and data.get("seller"):
        qs = qs.filter(seller=data["seller"])
    if data.get("customer_search"):
        search = data["customer_search"]
        qs = qs.filter(
            Q(customer__first_name__icontains=search)
            | Q(customer__last_name__icontains=search)
            | Q(customer__phone__icontains=search)
            | Q(invoice_number__icontains=search)
        )
    return qs


# ---------------------------------------------------------------------------
# SaleListView -- all sales for the store (managers)
# ---------------------------------------------------------------------------

class SaleListView(LoginRequiredMixin, ListView):
    """Display all sales for the current store.  Accessible by managers."""

    model = Sale
    template_name = "pos/sale_list.html"
    context_object_name = "sales"
    paginate_by = 25

    def dispatch(self, request, *args, **kwargs):
        if not _has_role(request.user, MANAGER_ROLES | {"CASHIER"}):
            return HttpResponseForbidden("Acces refuse.")
        return super().dispatch(request, *args, **kwargs)

    def get_queryset(self):
        qs = (
            Sale.objects
            .filter(store=self.request.current_store)
            .select_related("seller", "customer", "store")
        )
        self.filter_form = SaleFilterForm(self.request.GET, store=self.request.current_store)
        return _apply_sale_filters(qs, self.filter_form, allow_seller=True)

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["filter_form"] = self.filter_form
        ctx["show_all"] = True
        return ctx


# ---------------------------------------------------------------------------
# MySalesView -- seller's own sales
# ---------------------------------------------------------------------------

class MySalesView(LoginRequiredMixin, ListView):
    """Display the current user's sales for the current store."""

    model = Sale
    template_name = "pos/sale_list.html"
    context_object_name = "sales"
    paginate_by = 25

    def get_queryset(self):
        qs = (
            Sale.objects
            .filter(
                store=self.request.current_store,
                seller=self.request.user,
            )
            .select_related("customer", "store")
        )
        self.filter_form = SaleFilterForm(self.request.GET, store=self.request.current_store)
        return _apply_sale_filters(qs, self.filter_form, allow_seller=False)

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["show_all"] = False
        ctx["filter_form"] = self.filter_form
        return ctx


# ---------------------------------------------------------------------------
# SaleCreateView
# ---------------------------------------------------------------------------

class SaleCreateView(LoginRequiredMixin, View):
    """Create a new DRAFT sale and redirect to its detail page."""

    def dispatch(self, request, *args, **kwargs):
        if not _has_role(request.user, SALES_ROLES):
            return HttpResponseForbidden("Acces refuse.")
        return super().dispatch(request, *args, **kwargs)

    def get(self, request):
        current_store = getattr(request, "current_store", None)
        if current_store is None or getattr(current_store, "pk", None) is None:
            messages.error(
                request,
                "Aucune boutique active n'est associee a votre compte.",
            )
            return redirect("stores:store-list")

        sale = create_sale(
            store=current_store,
            seller=request.user,
            customer=None,
        )
        messages.success(request, "Vente creee. Ajoutez des articles.")
        return redirect("sales:sale-detail", pk=sale.pk)

    def post(self, request):
        current_store = getattr(request, "current_store", None)
        if current_store is None or getattr(current_store, "pk", None) is None:
            messages.error(
                request,
                "Aucune boutique active n'est associee a votre compte.",
            )
            return redirect("stores:store-list")

        form = SaleForm(request.POST)
        if form.is_valid():
            customer = form.cleaned_data.get("customer")
            if customer and customer.enterprise_id != current_store.enterprise_id:
                messages.error(request, "Client introuvable pour cette boutique.")
                return redirect("sales:sale-create")
            sale = create_sale(
                store=current_store,
                seller=request.user,
                customer=customer,
            )
            sale.notes = form.cleaned_data.get("notes", "")
            sale.discount_percent = form.cleaned_data.get("discount_percent", 0)
            sale.is_credit_sale = form.cleaned_data.get("is_credit_sale", False)
            sale.save()
            messages.success(request, "Vente creee. Ajoutez des articles.")
            return redirect("sales:sale-detail", pk=sale.pk)
        messages.error(request, "Donnees invalides pour creer la vente.")
        return redirect("sales:sale-create")


class ProductSearchView(LoginRequiredMixin, View):
    """Return available products for the current store (POS live search)."""

    def get(self, request):
        if not _has_role(request.user, SALES_ROLES):
            return HttpResponseForbidden("Acces refuse.")
        if request.current_store is None:
            return JsonResponse({"results": []})

        query = (request.GET.get("q") or "").strip()
        try:
            limit = int(request.GET.get("limit", request.GET.get("page_size", 20)))
        except (TypeError, ValueError):
            limit = 20
        limit = max(1, min(limit, 50))
        try:
            page = int(request.GET.get("page", 1))
        except (TypeError, ValueError):
            page = 1
        page = max(1, page)

        from stock.models import ProductStock

        available_qty_subquery = (
            ProductStock.objects
            .filter(
                store=request.current_store,
                product_id=OuterRef("pk"),
            )
            .annotate(available_qty_calc=F("quantity") - F("reserved_qty"))
            .values("available_qty_calc")[:1]
        )

        qs = (
            Product.objects
            .filter(
                is_active=True,
                enterprise=request.current_store.enterprise,
            )
            .annotate(
                available_qty=Coalesce(
                    Subquery(available_qty_subquery, output_field=IntegerField()),
                    Value(0),
                )
            )
            .select_related("category", "brand")
            .order_by("name")
        )

        if query:
            qs = qs.filter(
                Q(name__icontains=query)
                | Q(sku__icontains=query)
                | Q(barcode__icontains=query)
            )

        total = qs.count()
        start = (page - 1) * limit
        stop = start + limit

        results = [
            {
                "id": str(product.pk),
                "name": product.name,
                "sku": product.sku,
                "barcode": product.barcode,
                "selling_price": str(product.selling_price),
                "stock": int(product.available_qty),
            }
            for product in qs[start:stop]
        ]
        return JsonResponse(
            {
                "results": results,
                "pagination": {
                    "page": page,
                    "page_size": limit,
                    "total": total,
                    "has_next": stop < total,
                    "has_previous": page > 1,
                },
            }
        )


class SaleCustomerQuickCreateView(LoginRequiredMixin, View):
    """Create/select a customer from POS and attach it to a DRAFT sale."""

    def post(self, request, pk):
        sale = get_object_or_404(
            Sale,
            pk=pk,
            store=request.current_store,
            status=Sale.Status.DRAFT,
        )
        if not _can_edit_draft_sale(request.user, sale):
            if _wants_json_response(request):
                return JsonResponse({"error": "Acces refuse."}, status=403)
            return HttpResponseForbidden("Acces refuse.")

        first_name = (request.POST.get("first_name") or "").strip()
        last_name = (request.POST.get("last_name") or "").strip()
        phone = (request.POST.get("phone") or "").strip()
        email = (request.POST.get("email") or "").strip()

        if not phone:
            return JsonResponse(
                {"error": "Le numero de telephone est requis."},
                status=400,
            )

        if not first_name and not last_name:
            return JsonResponse(
                {"error": "Le nom du client est requis."},
                status=400,
            )

        if not first_name:
            first_name = last_name
            last_name = ""

        existing_customer = (
            Customer.objects
            .filter(
                enterprise=sale.store.enterprise,
                phone=phone,
                is_active=True,
            )
            .order_by("-created_at")
            .first()
        )

        created = False
        if existing_customer:
            customer = existing_customer
        else:
            customer = Customer.objects.create(
                enterprise=sale.store.enterprise,
                first_name=first_name,
                last_name=last_name,
                phone=phone,
                email=email,
                is_active=True,
            )
            created = True

        sale.customer = customer
        sale.save(update_fields=["customer", "updated_at"])

        return JsonResponse(
            {
                "created": created,
                "customer": {
                    "id": str(customer.pk),
                    "full_name": customer.full_name,
                    "phone": customer.phone,
                    "email": customer.email,
                },
            },
            status=201 if created else 200,
        )


# ---------------------------------------------------------------------------
# SaleDetailView
# ---------------------------------------------------------------------------

class SaleDetailView(LoginRequiredMixin, DetailView):
    """Display a sale with its items and available actions based on status."""

    model = Sale
    template_name = "pos/sale_create.html"
    context_object_name = "sale"

    def get_queryset(self):
        return (
            Sale.objects
            .filter(store=self.request.current_store)
            .select_related("seller", "customer", "store", "cancelled_by")
            .prefetch_related("items__product", "refunds")
        )

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        sale = self.object
        user = self.request.user

        items = list(sale.items.select_related("product").all())
        stock_by_product_id = {}
        if items:
            from stock.models import ProductStock
            product_ids = [item.product_id for item in items]
            stock_by_product_id = {
                row["product_id"]: row["available_qty"]
                for row in (
                    ProductStock.objects
                    .filter(store=sale.store, product_id__in=product_ids)
                    .annotate(available_qty=F("quantity") - F("reserved_qty"))
                    .values("product_id", "available_qty")
                )
            }
            for item in items:
                item.available_stock = int(stock_by_product_id.get(item.product_id, 0))

        ctx["items"] = items
        ctx["is_owner"] = sale.seller == user
        ctx["is_manager"] = _has_role(user, MANAGER_ROLES)
        ctx["can_edit"] = (
            sale.status == Sale.Status.DRAFT
            and (ctx["is_owner"] or ctx["is_manager"])
        )
        ctx["can_submit"] = sale.can_submit() and (ctx["is_owner"] or ctx["is_manager"])
        ctx["can_cancel"] = sale.can_cancel() and ctx["is_manager"]
        ctx["can_refund"] = (
            sale.status in (Sale.Status.PAID, Sale.Status.PARTIALLY_PAID)
            and ctx["is_manager"]
        )
        ctx["submit_form"] = SaleSubmitForm()
        ctx["item_form"] = SaleItemForm()
        ctx["refunds"] = sale.refunds.all()
        ctx["max_discount"] = _max_discount_for_user(user)
        document_type = _parse_print_document(self.request.GET.get("print_document"))
        ctx["auto_print_document"] = document_type is not None
        ctx["print_document_url"] = _build_print_document_url(sale.pk, document_type or "")
        ctx["sale_snapshot_json"] = json.dumps(
            _build_sale_snapshot(sale, user),
            cls=DjangoJSONEncoder,
        )
        return ctx


class SaleSnapshotView(LoginRequiredMixin, View):
    """Return a live sale snapshot for POS single-page refreshes."""

    def get(self, request, pk):
        sale = get_object_or_404(
            Sale.objects.select_related("seller", "customer", "store"),
            pk=pk,
            store=request.current_store,
        )
        is_owner = sale.seller_id == request.user.pk
        is_manager = _has_role(request.user, MANAGER_ROLES)
        is_cashier = _has_role(request.user, {"CASHIER"})
        if not (is_owner or is_manager or is_cashier):
            return JsonResponse({"error": "Acces refuse."}, status=403)
        return JsonResponse({"sale": _build_sale_snapshot(sale, request.user)})


# ---------------------------------------------------------------------------
# SaleEditView
# ---------------------------------------------------------------------------

class SaleEditView(LoginRequiredMixin, View):
    """Edit selected fields on a DRAFT sale (customer, notes, discount)."""

    def post(self, request, pk):
        sale = get_object_or_404(
            Sale,
            pk=pk,
            store=request.current_store,
            status=Sale.Status.DRAFT,
        )

        if not _can_edit_draft_sale(request.user, sale):
            return HttpResponseForbidden("Acces refuse.")

        updated_fields = []

        if "customer_id" in request.POST:
            customer_id = (request.POST.get("customer_id") or "").strip()
            if not customer_id:
                sale.customer = None
                updated_fields.append("customer")
            else:
                customer = Customer.objects.filter(
                    pk=customer_id,
                    enterprise=sale.store.enterprise,
                ).first()
                if customer is None:
                    if _wants_json_response(request):
                        return JsonResponse(
                            {"error": "Client introuvable pour cette boutique."},
                            status=400,
                        )
                    messages.error(request, "Client introuvable pour cette boutique.")
                    return redirect("sales:sale-detail", pk=sale.pk)
                sale.customer = customer
                updated_fields.append("customer")

        if "notes" in request.POST:
            sale.notes = request.POST.get("notes", "").strip()
            updated_fields.append("notes")

        if (
            "discount_type" in request.POST
            or "discount_value" in request.POST
            or "discount_percent" in request.POST
            or "discount_amount" in request.POST
        ):
            discount_type = (request.POST.get("discount_type") or "").strip().lower()
            if not discount_type:
                if "discount_amount" in request.POST and "discount_percent" not in request.POST:
                    discount_type = "amount"
                else:
                    discount_type = "percent"

            if discount_type not in {"percent", "amount"}:
                discount_type = "percent"

            raw_discount = (request.POST.get("discount_value") or "").strip()
            if not raw_discount:
                raw_discount = (
                    (request.POST.get("discount_amount") or "0").strip()
                    if discount_type == "amount"
                    else (request.POST.get("discount_percent") or "0").strip()
                )

            try:
                discount_value = Decimal(raw_discount)
            except InvalidOperation:
                if _wants_json_response(request):
                    return JsonResponse({"error": "Valeur de remise invalide."}, status=400)
                messages.error(request, "Valeur de remise invalide.")
                return redirect("sales:sale-detail", pk=sale.pk)

            if discount_value < Decimal("0"):
                discount_value = Decimal("0")

            if discount_type == "percent":
                max_discount = Decimal(str(_max_discount_for_user(request.user)))
                if discount_value > max_discount:
                    messages.error(
                        request,
                        f"La remise maximale autorisee est {max_discount}%.",
                    )
                    discount_value = max_discount

                sale.discount_percent = discount_value
                sale.discount_amount = Decimal("0.00")
            else:
                max_amount = sale.subtotal
                if discount_value > max_amount:
                    messages.error(
                        request,
                        "La remise en valeur ne peut pas depasser le sous-total.",
                    )
                    discount_value = max_amount

                sale.discount_percent = Decimal("0.00")
                sale.discount_amount = discount_value.quantize(Decimal("0.01"))

            updated_fields.extend(["discount_percent", "discount_amount"])

        if "is_credit_sale" in request.POST:
            sale.is_credit_sale = request.POST.get("is_credit_sale") in {
                "1", "true", "True", "on", "yes",
            }
            updated_fields.append("is_credit_sale")

        if updated_fields:
            sale.save(update_fields=[*updated_fields, "updated_at"])

        recalculate_sale(sale)

        if request.headers.get("HX-Request"):
            response = HttpResponse(status=204)
            response["HX-Redirect"] = reverse("sales:sale-detail", kwargs={"pk": sale.pk})
            return response

        if _wants_json_response(request):
            return _json_sale_response(sale, request.user, message="Vente mise a jour.")

        messages.success(request, "Vente mise a jour.")
        return redirect("sales:sale-detail", pk=sale.pk)

    def get(self, request, pk):
        return redirect("sales:sale-detail", pk=pk)


# ---------------------------------------------------------------------------
# SaleSubmitView (POST only)
# ---------------------------------------------------------------------------

class SaleSubmitView(LoginRequiredMixin, View):
    """Submit a sale to the cashier (POST).  Changes status to PENDING_PAYMENT."""

    def post(self, request, pk):
        sale = get_object_or_404(
            Sale,
            pk=pk,
            store=request.current_store,
        )
        is_owner = sale.seller == request.user
        is_manager = _has_role(request.user, MANAGER_ROLES)
        if not (is_owner or is_manager):
            if _wants_json_response(request):
                return JsonResponse({"error": "Acces refuse."}, status=403)
            return HttpResponseForbidden("Acces refuse.")

        form = SaleSubmitForm(request.POST)
        if not form.is_valid():
            if _wants_json_response(request):
                return JsonResponse(
                    {"error": "Veuillez confirmer la soumission."},
                    status=400,
                )
            messages.error(request, "Veuillez confirmer la soumission.")
            return redirect("sales:sale-detail", pk=sale.pk)

        if not sale.can_submit():
            if sale.customer_id is None:
                if _wants_json_response(request):
                    return JsonResponse(
                        {"error": "Veuillez selectionner un client avant de soumettre a la caisse."},
                        status=400,
                    )
                messages.error(
                    request,
                    "Veuillez selectionner un client avant de soumettre a la caisse.",
                )
                return redirect("sales:sale-detail", pk=sale.pk)
            if _wants_json_response(request):
                return JsonResponse(
                    {
                        "error": (
                            "Cette vente ne peut pas etre soumise. "
                            "Verifiez qu'elle contient un client, des articles et qu'elle est en brouillon."
                        )
                    },
                    status=400,
                )
            messages.error(
                request,
                "Cette vente ne peut pas etre soumise.  "
                "Verifiez qu'elle contient un client, des articles et qu'elle est en brouillon.",
            )
            return redirect("sales:sale-detail", pk=sale.pk)

        try:
            submit_sale_to_cashier(sale, actor=request.user)
            success_message = f"Vente {sale.invoice_number} soumise au caissier."
            messages.success(
                request,
                success_message,
            )
        except Exception as exc:
            logger.exception("Error submitting sale %s", sale.pk)
            if _wants_json_response(request):
                return JsonResponse({"error": f"Erreur: {exc}"}, status=400)
            messages.error(request, f"Erreur: {exc}")
            return redirect("sales:sale-detail", pk=sale.pk)

        print_document = _parse_print_document(request.POST.get("print_document"))
        if _wants_json_response(request):
            print_url = _build_print_document_url(sale.pk, print_document or "")
            return _json_sale_response(
                sale,
                request.user,
                message=success_message,
                redirect_url=reverse("cashier:pending-sales"),
                print_document_url=print_url,
            )

        if print_document:
            detail_url = reverse("sales:sale-detail", kwargs={"pk": sale.pk})
            return redirect(f"{detail_url}?print_document={print_document}")

        return redirect("sales:sale-detail", pk=sale.pk)


def _can_view_sale_document(user, sale) -> bool:
    """Check if the user can print documents for a sale."""
    if not _has_role(user, SALES_ROLES | {"CASHIER"}):
        return False
    is_owner = sale.seller_id == user.pk
    is_cashier = _has_role(user, {"CASHIER"})
    is_manager = _has_role(user, MANAGER_ROLES)
    return is_owner or is_cashier or is_manager


class SaleReceiptView(LoginRequiredMixin, View):
    """Render the sale receipt as PDF."""

    def get(self, request, pk):
        sale = get_object_or_404(
            Sale.objects.select_related("store", "seller", "customer"),
            pk=pk,
            store=request.current_store,
        )

        if not _can_view_sale_document(request.user, sale):
            return HttpResponseForbidden("Acces refuse.")

        try:
            return generate_receipt_pdf(
                sale=sale,
                store=request.current_store,
                payments=sale.payments.all().order_by("created_at"),
                cashier_name=request.user.get_full_name(),
            )
        except Exception:
            logger.exception("Error generating ticket for sale %s", sale.pk)
            messages.error(request, "Impossible de generer le recu pour cette vente.")
            return redirect("sales:sale-detail", pk=sale.pk)


class SaleInvoiceView(LoginRequiredMixin, View):
    """Render the sale invoice as PDF."""

    def get(self, request, pk):
        sale = get_object_or_404(
            Sale.objects.select_related("store", "seller", "customer"),
            pk=pk,
            store=request.current_store,
        )

        if not _can_view_sale_document(request.user, sale):
            return HttpResponseForbidden("Acces refuse.")

        try:
            return generate_invoice_pdf(
                sale=sale,
                store=request.current_store,
                document_kind=request.GET.get("kind", "invoice"),
            )
        except Exception:
            logger.exception("Error generating invoice for sale %s", sale.pk)
            messages.error(request, "Impossible de generer la facture pour cette vente.")
            return redirect("sales:sale-detail", pk=sale.pk)


# ---------------------------------------------------------------------------
# SaleCancelView
# ---------------------------------------------------------------------------

class SaleCancelView(LoginRequiredMixin, View):
    """Cancel a sale.  Requires manager role and a cancellation reason."""

    def dispatch(self, request, *args, **kwargs):
        if not _has_role(request.user, MANAGER_ROLES):
            return HttpResponseForbidden("Acces refuse.")
        return super().dispatch(request, *args, **kwargs)

    def get(self, request, pk):
        sale = get_object_or_404(
            Sale,
            pk=pk,
            store=request.current_store,
        )
        return render(request, "sales/sale_cancel.html", {"sale": sale})

    def post(self, request, pk):
        sale = get_object_or_404(
            Sale,
            pk=pk,
            store=request.current_store,
        )
        reason = request.POST.get("reason", "").strip()
        if not reason:
            messages.error(request, "Veuillez fournir une raison d'annulation.")
            return render(request, "sales/sale_cancel.html", {"sale": sale})

        if not sale.can_cancel():
            messages.error(request, "Cette vente ne peut pas etre annulee.")
            return redirect("sales:sale-detail", pk=sale.pk)

        try:
            cancel_sale(sale, reason=reason, actor=request.user)
            messages.success(request, "Vente annulee.")
        except Exception as exc:
            logger.exception("Error cancelling sale %s", sale.pk)
            messages.error(request, f"Erreur: {exc}")

        return redirect("sales:sale-detail", pk=sale.pk)


# ---------------------------------------------------------------------------
# HTMX: AddItemView
# ---------------------------------------------------------------------------

class AddItemView(LoginRequiredMixin, View):
    """HTMX view: add a product to a DRAFT sale and return updated cart HTML."""

    def post(self, request, pk):
        sale = get_object_or_404(
            Sale,
            pk=pk,
            store=request.current_store,
        )
        if not _can_edit_draft_sale(request.user, sale):
            if _wants_json_response(request):
                return JsonResponse({"error": "Acces refuse."}, status=403)
            return HttpResponseForbidden("Acces refuse.")
        payload = request.POST.copy()
        if "product" not in payload and payload.get("product_id"):
            payload["product"] = payload.get("product_id")
        if "quantity" not in payload and payload.get("qty"):
            payload["quantity"] = payload.get("qty")
        if "discount_amount" not in payload:
            payload["discount_amount"] = "0"
        form = SaleItemForm(payload)
        if form.is_valid():
            product = form.cleaned_data["product"]
            quantity = form.cleaned_data.get("quantity", 1)
            discount = form.cleaned_data.get("discount_amount", 0)
            try:
                add_item_to_sale(
                    sale,
                    product=product,
                    qty=quantity,
                    discount=discount,
                    actor=request.user,
                )
            except ValueError as exc:
                if _wants_json_response(request):
                    return JsonResponse({"error": str(exc)}, status=400)
                if request.headers.get("HX-Request"):
                    return HttpResponseBadRequest(str(exc))
                messages.error(request, str(exc))
                return redirect("sales:sale-detail", pk=sale.pk)
        else:
            if _wants_json_response(request):
                return JsonResponse({"error": "Formulaire invalide."}, status=400)
            if request.headers.get("HX-Request"):
                return HttpResponseBadRequest("Formulaire invalide.")
            messages.error(request, "Formulaire invalide.")
            return redirect("sales:sale-detail", pk=sale.pk)

        if _wants_json_response(request):
            return _json_sale_response(sale, request.user, message="Article ajoute.")

        # Return updated cart partial for HTMX
        if request.headers.get("HX-Request"):
            response = HttpResponse(status=204)
            response["HX-Redirect"] = reverse("sales:sale-detail", kwargs={"pk": sale.pk})
            return response

        messages.success(request, "Article ajoute.")
        return redirect("sales:sale-detail", pk=sale.pk)


# ---------------------------------------------------------------------------
# HTMX: RemoveItemView
# ---------------------------------------------------------------------------

class RemoveItemView(LoginRequiredMixin, View):
    """HTMX view: remove an item from a DRAFT sale."""

    def _remove(self, request, pk, item_pk):
        sale = get_object_or_404(
            Sale,
            pk=pk,
            store=request.current_store,
        )
        if not _can_edit_draft_sale(request.user, sale):
            if _wants_json_response(request):
                return JsonResponse({"error": "Acces refuse."}, status=403)
            return HttpResponseForbidden("Acces refuse.")
        removed_item = sale.items.filter(pk=item_pk).values(
            "product_id", "quantity", "product_name"
        ).first()
        try:
            remove_item_from_sale(sale, item_id=item_pk, actor=request.user)
        except ValueError as exc:
            if _wants_json_response(request):
                return JsonResponse({"error": str(exc)}, status=400)
            if request.headers.get("HX-Request"):
                return HttpResponseBadRequest(str(exc))
            messages.error(request, str(exc))
            return redirect("sales:sale-detail", pk=sale.pk)

        if _wants_json_response(request):
            undo_payload = None
            if removed_item:
                undo_payload = {
                    "product_id": str(removed_item["product_id"]),
                    "quantity": int(removed_item["quantity"]),
                    "product_name": removed_item["product_name"],
                }
            return _json_sale_response(
                sale,
                request.user,
                message="Article supprime.",
                undo=undo_payload,
            )

        if request.headers.get("HX-Request"):
            response = HttpResponse(status=204)
            response["HX-Redirect"] = reverse("sales:sale-detail", kwargs={"pk": sale.pk})
            return response

        messages.success(request, "Article supprime.")
        return redirect("sales:sale-detail", pk=sale.pk)

    def post(self, request, pk, item_pk):
        return self._remove(request, pk, item_pk)

    def delete(self, request, pk, item_pk):
        return self._remove(request, pk, item_pk)


# ---------------------------------------------------------------------------
# HTMX: UpdateItemQtyView
# ---------------------------------------------------------------------------

class UpdateItemQtyView(LoginRequiredMixin, View):
    """HTMX view: update the quantity of an item on a DRAFT sale."""

    def post(self, request, pk, item_pk):
        sale = get_object_or_404(
            Sale,
            pk=pk,
            store=request.current_store,
        )
        if not _can_edit_draft_sale(request.user, sale):
            if _wants_json_response(request):
                return JsonResponse({"error": "Acces refuse."}, status=403)
            return HttpResponseForbidden("Acces refuse.")
        try:
            new_qty = int(request.POST.get("quantity") or request.POST.get("qty") or 1)
        except (TypeError, ValueError):
            new_qty = 1

        if new_qty < 1:
            if _wants_json_response(request):
                return JsonResponse({"error": "La quantite doit etre >= 1."}, status=400)
            if request.headers.get("HX-Request"):
                return HttpResponseBadRequest("La quantite doit etre >= 1.")
            messages.error(request, "La quantite doit etre >= 1.")
            return redirect("sales:sale-detail", pk=sale.pk)

        try:
            update_item_quantity(
                sale,
                item_id=item_pk,
                new_qty=new_qty,
                actor=request.user,
            )
        except ValueError as exc:
            if _wants_json_response(request):
                return JsonResponse({"error": str(exc)}, status=400)
            if request.headers.get("HX-Request"):
                return HttpResponseBadRequest(str(exc))
            messages.error(request, str(exc))
            return redirect("sales:sale-detail", pk=sale.pk)

        if _wants_json_response(request):
            return _json_sale_response(sale, request.user, message="Quantite mise a jour.")

        if request.headers.get("HX-Request"):
            response = HttpResponse(status=204)
            response["HX-Redirect"] = reverse("sales:sale-detail", kwargs={"pk": sale.pk})
            return response

        messages.success(request, "Quantite mise a jour.")
        return redirect("sales:sale-detail", pk=sale.pk)


# ---------------------------------------------------------------------------
# RefundCreateView
# ---------------------------------------------------------------------------

class RefundCreateView(LoginRequiredMixin, View):
    """Create a refund against a sale.  Requires manager role."""

    def dispatch(self, request, *args, **kwargs):
        if not _has_role(request.user, MANAGER_ROLES):
            return HttpResponseForbidden("Acces refuse.")
        return super().dispatch(request, *args, **kwargs)

    def get(self, request, pk):
        sale = get_object_or_404(
            Sale,
            pk=pk,
            store=request.current_store,
        )
        form = RefundForm(sale=sale)
        return render(
            request,
            "sales/refund_create.html",
            {"sale": sale, "form": form},
        )

    def post(self, request, pk):
        sale = get_object_or_404(
            Sale,
            pk=pk,
            store=request.current_store,
        )
        form = RefundForm(request.POST, sale=sale)
        if form.is_valid():
            try:
                refund = create_refund(
                    sale=sale,
                    amount=form.cleaned_data["amount"],
                    reason=form.cleaned_data["reason"],
                    refund_method=form.cleaned_data["refund_method"],
                    approved_by=request.user,
                    processed_by=request.user,
                )
                messages.success(
                    request,
                    f"Remboursement de {refund.amount} enregistre.",
                )
                return redirect("sales:sale-detail", pk=sale.pk)
            except ValueError as exc:
                form.add_error(None, str(exc))

        return render(
            request,
            "sales/refund_create.html",
            {"sale": sale, "form": form},
        )
