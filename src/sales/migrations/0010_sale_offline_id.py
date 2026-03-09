"""Add offline_id UUID field to Sale for offline sync deduplication."""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("sales", "0009_sale_delivery_fee"),
    ]

    operations = [
        migrations.AddField(
            model_name="sale",
            name="offline_id",
            field=models.UUIDField(
                blank=True,
                db_index=True,
                help_text="UUID genere cote client pour deduplication des ventes offline.",
                null=True,
                unique=True,
                verbose_name="identifiant offline",
            ),
        ),
    ]
