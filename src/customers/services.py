"""Domain services for customers."""

from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from customers.models import Customer, LoyaltyAccount, LoyaltyTransaction


@transaction.atomic
def get_or_create_default_customer(*, enterprise) -> Customer:
    """Return the default 'walk-in' customer for an enterprise.

    This customer is used when a sale is created without explicitly selecting
    a customer in the SPA.
    """
    existing = (
        Customer.objects
        .select_for_update()
        .filter(enterprise=enterprise, is_default=True)
        .first()
    )
    if existing:
        if not existing.is_active:
            existing.is_active = True
            existing.save(update_fields=["is_active", "updated_at"])
        return existing

    # Keep it recognizable and searchable.
    return Customer.objects.create(
        enterprise=enterprise,
        first_name="Client",
        last_name="Comptant",
        phone="0000000000",
        email="",
        address="",
        company="",
        tax_id="",
        is_default=True,
        is_active=True,
        notes="Client par defaut (walk-in).",
    )


# ---------------------------------------------------------------------------
# Loyalty services
# ---------------------------------------------------------------------------

LOYALTY_TIER_THRESHOLDS = [
    ("PLATINUM", 401),
    ("GOLD", 151),
    ("SILVER", 51),
    ("BRONZE", 0),
]


def compute_customer_score(customer: Customer) -> Decimal:
    """Compute loyalty score using purchase history + recency bonus."""
    score = Decimal(customer.purchase_count * 20)
    score += customer.total_purchase_amount / Decimal("10000")
    if customer.last_purchase_at:
        now = timezone.now()
        days = (now - customer.last_purchase_at).days
        if days < 30:
            score += 30
        elif days < 60:
            score += 15
    return score


def _tier_for_score(score: Decimal) -> str:
    for tier, threshold in LOYALTY_TIER_THRESHOLDS:
        if score >= threshold:
            return tier
    return "BRONZE"


@transaction.atomic
def award_points(*, account: LoyaltyAccount, points: Decimal, sale=None, reference: str = "") -> LoyaltyAccount:
    """Award earned points to a loyalty account."""
    account = LoyaltyAccount.objects.select_for_update().get(pk=account.pk)
    account.points_balance += points
    account.points_earned += points
    balance_after = account.points_balance
    account.save(update_fields=["points_balance", "points_earned", "updated_at"])
    LoyaltyTransaction.objects.create(
        account=account,
        transaction_type=LoyaltyTransaction.TransactionType.EARN,
        points=points,
        balance_after=balance_after,
        sale=sale,
        reference=reference,
    )
    return account


@transaction.atomic
def redeem_points(*, account: LoyaltyAccount, points: float, sale_id=None, actor=None) -> LoyaltyAccount:
    """Redeem loyalty points from an account."""
    pts = Decimal(str(points))
    account = LoyaltyAccount.objects.select_for_update().get(pk=account.pk)
    if pts <= 0:
        raise ValueError("Le nombre de points doit etre positif.")
    if account.points_balance < pts:
        raise ValueError(f"Solde insuffisant ({account.points_balance} pts disponibles).")
    account.points_balance -= pts
    account.points_redeemed += pts
    balance_after = account.points_balance
    account.save(update_fields=["points_balance", "points_redeemed", "updated_at"])
    sale = None
    if sale_id:
        from sales.models import Sale
        sale = Sale.objects.filter(pk=sale_id).first()
    LoyaltyTransaction.objects.create(
        account=account,
        transaction_type=LoyaltyTransaction.TransactionType.REDEEM,
        points=-pts,
        balance_after=balance_after,
        sale=sale,
    )
    return account


@transaction.atomic
def update_customer_loyalty_after_sale(sale) -> None:
    """Update customer stats + award points after a sale is fully paid."""
    customer = sale.customer
    if not customer or customer.is_default:
        return
    customer = Customer.objects.select_for_update().get(pk=customer.pk)
    customer.purchase_count += 1
    customer.total_purchase_amount += sale.total_amount
    customer.last_purchase_at = timezone.now()
    score = compute_customer_score(customer)
    customer.loyalty_score = score
    customer.loyalty_tier = _tier_for_score(score)
    customer.save(update_fields=[
        "purchase_count", "total_purchase_amount", "last_purchase_at",
        "loyalty_score", "loyalty_tier", "updated_at",
    ])
    # Compute points to award (1 pt per 1000 FCFA by default)
    rate = Decimal("1") / Decimal("1000")
    try:
        enterprise_rate = sale.store.enterprise.analytics_feature_flags.get("loyalty_points_rate")
        if enterprise_rate:
            rate = Decimal(str(enterprise_rate)) / Decimal("1000")
    except Exception:
        pass
    pts = (sale.total_amount * rate).quantize(Decimal("0.01"))
    if pts > 0:
        account, _ = LoyaltyAccount.objects.get_or_create(store=sale.store, customer=customer)
        award_points(account=account, points=pts, sale=sale, reference=str(sale.id))

