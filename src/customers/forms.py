"""Forms for the customers app."""
from django import forms

from .models import Customer


# ---------------------------------------------------------------------------
# CustomerForm
# ---------------------------------------------------------------------------

class CustomerForm(forms.ModelForm):
    """Create / update form for a Customer."""

    class Meta:
        model = Customer
        fields = [
            "first_name",
            "last_name",
            "phone",
            "email",
            "address",
            "company",
            "tax_id",
            "is_active",
            "notes",
        ]
        widgets = {
            "first_name": forms.TextInput(attrs={
                "class": "form-control",
                "placeholder": "Prenom",
            }),
            "last_name": forms.TextInput(attrs={
                "class": "form-control",
                "placeholder": "Nom",
            }),
            "phone": forms.TextInput(attrs={
                "class": "form-control",
                "placeholder": "+237 6XX XXX XXX",
            }),
            "email": forms.EmailInput(attrs={
                "class": "form-control",
                "placeholder": "email@exemple.com",
            }),
            "address": forms.Textarea(attrs={
                "class": "form-control",
                "rows": 3,
                "placeholder": "Adresse du client",
            }),
            "company": forms.TextInput(attrs={
                "class": "form-control",
                "placeholder": "Nom de l'entreprise",
            }),
            "tax_id": forms.TextInput(attrs={
                "class": "form-control",
                "placeholder": "Numero fiscal / contribuable",
            }),
            "is_active": forms.CheckboxInput(attrs={"class": "form-check-input"}),
            "notes": forms.Textarea(attrs={
                "class": "form-control",
                "rows": 3,
                "placeholder": "Notes internes...",
            }),
        }


# ---------------------------------------------------------------------------
# CustomerFilterForm
# ---------------------------------------------------------------------------

class CustomerFilterForm(forms.Form):
    """Filter / search form for the customer list."""

    search = forms.CharField(
        required=False,
        widget=forms.TextInput(attrs={
            "class": "form-control",
            "placeholder": "Rechercher (nom, telephone, e-mail)...",
        }),
    )
    is_active = forms.NullBooleanField(
        required=False,
        widget=forms.Select(
            attrs={"class": "form-select"},
            choices=[
                ("", "Tous"),
                ("true", "Actif"),
                ("false", "Inactif"),
            ],
        ),
    )
