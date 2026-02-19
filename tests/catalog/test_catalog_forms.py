import pytest

from catalog.forms import ProductForm
from catalog.forms import ProductImportForm


def test_product_import_form_accepts_only_xlsx():
    form = ProductImportForm()

    assert form.fields["file"].widget.attrs["accept"] == ".xlsx"


@pytest.mark.django_db
def test_product_form_generates_slug_and_barcode_when_missing(category, brand):
    form = ProductForm(
        data={
            "name": "Switch Core 48",
            "sku": "SW-CORE-48",
            "barcode": "",
            "category": str(category.pk),
            "brand": str(brand.pk),
            "description": "",
            "cost_price": "100000",
            "selling_price": "150000",
            "is_active": "on",
        }
    )

    assert form.is_valid(), form.errors
    product = form.save()

    assert product.slug == "switch-core-48"
    assert product.barcode == "SW-CORE-48"
