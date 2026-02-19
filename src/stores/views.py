"""Views for store management."""
import logging
import re
from decimal import Decimal, InvalidOperation

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.contrib.admin.views.decorators import staff_member_required
from django.db.models import Q
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.utils.http import url_has_allowed_host_and_scheme

from stores.models import (
    FEATURE_FLAG_DEFAULTS,
    FEATURE_FLAG_LABELS,
    Enterprise,
    Store,
    StoreUser,
)
from stores.services import get_user_enterprise, get_user_stores, switch_store

logger = logging.getLogger("boutique")
HEX_COLOR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")


def _normalize_hex_color(value: str, fallback: str) -> str:
    candidate = (value or "").strip()
    if not candidate.startswith("#"):
        candidate = f"#{candidate}"
    if HEX_COLOR_RE.match(candidate):
        return candidate.upper()
    return fallback


def _build_invoice_preview_context(store):
    """Build fake invoice data used in the store detail preview screen."""
    items = [
        {
            "name": "Produit Exemple A",
            "quantity": 2,
            "unit_price": Decimal("7500.00"),
            "discount": Decimal("0.00"),
            "line_total": Decimal("15000.00"),
        },
        {
            "name": "Produit Exemple B",
            "quantity": 1,
            "unit_price": Decimal("12000.00"),
            "discount": Decimal("2000.00"),
            "line_total": Decimal("10000.00"),
        },
    ]

    subtotal = sum((item["unit_price"] * item["quantity"] for item in items), Decimal("0.00"))
    discount_total = sum((item["discount"] for item in items), Decimal("0.00"))
    taxable_base = subtotal - discount_total
    if taxable_base < Decimal("0.00"):
        taxable_base = Decimal("0.00")

    vat_enabled = bool(getattr(store, "vat_enabled", False))
    vat_rate = getattr(store, "vat_rate", Decimal("18.00")) or Decimal("0.00")
    vat_rate = Decimal(str(vat_rate))
    vat_amount = Decimal("0.00")
    if vat_enabled and vat_rate > Decimal("0.00"):
        vat_amount = (taxable_base * vat_rate / Decimal("100")).quantize(Decimal("0.01"))

    total = taxable_base + vat_amount

    return {
        "document_title": store.invoice_header or "FACTURE",
        "business_name": store.legal_name or store.name,
        "invoice_template": store.invoice_template or Store.InvoiceTemplate.CLASSIC,
        "primary_color": store.invoice_primary_color or "#0F4C9A",
        "secondary_color": store.invoice_secondary_color or "#21A8F6",
        "offer_validity_days": store.offer_validity_days or 15,
        "vat_enabled": vat_enabled,
        "vat_rate": vat_rate,
        "vat_amount": vat_amount,
        "invoice_number": "FAC-PREVIEW-0001",
        "date": timezone.now(),
        "customer_name": "Client Exemple",
        "customer_phone": "+237600000000",
        "items": items,
        "subtotal": subtotal,
        "discount_total": discount_total,
        "total": total,
        "currency": store.currency or "FCFA",
    }


def _enterprise_flags_from_request(request, current_flags=None):
    flags = dict(FEATURE_FLAG_DEFAULTS)
    if isinstance(current_flags, dict):
        for key in FEATURE_FLAG_DEFAULTS:
            if key in current_flags:
                flags[key] = bool(current_flags[key])
    for key in FEATURE_FLAG_DEFAULTS:
        checkbox_new = request.POST.get(f"feature_flag_{key}")
        checkbox_old = request.POST.get(f"analytics_flag_{key}")
        flags[key] = (checkbox_new == "on") or (checkbox_old == "on")
    return flags


def _store_overrides_from_request(request):
    overrides = {}
    for key in FEATURE_FLAG_DEFAULTS:
        mode = (
            request.POST.get(f"feature_mode_{key}")
            or request.POST.get(f"analytics_mode_{key}")
            or "inherit"
        ).strip().lower()
        if mode == "enabled":
            overrides[key] = True
        elif mode == "disabled":
            overrides[key] = False
    return overrides


def _enterprise_feature_rows(enterprise):
    flags = enterprise.effective_feature_flags
    return [
        {
            "key": key,
            "label": label,
            "enabled": bool(flags.get(key, True)),
        }
        for key, label in FEATURE_FLAG_LABELS.items()
    ]


def _store_feature_rows(store):
    enterprise_flags = (
        store.enterprise.effective_feature_flags
        if store.enterprise_id else dict(FEATURE_FLAG_DEFAULTS)
    )
    effective_flags = store.effective_feature_flags
    rows = []
    for key, label in FEATURE_FLAG_LABELS.items():
        rows.append(
            {
                "key": key,
                "label": label,
                "mode": store.feature_mode(key),
                "enterprise_enabled": bool(enterprise_flags.get(key, True)),
                "effective_enabled": bool(effective_flags.get(key, True)),
            }
        )
    return rows


def _store_feature_rows_for_create(post_data=None, enterprise=None):
    enterprise_flags = (
        enterprise.effective_feature_flags
        if enterprise is not None else dict(FEATURE_FLAG_DEFAULTS)
    )
    rows = []
    for key, label in FEATURE_FLAG_LABELS.items():
        mode = "inherit"
        if post_data is not None:
            mode = (
                post_data.get(f"feature_mode_{key}")
                or post_data.get(f"analytics_mode_{key}")
                or "inherit"
            ).strip().lower()
            if mode not in ("inherit", "enabled", "disabled"):
                mode = "inherit"
        if mode == "enabled":
            effective_enabled = True
        elif mode == "disabled":
            effective_enabled = False
        else:
            effective_enabled = bool(enterprise_flags.get(key, True))
        rows.append(
            {
                "key": key,
                "label": label,
                "mode": mode,
                "enterprise_enabled": bool(enterprise_flags.get(key, True)),
                "effective_enabled": effective_enabled,
            }
        )
    return rows


# ---------------------------------------------------------------------------
# Store list (all authenticated users can see their stores)
# ---------------------------------------------------------------------------
@login_required
def store_list(request):
    """Display the list of stores the current user belongs to."""
    stores = get_user_stores(request.user)
    search = (request.GET.get("q") or "").strip()
    if search:
        stores = stores.filter(
            Q(name__icontains=search)
            | Q(code__icontains=search)
            | Q(address__icontains=search)
            | Q(phone__icontains=search)
            | Q(email__icontains=search)
        )

    memberships = (
        StoreUser.objects
        .filter(user=request.user, store__in=stores)
        .values_list("store_id", "is_default")
    )
    default_store_ids = {store_id for store_id, is_default in memberships if is_default}

    context = {
        "stores": stores,
        "search_query": search,
        "default_store_ids": default_store_ids,
    }
    return render(request, "stores/store_list.html", context)


# ---------------------------------------------------------------------------
# Switch active store (POST only)
# ---------------------------------------------------------------------------
@login_required
def store_switch(request):
    """Switch the active store for the current session.

    Expects a POST with ``store_id`` in the body.
    """
    if request.method != "POST":
        return redirect("stores:store-list")

    store_id = request.POST.get("store_id")
    if not store_id:
        messages.error(request, "Aucune boutique specifiee.")
        return redirect("stores:store-list")

    try:
        store = switch_store(request, store_id)
        messages.success(request, f"Boutique active : {store.name}")
    except Store.DoesNotExist:
        messages.error(request, "Boutique introuvable ou acces refuse.")

    next_url = request.POST.get("next", request.META.get("HTTP_REFERER", "/"))
    if not url_has_allowed_host_and_scheme(
        next_url,
        allowed_hosts={request.get_host()},
        require_https=request.is_secure(),
    ):
        next_url = "/"
    return redirect(next_url)


# ---------------------------------------------------------------------------
# Store create / edit (admin / staff only)
# ---------------------------------------------------------------------------
@staff_member_required
def store_create(request):
    """Create a new store."""
    current_enterprise = getattr(request, "current_enterprise", None) or get_user_enterprise(request.user)

    if request.method == "POST":
        name = request.POST.get("name", "").strip()
        code = request.POST.get("code", "").strip()
        address = request.POST.get("address", "").strip()
        phone = request.POST.get("phone", "").strip()
        email = request.POST.get("email", "").strip()
        website = request.POST.get("website", "").strip()
        currency = request.POST.get("currency", "FCFA").strip()
        legal_name = request.POST.get("legal_name", "").strip()
        registration_number = request.POST.get("registration_number", "").strip()
        tax_id = request.POST.get("tax_id", "").strip()
        vat_enabled = request.POST.get("vat_enabled") == "on"
        try:
            vat_rate = Decimal((request.POST.get("vat_rate") or "18").strip())
        except (InvalidOperation, ValueError, TypeError):
            vat_rate = Decimal("18.00")
        if vat_rate < Decimal("0.00"):
            vat_rate = Decimal("0.00")
        if vat_rate > Decimal("100.00"):
            vat_rate = Decimal("100.00")
        vat_rate = vat_rate.quantize(Decimal("0.01"))
        bank_details = request.POST.get("bank_details", "").strip()
        invoice_header = request.POST.get("invoice_header", "FACTURE").strip() or "FACTURE"
        invoice_template = request.POST.get(
            "invoice_template",
            Store.InvoiceTemplate.CLASSIC,
        ).strip() or Store.InvoiceTemplate.CLASSIC
        invoice_primary_color = _normalize_hex_color(
            request.POST.get("invoice_primary_color", "#0F4C9A"),
            "#0F4C9A",
        )
        invoice_secondary_color = _normalize_hex_color(
            request.POST.get("invoice_secondary_color", "#21A8F6"),
            "#21A8F6",
        )
        try:
            offer_validity_days = int(request.POST.get("offer_validity_days", "15"))
        except (TypeError, ValueError):
            offer_validity_days = 15
        if offer_validity_days < 1:
            offer_validity_days = 15
        invoice_terms = request.POST.get("invoice_terms", "").strip()
        invoice_footer = request.POST.get("invoice_footer", "").strip()
        logo = request.FILES.get("logo")

        allowed_templates = {choice[0] for choice in Store.InvoiceTemplate.choices}
        if invoice_template not in allowed_templates:
            invoice_template = Store.InvoiceTemplate.CLASSIC

        if not name or not code:
            messages.error(request, "Le nom et le code sont obligatoires.")
            return render(
                request,
                "stores/store_form.html",
                {
                    "form_data": request.POST,
                    "store": None,
                    "store_feature_rows": _store_feature_rows_for_create(request.POST, enterprise=current_enterprise),
                },
            )

        if Store.objects.filter(code=code).exists():
            messages.error(request, f"Le code '{code}' est deja utilise.")
            return render(
                request,
                "stores/store_form.html",
                {
                    "form_data": request.POST,
                    "store": None,
                    "store_feature_rows": _store_feature_rows_for_create(request.POST, enterprise=current_enterprise),
                },
            )

        enterprise = current_enterprise
        if enterprise is None:
            enterprise = Enterprise.objects.filter(is_active=True).order_by("created_at").first()
        if enterprise is None:
            base_code = f"ENT-{code or 'DEFAULT'}".upper()[:50]
            unique_code = base_code
            suffix = 1
            while Enterprise.objects.filter(code=unique_code).exists():
                suffix_token = f"-{suffix}"
                unique_code = f"{base_code[:50-len(suffix_token)]}{suffix_token}"
                suffix += 1

            enterprise = Enterprise.objects.create(
                name=legal_name or name,
                code=unique_code,
                legal_name=legal_name,
                currency=currency or "FCFA",
            )
            messages.info(
                request,
                "Aucune entreprise n'etait configuree. Une entreprise par defaut a ete creee.",
            )

        store = Store.objects.create(
            enterprise=enterprise,
            name=name,
            code=code,
            address=address,
            phone=phone,
            email=email,
            website=website,
            currency=currency,
            legal_name=legal_name,
            registration_number=registration_number,
            tax_id=tax_id,
            vat_enabled=vat_enabled,
            vat_rate=vat_rate,
            bank_details=bank_details,
            invoice_header=invoice_header,
            invoice_template=invoice_template,
            invoice_primary_color=invoice_primary_color,
            invoice_secondary_color=invoice_secondary_color,
            offer_validity_days=offer_validity_days,
            invoice_terms=invoice_terms,
            invoice_footer=invoice_footer,
            analytics_feature_overrides=_store_overrides_from_request(request),
            logo=logo,
        )
        # Automatically link the creator to the new store
        StoreUser.objects.create(store=store, user=request.user, is_default=False)
        messages.success(request, f"Boutique '{store.name}' creee avec succes.")
        logger.info("Store created: %s by user %s", store.code, request.user)
        return redirect("stores:store-list")

    return render(
        request,
        "stores/store_form.html",
        {
            "form_data": {},
            "store": None,
            "store_feature_rows": _store_feature_rows_for_create(enterprise=current_enterprise),
        },
    )


@staff_member_required
def store_edit(request, store_id):
    """Edit an existing store."""
    store = get_object_or_404(Store, pk=store_id)

    if request.method == "POST":
        store.name = request.POST.get("name", store.name).strip()
        store.address = request.POST.get("address", "").strip()
        store.phone = request.POST.get("phone", "").strip()
        store.email = request.POST.get("email", "").strip()
        store.website = request.POST.get("website", "").strip()
        store.currency = request.POST.get("currency", store.currency).strip()
        store.legal_name = request.POST.get("legal_name", "").strip()
        store.registration_number = request.POST.get("registration_number", "").strip()
        store.tax_id = request.POST.get("tax_id", "").strip()
        store.vat_enabled = request.POST.get("vat_enabled") == "on"
        try:
            store.vat_rate = Decimal((request.POST.get("vat_rate") or "18").strip())
        except (InvalidOperation, ValueError, TypeError):
            store.vat_rate = Decimal("18.00")
        if store.vat_rate < Decimal("0.00"):
            store.vat_rate = Decimal("0.00")
        if store.vat_rate > Decimal("100.00"):
            store.vat_rate = Decimal("100.00")
        store.vat_rate = store.vat_rate.quantize(Decimal("0.01"))
        store.bank_details = request.POST.get("bank_details", "").strip()
        store.invoice_header = request.POST.get("invoice_header", "FACTURE").strip() or "FACTURE"
        invoice_template = request.POST.get(
            "invoice_template",
            Store.InvoiceTemplate.CLASSIC,
        ).strip() or Store.InvoiceTemplate.CLASSIC
        allowed_templates = {choice[0] for choice in Store.InvoiceTemplate.choices}
        if invoice_template not in allowed_templates:
            invoice_template = Store.InvoiceTemplate.CLASSIC
        store.invoice_template = invoice_template
        store.invoice_primary_color = _normalize_hex_color(
            request.POST.get("invoice_primary_color", "#0F4C9A"),
            "#0F4C9A",
        )
        store.invoice_secondary_color = _normalize_hex_color(
            request.POST.get("invoice_secondary_color", "#21A8F6"),
            "#21A8F6",
        )
        try:
            store.offer_validity_days = int(request.POST.get("offer_validity_days", "15"))
        except (TypeError, ValueError):
            store.offer_validity_days = 15
        if store.offer_validity_days < 1:
            store.offer_validity_days = 15
        store.invoice_terms = request.POST.get("invoice_terms", "").strip()
        store.invoice_footer = request.POST.get("invoice_footer", "").strip()
        store.analytics_feature_overrides = _store_overrides_from_request(request)
        if request.POST.get("remove_logo") == "on":
            if store.logo:
                store.logo.delete(save=False)
            store.logo = None
        elif request.FILES.get("logo"):
            store.logo = request.FILES["logo"]
        store.is_active = request.POST.get("is_active") == "on"
        store.save()
        messages.success(request, f"Boutique '{store.name}' mise a jour.")
        logger.info("Store updated: %s by user %s", store.code, request.user)
        return redirect("stores:store-detail", store_id=store.pk)

    return render(
        request,
        "stores/store_form.html",
        {"store": store, "form_data": None, "store_feature_rows": _store_feature_rows(store)},
    )


@staff_member_required
def store_detail(request, store_id):
    """View store details (admin only)."""
    store = get_object_or_404(Store, pk=store_id)
    store_users = StoreUser.objects.filter(store=store).select_related("user")
    preview = _build_invoice_preview_context(store)
    return render(
        request,
        "stores/store_detail.html",
        {
            "store": store,
            "store_users": store_users,
            "preview": preview,
            "store_feature_rows": _store_feature_rows(store),
        },
    )


# ---------------------------------------------------------------------------
# Enterprise views (admin only)
# ---------------------------------------------------------------------------
@staff_member_required
def enterprise_detail(request):
    """Show the current enterprise details."""
    enterprise = getattr(request, "current_enterprise", None)
    if not enterprise:
        messages.warning(request, "Aucune entreprise configuree.")
        return redirect("stores:store-list")
    stores = Store.objects.filter(enterprise=enterprise, is_active=True)
    return render(
        request,
        "stores/enterprise_detail.html",
        {"enterprise": enterprise, "stores": stores, "enterprise_feature_rows": _enterprise_feature_rows(enterprise)},
    )


@staff_member_required
def enterprise_edit(request):
    """Edit the current enterprise."""
    enterprise = getattr(request, "current_enterprise", None)
    if not enterprise:
        messages.warning(request, "Aucune entreprise configuree.")
        return redirect("stores:store-list")

    if request.method == "POST":
        enterprise.name = request.POST.get("name", enterprise.name).strip()
        enterprise.legal_name = request.POST.get("legal_name", "").strip()
        enterprise.registration_number = request.POST.get("registration_number", "").strip()
        enterprise.tax_id = request.POST.get("tax_id", "").strip()
        enterprise.currency = request.POST.get("currency", enterprise.currency).strip()
        enterprise.vat_enabled = request.POST.get("vat_enabled") == "on"
        try:
            enterprise.vat_rate = Decimal((request.POST.get("vat_rate") or "19.25").strip())
        except (InvalidOperation, ValueError, TypeError):
            enterprise.vat_rate = Decimal("19.25")
        enterprise.email = request.POST.get("email", "").strip()
        enterprise.phone = request.POST.get("phone", "").strip()
        enterprise.website = request.POST.get("website", "").strip()
        enterprise.analytics_feature_flags = _enterprise_flags_from_request(
            request,
            current_flags=enterprise.analytics_feature_flags,
        )
        if request.FILES.get("logo"):
            enterprise.logo = request.FILES["logo"]
        elif request.POST.get("remove_logo") == "on" and enterprise.logo:
            enterprise.logo.delete(save=False)
            enterprise.logo = None
        enterprise.save()
        messages.success(request, f"Entreprise '{enterprise.name}' mise a jour.")
        return redirect("stores:enterprise-detail")

    return render(
        request,
        "stores/enterprise_form.html",
        {"enterprise": enterprise, "enterprise_feature_rows": _enterprise_feature_rows(enterprise)},
    )


# ---------------------------------------------------------------------------
# System settings stub (admin only)
# ---------------------------------------------------------------------------
@staff_member_required
def system_settings(request):
    """System-wide settings page (stub).

    This view will eventually allow admins to configure global
    parameters such as currency, thresholds, etc.
    """
    if request.method == "POST":
        messages.success(request, "Parametres enregistres.")
        return redirect("stores:system_settings")

    return render(request, "stores/system_settings.html")
