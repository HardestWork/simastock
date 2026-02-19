"""Forms for the sales app."""
from django import forms
from django.conf import settings
from django.contrib.auth import get_user_model
from django.forms import inlineformset_factory

from catalog.models import Product
from sales.models import Refund, Sale, SaleItem

User = get_user_model()


# ---------------------------------------------------------------------------
# Sale form (create / edit)
# ---------------------------------------------------------------------------

class SaleForm(forms.ModelForm):
    """Form for creating or editing a sale (customer selection, notes)."""

    class Meta:
        model = Sale
        fields = [
            "customer",
            "notes",
            "discount_percent",
            "is_credit_sale",
        ]
        widgets = {
            "customer": forms.Select(
                attrs={
                    "class": "form-select",
                    "data-placeholder": "Selectionnez un client (optionnel)",
                },
            ),
            "notes": forms.Textarea(
                attrs={
                    "class": "form-control",
                    "rows": 3,
                    "placeholder": "Notes supplementaires...",
                },
            ),
            "discount_percent": forms.NumberInput(
                attrs={
                    "class": "form-control",
                    "min": "0",
                    "max": "100",
                    "step": "0.01",
                },
            ),
            "is_credit_sale": forms.CheckboxInput(
                attrs={"class": "form-check-input"},
            ),
        }


# ---------------------------------------------------------------------------
# SaleItem form
# ---------------------------------------------------------------------------

class SaleItemForm(forms.ModelForm):
    """Form for a single sale item (product, quantity, discount)."""

    product = forms.ModelChoiceField(
        queryset=Product.objects.none(),
        label="Produit",
        widget=forms.Select(attrs={"class": "form-select"}),
    )

    def __init__(self, *args, enterprise=None, **kwargs):
        super().__init__(*args, **kwargs)
        if enterprise:
            self.fields["product"].queryset = Product.objects.filter(
                is_active=True, enterprise=enterprise,
            )
        else:
            self.fields["product"].queryset = Product.objects.filter(is_active=True)

    class Meta:
        model = SaleItem
        fields = [
            "product",
            "quantity",
            "discount_amount",
        ]
        widgets = {
            "quantity": forms.NumberInput(
                attrs={
                    "class": "form-control",
                    "min": "1",
                    "value": "1",
                },
            ),
            "discount_amount": forms.NumberInput(
                attrs={
                    "class": "form-control",
                    "min": "0",
                    "step": "0.01",
                    "value": "0",
                },
            ),
        }


# ---------------------------------------------------------------------------
# SaleItem formset
# ---------------------------------------------------------------------------

SaleItemFormSet = inlineformset_factory(
    Sale,
    SaleItem,
    form=SaleItemForm,
    extra=1,
    can_delete=True,
    fields=["product", "quantity", "discount_amount"],
)


# ---------------------------------------------------------------------------
# Sale submit confirmation form
# ---------------------------------------------------------------------------

class SaleSubmitForm(forms.Form):
    """Confirmation form for submitting a sale to the cashier."""

    confirm = forms.BooleanField(
        required=True,
        label="Je confirme la soumission de cette vente au caissier.",
        widget=forms.CheckboxInput(attrs={"class": "form-check-input"}),
    )


# ---------------------------------------------------------------------------
# Refund form
# ---------------------------------------------------------------------------

class RefundForm(forms.ModelForm):
    """Form for creating a refund against a sale."""

    class Meta:
        model = Refund
        fields = [
            "amount",
            "reason",
            "refund_method",
        ]
        widgets = {
            "amount": forms.NumberInput(
                attrs={
                    "class": "form-control",
                    "min": "0.01",
                    "step": "0.01",
                },
            ),
            "reason": forms.Textarea(
                attrs={
                    "class": "form-control",
                    "rows": 3,
                    "placeholder": "Raison du remboursement...",
                },
            ),
            "refund_method": forms.Select(
                attrs={"class": "form-select"},
            ),
        }

    def __init__(self, *args, sale=None, **kwargs):
        super().__init__(*args, **kwargs)
        self._sale = sale

    def clean_amount(self):
        amount = self.cleaned_data["amount"]
        if self._sale and amount > self._sale.amount_paid:
            raise forms.ValidationError(
                "Le montant du remboursement ne peut pas depasser "
                "le montant deja paye."
            )
        return amount


# ---------------------------------------------------------------------------
# Sale filter form (for list views)
# ---------------------------------------------------------------------------

class SaleFilterForm(forms.Form):
    """Filter form for the sales list view."""

    date_from = forms.DateField(
        required=False,
        label="Date debut",
        widget=forms.DateInput(
            attrs={
                "class": "form-control",
                "type": "date",
            },
        ),
    )
    date_to = forms.DateField(
        required=False,
        label="Date fin",
        widget=forms.DateInput(
            attrs={
                "class": "form-control",
                "type": "date",
            },
        ),
    )
    status = forms.ChoiceField(
        required=False,
        label="Statut",
        choices=[("", "Tous les statuts")] + list(Sale.Status.choices),
        widget=forms.Select(attrs={"class": "form-select"}),
    )
    seller = forms.ModelChoiceField(
        required=False,
        label="Vendeur",
        queryset=User.objects.none(),
        empty_label="Tous les vendeurs",
        widget=forms.Select(attrs={"class": "form-select"}),
    )

    def __init__(self, *args, store=None, **kwargs):
        super().__init__(*args, **kwargs)
        if store:
            from stores.models import StoreUser
            user_ids = StoreUser.objects.filter(store=store).values_list("user_id", flat=True)
            self.fields["seller"].queryset = User.objects.filter(
                pk__in=user_ids, is_active=True,
            )
        else:
            self.fields["seller"].queryset = User.objects.filter(is_active=True)
    customer_search = forms.CharField(
        required=False,
        label="Client",
        widget=forms.TextInput(
            attrs={
                "class": "form-control",
                "placeholder": "Nom ou telephone du client...",
            },
        ),
    )
