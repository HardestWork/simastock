from django.shortcuts import render
from django.contrib.admin.views.decorators import staff_member_required
from django.http import Http404

from accounting.models import FiscalYear
from accounting.reports import generate_general_balance
from stores.models import StoreUser

@staff_member_required
def general_balance_report(request):
    """
    Display the general balance report for the active fiscal year of the user's
    default enterprise.
    """
    try:
        # Find the user's default store association
        store_user = StoreUser.objects.select_related('store__enterprise').get(
            user=request.user,
            is_default=True
        )
        enterprise = store_user.store.enterprise
    except StoreUser.DoesNotExist:
        # Fallback: try to get any store if no default is set
        store_user = StoreUser.objects.select_related('store__enterprise').filter(
            user=request.user
        ).first()
        if not store_user:
            raise Http404("Aucune boutique n'est associée à cet utilisateur.")
        enterprise = store_user.store.enterprise

    # Find the latest open fiscal year for the enterprise
    fiscal_year = FiscalYear.objects.filter(
        enterprise=enterprise,
        status=FiscalYear.Status.OPEN
    ).order_by('-end_date').first()

    balance_data = []
    totals = {}
    if fiscal_year:
        balance_data, totals = generate_general_balance(enterprise, fiscal_year)

    context = {
        "fiscal_year": fiscal_year,
        "balance_data": balance_data,
        "totals": totals,
        "page_title": f"Balance Générale — {fiscal_year.name if fiscal_year else 'Aucun exercice ouvert'}",
        "enterprise": enterprise,
    }
    return render(request, "accounting/balance.html", context)
