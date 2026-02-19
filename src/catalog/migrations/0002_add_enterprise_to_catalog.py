"""Add enterprise FK to Category, Brand, and Product.

Three-step migration:
1. Add enterprise FK (nullable) to all three models, drop old unique constraints
2. Populate enterprise from the default Enterprise
3. Make enterprise non-nullable, add new unique_together constraints
"""
import django.db.models.deletion
from django.db import migrations, models


def populate_catalog_enterprise(apps, schema_editor):
    """Set enterprise on all Category, Brand, and Product rows."""
    Enterprise = apps.get_model("stores", "Enterprise")
    enterprise = Enterprise.objects.first()
    if not enterprise:
        return

    Category = apps.get_model("catalog", "Category")
    Brand = apps.get_model("catalog", "Brand")
    Product = apps.get_model("catalog", "Product")

    Category.objects.filter(enterprise__isnull=True).update(enterprise=enterprise)
    Brand.objects.filter(enterprise__isnull=True).update(enterprise=enterprise)
    Product.objects.filter(enterprise__isnull=True).update(enterprise=enterprise)


def reverse_populate(apps, schema_editor):
    """No-op reverse: enterprise column will be dropped anyway."""
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("catalog", "0001_initial"),
        ("stores", "0008_store_enterprise_non_nullable"),
    ]

    operations = [
        # ---------------------------------------------------------------
        # Step 1: Add enterprise FK (nullable) to Category, Brand, Product
        # ---------------------------------------------------------------
        migrations.AddField(
            model_name="category",
            name="enterprise",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="categories",
                to="stores.enterprise",
                verbose_name="entreprise",
            ),
        ),
        migrations.AddField(
            model_name="brand",
            name="enterprise",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="brands",
                to="stores.enterprise",
                verbose_name="entreprise",
            ),
        ),
        migrations.AddField(
            model_name="product",
            name="enterprise",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="products",
                to="stores.enterprise",
                verbose_name="entreprise",
            ),
        ),
        # ---------------------------------------------------------------
        # Step 2: Drop old unique=True on slug/sku fields
        # ---------------------------------------------------------------
        migrations.AlterField(
            model_name="category",
            name="slug",
            field=models.SlugField(max_length=255, verbose_name="slug"),
        ),
        migrations.AlterField(
            model_name="brand",
            name="slug",
            field=models.SlugField(max_length=255, verbose_name="slug"),
        ),
        migrations.AlterField(
            model_name="product",
            name="slug",
            field=models.SlugField(max_length=255, verbose_name="slug"),
        ),
        migrations.AlterField(
            model_name="product",
            name="sku",
            field=models.CharField(
                help_text="Reference interne unique du produit.",
                max_length=50,
                verbose_name="SKU",
            ),
        ),
        # ---------------------------------------------------------------
        # Step 3: Populate enterprise on all rows
        # ---------------------------------------------------------------
        migrations.RunPython(populate_catalog_enterprise, reverse_populate),
        # ---------------------------------------------------------------
        # Step 4: Make enterprise non-nullable
        # ---------------------------------------------------------------
        migrations.AlterField(
            model_name="category",
            name="enterprise",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="categories",
                to="stores.enterprise",
                verbose_name="entreprise",
            ),
        ),
        migrations.AlterField(
            model_name="brand",
            name="enterprise",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="brands",
                to="stores.enterprise",
                verbose_name="entreprise",
            ),
        ),
        migrations.AlterField(
            model_name="product",
            name="enterprise",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="products",
                to="stores.enterprise",
                verbose_name="entreprise",
            ),
        ),
        # ---------------------------------------------------------------
        # Step 5: Add new unique_together constraints
        # ---------------------------------------------------------------
        migrations.AlterUniqueTogether(
            name="category",
            unique_together={("enterprise", "slug")},
        ),
        migrations.AlterUniqueTogether(
            name="brand",
            unique_together={("enterprise", "slug")},
        ),
        migrations.AlterUniqueTogether(
            name="product",
            unique_together={("enterprise", "slug"), ("enterprise", "sku")},
        ),
    ]
