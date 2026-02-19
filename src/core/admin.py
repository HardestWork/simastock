"""Global Django admin customizations."""
from __future__ import annotations

from datetime import timedelta

from django.contrib import admin
from django.core.exceptions import PermissionDenied
from django.db.models import Count, F, Sum
from django.template.response import TemplateResponse
from django.urls import path, reverse
from django.utils import timezone


def _money(value):
    return value or 0


def admin_system_overview(request):
    """Global admin dashboard for super-admin operations."""
    if not request.user.is_superuser:
        raise PermissionDenied("Superuser access required.")

    from accounts.models import User
    from alerts.models import Alert
    from analytics.models import FraudEvent
    from catalog.models import Product
    from credits.models import CustomerAccount
    from customers.models import Customer
    from sales.models import Sale, SaleItem
    from stock.models import ProductStock
    from stores.models import AuditLog, Enterprise, Store

    today = timezone.localdate()
    start_30d = today - timedelta(days=29)

    sales_30d = Sale.objects.filter(
        status=Sale.Status.PAID,
        paid_at__date__gte=start_30d,
        paid_at__date__lte=today,
    )
    sales_today = Sale.objects.filter(
        status=Sale.Status.PAID,
        paid_at__date=today,
    )

    low_stock_count = (
        ProductStock.objects
        .annotate(available_qty=F("quantity") - F("reserved_qty"))
        .filter(available_qty__lte=F("min_qty"))
        .count()
    )

    top_stores = list(
        sales_30d.values("store__code", "store__name")
        .annotate(
            orders=Count("id"),
            revenue=Sum("total"),
        )
        .order_by("-revenue")[:8]
    )
    top_products = list(
        SaleItem.objects.filter(
            sale__status=Sale.Status.PAID,
            sale__paid_at__date__gte=start_30d,
            sale__paid_at__date__lte=today,
        )
        .values("product__sku", "product_name")
        .annotate(
            quantity=Sum("quantity"),
            revenue=Sum("line_total"),
        )
        .order_by("-revenue")[:10]
    )

    recent_audit_logs = (
        AuditLog.objects
        .select_related("actor", "store")
        .order_by("-created_at")[:20]
    )

    summary = {
        "enterprises": Enterprise.objects.count(),
        "stores": Store.objects.count(),
        "users_total": User.objects.count(),
        "users_active": User.objects.filter(is_active=True).count(),
        "products": Product.objects.count(),
        "customers": Customer.objects.count(),
        "sales_open": Sale.objects.filter(
            status__in=[
                Sale.Status.DRAFT,
                Sale.Status.PENDING_PAYMENT,
                Sale.Status.PARTIALLY_PAID,
            ]
        ).count(),
        "revenue_today": _money(sales_today.aggregate(total=Sum("total"))["total"]),
        "revenue_30d": _money(sales_30d.aggregate(total=Sum("total"))["total"]),
        "orders_30d": sales_30d.count(),
        "amount_due": _money(
            Sale.objects.filter(status=Sale.Status.PARTIALLY_PAID).aggregate(total=Sum("amount_due"))["total"]
        ),
        "credit_outstanding": _money(CustomerAccount.objects.aggregate(total=Sum("balance"))["total"]),
        "low_stock": low_stock_count,
        "alerts_unread": Alert.objects.filter(is_read=False).count(),
        "fraud_open": FraudEvent.objects.filter(is_resolved=False).count(),
    }

    quick_links = [
        {"label": "Utilisateurs", "url": reverse("admin:accounts_user_changelist")},
        {"label": "Entreprises", "url": reverse("admin:stores_enterprise_changelist")},
        {"label": "Boutiques", "url": reverse("admin:stores_store_changelist")},
        {"label": "Ventes", "url": reverse("admin:sales_sale_changelist")},
        {"label": "Paiements", "url": reverse("admin:cashier_payment_changelist")},
        {"label": "Stocks", "url": reverse("admin:stock_productstock_changelist")},
        {"label": "Credits", "url": reverse("admin:credits_customeraccount_changelist")},
        {"label": "Alertes", "url": reverse("admin:alerts_alert_changelist")},
        {"label": "Fraude", "url": reverse("admin:analytics_fraudevent_changelist")},
        {"label": "Audit Log", "url": reverse("admin:stores_auditlog_changelist")},
    ]

    context = {
        **admin.site.each_context(request),
        "title": "Vue globale administrateur",
        "summary": summary,
        "quick_links": quick_links,
        "top_stores": top_stores,
        "top_products": top_products,
        "recent_audit_logs": recent_audit_logs,
        "period_start": start_30d,
        "period_end": today,
    }
    return TemplateResponse(request, "admin/system_overview.html", context)


def _patch_admin_urls():
    base_get_urls = admin.site.get_urls

    def get_urls():
        urls = base_get_urls()
        custom_urls = [
            path(
                "system-overview/",
                admin.site.admin_view(admin_system_overview),
                name="system-overview",
            ),
        ]
        return custom_urls + urls

    admin.site.get_urls = get_urls


admin.site.site_header = "Boutique Platform - Administration generale"
admin.site.site_title = "Boutique Admin"
admin.site.index_title = "Controle global"
admin.site.index_template = "admin/custom_index.html"
_patch_admin_urls()
