"""Migrate Supplier.store → Supplier.enterprise.

Three-step migration:
1. Add enterprise FK (nullable), drop old unique_together
2. Populate enterprise from store.enterprise, deduplicate
3. Remove store FK, make enterprise non-nullable, add new unique_together
"""
import django.db.models.deletion
from django.db import migrations, models


def populate_supplier_enterprise(apps, schema_editor):
    Supplier = apps.get_model("purchases", "Supplier")
    for supplier in Supplier.objects.select_related("store__enterprise").all():
        if supplier.store_id and supplier.store.enterprise_id:
            supplier.enterprise_id = supplier.store.enterprise_id
            supplier.save(update_fields=["enterprise_id"])

    # Deduplicate: if two suppliers have the same (enterprise, name),
    # keep the oldest one and reassign PurchaseOrders from the duplicate.
    PurchaseOrder = apps.get_model("purchases", "PurchaseOrder")
    seen = {}
    for supplier in Supplier.objects.order_by("created_at"):
        key = (str(supplier.enterprise_id), supplier.name)
        if key in seen:
            # Reassign purchase orders to the surviving supplier
            PurchaseOrder.objects.filter(supplier=supplier).update(
                supplier=seen[key]
            )
            supplier.delete()
        else:
            seen[key] = supplier


def reverse_populate(apps, schema_editor):
    Supplier = apps.get_model("purchases", "Supplier")
    Store = apps.get_model("stores", "Store")
    for supplier in Supplier.objects.all():
        if supplier.enterprise_id:
            store = Store.objects.filter(enterprise_id=supplier.enterprise_id).first()
            if store:
                supplier.store_id = store.pk
                supplier.save(update_fields=["store_id"])


class Migration(migrations.Migration):

    dependencies = [
        ("purchases", "0001_initial"),
        ("stores", "0008_store_enterprise_non_nullable"),
    ]

    operations = [
        # Step 1: Drop old unique_together (store, name)
        migrations.AlterUniqueTogether(
            name="supplier",
            unique_together=set(),
        ),
        # Step 2: Add enterprise FK (nullable)
        migrations.AddField(
            model_name="supplier",
            name="enterprise",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="suppliers",
                to="stores.enterprise",
            ),
        ),
        # Step 3: Populate enterprise + deduplicate
        migrations.RunPython(populate_supplier_enterprise, reverse_populate),
        # Step 4: Make enterprise non-nullable
        migrations.AlterField(
            model_name="supplier",
            name="enterprise",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="suppliers",
                to="stores.enterprise",
            ),
        ),
        # Step 5: Remove store FK
        migrations.RemoveField(
            model_name="supplier",
            name="store",
        ),
        # Step 6: Add new unique_together (enterprise, name)
        migrations.AlterUniqueTogether(
            name="supplier",
            unique_together={("enterprise", "name")},
        ),
    ]
