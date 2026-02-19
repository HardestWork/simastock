"""Forms for the stock app."""
from django import forms
from django.forms import inlineformset_factory

from catalog.models import Product

from .models import (
    StockCount,
    StockCountLine,
    StockTransfer,
    StockTransferLine,
)


class StockAdjustForm(forms.Form):
    """Form for creating a manual stock adjustment."""

    product = forms.ModelChoiceField(
        queryset=Product.objects.none(),
        label="Produit",
        widget=forms.Select(attrs={"class": "form-select"}),
    )
    quantity = forms.IntegerField(
        label="Quantite d'ajustement",
        help_text="Positif pour ajouter, negatif pour retirer.",
        widget=forms.NumberInput(attrs={
            "class": "form-control",
            "placeholder": "Ex: +10 ou -5",
        }),
    )
    reason = forms.CharField(
        label="Motif",
        widget=forms.Textarea(attrs={
            "class": "form-control",
            "rows": 3,
                "placeholder": "Raison de l'ajustement...",
        }),
    )

    def __init__(self, *args, current_store=None, **kwargs):
        super().__init__(*args, **kwargs)
        if current_store is not None:
            self.fields["product"].queryset = (
                Product.objects
                .filter(stock_records__store=current_store, is_active=True)
                .distinct()
                .order_by("name")
            )


class StockEntryForm(forms.Form):
    """Form for recording stock incoming entries."""

    product = forms.ModelChoiceField(
        queryset=Product.objects.none(),
        label="Produit",
        widget=forms.Select(attrs={"class": "form-select"}),
    )
    quantity = forms.IntegerField(
        label="Quantite entree",
        min_value=1,
        widget=forms.NumberInput(
            attrs={
                "class": "form-control",
                "placeholder": "Ex: 25",
                "min": "1",
            }
        ),
    )
    reference = forms.CharField(
        label="Reference",
        required=False,
        max_length=255,
        widget=forms.TextInput(
            attrs={
                "class": "form-control",
                "placeholder": "BON-ENTREE-001, Facture fournisseur, etc.",
            }
        ),
    )
    reason = forms.CharField(
        label="Motif",
        required=False,
        widget=forms.Textarea(
            attrs={
                "class": "form-control",
                "rows": 3,
                "placeholder": "Motif de l'entree de stock...",
            }
        ),
    )

    def __init__(self, *args, current_store=None, **kwargs):
        super().__init__(*args, **kwargs)
        if current_store is not None:
            self.fields["product"].queryset = (
                Product.objects
                .filter(enterprise=current_store.enterprise, is_active=True)
                .order_by("name")
            )


class StockTransferForm(forms.ModelForm):
    """Form for creating a stock transfer."""

    class Meta:
        model = StockTransfer
        fields = ["to_store", "notes"]
        widgets = {
            "to_store": forms.Select(attrs={"class": "form-select"}),
            "notes": forms.Textarea(attrs={
                "class": "form-control",
                "rows": 3,
                "placeholder": "Notes optionnelles...",
            }),
        }
        labels = {
            "to_store": "Boutique destination",
            "notes": "Notes",
        }

    def __init__(self, *args, current_store=None, **kwargs):
        super().__init__(*args, **kwargs)
        if current_store:
            # Exclude the current store from the destination choices
            self.fields["to_store"].queryset = (
                self.fields["to_store"].queryset.exclude(pk=current_store.pk)
            )


StockTransferLineFormSet = inlineformset_factory(
    StockTransfer,
    StockTransferLine,
    fields=["product", "quantity"],
    extra=1,
    can_delete=True,
    widgets={
        "product": forms.Select(attrs={"class": "form-select"}),
        "quantity": forms.NumberInput(attrs={
            "class": "form-control",
            "min": "1",
            "placeholder": "Quantite",
        }),
    },
    labels={
        "product": "Produit",
        "quantity": "Quantite",
    },
)


class StockCountForm(forms.ModelForm):
    """Form for creating an inventory count session."""

    class Meta:
        model = StockCount
        fields = ["notes"]
        widgets = {
            "notes": forms.Textarea(attrs={
                "class": "form-control",
                "rows": 3,
                "placeholder": "Notes optionnelles...",
            }),
        }
        labels = {
            "notes": "Notes",
        }
