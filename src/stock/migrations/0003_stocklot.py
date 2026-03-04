import uuid
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("catalog", "0002_add_enterprise_to_catalog"),
        ("stock", "0002_alter_inventorymovement_product_and_more"),
        ("stores", "0010_alter_auditlog_entity_type_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="StockLot",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("quantity_initial", models.IntegerField(verbose_name="quantite initiale")),
                ("quantity_remaining", models.IntegerField(verbose_name="quantite restante")),
                ("unit_cost", models.DecimalField(decimal_places=2, max_digits=12, verbose_name="cout unitaire")),
                (
                    "source_type",
                    models.CharField(
                        choices=[
                            ("PURCHASE", "Achat"),
                            ("MANUAL_IN", "Entree manuelle"),
                            ("TRANSFER_IN", "Transfert entrant"),
                            ("RETURN", "Retour"),
                            ("ADJUST", "Ajustement"),
                            ("UNKNOWN", "Autre"),
                        ],
                        db_index=True,
                        default="UNKNOWN",
                        max_length=20,
                        verbose_name="source",
                    ),
                ),
                ("source_reference", models.CharField(blank=True, default="", max_length=255, verbose_name="reference source")),
                ("received_at", models.DateTimeField(db_index=True, verbose_name="recu le")),
                (
                    "product",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="stock_lots",
                        to="catalog.product",
                        verbose_name="produit",
                    ),
                ),
                (
                    "store",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="stock_lots",
                        to="stores.store",
                        verbose_name="boutique",
                    ),
                ),
            ],
            options={
                "verbose_name": "lot de stock",
                "verbose_name_plural": "lots de stock",
                "ordering": ["received_at", "created_at"],
                "indexes": [
                    models.Index(fields=["store", "product", "received_at"], name="stklot_store_prod_recv_idx"),
                    models.Index(fields=["store", "product", "quantity_remaining"], name="stklot_store_prod_qty_idx"),
                ],
            },
        ),
    ]
