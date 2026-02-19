"""Migrate Customer.store → Customer.enterprise.

Three-step migration:
1. Add enterprise FK (nullable)
2. Populate enterprise from store.enterprise
3. Remove store FK, make enterprise non-nullable
"""
import django.db.models.deletion
from django.db import migrations, models


def populate_customer_enterprise(apps, schema_editor):
    Customer = apps.get_model("customers", "Customer")
    for customer in Customer.objects.select_related("store__enterprise").all():
        if customer.store_id and customer.store.enterprise_id:
            customer.enterprise_id = customer.store.enterprise_id
            customer.save(update_fields=["enterprise_id"])


def reverse_populate(apps, schema_editor):
    """Best-effort reverse: assign customer to first store of their enterprise."""
    Customer = apps.get_model("customers", "Customer")
    Store = apps.get_model("stores", "Store")
    for customer in Customer.objects.all():
        if customer.enterprise_id:
            store = Store.objects.filter(enterprise_id=customer.enterprise_id).first()
            if store:
                customer.store_id = store.pk
                customer.save(update_fields=["store_id"])


class Migration(migrations.Migration):

    dependencies = [
        ("customers", "0001_initial"),
        ("stores", "0008_store_enterprise_non_nullable"),
    ]

    operations = [
        # Step 1: Add enterprise FK (nullable)
        migrations.AddField(
            model_name="customer",
            name="enterprise",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="customers",
                to="stores.enterprise",
                verbose_name="entreprise",
            ),
        ),
        # Step 2: Populate enterprise from store.enterprise
        migrations.RunPython(populate_customer_enterprise, reverse_populate),
        # Step 3: Make enterprise non-nullable
        migrations.AlterField(
            model_name="customer",
            name="enterprise",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="customers",
                to="stores.enterprise",
                verbose_name="entreprise",
            ),
        ),
        # Step 4: Remove store FK
        migrations.RemoveField(
            model_name="customer",
            name="store",
        ),
    ]
