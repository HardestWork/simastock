"""Seed demo data for Commercial CRM module."""
from __future__ import annotations

import random
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from commercial.models import (
    CommercialLeadSource,
    CommercialOpportunity,
    CommercialProspect,
    CommercialRegion,
    CommercialSector,
    CommercialTag,
)
from stores.models import Store, StoreUser

User = get_user_model()


class Command(BaseCommand):
    help = "Seed commercial demo dataset (2 stores, 3 sellers, 20 prospects, 10 opportunities)."

    def add_arguments(self, parser):
        parser.add_argument("--seed", type=int, default=42, help="Random seed.")
        parser.add_argument("--reset", action="store_true", help="Delete existing commercial prospects/opportunities first.")

    def handle(self, *args, **options):
        random.seed(int(options["seed"]))
        stores = list(Store.objects.filter(is_active=True).order_by("name")[:2])
        if len(stores) < 2:
            raise CommandError("Need at least 2 active stores before seeding commercial data.")

        if options["reset"]:
            CommercialOpportunity.objects.filter(store__in=stores).delete()
            CommercialProspect.objects.filter(store__in=stores).delete()

        seller_profiles = [
            ("demo.commercial.aline@magictech.local", "Aline", "Nkom"),
            ("demo.commercial.brice@magictech.local", "Brice", "Manga"),
            ("demo.commercial.carine@magictech.local", "Carine", "Atangana"),
        ]
        sellers = []
        for idx, (email, first, last) in enumerate(seller_profiles):
            seller, _created = User.objects.get_or_create(
                email=email,
                defaults={
                    "first_name": first,
                    "last_name": last,
                    "role": "SALES",
                    "is_active": True,
                },
            )
            sellers.append(seller)
            target_store = stores[0] if idx < 2 else stores[1]
            StoreUser.objects.get_or_create(store=target_store, user=seller, defaults={"is_default": False})

        for store in stores:
            enterprise = store.enterprise
            for code, label in [("LIT", "Littoral"), ("CTR", "Centre")]:
                CommercialRegion.objects.get_or_create(
                    enterprise=enterprise,
                    code=code,
                    defaults={"name": label, "is_active": True},
                )
            for name in ["BTP", "Distribution", "Sante", "Education"]:
                CommercialSector.objects.get_or_create(
                    enterprise=enterprise,
                    name=name,
                    defaults={"is_active": True},
                )
            for name, color in [("VIP", "#2563EB"), ("Urgent", "#DC2626"), ("Nouveau", "#16A34A")]:
                CommercialTag.objects.get_or_create(
                    enterprise=enterprise,
                    name=name,
                    defaults={"color": color},
                )
            CommercialLeadSource.objects.get_or_create(
                enterprise=enterprise,
                code=CommercialLeadSource.Code.MANUAL,
                defaults={"label": "Manual", "is_active": True},
            )
            CommercialLeadSource.objects.get_or_create(
                enterprise=enterprise,
                code=CommercialLeadSource.Code.CSV,
                defaults={"label": "CSV", "is_active": True},
            )

        prospects_target = 20
        opportunities_target = 10
        now = timezone.now()
        all_regions = list(CommercialRegion.objects.filter(enterprise=stores[0].enterprise))
        all_sectors = list(CommercialSector.objects.filter(enterprise=stores[0].enterprise))
        all_sources = list(CommercialLeadSource.objects.filter(enterprise=stores[0].enterprise))
        all_tags = list(CommercialTag.objects.filter(enterprise=stores[0].enterprise))

        prospects = []
        for idx in range(prospects_target):
            store = stores[0] if idx < 12 else stores[1]
            owner = sellers[idx % len(sellers)]
            prospect = CommercialProspect.objects.create(
                store=store,
                owner=owner,
                created_by=owner,
                company_name=f"Prospect Company {idx + 1:02d}",
                contact_name=f"Contact {idx + 1:02d}",
                phone=f"+2376900{idx:04d}",
                email=f"prospect{idx + 1:02d}@demo.local",
                region=random.choice(all_regions) if all_regions else None,
                sector=random.choice(all_sectors) if all_sectors else None,
                source=random.choice(all_sources) if all_sources else None,
                status=CommercialProspect.Status.NEW,
                estimated_potential=Decimal(str(random.randint(300000, 9500000))),
                score=random.randint(35, 92),
                next_follow_up_at=now + timedelta(days=random.randint(1, 14)),
            )
            if all_tags:
                prospect.tags.set(random.sample(all_tags, k=min(len(all_tags), random.randint(1, 2))))
            prospects.append(prospect)

        stages = [
            CommercialOpportunity.Stage.PROSPECT,
            CommercialOpportunity.Stage.CONTACTED,
            CommercialOpportunity.Stage.RDV,
            CommercialOpportunity.Stage.QUOTE_SENT,
            CommercialOpportunity.Stage.NEGOTIATION,
            CommercialOpportunity.Stage.WON,
            CommercialOpportunity.Stage.LOST,
        ]
        for idx in range(opportunities_target):
            prospect = prospects[idx]
            stage = stages[idx % len(stages)]
            opportunity = CommercialOpportunity.objects.create(
                store=prospect.store,
                prospect=prospect,
                owner=prospect.owner,
                name=f"Opportunity {idx + 1:02d} - {prospect.company_name}",
                stage=stage,
                probability_pct=random.randint(20, 90),
                estimated_amount=Decimal(str(random.randint(350000, 9500000))),
                estimated_margin_pct=Decimal(str(random.randint(8, 35))),
                expected_close_date=(now + timedelta(days=random.randint(5, 45))).date(),
                pipeline_order=idx,
                closed_at=now if stage in (CommercialOpportunity.Stage.WON, CommercialOpportunity.Stage.LOST) else None,
            )
            opportunity.tags.set(prospect.tags.all())
            prospect.status = CommercialProspect.Status.QUALIFIED
            prospect.save(update_fields=["status", "updated_at"])

        self.stdout.write(self.style.SUCCESS("Commercial demo data seeded successfully."))
        self.stdout.write(f"- Stores: {stores[0].code}, {stores[1].code}")
        self.stdout.write(f"- Sellers: {len(sellers)}")
        self.stdout.write(f"- Prospects: {CommercialProspect.objects.filter(store__in=stores).count()}")
        self.stdout.write(f"- Opportunities: {CommercialOpportunity.objects.filter(store__in=stores).count()}")
