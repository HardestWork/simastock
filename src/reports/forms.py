"""Forms for the reports app."""
from django import forms

from stores.models import Store


class ReportFilterForm(forms.Form):
    """Filter form for report views.

    The ``store`` field is only displayed when the current user is an
    ADMIN or MANAGER (i.e. has access to multiple stores or needs a
    cross-store view).
    """

    REPORT_TYPE_CHOICES = [
        ("sales", "Rapport des ventes"),
        ("stock", "Rapport du stock"),
        ("cashier", "Rapport de caisse"),
        ("credit", "Rapport des credits"),
    ]

    date_from = forms.DateField(
        label="Date de debut",
        widget=forms.DateInput(attrs={
            "type": "date",
            "class": "form-control",
        }),
        required=False,
    )
    date_to = forms.DateField(
        label="Date de fin",
        widget=forms.DateInput(attrs={
            "type": "date",
            "class": "form-control",
        }),
        required=False,
    )
    store = forms.ModelChoiceField(
        label="Boutique",
        queryset=Store.objects.filter(is_active=True),
        required=False,
        empty_label="Toutes les boutiques",
        widget=forms.Select(attrs={"class": "form-select"}),
    )
    report_type = forms.ChoiceField(
        label="Type de rapport",
        choices=REPORT_TYPE_CHOICES,
        required=False,
        widget=forms.Select(attrs={"class": "form-select"}),
    )

    def __init__(self, *args, user=None, **kwargs):
        super().__init__(*args, **kwargs)
        if user:
            if user.is_admin:
                self.fields["store"].queryset = Store.objects.filter(is_active=True)
            else:
                self.fields["store"].queryset = (
                    Store.objects
                    .filter(is_active=True, store_users__user=user)
                    .distinct()
                    .order_by("name")
                )
        # Only show the store selector for ADMIN / MANAGER users.
        if user and not (user.is_admin or user.is_manager):
            del self.fields["store"]


class ExportForm(forms.Form):
    """Form to choose the export format for a report."""

    FORMAT_CHOICES = [
        ("csv", "CSV"),
        ("excel", "Excel (.xlsx)"),
        ("pdf", "PDF"),
    ]

    format = forms.ChoiceField(
        label="Format d'export",
        choices=FORMAT_CHOICES,
        widget=forms.Select(attrs={"class": "form-select"}),
    )
