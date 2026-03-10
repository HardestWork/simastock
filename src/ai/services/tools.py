"""Tool definitions for Claude tool_use — each tool maps to an ORM query.

All tools are store-scoped for multi-tenancy safety.
"""
import logging
from datetime import timedelta
from decimal import Decimal

from django.db.models import Sum, Count, Avg, F, Q
from django.utils import timezone

logger = logging.getLogger("boutique")


# ---------------------------------------------------------------------------
# Tool definitions (sent to Claude API)
# ---------------------------------------------------------------------------

TOOL_DEFINITIONS = [
    {
        "name": "get_product_stock",
        "description": "Rechercher un produit et son stock dans la boutique. Retourne le nom, SKU, prix, quantite en stock.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Nom du produit ou SKU a rechercher",
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "get_customer_credit",
        "description": "Obtenir les informations de credit d'un client: solde, limite, disponible.",
        "input_schema": {
            "type": "object",
            "properties": {
                "customer_name": {
                    "type": "string",
                    "description": "Nom du client a rechercher",
                },
            },
            "required": ["customer_name"],
        },
    },
    {
        "name": "get_sales_summary",
        "description": "Obtenir un resume des ventes pour une periode donnee: total, nombre, panier moyen, top produits.",
        "input_schema": {
            "type": "object",
            "properties": {
                "period": {
                    "type": "string",
                    "enum": ["today", "yesterday", "week", "month", "year"],
                    "description": "Periode d'analyse",
                },
            },
            "required": ["period"],
        },
    },
    {
        "name": "get_low_stock_products",
        "description": "Lister les produits en rupture ou dont le stock est faible (sous le seuil minimum).",
        "input_schema": {
            "type": "object",
            "properties": {
                "limit": {
                    "type": "integer",
                    "description": "Nombre max de produits a retourner (defaut: 20)",
                },
            },
        },
    },
    {
        "name": "get_top_products",
        "description": "Obtenir les produits les plus vendus sur une periode donnee.",
        "input_schema": {
            "type": "object",
            "properties": {
                "period": {
                    "type": "string",
                    "enum": ["week", "month", "year"],
                    "description": "Periode d'analyse",
                },
                "limit": {
                    "type": "integer",
                    "description": "Nombre de produits (defaut: 10)",
                },
            },
            "required": ["period"],
        },
    },
    {
        "name": "get_overdue_credits",
        "description": "Lister les clients avec des credits en retard de paiement.",
        "input_schema": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "get_cash_shift_summary",
        "description": "Resume de la session de caisse en cours ou de la derniere session fermee.",
        "input_schema": {
            "type": "object",
            "properties": {
                "current": {
                    "type": "boolean",
                    "description": "True pour la session en cours, False pour la derniere fermee",
                },
            },
        },
    },
    {
        "name": "search_customers",
        "description": "Rechercher un client par nom ou telephone.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Nom ou telephone du client",
                },
            },
            "required": ["query"],
        },
    },
]


# ---------------------------------------------------------------------------
# Tool implementations
# ---------------------------------------------------------------------------

def _get_period_range(period: str):
    """Return (start_date, end_date) for a period string."""
    now = timezone.now()
    if period == "today":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "yesterday":
        start = (now - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        now = start + timedelta(days=1)
    elif period == "week":
        start = now - timedelta(days=7)
    elif period == "month":
        start = now - timedelta(days=30)
    elif period == "year":
        start = now - timedelta(days=365)
    else:
        start = now - timedelta(days=30)
    return start, now


def execute_tool(tool_name: str, tool_input: dict, store) -> dict:
    """Execute a tool by name with given input, scoped to store."""
    handler = TOOL_HANDLERS.get(tool_name)
    if not handler:
        return {"error": f"Outil inconnu: {tool_name}"}
    try:
        return handler(tool_input, store)
    except Exception as e:
        logger.exception("Tool %s failed: %s", tool_name, e)
        return {"error": f"Erreur: {str(e)}"}


def _get_product_stock(params: dict, store) -> dict:
    from catalog.models import Product
    from stock.models import ProductStock

    query = params.get("query", "")
    products = Product.objects.filter(
        Q(name__icontains=query) | Q(sku__icontains=query),
        enterprise=store.enterprise,
        is_active=True,
    )[:10]

    results = []
    for p in products:
        stock = ProductStock.objects.filter(store=store, product=p).first()
        results.append({
            "nom": p.name,
            "sku": p.sku or "",
            "prix_vente": str(p.selling_price or 0),
            "prix_achat": str(p.cost_price or 0),
            "stock": stock.quantity if stock else 0,
            "stock_min": stock.min_quantity if stock else 0,
            "categorie": p.category.name if p.category else "",
        })

    if not results:
        return {"message": f"Aucun produit trouve pour '{query}'."}
    return {"produits": results}


def _get_customer_credit(params: dict, store) -> dict:
    from customers.models import Customer
    from credits.models import CustomerAccount

    name = params.get("customer_name", "")
    customers = Customer.objects.filter(
        Q(first_name__icontains=name) | Q(last_name__icontains=name) | Q(phone__icontains=name),
        enterprise=store.enterprise,
    )[:5]

    results = []
    for c in customers:
        account = CustomerAccount.objects.filter(store=store, customer=c, is_active=True).first()
        results.append({
            "nom": c.full_name,
            "telephone": c.phone or "",
            "solde_credit": str(account.balance) if account else "0",
            "limite_credit": str(account.credit_limit) if account else "0",
            "disponible": str(account.available_credit) if account else "0",
            "a_un_compte": account is not None,
        })

    if not results:
        return {"message": f"Aucun client trouve pour '{name}'."}
    return {"clients": results}


def _get_sales_summary(params: dict, store) -> dict:
    from sales.models import Sale

    period = params.get("period", "today")
    start, end = _get_period_range(period)

    sales = Sale.objects.filter(
        store=store,
        created_at__gte=start,
        created_at__lt=end,
        status__in=["PAID", "PARTIALLY_PAID"],
    )

    agg = sales.aggregate(
        total=Sum("total"),
        count=Count("id"),
        avg_basket=Avg("total"),
    )

    # Top 5 products
    from sales.models import SaleItem
    top = (
        SaleItem.objects.filter(sale__in=sales)
        .values("product__name")
        .annotate(qty=Sum("quantity"), revenue=Sum(F("quantity") * F("unit_price")))
        .order_by("-revenue")[:5]
    )

    return {
        "periode": period,
        "total_ventes": str(agg["total"] or 0),
        "nombre_ventes": agg["count"] or 0,
        "panier_moyen": str(round(agg["avg_basket"] or 0, 0)),
        "top_produits": [
            {"nom": t["product__name"], "quantite": t["qty"], "chiffre_affaires": str(t["revenue"])}
            for t in top
        ],
    }


def _get_low_stock_products(params: dict, store) -> dict:
    from stock.models import ProductStock

    limit = params.get("limit", 20)
    low = (
        ProductStock.objects.filter(
            store=store,
            product__is_active=True,
            quantity__lte=F("min_quantity"),
        )
        .select_related("product")
        .order_by("quantity")[:limit]
    )

    return {
        "produits_stock_faible": [
            {
                "nom": ps.product.name,
                "stock": ps.quantity,
                "seuil_min": ps.min_quantity,
                "ecart": ps.quantity - ps.min_quantity,
            }
            for ps in low
        ],
        "total": low.count(),
    }


def _get_top_products(params: dict, store) -> dict:
    from sales.models import Sale, SaleItem

    period = params.get("period", "month")
    limit = params.get("limit", 10)
    start, end = _get_period_range(period)

    top = (
        SaleItem.objects.filter(
            sale__store=store,
            sale__created_at__gte=start,
            sale__created_at__lt=end,
            sale__status__in=["PAID", "PARTIALLY_PAID"],
        )
        .values("product__name")
        .annotate(
            qty=Sum("quantity"),
            revenue=Sum(F("quantity") * F("unit_price")),
        )
        .order_by("-revenue")[:limit]
    )

    return {
        "periode": period,
        "top_produits": [
            {"nom": t["product__name"], "quantite": t["qty"], "chiffre_affaires": str(t["revenue"])}
            for t in top
        ],
    }


def _get_overdue_credits(params: dict, store) -> dict:
    from credits.models import PaymentSchedule

    today = timezone.now().date()
    overdue = (
        PaymentSchedule.objects.filter(
            account__store=store,
            due_date__lt=today,
            status__in=["PENDING", "PARTIAL", "OVERDUE"],
        )
        .select_related("account__customer")
        .order_by("due_date")[:20]
    )

    return {
        "credits_en_retard": [
            {
                "client": s.account.customer.full_name if s.account.customer else "Inconnu",
                "montant_du": str(s.amount_due),
                "montant_paye": str(s.amount_paid),
                "reste": str(s.remaining),
                "echeance": s.due_date.isoformat(),
                "jours_retard": (today - s.due_date).days,
            }
            for s in overdue
        ],
        "total": overdue.count(),
    }


def _get_cash_shift_summary(params: dict, store) -> dict:
    from cashier.models import CashShift

    current = params.get("current", True)
    if current:
        shift = CashShift.objects.filter(store=store, status="OPEN").order_by("-opened_at").first()
    else:
        shift = CashShift.objects.filter(store=store, status="CLOSED").order_by("-closed_at").first()

    if not shift:
        return {"message": "Aucune session de caisse trouvee."}

    from cashier.services import calculate_shift_totals
    totals = calculate_shift_totals(shift)

    return {
        "statut": shift.status,
        "caissier": str(shift.cashier),
        "ouverture": shift.opened_at.isoformat(),
        "fermeture": shift.closed_at.isoformat() if shift.closed_at else None,
        "fond_caisse": str(shift.opening_float),
        "total_ventes": str(totals["total_sales"]),
        "total_especes": str(totals["total_cash"]),
        "total_mobile": str(totals["total_mobile"]),
        "total_credit": str(totals["total_credit"]),
        "total_remboursements": str(totals.get("total_refunds", 0)),
        "ventes_nettes": str(totals.get("net_sales", totals["total_sales"])),
        "nombre_paiements": totals["payment_count"],
    }


def _search_customers(params: dict, store) -> dict:
    from customers.models import Customer

    query = params.get("query", "")
    customers = Customer.objects.filter(
        Q(first_name__icontains=query) | Q(last_name__icontains=query) | Q(phone__icontains=query),
        enterprise=store.enterprise,
    )[:10]

    return {
        "clients": [
            {
                "nom": c.full_name,
                "telephone": c.phone or "",
                "email": c.email or "",
                "total_achats": str(
                    c.sales.filter(store=store, status__in=["PAID", "PARTIALLY_PAID"])
                    .aggregate(total=Sum("total"))["total"] or 0
                ),
            }
            for c in customers
        ],
    }


# ---------------------------------------------------------------------------
# Handler registry
# ---------------------------------------------------------------------------

TOOL_HANDLERS = {
    "get_product_stock": _get_product_stock,
    "get_customer_credit": _get_customer_credit,
    "get_sales_summary": _get_sales_summary,
    "get_low_stock_products": _get_low_stock_products,
    "get_top_products": _get_top_products,
    "get_overdue_credits": _get_overdue_credits,
    "get_cash_shift_summary": _get_cash_shift_summary,
    "search_customers": _search_customers,
}
