"""Forms for the cashier app."""
from decimal import Decimal

from django import forms
from django.contrib.auth import get_user_model
from django.forms import formset_factory

from .models import CashShift, Payment

User = get_user_model()


# ---------------------------------------------------------------------------
# OpenShiftForm
# ---------------------------------------------------------------------------

class OpenShiftForm(forms.Form):
    """Form to open a new cash shift with an initial float amount."""

    opening_float = forms.DecimalField(
        label="Fond de caisse initial",
        max_digits=14,
        decimal_places=2,
        min_value=Decimal("0"),
        initial=Decimal("0"),
        widget=forms.NumberInput(
            attrs={
                "class": "form-control",
                "placeholder": "0.00",
                "step": "0.01",
            }
        ),
        help_text="Montant en especes present dans la caisse au debut de la session.",
    )


# ---------------------------------------------------------------------------
# CloseShiftForm
# ---------------------------------------------------------------------------

class CloseShiftForm(forms.Form):
    """Form to close the current cash shift."""

    closing_cash = forms.DecimalField(
        label="Especes comptees en caisse",
        max_digits=14,
        decimal_places=2,
        min_value=Decimal("0"),
        widget=forms.NumberInput(
            attrs={
                "class": "form-control",
                "placeholder": "0.00",
                "step": "0.01",
            }
        ),
        help_text="Montant reel en especes compte dans la caisse.",
    )
    notes = forms.CharField(
        label="Notes",
        required=False,
        widget=forms.Textarea(
            attrs={
                "class": "form-control",
                "rows": 3,
                "placeholder": "Observations ou commentaires sur la session...",
            }
        ),
    )


# ---------------------------------------------------------------------------
# PaymentForm (single payment line)
# ---------------------------------------------------------------------------

class PaymentForm(forms.Form):
    """Form for a single payment line.

    Used within a formset to allow split payments across multiple
    payment methods for a single sale.
    """

    method = forms.ChoiceField(
        label="Methode de paiement",
        choices=Payment.Method.choices,
        widget=forms.Select(
            attrs={"class": "form-select"}
        ),
    )
    amount = forms.DecimalField(
        label="Montant",
        max_digits=14,
        decimal_places=2,
        min_value=Decimal("0.01"),
        widget=forms.NumberInput(
            attrs={
                "class": "form-control",
                "placeholder": "0.00",
                "step": "0.01",
            }
        ),
    )
    reference = forms.CharField(
        label="Reference",
        max_length=100,
        required=False,
        widget=forms.TextInput(
            attrs={
                "class": "form-control",
                "placeholder": "Ref. Mobile Money, virement, etc.",
            }
        ),
    )
    notes = forms.CharField(
        label="Notes",
        required=False,
        widget=forms.TextInput(
            attrs={
                "class": "form-control",
                "placeholder": "Notes optionnelles",
            }
        ),
    )


# ---------------------------------------------------------------------------
# PaymentFormSet
# ---------------------------------------------------------------------------

# A formset that allows entering multiple payment lines for a single sale.
# ``extra=1`` provides one blank form by default; the front-end can add more
# dynamically via JavaScript.
PaymentFormSet = formset_factory(
    PaymentForm,
    extra=1,
    min_num=1,
    validate_min=True,
    max_num=5,
    validate_max=True,
)


# ---------------------------------------------------------------------------
# MultiPaymentForm (alternative to formset for simpler use cases)
# ---------------------------------------------------------------------------

class MultiPaymentForm(forms.Form):
    """All-in-one form that collects the primary payment method and optionally
    a secondary split payment.

    This is a convenience form for cases where a full dynamic formset
    is not needed (e.g., simple two-way split like cash + mobile money).
    """

    primary_method = forms.ChoiceField(
        label="Methode de paiement principale",
        choices=Payment.Method.choices,
        initial=Payment.Method.CASH,
        widget=forms.Select(attrs={"class": "form-select"}),
    )
    primary_amount = forms.DecimalField(
        label="Montant principal",
        max_digits=14,
        decimal_places=2,
        min_value=Decimal("0.01"),
        widget=forms.NumberInput(
            attrs={
                "class": "form-control",
                "placeholder": "0.00",
                "step": "0.01",
            }
        ),
    )
    primary_reference = forms.CharField(
        label="Reference principale",
        max_length=100,
        required=False,
        widget=forms.TextInput(
            attrs={
                "class": "form-control",
                "placeholder": "Reference",
            }
        ),
    )

    # Optional secondary payment (for split payments)
    secondary_method = forms.ChoiceField(
        label="Methode secondaire",
        choices=[("", "--- Pas de paiement secondaire ---")] + list(Payment.Method.choices),
        required=False,
        widget=forms.Select(attrs={"class": "form-select"}),
    )
    secondary_amount = forms.DecimalField(
        label="Montant secondaire",
        max_digits=14,
        decimal_places=2,
        required=False,
        min_value=Decimal("0.01"),
        widget=forms.NumberInput(
            attrs={
                "class": "form-control",
                "placeholder": "0.00",
                "step": "0.01",
            }
        ),
    )
    secondary_reference = forms.CharField(
        label="Reference secondaire",
        max_length=100,
        required=False,
        widget=forms.TextInput(
            attrs={
                "class": "form-control",
                "placeholder": "Reference",
            }
        ),
    )

    notes = forms.CharField(
        label="Notes",
        required=False,
        widget=forms.Textarea(
            attrs={
                "class": "form-control",
                "rows": 2,
                "placeholder": "Notes optionnelles",
            }
        ),
    )

    def clean(self):
        cleaned_data = super().clean()
        secondary_method = cleaned_data.get("secondary_method")
        secondary_amount = cleaned_data.get("secondary_amount")

        if secondary_method and not secondary_amount:
            self.add_error(
                "secondary_amount",
                "Le montant secondaire est requis lorsqu'une methode secondaire est selectionnee.",
            )
        if secondary_amount and not secondary_method:
            self.add_error(
                "secondary_method",
                "Veuillez selectionner une methode de paiement secondaire.",
            )

        return cleaned_data

    def get_payments_data(self):
        """Return a list of payment dicts suitable for ``process_payment()``."""
        data = self.cleaned_data
        payments = [
            {
                "method": data["primary_method"],
                "amount": data["primary_amount"],
                "reference": data.get("primary_reference", ""),
                "notes": data.get("notes", ""),
            }
        ]
        if data.get("secondary_method") and data.get("secondary_amount"):
            payments.append(
                {
                    "method": data["secondary_method"],
                    "amount": data["secondary_amount"],
                    "reference": data.get("secondary_reference", ""),
                    "notes": "",
                }
            )
        return payments


# ---------------------------------------------------------------------------
# PaymentFilterForm (for filtering payment lists)
# ---------------------------------------------------------------------------

class PaymentFilterForm(forms.Form):
    """Form for filtering the payments list."""

    date_from = forms.DateField(
        label="Date debut",
        required=False,
        widget=forms.DateInput(
            attrs={
                "class": "form-control",
                "type": "date",
            }
        ),
    )
    date_to = forms.DateField(
        label="Date fin",
        required=False,
        widget=forms.DateInput(
            attrs={
                "class": "form-control",
                "type": "date",
            }
        ),
    )
    method = forms.ChoiceField(
        label="Methode de paiement",
        required=False,
        choices=[("", "Toutes les methodes")] + list(Payment.Method.choices),
        widget=forms.Select(attrs={"class": "form-select"}),
    )
    q = forms.CharField(
        label="Recherche",
        required=False,
        widget=forms.TextInput(
            attrs={
                "class": "form-control",
                "placeholder": "Facture, reference, client ou caissier...",
            }
        ),
    )
    cashier = forms.UUIDField(
        label="Caissier",
        required=False,
        widget=forms.HiddenInput(),
    )
    cashier_display = forms.CharField(
        label="Caissier",
        required=False,
        widget=forms.Select(attrs={"class": "form-select"}),
    )

    def __init__(self, *args, store=None, **kwargs):
        super().__init__(*args, **kwargs)
        # Populate the cashier dropdown with users who have the CASHIER or
        # MANAGER role and belong to the given store.
        cashier_choices = [("", "Tous les caissiers")]
        if store:
            from stores.models import StoreUser
            store_users = (
                StoreUser.objects
                .filter(store=store, user__role__in=["CASHIER", "MANAGER"])
                .select_related("user")
                .order_by("user__last_name", "user__first_name")
            )
            cashier_choices += [
                (str(su.user.pk), su.user.get_full_name())
                for su in store_users
            ]
        self.fields["cashier_display"] = forms.ChoiceField(
            label="Caissier",
            required=False,
            choices=cashier_choices,
            widget=forms.Select(attrs={"class": "form-select"}),
        )

    def clean(self):
        cleaned_data = super().clean()
        date_from = cleaned_data.get("date_from")
        date_to = cleaned_data.get("date_to")

        if date_from and date_to and date_from > date_to:
            self.add_error(
                "date_to",
                "La date de fin doit etre posterieure a la date de debut.",
            )

        # Map the cashier_display choice back to the cashier UUID field
        cashier_display = cleaned_data.get("cashier_display")
        if cashier_display:
            cleaned_data["cashier"] = cashier_display

        return cleaned_data
