"""Seed commercial modules, dependencies, and plans."""
from __future__ import annotations

from datetime import date

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from stores.models import (
    BillingModule,
    BillingModuleDependency,
    BillingPlan,
    BillingPlanModule,
    Enterprise,
    EnterprisePlanAssignment,
    MODULE_CODE_LABELS,
    MODULE_DEFAULT_ORDER,
)


MODULE_DESCRIPTIONS = {
    "CORE": "Authentification, utilisateurs, boutiques, roles, audit.",
    "SELL": "Point de vente, devis et flux de vente.",
    "CASH": "Encaissement, sessions caisse, recus.",
    "CUSTOMER": "Clients, credit, echeanciers et recouvrement.",
    "STOCK": "Niveaux stock, mouvements, transferts et inventaires.",
    "PURCHASE": "Fournisseurs, commandes achats, receptions.",
    "EXPENSE": "Depenses, wallets, budgets, recurrent.",
    "SELLER_PERF": "Objectifs vendeurs, classement, coaching.",
    "ANALYTICS_MANAGER": "Analytics manager (kpi, marge, forecast, fraude).",
    "ANALYTICS_CASHIER": "Analytics operation caisse.",
    "ANALYTICS_STOCK": "Analytics stock et alertes.",
    "ANALYTICS_DG": "Dashboard executif DG.",
    "CLIENT_INTEL": "Score client, churn, reco produits, next order.",
    "ALERTS": "Centre d'alertes transversal.",
}

MODULE_DEPENDENCIES = {
    "SELL": ["CORE"],
    "CASH": ["SELL"],
    "CUSTOMER": ["SELL", "CASH"],
    "STOCK": ["CORE"],
    "PURCHASE": ["STOCK"],
    "EXPENSE": ["CORE"],
    "SELLER_PERF": ["SELL", "CASH"],
    "ANALYTICS_MANAGER": ["SELL", "CASH", "STOCK"],
    "ANALYTICS_CASHIER": ["CASH"],
    "ANALYTICS_STOCK": ["STOCK"],
    "ANALYTICS_DG": ["ANALYTICS_MANAGER", "ANALYTICS_CASHIER", "ANALYTICS_STOCK"],
    "CLIENT_INTEL": ["CUSTOMER", "ANALYTICS_MANAGER"],
    "ALERTS": ["CORE"],
}

PLAN_DEFINITIONS = [
    {
        "code": "STARTER",
        "name": "Starter",
        "billing_cycle": BillingPlan.BillingCycle.MONTHLY,
        "base_price_fcfa": 20000,
        "modules": {"CORE", "SELL"},
    },
    {
        "code": "RETAIL_OPS",
        "name": "Retail Ops",
        "billing_cycle": BillingPlan.BillingCycle.MONTHLY,
        "base_price_fcfa": 45000,
        "modules": {"CORE", "SELL", "CASH", "STOCK"},
    },
    {
        "code": "BUSINESS",
        "name": "Business",
        "billing_cycle": BillingPlan.BillingCycle.MONTHLY,
        "base_price_fcfa": 85000,
        "modules": {"CORE", "SELL", "CASH", "STOCK", "CUSTOMER", "PURCHASE", "EXPENSE", "ALERTS"},
    },
    {
        "code": "PERFORMANCE",
        "name": "Performance",
        "billing_cycle": BillingPlan.BillingCycle.MONTHLY,
        "base_price_fcfa": 130000,
        "modules": {
            "CORE",
            "SELL",
            "CASH",
            "STOCK",
            "CUSTOMER",
            "PURCHASE",
            "EXPENSE",
            "ALERTS",
            "SELLER_PERF",
            "ANALYTICS_MANAGER",
            "ANALYTICS_CASHIER",
            "ANALYTICS_STOCK",
        },
    },
    {
        "code": "EXEC_AI",
        "name": "Executive AI",
        "billing_cycle": BillingPlan.BillingCycle.MONTHLY,
        "base_price_fcfa": 185000,
        "modules": {
            "CORE",
            "SELL",
            "CASH",
            "STOCK",
            "CUSTOMER",
            "PURCHASE",
            "EXPENSE",
            "ALERTS",
            "SELLER_PERF",
            "ANALYTICS_MANAGER",
            "ANALYTICS_CASHIER",
            "ANALYTICS_STOCK",
            "ANALYTICS_DG",
            "CLIENT_INTEL",
        },
    },
]


class Command(BaseCommand):
    help = "Seed module catalog, dependencies, pricing plans, and optional enterprise plan assignments."

    def add_arguments(self, parser):
        parser.add_argument(
            "--assign-plan",
            type=str,
            default="",
            help="Assign this plan code to all active enterprises (ex: BUSINESS).",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Archive existing active assignments before assigning plan.",
        )
        parser.add_argument(
            "--start-date",
            type=str,
            default="",
            help="Assignment start date YYYY-MM-DD (default: today).",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        module_map = self._seed_modules()
        self._seed_dependencies(module_map)
        plan_map = self._seed_plans(module_map)

        assign_plan_code = (options.get("assign_plan") or "").strip().upper()
        if assign_plan_code:
            start_date_raw = (options.get("start_date") or "").strip()
            starts_on = date.fromisoformat(start_date_raw) if start_date_raw else date.today()
            self._assign_plan_to_enterprises(
                plan_map=plan_map,
                plan_code=assign_plan_code,
                starts_on=starts_on,
                force=bool(options.get("force")),
            )

        self.stdout.write(self.style.SUCCESS("Module catalog seeding complete."))

    def _seed_modules(self) -> dict[str, BillingModule]:
        module_map: dict[str, BillingModule] = {}
        for order, code in enumerate(MODULE_DEFAULT_ORDER, start=1):
            module, _created = BillingModule.objects.update_or_create(
                code=code,
                defaults={
                    "name": MODULE_CODE_LABELS.get(code, code),
                    "description": MODULE_DESCRIPTIONS.get(code, ""),
                    "display_order": order,
                    "is_active": True,
                },
            )
            module_map[code] = module
        self.stdout.write(f"Modules upserted: {len(module_map)}")
        return module_map

    def _seed_dependencies(self, module_map: dict[str, BillingModule]) -> None:
        BillingModuleDependency.objects.all().delete()
        created_count = 0
        for module_code, dep_codes in MODULE_DEPENDENCIES.items():
            module = module_map.get(module_code)
            if not module:
                continue
            for dep_code in dep_codes:
                dep = module_map.get(dep_code)
                if not dep:
                    continue
                BillingModuleDependency.objects.create(
                    module=module,
                    depends_on_module=dep,
                )
                created_count += 1
        self.stdout.write(f"Dependencies rebuilt: {created_count}")

    def _seed_plans(self, module_map: dict[str, BillingModule]) -> dict[str, BillingPlan]:
        plans: dict[str, BillingPlan] = {}
        for definition in PLAN_DEFINITIONS:
            plan, _created = BillingPlan.objects.update_or_create(
                code=definition["code"],
                defaults={
                    "name": definition["name"],
                    "description": f"Pack {definition['name']}",
                    "billing_cycle": definition["billing_cycle"],
                    "base_price_fcfa": int(definition["base_price_fcfa"]),
                    "currency": "FCFA",
                    "is_active": True,
                },
            )
            plans[plan.code] = plan

            included_codes = set(definition["modules"])
            for code, module in module_map.items():
                BillingPlanModule.objects.update_or_create(
                    plan=plan,
                    module=module,
                    defaults={"included": code in included_codes},
                )

        self.stdout.write(f"Plans upserted: {len(plans)}")
        return plans

    def _assign_plan_to_enterprises(
        self,
        *,
        plan_map: dict[str, BillingPlan],
        plan_code: str,
        starts_on: date,
        force: bool,
    ) -> None:
        plan = plan_map.get(plan_code)
        if plan is None:
            raise CommandError(f"Unknown plan code '{plan_code}'.")

        enterprises = Enterprise.objects.filter(is_active=True).order_by("name")
        created_count = 0
        skipped_count = 0
        for enterprise in enterprises:
            active_qs = EnterprisePlanAssignment.objects.filter(
                enterprise=enterprise,
                status__in=[EnterprisePlanAssignment.Status.TRIAL, EnterprisePlanAssignment.Status.ACTIVE],
            )
            if active_qs.exists() and not force:
                skipped_count += 1
                continue
            if force:
                active_qs.update(status=EnterprisePlanAssignment.Status.CANCELED)

            EnterprisePlanAssignment.objects.create(
                enterprise=enterprise,
                plan=plan,
                status=EnterprisePlanAssignment.Status.ACTIVE,
                starts_on=starts_on,
                ends_on=None,
                auto_renew=True,
            )
            created_count += 1

        self.stdout.write(
            f"Assignments created: {created_count}, skipped: {skipped_count}, plan: {plan_code}"
        )
