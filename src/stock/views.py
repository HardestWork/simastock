"""Views for the stock app."""
import json
import uuid

from django.contrib import messages
from django.contrib.auth.mixins import LoginRequiredMixin
from django.db.models import Exists, F, IntegerField, OuterRef, Q, Subquery, Value
from django.db.models.functions import Coalesce
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse_lazy
from django.utils import timezone
from django.views import View
from django.views.generic import CreateView, DetailView, FormView, ListView

from catalog.models import Product

from .forms import (
    StockAdjustForm,
    StockCountForm,
    StockEntryForm,
    StockTransferForm,
    StockTransferLineFormSet,
)
from .models import (
    InventoryMovement,
    ProductStock,
    StockCount,
    StockCountLine,
    StockTransfer,
)
from .services import adjust_stock, complete_stock_count, process_transfer


# ---------------------------------------------------------------------------
# Stock levels
# ---------------------------------------------------------------------------

def _build_stock_product_seed(store):
    """Return product data for local live search in stock screens."""
    if store is None:
        return []

    stock_qty_subquery = (
        ProductStock.objects
        .filter(
            store=store,
            product_id=OuterRef("pk"),
        )
        .annotate(stock_qty=F("quantity") - F("reserved_qty"))
        .values("stock_qty")[:1]
    )

    qs = (
        Product.objects
        .filter(
            enterprise=store.enterprise,
            is_active=True,
            track_stock=True,
        )
        .annotate(
            stock_available=Coalesce(
                Subquery(stock_qty_subquery, output_field=IntegerField()),
                Value(0),
            )
        )
        .order_by("name")
    )
    return [
        {
            "id": str(product.pk),
            "name": product.name,
            "sku": product.sku,
            "barcode": product.barcode,
            "stock": int(product.stock_available or 0),
        }
        for product in qs
    ]


class StockListView(LoginRequiredMixin, ListView):
    """List ProductStock records for the current store with search."""

    model = ProductStock
    template_name = "stock/stock_list.html"
    context_object_name = "stocks"
    paginate_by = 25

    def _sync_missing_stock_rows(self):
        """Ensure each product has a ProductStock row for the current store."""
        store = getattr(self.request, "current_store", None)
        if store is None:
            return

        stock_exists = ProductStock.objects.filter(
            store=store,
            product_id=OuterRef("pk"),
        )
        missing_product_ids = list(
            Product.objects
            .filter(
                enterprise=store.enterprise,
                is_active=True,
                track_stock=True,
            )
            .annotate(has_stock=Exists(stock_exists))
            .filter(has_stock=False)
            .values_list("pk", flat=True)
        )
        if not missing_product_ids:
            return

        ProductStock.objects.bulk_create(
            [
                ProductStock(store=store, product_id=product_id)
                for product_id in missing_product_ids
            ],
            ignore_conflicts=True,
        )

    def get_queryset(self):
        store = getattr(self.request, "current_store", None)
        if store is None:
            return ProductStock.objects.none()

        self._sync_missing_stock_rows()

        qs = (
            ProductStock.objects
            .filter(store=store, product__track_stock=True)
            .select_related("product", "product__category", "store")
        )
        q = self.request.GET.get("q", "").strip()
        if q:
            qs = qs.filter(
                Q(product__name__icontains=q) | Q(product__sku__icontains=q)
            )
        return qs

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["search_query"] = self.request.GET.get("q", "")
        return ctx


class MovementListView(LoginRequiredMixin, ListView):
    """List InventoryMovement records for the current store."""

    model = InventoryMovement
    template_name = "stock/movement_list.html"
    context_object_name = "movements"
    paginate_by = 50

    def get_queryset(self):
        qs = (
            InventoryMovement.objects
            .filter(store=self.request.current_store)
            .select_related("product", "store", "actor")
        )
        q = self.request.GET.get("q", "").strip()
        if q:
            qs = qs.filter(
                Q(product__name__icontains=q)
                | Q(product__sku__icontains=q)
                | Q(reason__icontains=q)
                | Q(reference__icontains=q)
                | Q(actor__first_name__icontains=q)
                | Q(actor__last_name__icontains=q)
            )
        return qs

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["search_query"] = self.request.GET.get("q", "")
        return ctx


class StockAdjustView(LoginRequiredMixin, FormView):
    """Create a manual stock adjustment movement."""

    template_name = "stock/stock_adjust.html"
    form_class = StockAdjustForm
    success_url = reverse_lazy("stock:stock-list")

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs["current_store"] = self.request.current_store
        return kwargs

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["product_seed"] = _build_stock_product_seed(self.request.current_store)
        return context

    @staticmethod
    def _parse_adjust_data_json(request):
        raw = (request.POST.get("adjust_data") or "").strip()
        if not raw:
            return None, None

        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            return None, "Format de donnees d'ajustement invalide."

        if not isinstance(payload, list):
            return None, "Format de donnees d'ajustement invalide."

        lines = []
        for line in payload:
            if not isinstance(line, dict):
                continue

            product_id = str(line.get("product_id") or line.get("id") or "").strip()
            try:
                quantity = int(line.get("quantity", 0))
            except (TypeError, ValueError):
                return None, "Quantite invalide dans les lignes d'ajustement."

            if not product_id:
                continue
            if quantity == 0:
                return None, "Chaque ligne doit avoir une quantite non nulle."

            lines.append(
                {
                    "product_id": product_id,
                    "quantity": quantity,
                }
            )

        if not lines:
            return None, "Aucune ligne d'ajustement valide."
        return lines, None

    def post(self, request, *args, **kwargs):
        lines, parse_error = self._parse_adjust_data_json(request)
        if parse_error:
            messages.error(request, parse_error)
            return self.render_to_response(self.get_context_data(form=self.get_form()))

        # New UI: batch adjustments sent as JSON.
        if lines is not None:
            product_ids = [line["product_id"] for line in lines]
            products = {
                str(product.pk): product
                for product in Product.objects.filter(
                    pk__in=product_ids,
                    enterprise=request.current_store.enterprise,
                    is_active=True,
                    track_stock=True,
                )
            }
            missing_products = [pid for pid in product_ids if pid not in products]
            if missing_products:
                messages.error(
                    request,
                    "Certains produits sont introuvables ou inactifs pour cette boutique.",
                )
                return self.render_to_response(self.get_context_data(form=self.get_form()))

            reference = (request.POST.get("reference") or "").strip()
            reason = (request.POST.get("reason") or "").strip() or "Ajustement de stock manuel."
            batch_id = uuid.uuid4()
            total_lines = 0
            total_qty = 0

            try:
                for line in lines:
                    product = products[line["product_id"]]
                    qty_delta = int(line["quantity"])
                    adjust_stock(
                        store=request.current_store,
                        product=product,
                        qty_delta=qty_delta,
                        movement_type=InventoryMovement.MovementType.ADJUST,
                        reason=reason,
                        actor=request.user,
                        reference=reference,
                        batch_id=batch_id,
                    )
                    total_lines += 1
                    total_qty += qty_delta
            except ValueError as exc:
                messages.error(request, str(exc))
                return self.render_to_response(self.get_context_data(form=self.get_form()))

            messages.success(
                request,
                f"Ajustement groupe enregistre ({total_lines} ligne(s), delta total: {total_qty:+d}).",
            )
            return redirect("stock:movement-document", batch_id=batch_id)

        # Backward compatibility: classic single-line adjust form.
        return super().post(request, *args, **kwargs)

    def form_valid(self, form):
        product = form.cleaned_data["product"]
        qty_delta = form.cleaned_data["quantity"]
        reason = form.cleaned_data["reason"]
        store = self.request.current_store
        batch_id = uuid.uuid4()

        try:
            adjust_stock(
                store=store,
                product=product,
                qty_delta=qty_delta,
                movement_type=InventoryMovement.MovementType.ADJUST,
                reason=reason,
                actor=self.request.user,
                batch_id=batch_id,
            )
            messages.success(self.request, "Ajustement de stock effectue avec succes.")
        except ValueError as exc:
            messages.error(self.request, str(exc))
            return self.form_invalid(form)

        return redirect("stock:movement-document", batch_id=batch_id)


class StockEntryView(LoginRequiredMixin, FormView):
    """Record stock incoming entries and display recent incoming history."""

    template_name = "stock/stock_entry.html"
    form_class = StockEntryForm
    success_url = reverse_lazy("stock:stock-entry")

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs["current_store"] = self.request.current_store
        return kwargs

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["product_seed"] = _build_stock_product_seed(self.request.current_store)
        context["recent_entries"] = (
            InventoryMovement.objects
            .filter(
                store=self.request.current_store,
                movement_type=InventoryMovement.MovementType.IN,
            )
            .select_related("product", "actor")
            .order_by("-created_at")[:30]
        )
        return context

    @staticmethod
    def _parse_entry_data_json(request):
        raw = (request.POST.get("entry_data") or "").strip()
        if not raw:
            return None, None

        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            return None, "Format de donnees d'entree invalide."

        if not isinstance(payload, list):
            return None, "Format de donnees d'entree invalide."

        lines = []
        for line in payload:
            if not isinstance(line, dict):
                continue
            product_id = str(line.get("product_id") or line.get("id") or "").strip()
            quantity_raw = line.get("quantity", 0)
            try:
                quantity = int(quantity_raw)
            except (TypeError, ValueError):
                return None, "Quantite invalide dans les lignes d'entree."

            if not product_id:
                continue
            if quantity <= 0:
                return None, "Chaque ligne d'entree doit avoir une quantite > 0."

            lines.append(
                {
                    "product_id": product_id,
                    "quantity": quantity,
                }
            )

        if not lines:
            return None, "Aucune ligne d'entree valide."

        return lines, None

    def post(self, request, *args, **kwargs):
        lines, parse_error = self._parse_entry_data_json(request)
        if parse_error:
            messages.error(request, parse_error)
            return self.render_to_response(self.get_context_data(form=self.get_form()))

        # New UI: batched stock entries sent as JSON.
        if lines is not None:
            batch_id = uuid.uuid4()
            product_ids = [line["product_id"] for line in lines]
            products = {
                str(product.pk): product
                for product in Product.objects.filter(
                    pk__in=product_ids,
                    enterprise=request.current_store.enterprise,
                    is_active=True,
                    track_stock=True,
                )
            }
            missing_products = [pid for pid in product_ids if pid not in products]
            if missing_products:
                messages.error(
                    request,
                    "Certains produits sont introuvables ou inactifs pour cette boutique.",
                )
                return self.render_to_response(self.get_context_data(form=self.get_form()))

            reference = (request.POST.get("reference") or "").strip()
            reason = (request.POST.get("reason") or "").strip() or "Entree de stock manuelle."
            total_qty = 0
            processed_count = 0

            for line in lines:
                product = products[line["product_id"]]
                qty = int(line["quantity"])
                adjust_stock(
                    store=request.current_store,
                    product=product,
                    qty_delta=qty,
                    movement_type=InventoryMovement.MovementType.IN,
                    reason=reason,
                    actor=request.user,
                    reference=reference,
                    batch_id=batch_id,
                )
                total_qty += qty
                processed_count += 1

            messages.success(
                request,
                f"{processed_count} produit(s) ajoute(s) en stock (+{total_qty} unites).",
            )
            return redirect("stock:movement-document", batch_id=batch_id)

        # Backward compatibility: classic single-line form submit.
        return super().post(request, *args, **kwargs)

    def form_valid(self, form):
        product = form.cleaned_data["product"]
        qty = form.cleaned_data["quantity"]
        reference = (form.cleaned_data.get("reference") or "").strip()
        reason = (form.cleaned_data.get("reason") or "").strip() or "Entree de stock manuelle."
        batch_id = uuid.uuid4()

        try:
            adjust_stock(
                store=self.request.current_store,
                product=product,
                qty_delta=qty,
                movement_type=InventoryMovement.MovementType.IN,
                reason=reason,
                actor=self.request.user,
                reference=reference,
                batch_id=batch_id,
            )
            messages.success(
                self.request,
                f"Entree enregistree: +{qty} pour {product.name}.",
            )
        except ValueError as exc:
            messages.error(self.request, str(exc))
            return self.form_invalid(form)

        return redirect("stock:movement-document", batch_id=batch_id)


class StockEntryProductSearchView(LoginRequiredMixin, View):
    """Return products for stock entry live search with current stock level."""

    def get(self, request):
        current_store = getattr(request, "current_store", None)
        if current_store is None:
            return JsonResponse({"results": []})

        query = (request.GET.get("q") or "").strip()
        try:
            limit = int(request.GET.get("limit", 20))
        except (TypeError, ValueError):
            limit = 20
        limit = max(1, min(limit, 50))

        stock_qty_subquery = (
            ProductStock.objects
            .filter(
                store=current_store,
                product_id=OuterRef("pk"),
            )
            .annotate(stock_qty=F("quantity") - F("reserved_qty"))
            .values("stock_qty")[:1]
        )

        qs = (
            Product.objects
            .filter(
                enterprise=current_store.enterprise,
                is_active=True,
                track_stock=True,
            )
            .annotate(
                stock_available=Coalesce(
                    Subquery(stock_qty_subquery, output_field=IntegerField()),
                    Value(0),
                )
            )
            .order_by("name")
        )
        if query:
            qs = qs.filter(
                Q(name__icontains=query)
                | Q(sku__icontains=query)
                | Q(barcode__icontains=query)
            )

        return JsonResponse(
            {
                "results": [
                    {
                        "id": str(product.pk),
                        "name": product.name,
                        "sku": product.sku,
                        "barcode": product.barcode,
                        "stock": int(product.stock_available or 0),
                    }
                    for product in qs[:limit]
                ]
            }
        )


class StockMovementDocumentView(LoginRequiredMixin, View):
    """Display a printable movement document for a movement batch."""

    template_name = "stock/movement_document.html"

    def get(self, request, batch_id):
        movements = list(
            InventoryMovement.objects
            .filter(store=request.current_store, batch_id=batch_id)
            .select_related("product", "actor")
            .order_by("created_at", "product__name")
        )
        if not movements:
            messages.error(request, "Aucun document trouve pour ce mouvement.")
            return redirect("stock:stock-list")

        total_lines = len(movements)
        total_qty = sum(abs(m.quantity) for m in movements)
        positive = all(m.quantity > 0 for m in movements)
        negative = all(m.quantity < 0 for m in movements)
        if positive:
            document_title = "Bon d'entree de stock"
        elif negative:
            document_title = "Bon de sortie de stock"
        else:
            document_title = "Bon d'ajustement de stock"

        context = {
            "document_title": document_title,
            "batch_id": batch_id,
            "movements": movements,
            "total_lines": total_lines,
            "total_qty": total_qty,
            "issued_at": movements[0].created_at,
            "reference": next((m.reference for m in movements if m.reference), ""),
            "reason": next((m.reason for m in movements if m.reason), ""),
        }
        return render(request, self.template_name, context)


# ---------------------------------------------------------------------------
# Transfers
# ---------------------------------------------------------------------------


class TransferListView(LoginRequiredMixin, ListView):
    """List stock transfers involving the current store."""

    model = StockTransfer
    template_name = "stock/transfer_list.html"
    context_object_name = "transfers"
    paginate_by = 25

    def get_queryset(self):
        store = self.request.current_store
        return (
            StockTransfer.objects
            .filter(Q(from_store=store) | Q(to_store=store))
            .select_related("from_store", "to_store", "created_by", "approved_by")
        )


class TransferCreateView(LoginRequiredMixin, CreateView):
    """Create a new stock transfer from the current store."""

    model = StockTransfer
    form_class = StockTransferForm
    template_name = "stock/transfer_form.html"

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs["current_store"] = self.request.current_store
        return kwargs

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        if self.request.POST:
            ctx["lines_formset"] = StockTransferLineFormSet(
                self.request.POST, instance=self.object
            )
        else:
            ctx["lines_formset"] = StockTransferLineFormSet(instance=self.object)
        return ctx

    def form_valid(self, form):
        form.instance.from_store = self.request.current_store
        form.instance.created_by = self.request.user
        self.object = form.save()

        lines_formset = StockTransferLineFormSet(
            self.request.POST, instance=self.object
        )
        if lines_formset.is_valid():
            lines_formset.save()
            messages.success(self.request, "Transfert cree avec succes.")
            return redirect("stock:transfer-detail", pk=self.object.pk)
        else:
            # If lines are invalid, delete the transfer and re-render
            self.object.delete()
            return self.form_invalid(form)

    def get_success_url(self):
        return reverse_lazy("stock:transfer-detail", kwargs={"pk": self.object.pk})


class TransferDetailView(LoginRequiredMixin, DetailView):
    """View transfer details and its lines."""

    model = StockTransfer
    template_name = "stock/transfer_detail.html"
    context_object_name = "transfer"

    def get_queryset(self):
        store = self.request.current_store
        return (
            StockTransfer.objects
            .filter(Q(from_store=store) | Q(to_store=store))
            .select_related("from_store", "to_store", "created_by", "approved_by")
            .prefetch_related("lines__product")
        )


class TransferApproveView(LoginRequiredMixin, View):
    """Approve a pending transfer and process stock movements."""

    def post(self, request, pk):
        store = request.current_store
        transfer = get_object_or_404(
            StockTransfer.objects.filter(
                Q(from_store=store) | Q(to_store=store)
            ),
            pk=pk,
        )

        if transfer.status != StockTransfer.Status.PENDING:
            messages.error(request, "Ce transfert ne peut pas etre approuve.")
            return redirect("stock:transfer-detail", pk=pk)

        transfer.status = StockTransfer.Status.APPROVED
        transfer.approved_by = request.user
        transfer.save(update_fields=["status", "approved_by", "updated_at"])

        try:
            process_transfer(transfer, actor=request.user)
            messages.success(request, "Transfert approuve et traite avec succes.")
        except ValueError as exc:
            messages.error(request, str(exc))

        return redirect("stock:transfer-detail", pk=pk)


class TransferReceiveView(LoginRequiredMixin, View):
    """Mark a transfer as received."""

    def post(self, request, pk):
        store = request.current_store
        transfer = get_object_or_404(
            StockTransfer.objects.filter(to_store=store),
            pk=pk,
        )

        if transfer.status not in (StockTransfer.Status.APPROVED, StockTransfer.Status.IN_TRANSIT):
            messages.error(request, "Ce transfert ne peut pas etre recu.")
            return redirect("stock:transfer-detail", pk=pk)

        transfer.status = StockTransfer.Status.RECEIVED
        transfer.save(update_fields=["status", "updated_at"])

        # Update received quantities to match requested quantities
        for line in transfer.lines.all():
            line.received_qty = line.quantity
            line.save(update_fields=["received_qty", "updated_at"])

        messages.success(request, "Transfert marque comme recu.")
        return redirect("stock:transfer-detail", pk=pk)


# ---------------------------------------------------------------------------
# Inventory counts
# ---------------------------------------------------------------------------


class StockCountListView(LoginRequiredMixin, ListView):
    """List inventory counts for the current store."""

    model = StockCount
    template_name = "stock/count_list.html"
    context_object_name = "counts"
    paginate_by = 25

    def get_template_names(self):
        if (
            self.request.headers.get("HX-Request")
            and self.request.headers.get("HX-Boosted") != "true"
        ):
            return ["stock/partials/count_table.html"]
        return [self.template_name]

    def get_queryset(self):
        qs = (
            StockCount.objects
            .filter(store=self.request.current_store)
            .select_related("store", "created_by")
        )
        q = self.request.GET.get("q", "").strip()
        if q:
            qs = qs.filter(
                Q(created_by__first_name__icontains=q)
                | Q(created_by__last_name__icontains=q)
                | Q(status__icontains=q)
                | Q(notes__icontains=q)
            )
        return qs

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["search_query"] = self.request.GET.get("q", "")
        query_params = self.request.GET.copy()
        query_params.pop("page", None)
        ctx["query_string"] = query_params.urlencode()
        return ctx


class StockCountCreateView(LoginRequiredMixin, CreateView):
    """Create a new inventory count, pre-populating lines from current stock."""

    model = StockCount
    form_class = StockCountForm
    template_name = "stock/count_form.html"

    def form_valid(self, form):
        store = self.request.current_store
        form.instance.store = store
        form.instance.created_by = self.request.user
        form.instance.status = StockCount.Status.IN_PROGRESS
        self.object = form.save()

        # Create a line for every product in stock at this store
        stock_records = ProductStock.objects.filter(store=store).select_related("product")
        lines = [
            StockCountLine(
                stock_count=self.object,
                product=stock.product,
                system_qty=stock.quantity,
            )
            for stock in stock_records
        ]
        StockCountLine.objects.bulk_create(lines)

        messages.success(
            self.request,
            f"Inventaire cree avec {len(lines)} ligne(s).",
        )
        return redirect("stock:count-detail", pk=self.object.pk)

    def get_success_url(self):
        return reverse_lazy("stock:count-detail", kwargs={"pk": self.object.pk})


class StockCountDetailView(LoginRequiredMixin, DetailView):
    """View an inventory count and its lines."""

    model = StockCount
    template_name = "stock/count_detail.html"
    context_object_name = "stock_count"

    def get_queryset(self):
        return (
            StockCount.objects
            .filter(store=self.request.current_store)
            .select_related("store", "created_by")
            .prefetch_related("lines__product")
        )

    def post(self, request, *args, **kwargs):
        self.object = self.get_object()
        stock_count = self.object

        if stock_count.status != StockCount.Status.IN_PROGRESS:
            messages.error(request, "Cet inventaire ne peut plus etre modifie.")
            return redirect("stock:count-detail", pk=stock_count.pk)

        lines = list(stock_count.lines.all())
        changed = 0

        for line in lines:
            field_name = f"counted_{line.pk}"
            if field_name not in request.POST:
                continue

            raw_value = (request.POST.get(field_name) or "").strip()
            if raw_value == "":
                new_value = None
            else:
                try:
                    new_value = int(raw_value)
                except (TypeError, ValueError):
                    messages.error(
                        request,
                        f"Quantite comptee invalide pour {line.product.name}.",
                    )
                    return redirect("stock:count-detail", pk=stock_count.pk)
                if new_value < 0:
                    messages.error(
                        request,
                        f"La quantite comptee ne peut pas etre negative pour {line.product.name}.",
                    )
                    return redirect("stock:count-detail", pk=stock_count.pk)

            if line.counted_qty != new_value:
                line.counted_qty = new_value
                line.save(update_fields=["counted_qty", "updated_at"])
                changed += 1

        if changed:
            messages.success(request, f"{changed} ligne(s) d'inventaire mise(s) a jour.")
        else:
            messages.info(request, "Aucune modification detectee.")

        return redirect("stock:count-detail", pk=stock_count.pk)

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        lines = self.object.lines.all()
        total_lines = lines.count()
        counted_lines = lines.filter(counted_qty__isnull=False).count()
        ctx["total_lines"] = total_lines
        ctx["counted_lines"] = counted_lines
        ctx["remaining_lines"] = max(total_lines - counted_lines, 0)
        return ctx


class StockCountCompleteView(LoginRequiredMixin, View):
    """Complete an inventory count and create adjustment movements for variances."""

    def post(self, request, pk):
        stock_count = get_object_or_404(
            StockCount.objects.filter(store=request.current_store),
            pk=pk,
        )

        if stock_count.status != StockCount.Status.IN_PROGRESS:
            messages.error(request, "Cet inventaire ne peut pas etre termine.")
            return redirect("stock:count-detail", pk=pk)

        try:
            complete_stock_count(stock_count, actor=request.user)
            messages.success(request, "Inventaire termine. Les ajustements ont ete appliques.")
        except ValueError as exc:
            messages.error(request, str(exc))

        return redirect("stock:count-detail", pk=pk)
