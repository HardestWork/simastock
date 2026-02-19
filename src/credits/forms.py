"""Forms for the credits app."""
from django import forms

from .models import CustomerAccount, PaymentSchedule


# ---------------------------------------------------------------------------
# CustomerAccountForm
# ---------------------------------------------------------------------------

class CustomerAccountForm(forms.ModelForm):
    """Create / update form for a CustomerAccount (credit limit only)."""

    class Meta:
        model = CustomerAccount
        fields = ["credit_limit"]
        widgets = {
            "credit_limit": forms.NumberInput(attrs={
                "class": "form-control",
                "step": "0.01",
                "min": "0",
                "placeholder": "Plafond de credit",
            }),
        }


# ---------------------------------------------------------------------------
# CreditPaymentForm
# ---------------------------------------------------------------------------

class CreditPaymentForm(forms.Form):
    """Form to record a payment against a customer's credit balance."""

    amount = forms.DecimalField(
        label="Montant",
        max_digits=14,
        decimal_places=2,
        min_value=0.01,
        widget=forms.NumberInput(attrs={
            "class": "form-control",
            "step": "0.01",
            "placeholder": "Montant du paiement",
        }),
    )
    reference = forms.CharField(
        label="Reference",
        max_length=200,
        required=False,
        widget=forms.TextInput(attrs={
            "class": "form-control",
            "placeholder": "Reference du paiement (facultatif)",
        }),
    )
    notes = forms.CharField(
        label="Notes",
        required=False,
        widget=forms.Textarea(attrs={
            "class": "form-control",
            "rows": 3,
            "placeholder": "Notes internes...",
        }),
    )


# ---------------------------------------------------------------------------
# PaymentScheduleForm
# ---------------------------------------------------------------------------

class PaymentScheduleForm(forms.ModelForm):
    """Create form for a payment schedule (installment)."""

    class Meta:
        model = PaymentSchedule
        fields = ["due_date", "amount_due"]
        widgets = {
            "due_date": forms.DateInput(attrs={
                "class": "form-control",
                "type": "date",
            }),
            "amount_due": forms.NumberInput(attrs={
                "class": "form-control",
                "step": "0.01",
                "min": "0.01",
                "placeholder": "Montant de l'echeance",
            }),
        }


# ---------------------------------------------------------------------------
# CreditFilterForm
# ---------------------------------------------------------------------------

class CreditFilterForm(forms.Form):
    """Filter form for credit account lists."""

    search = forms.CharField(
        label="Client",
        required=False,
        widget=forms.TextInput(attrs={
            "class": "form-control",
            "placeholder": "Rechercher un client (nom, telephone)...",
        }),
    )
    status = forms.ChoiceField(
        label="Statut du compte",
        required=False,
        choices=[
            ("", "Tous"),
            ("active", "Actif"),
            ("inactive", "Inactif"),
            ("over_limit", "Depassement plafond"),
        ],
        widget=forms.Select(attrs={"class": "form-select"}),
    )
    overdue_only = forms.BooleanField(
        label="Echeances en retard uniquement",
        required=False,
        widget=forms.CheckboxInput(attrs={"class": "form-check-input"}),
    )
