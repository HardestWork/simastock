# Generated manually for AI credits and activity tracking

import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('ai', '0001_initial'),
        ('stores', '0023_store_receipt_custom_footer_and_more'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='AICreditBalance',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('balance', models.IntegerField(default=0, help_text='Nombre de credits IA restants. 1 credit ≈ 1 message assistant.', verbose_name='solde (credits)')),
                ('enterprise', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='ai_credit_balance', to='stores.enterprise', verbose_name='entreprise')),
            ],
            options={
                'verbose_name': 'solde credits IA',
                'verbose_name_plural': 'soldes credits IA',
            },
        ),
        migrations.CreateModel(
            name='AICreditTransaction',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('transaction_type', models.CharField(choices=[('PURCHASE', 'Achat'), ('CONSUMPTION', 'Consommation'), ('BONUS', 'Bonus'), ('ADJUSTMENT', 'Ajustement')], max_length=15, verbose_name='type')),
                ('amount', models.IntegerField(help_text='Positif = ajout, negatif = consommation.', verbose_name='montant (credits)')),
                ('balance_after', models.IntegerField(verbose_name='solde apres')),
                ('description', models.CharField(blank=True, default='', max_length=300, verbose_name='description')),
                ('payment_reference', models.CharField(blank=True, default='', max_length=100, verbose_name='reference paiement')),
                ('amount_paid_fcfa', models.IntegerField(default=0, verbose_name='montant paye (FCFA)')),
                ('enterprise', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='ai_credit_transactions', to='stores.enterprise', verbose_name='entreprise')),
                ('user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL, verbose_name='utilisateur')),
            ],
            options={
                'verbose_name': 'transaction credits IA',
                'verbose_name_plural': 'transactions credits IA',
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='UserActivitySession',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('date', models.DateField(db_index=True, verbose_name='date')),
                ('started_at', models.DateTimeField(verbose_name='debut')),
                ('last_heartbeat', models.DateTimeField(verbose_name='dernier heartbeat')),
                ('total_seconds', models.IntegerField(default=0, help_text='Temps actif cumule pour cette session.', verbose_name='duree totale (secondes)')),
                ('page_views', models.IntegerField(default=0, verbose_name='pages vues')),
                ('is_active', models.BooleanField(default=True, verbose_name='session active')),
                ('store', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='activity_sessions', to='stores.store', verbose_name='boutique')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='activity_sessions', to=settings.AUTH_USER_MODEL, verbose_name='utilisateur')),
            ],
            options={
                'verbose_name': 'session activite',
                'verbose_name_plural': 'sessions activite',
                'ordering': ['-date', '-last_heartbeat'],
                'indexes': [
                    models.Index(fields=['user', 'date'], name='ai_useracti_user_id_idx'),
                    models.Index(fields=['store', 'date'], name='ai_useracti_store_i_idx'),
                ],
            },
        ),
    ]
