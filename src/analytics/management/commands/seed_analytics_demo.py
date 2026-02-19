"""Seed realistic demo data for analytics validation."""
from __future__ import annotations

import random
from datetime import date, datetime, time, timedelta
from decimal import Decimal, ROUND_HALF_UP

from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify

from analytics.models import (
    ABCAnalysis,
    CustomerCreditScore,
    FraudEvent,
    ReorderRecommendation,
    SalesForecast,
)
from analytics.services import (
    build_strategic_dashboard,
    compute_abc_analysis,
    compute_credit_scores,
    compute_dynamic_reorder,
    compute_sales_forecast,
    detect_fraud_signals,
)
from accounts.models import User
from cashier.models import CashShift, Payment
from catalog.models import Brand, Category, Product
from credits.models import CreditLedgerEntry, CustomerAccount, PaymentSchedule
from customers.models import Customer
from sales.models import Refund, Sale, SaleItem
from stock.models import ProductStock
from stores.models import FEATURE_FLAG_DEFAULTS, Enterprise, Store, StoreUser


class Command(BaseCommand):
    help = (
        "Generate realistic historical data to test analytics modules "
        "(ABC, reorder, credit scoring, forecast, fraud)."
    )

    DEMO_PREFIX = "SIMAN"

    def add_arguments(self, parser):
        parser.add_argument("--store-code", default="", help="Store code to target. Defaults to first active store.")
        parser.add_argument("--days", type=int, default=90, help="Number of historical days to generate (default: 90).")
        parser.add_argument("--sales-per-day", type=int, default=5, help="Average number of sales per day (default: 5).")
        parser.add_argument("--seed", type=int, default=20260216, help="Deterministic random seed (default: 20260216).")
        parser.add_argument("--seed-base", action="store_true", help="Run core seed_data first if base catalog/users are missing.")
        parser.add_argument("--flush-base", action="store_true", help="Run core seed_data --flush before generating analytics demo data.")
        parser.add_argument("--replace", action="store_true", help="Delete previously generated SIMAN data for the selected store first.")
        parser.add_argument("--reset-analytics", action="store_true", help="Clear analytics snapshots/events for the selected store before recomputation.")
        parser.add_argument("--run-pipeline", action="store_true", help="Run analytics computations at the end (recommended).")
        parser.add_argument("--multi-enterprise", action="store_true", help="Generate a complete multi-enterprise / multi-store demo scenario.")
        parser.add_argument("--enterprise-count", type=int, default=3, help="Number of demo enterprises when --multi-enterprise is set.")
        parser.add_argument("--stores-per-enterprise", type=int, default=2, help="Stores per demo enterprise when --multi-enterprise is set.")

    def handle(self, *args, **options):
        random.seed(options["seed"])

        if options["flush_base"]:
            self.stdout.write("Running base seed with --flush...")
            call_command("seed_data", flush=True)
        elif options["seed_base"]:
            self.stdout.write("Running base seed...")
            call_command("seed_data")

        stores = self._resolve_target_stores(options)
        if not stores:
            raise CommandError("No target stores found.")

        totals = {
            "sales": 0,
            "payments": 0,
            "items": 0,
            "shifts": 0,
            "abc": 0,
            "reorder": 0,
            "credit": 0,
            "forecast": 0,
            "fraud": 0,
        }

        for index, store in enumerate(stores, start=1):
            self.stdout.write(f"[{index}/{len(stores)}] Seeding {store.code} ({store.name})...")
            self._ensure_feature_flags(store)

            if options["replace"]:
                self._cleanup_demo_data(store)
            if options["reset_analytics"]:
                self._cleanup_analytics_rows(store)

            context = self._ensure_generation_context(store)
            generated = self._generate_sales_history(
                store=store,
                context=context,
                days=max(30, options["days"]),
                sales_per_day=max(1, options["sales_per_day"]),
            )
            self._generate_credit_data(store, context)
            self._generate_quick_high_refund(store, context)
            self._tune_stock_levels(store)

            analytics_summary = {}
            if options["run_pipeline"]:
                analytics_summary = self._run_analytics_pipeline(store, options["days"])

            totals["sales"] += generated["sales"]
            totals["payments"] += generated["payments"]
            totals["items"] += generated["items"]
            totals["shifts"] += generated["shifts"]

            if analytics_summary:
                totals["abc"] += analytics_summary["abc"]
                totals["reorder"] += analytics_summary["reorder"]
                totals["credit"] += analytics_summary["credit"]
                totals["forecast"] += analytics_summary["forecast"]
                totals["fraud"] += analytics_summary["fraud"]

            self.stdout.write(
                f"- Store: {store.name} ({store.code})\n"
                f"  Sales generated: {generated['sales']}\n"
                f"  Payments generated: {generated['payments']}\n"
                f"  Sale lines generated: {generated['items']}\n"
                f"  Closed shifts generated: {generated['shifts']}"
            )
            if analytics_summary:
                self.stdout.write(
                    "  Analytics refresh:\n"
                    f"  - ABC rows: {analytics_summary['abc']}\n"
                    f"  - Reorder rows: {analytics_summary['reorder']}\n"
                    f"  - Credit score rows: {analytics_summary['credit']}\n"
                    f"  - Forecast rows: {analytics_summary['forecast']}\n"
                    f"  - Fraud events (new): {analytics_summary['fraud']}"
                )

        self.stdout.write(self.style.SUCCESS("Demo analytics data generated successfully."))
        self.stdout.write(
            f"- Target stores: {len(stores)}\n"
            f"- Sales generated: {totals['sales']}\n"
            f"- Payments generated: {totals['payments']}\n"
            f"- Sale lines generated: {totals['items']}\n"
            f"- Closed shifts generated: {totals['shifts']}"
        )
        if options["run_pipeline"]:
            self.stdout.write(
                "Aggregated analytics refresh:\n"
                f"- ABC rows: {totals['abc']}\n"
                f"- Reorder rows: {totals['reorder']}\n"
                f"- Credit score rows: {totals['credit']}\n"
                f"- Forecast rows: {totals['forecast']}\n"
                f"- Fraud events (new): {totals['fraud']}"
            )

    def _resolve_target_stores(self, options) -> list[Store]:
        if options.get("multi_enterprise"):
            enterprise_count = max(1, int(options.get("enterprise_count") or 1))
            stores_per_enterprise = max(1, int(options.get("stores_per_enterprise") or 1))
            return self._ensure_multi_store_scenario(
                enterprise_count=enterprise_count,
                stores_per_enterprise=stores_per_enterprise,
            )
        return [self._resolve_store(options.get("store_code", ""))]

    def _resolve_store(self, store_code: str) -> Store:
        if store_code:
            store = Store.objects.filter(code=store_code, is_active=True).first()
            if not store:
                raise CommandError(f"Store not found for code '{store_code}'.")
            return store

        store = Store.objects.filter(is_active=True).order_by("created_at").first()
        if not store:
            raise CommandError("No active store found. Run seed_data first.")
        return store

    @transaction.atomic
    def _ensure_multi_store_scenario(self, *, enterprise_count: int, stores_per_enterprise: int) -> list[Store]:
        template_enterprise = (
            Enterprise.objects.filter(products__is_active=True).distinct().order_by("created_at").first()
        )
        if not template_enterprise:
            raise CommandError("No enterprise with products found. Run seed_data first.")

        stores: list[Store] = []
        for ent_index in range(1, enterprise_count + 1):
            ent_code = f"{self.DEMO_PREFIX}-ENT-{ent_index:02d}"
            enterprise, _created = Enterprise.objects.get_or_create(
                code=ent_code,
                defaults={
                    "name": f"Entreprise Demo {ent_index:02d}",
                    "legal_name": f"Entreprise Demo {ent_index:02d} SARL",
                    "registration_number": f"RC-DEMO-{ent_index:04d}",
                    "tax_id": f"NIU-DEMO-{ent_index:04d}",
                    "currency": "FCFA",
                    "vat_enabled": True,
                    "vat_rate": Decimal("19.25"),
                    "email": f"contact+ent{ent_index:02d}@siman.local",
                    "phone": f"+237620{ent_index:04d}",
                    "website": f"https://ent{ent_index:02d}.siman.local",
                    "analytics_feature_flags": dict(FEATURE_FLAG_DEFAULTS),
                    "is_active": True,
                },
            )
            if not enterprise.analytics_feature_flags:
                enterprise.analytics_feature_flags = dict(FEATURE_FLAG_DEFAULTS)
                enterprise.save(update_fields=["analytics_feature_flags", "updated_at"])

            self._ensure_enterprise_catalog(enterprise=enterprise, template_enterprise=template_enterprise)

            products = list(Product.objects.filter(enterprise=enterprise, is_active=True))
            if not products:
                raise CommandError(f"Unable to provision products for enterprise {enterprise.code}.")

            for store_index in range(1, stores_per_enterprise + 1):
                store_code = f"{self.DEMO_PREFIX}-S{ent_index:02d}{store_index:02d}"
                store, _created = Store.objects.get_or_create(
                    code=store_code,
                    defaults={
                        "enterprise": enterprise,
                        "name": f"Boutique {ent_index:02d}-{store_index:02d}",
                        "address": f"Avenue Demo {store_index}, Zone {ent_index}",
                        "phone": f"+237650{ent_index:02d}{store_index:02d}",
                        "email": f"store-{ent_index:02d}-{store_index:02d}@siman.local",
                        "currency": "FCFA",
                        "is_active": True,
                    },
                )
                if store.enterprise_id != enterprise.id:
                    continue

                for product in products:
                    ProductStock.objects.get_or_create(
                        store=store,
                        product=product,
                        defaults={
                            "quantity": random.randint(35, 120),
                            "reserved_qty": 0,
                            "min_qty": random.randint(5, 12),
                        },
                    )

                stores.append(store)

        return stores

    def _ensure_enterprise_catalog(self, *, enterprise: Enterprise, template_enterprise: Enterprise) -> None:
        if Product.objects.filter(enterprise=enterprise, is_active=True).exists():
            return

        template_categories = list(
            Category.objects.filter(enterprise=template_enterprise, is_active=True).order_by("parent_id", "name")
        )
        template_brands = list(
            Brand.objects.filter(enterprise=template_enterprise, is_active=True).order_by("name")
        )
        template_products = list(
            Product.objects.filter(enterprise=template_enterprise, is_active=True)
            .select_related("category", "brand")
            .order_by("name")
        )

        category_map = {}
        pending = template_categories[:]
        while pending:
            progressed = False
            remaining = []
            for source in pending:
                parent = category_map.get(source.parent_id)
                if source.parent_id and parent is None:
                    remaining.append(source)
                    continue
                candidate_slug = source.slug or slugify(source.name) or "categorie"
                target_slug = self._unique_slug(Category, enterprise, candidate_slug)
                category = Category.objects.create(
                    enterprise=enterprise,
                    name=source.name,
                    slug=target_slug,
                    description=source.description,
                    parent=parent,
                    is_active=source.is_active,
                )
                category_map[source.id] = category
                progressed = True
            if not progressed:
                break
            pending = remaining

        if pending:
            for source in pending:
                candidate_slug = source.slug or slugify(source.name) or "categorie"
                target_slug = self._unique_slug(Category, enterprise, candidate_slug)
                category = Category.objects.create(
                    enterprise=enterprise,
                    name=source.name,
                    slug=target_slug,
                    description=source.description,
                    parent=None,
                    is_active=source.is_active,
                )
                category_map[source.id] = category

        brand_map = {}
        for source in template_brands:
            candidate_slug = source.slug or slugify(source.name) or "marque"
            target_slug = self._unique_slug(Brand, enterprise, candidate_slug)
            brand = Brand.objects.create(
                enterprise=enterprise,
                name=source.name,
                slug=target_slug,
                is_active=source.is_active,
            )
            brand_map[source.id] = brand

        for source in template_products:
            target_category = category_map.get(source.category_id)
            if target_category is None:
                continue
            target_brand = brand_map.get(source.brand_id)
            target_slug = self._unique_slug(Product, enterprise, source.slug or slugify(source.name) or "produit")
            target_sku = self._unique_sku(enterprise, source.sku)
            Product.objects.create(
                enterprise=enterprise,
                category=target_category,
                brand=target_brand,
                name=source.name,
                slug=target_slug,
                sku=target_sku,
                barcode=source.barcode,
                description=source.description,
                cost_price=source.cost_price,
                selling_price=source.selling_price,
                is_active=source.is_active,
            )

    def _unique_slug(self, model, enterprise: Enterprise, base_slug: str) -> str:
        base = (base_slug or "item").strip("-")[:245] or "item"
        candidate = base
        index = 2
        while model.objects.filter(enterprise=enterprise, slug=candidate).exists():
            suffix = f"-{index}"
            candidate = f"{base[:255-len(suffix)]}{suffix}"
            index += 1
        return candidate

    def _unique_sku(self, enterprise: Enterprise, base_sku: str) -> str:
        base = (base_sku or "SKU-DEMO").strip()[:44] or "SKU-DEMO"
        candidate = base
        index = 2
        while Product.objects.filter(enterprise=enterprise, sku=candidate).exists():
            suffix = f"-{index}"
            candidate = f"{base[:50-len(suffix)]}{suffix}"
            index += 1
        return candidate

    def _ensure_feature_flags(self, store: Store) -> None:
        enterprise = store.enterprise
        if not enterprise:
            return
        flags = dict(FEATURE_FLAG_DEFAULTS)
        enterprise.analytics_feature_flags = flags
        enterprise.save(update_fields=["analytics_feature_flags", "updated_at"])
        store.analytics_feature_overrides = {}
        store.save(update_fields=["analytics_feature_overrides", "updated_at"])

    @transaction.atomic
    def _cleanup_demo_data(self, store: Store) -> None:
        prefix = f"{self.DEMO_PREFIX}-"
        customer_marker = self._customer_marker(store)
        demo_sales = Sale.objects.filter(store=store, invoice_number__startswith=prefix)

        PaymentSchedule.objects.filter(sale__in=demo_sales).delete()
        CreditLedgerEntry.objects.filter(sale__in=demo_sales).delete()
        Refund.objects.filter(sale__in=demo_sales).delete()
        Payment.objects.filter(sale__in=demo_sales).delete()
        SaleItem.objects.filter(sale__in=demo_sales).delete()
        demo_sales.delete()

        CreditLedgerEntry.objects.filter(account__store=store, reference__startswith=prefix).delete()
        PaymentSchedule.objects.filter(account__store=store, notes__icontains=self.DEMO_PREFIX).delete()
        CustomerAccount.objects.filter(store=store, customer__notes__icontains=customer_marker).delete()
        Customer.objects.filter(enterprise=store.enterprise, notes__icontains=customer_marker).delete()
        CashShift.objects.filter(store=store, notes__icontains=self.DEMO_PREFIX).delete()

    @transaction.atomic
    def _cleanup_analytics_rows(self, store: Store) -> None:
        ABCAnalysis.objects.filter(store=store).delete()
        ReorderRecommendation.objects.filter(store=store).delete()
        CustomerCreditScore.objects.filter(store=store).delete()
        SalesForecast.objects.filter(store=store).delete()
        FraudEvent.objects.filter(store=store).delete()

    def _ensure_generation_context(self, store: Store) -> dict:
        enterprise = store.enterprise
        store_token = self._store_token(store)

        sellers = list(User.objects.filter(role=User.Role.SALES, store_users__store=store, is_active=True).distinct())
        cashiers = list(
            User.objects.filter(
                role__in=(User.Role.CASHIER, User.Role.MANAGER, User.Role.ADMIN),
                store_users__store=store,
                is_active=True,
            ).distinct()
        )
        managers = list(
            User.objects.filter(
                role__in=(User.Role.MANAGER, User.Role.ADMIN),
                store_users__store=store,
                is_active=True,
            ).distinct()
        )

        if not sellers:
            sellers = [self._create_user(store, f"demo.sales.{store_token}@siman.local", User.Role.SALES, "Sales", "Demo")]
        if not cashiers:
            cashiers = [self._create_user(store, f"demo.cashier.{store_token}@siman.local", User.Role.CASHIER, "Cashier", "Demo")]
        if not managers:
            managers = [self._create_user(store, f"demo.manager.{store_token}@siman.local", User.Role.MANAGER, "Manager", "Demo")]

        products = list(
            Product.objects.filter(enterprise=enterprise, is_active=True, stock_records__store=store).distinct()
        )
        if len(products) < 10:
            missing_products = list(
                Product.objects.filter(enterprise=enterprise, is_active=True).exclude(pk__in=[p.pk for p in products])[:15]
            )
            for product in missing_products:
                ProductStock.objects.get_or_create(
                    store=store,
                    product=product,
                    defaults={"quantity": 80, "reserved_qty": 0, "min_qty": 8},
                )
            products = list(
                Product.objects.filter(enterprise=enterprise, is_active=True, stock_records__store=store).distinct()
            )

        if not products:
            raise CommandError("No products available for this store. Run seed_data first.")

        customer_marker = self._customer_marker(store)
        customers = list(
            Customer.objects.filter(enterprise=enterprise, is_active=True).exclude(notes__icontains=f"[{self.DEMO_PREFIX}]")
        )
        customers.extend(
            list(Customer.objects.filter(enterprise=enterprise, is_active=True, notes__icontains=customer_marker))
        )

        seen_ids = set()
        deduped_customers = []
        for customer in customers:
            if customer.id in seen_ids:
                continue
            deduped_customers.append(customer)
            seen_ids.add(customer.id)
        customers = deduped_customers

        while len(customers) < 12:
            idx = len(customers) + 1
            customer = Customer.objects.create(
                enterprise=enterprise,
                first_name=f"Client{idx}",
                last_name="Siman",
                phone=self._build_demo_phone(store, idx),
                email=f"client{idx}.{store_token}@siman.local",
                notes=f"[{self.DEMO_PREFIX}] {customer_marker}",
            )
            customers.append(customer)

        return {
            "sellers": sellers,
            "cashiers": cashiers,
            "managers": managers,
            "products": products,
            "customers": customers,
        }

    def _create_user(self, store: Store, email: str, role: str, first_name: str, last_name: str) -> User:
        user, created = User.objects.get_or_create(
            email=email,
            defaults={"first_name": first_name, "last_name": last_name, "role": role, "is_active": True},
        )
        if created:
            user.set_password("DemoPassword123!")
            user.save(update_fields=["password"])
        StoreUser.objects.get_or_create(store=store, user=user, defaults={"is_default": False})
        return user

    @transaction.atomic
    def _generate_sales_history(self, *, store: Store, context: dict, days: int, sales_per_day: int) -> dict:
        sellers = context["sellers"]
        cashiers = context["cashiers"]
        customers = context["customers"]
        products = context["products"]

        invoice_prefix = f"{self.DEMO_PREFIX}-{self._store_token(store)}"
        start_day = date.today() - timedelta(days=days - 1)
        invoice_seq = Sale.objects.filter(store=store, invoice_number__startswith=f"{invoice_prefix}-").count() + 1

        sales_count = 0
        items_count = 0
        payments_count = 0
        shifts_count = 0

        for day_index in range(days):
            current_day = start_day + timedelta(days=day_index)
            cashier = random.choice(cashiers)
            shift = CashShift.objects.create(
                store=store,
                cashier=cashier,
                status=CashShift.Status.CLOSED,
                opening_float=Decimal(random.choice([30000, 50000, 75000])),
                notes=f"[{self.DEMO_PREFIX}] generated shift",
            )
            shift_totals = {
                "sales": Decimal("0.00"),
                "cash": Decimal("0.00"),
                "mobile": Decimal("0.00"),
                "bank": Decimal("0.00"),
                "credit": Decimal("0.00"),
            }

            day_sales = random.randint(max(1, sales_per_day - 2), sales_per_day + 2)
            high_discount_day = (day_index % 28 == 0)
            split_day = (day_index % 13 == 0)
            outlier_day = (day_index == days - 4)

            for sale_idx in range(day_sales):
                seller = random.choice(sellers)
                customer = random.choice(customers)
                sale_time = datetime.combine(
                    current_day,
                    time(hour=random.randint(9, 18), minute=random.randint(0, 59)),
                    tzinfo=timezone.get_current_timezone(),
                )
                sale = Sale.objects.create(
                    store=store,
                    seller=seller,
                    customer=customer,
                    invoice_number=f"{invoice_prefix}-{current_day.strftime('%Y%m%d')}-{invoice_seq:05d}",
                    status=Sale.Status.PAID,
                    submitted_at=sale_time,
                    paid_at=sale_time + timedelta(minutes=5),
                    notes=f"[{self.DEMO_PREFIX}] generated sale",
                )
                invoice_seq += 1
                sales_count += 1

                forced_outlier = outlier_day and sale_idx == 0
                discount_percent = Decimal("0.00")
                if high_discount_day and sale_idx == 0:
                    discount_percent = Decimal("65.00")
                elif random.random() < 0.20:
                    discount_percent = Decimal(str(random.choice([5, 7.5, 10, 12.5])))

                line_count = random.randint(1, 4)
                chosen_products = random.sample(products, k=min(line_count, len(products)))
                subtotal = Decimal("0.00")

                for product in chosen_products:
                    quantity = random.randint(1, 3)
                    if forced_outlier:
                        quantity = random.randint(8, 15)
                    item = SaleItem.objects.create(
                        sale=sale,
                        product=product,
                        product_name=product.name,
                        unit_price=product.selling_price,
                        cost_price=product.cost_price,
                        quantity=quantity,
                        discount_amount=Decimal("0.00"),
                    )
                    self._set_created_at(item, sale_time + timedelta(minutes=1))
                    items_count += 1
                    subtotal += item.line_total

                sale.subtotal = subtotal.quantize(Decimal("0.01"))
                sale.discount_percent = discount_percent
                sale.discount_amount = (
                    (sale.subtotal * discount_percent / Decimal("100"))
                    .quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                )
                taxable = max(Decimal("0.00"), sale.subtotal - sale.discount_amount)

                vat_enabled = bool(getattr(store, "effective_vat_enabled", False))
                vat_rate = Decimal(str(getattr(store, "effective_vat_rate", Decimal("0.00"))))
                sale.tax_amount = (
                    (taxable * vat_rate / Decimal("100")).quantize(Decimal("0.01"))
                    if vat_enabled and vat_rate > 0
                    else Decimal("0.00")
                )
                sale.total = (taxable + sale.tax_amount).quantize(Decimal("0.01"))

                if forced_outlier:
                    sale.total = (sale.total * Decimal("2.80")).quantize(Decimal("0.01"))

                partial = random.random() < 0.18
                if partial:
                    ratio = Decimal(str(random.uniform(0.35, 0.75)))
                    amount_paid = (sale.total * ratio).quantize(Decimal("0.01"))
                    sale.status = Sale.Status.PARTIALLY_PAID
                    sale.reserve_stock = True
                else:
                    amount_paid = sale.total
                    sale.status = Sale.Status.PAID

                sale.amount_paid = amount_paid
                sale.amount_due = max(Decimal("0.00"), sale.total - amount_paid).quantize(Decimal("0.01"))
                sale.save(
                    update_fields=[
                        "subtotal",
                        "discount_percent",
                        "discount_amount",
                        "tax_amount",
                        "total",
                        "status",
                        "amount_paid",
                        "amount_due",
                        "reserve_stock",
                        "updated_at",
                    ]
                )
                self._set_created_at(sale, sale_time)

                if sale.amount_paid > 0:
                    split_payment = split_day and sale_idx == 1 and sale.amount_paid >= Decimal("50000.00")
                    lines = 3 if split_payment else (2 if random.random() < 0.25 else 1)
                    payment_lines = self._split_amount(sale.amount_paid, lines)

                    for line_idx, amount in enumerate(payment_lines):
                        method = self._choose_payment_method(split_payment=split_payment, line_idx=line_idx)
                        payment = Payment.objects.create(
                            sale=sale,
                            store=store,
                            cashier=cashier,
                            shift=shift,
                            method=method,
                            amount=amount,
                            reference=f"{self.DEMO_PREFIX}-PAY-{sale.pk}-{line_idx+1}",
                            notes=f"[{self.DEMO_PREFIX}] generated payment",
                        )
                        payment_time = sale_time + timedelta(minutes=2 + line_idx)
                        self._set_created_at(payment, payment_time)
                        payments_count += 1

                        shift_totals["sales"] += amount
                        if method == Payment.Method.CASH:
                            shift_totals["cash"] += amount
                        elif method == Payment.Method.MOBILE_MONEY:
                            shift_totals["mobile"] += amount
                        elif method == Payment.Method.BANK_TRANSFER:
                            shift_totals["bank"] += amount
                        elif method == Payment.Method.CREDIT:
                            shift_totals["credit"] += amount

            opened_at = datetime.combine(current_day, time(hour=8, minute=5), tzinfo=timezone.get_current_timezone())
            closed_at = datetime.combine(current_day, time(hour=19, minute=10), tzinfo=timezone.get_current_timezone())
            shift.total_sales = shift_totals["sales"].quantize(Decimal("0.01"))
            shift.total_cash_payments = shift_totals["cash"].quantize(Decimal("0.01"))
            shift.total_mobile_payments = shift_totals["mobile"].quantize(Decimal("0.01"))
            shift.total_bank_payments = shift_totals["bank"].quantize(Decimal("0.01"))
            shift.total_credit_payments = shift_totals["credit"].quantize(Decimal("0.01"))
            shift.expected_cash = (shift.opening_float + shift.total_cash_payments).quantize(Decimal("0.01"))
            variance = Decimal(str(random.choice([-1500, -500, 0, 350, 850])))
            shift.closing_cash = (shift.expected_cash + variance).quantize(Decimal("0.01"))
            shift.variance = variance
            shift.closed_at = closed_at
            shift.save(
                update_fields=[
                    "total_sales",
                    "total_cash_payments",
                    "total_mobile_payments",
                    "total_bank_payments",
                    "total_credit_payments",
                    "expected_cash",
                    "closing_cash",
                    "variance",
                    "closed_at",
                    "updated_at",
                ]
            )
            CashShift.objects.filter(pk=shift.pk).update(opened_at=opened_at, created_at=opened_at, updated_at=closed_at)
            shifts_count += 1

        return {
            "sales": sales_count,
            "payments": payments_count,
            "items": items_count,
            "shifts": shifts_count,
        }

    def _split_amount(self, total: Decimal, lines: int) -> list[Decimal]:
        if lines <= 1:
            return [total.quantize(Decimal("0.01"))]

        amounts = []
        remaining = total.quantize(Decimal("0.01"))
        for index in range(lines):
            if index == lines - 1:
                amounts.append(remaining.quantize(Decimal("0.01")))
                break
            max_chunk = (remaining / Decimal(str(lines - index))).quantize(Decimal("0.01"))
            min_chunk = min(Decimal("500.00"), max_chunk)
            if max_chunk <= min_chunk:
                chunk = min_chunk
            else:
                chunk = Decimal(str(random.uniform(float(min_chunk), float(max_chunk)))).quantize(Decimal("0.01"))
            amounts.append(chunk)
            remaining -= chunk
        if sum(amounts) != total.quantize(Decimal("0.01")):
            amounts[-1] = (amounts[-1] + (total - sum(amounts))).quantize(Decimal("0.01"))
        return amounts

    def _choose_payment_method(self, *, split_payment: bool, line_idx: int) -> str:
        if split_payment and line_idx == 0:
            return Payment.Method.CASH
        methods = [
            Payment.Method.CASH,
            Payment.Method.MOBILE_MONEY,
            Payment.Method.BANK_TRANSFER,
        ]
        return random.choice(methods)

    @transaction.atomic
    def _generate_credit_data(self, store: Store, context: dict) -> None:
        manager = random.choice(context["managers"])
        customers = context["customers"][:8]
        today = date.today()
        prefix = f"{self.DEMO_PREFIX}-CREDIT"

        for idx, customer in enumerate(customers, start=1):
            account, _created = CustomerAccount.objects.get_or_create(
                store=store,
                customer=customer,
                defaults={
                    "credit_limit": Decimal(str(random.choice([200000, 400000, 800000, 1200000]))),
                    "balance": Decimal("0.00"),
                    "is_active": True,
                },
            )
            if account.credit_limit <= 0:
                account.credit_limit = Decimal("400000.00")
                account.save(update_fields=["credit_limit", "updated_at"])

            usage_factor = Decimal(str(random.choice([0.35, 0.65, 0.95, 1.20 if idx % 5 == 0 else 0.80])))
            target_balance = (account.credit_limit * usage_factor).quantize(Decimal("0.01"))
            account.balance = target_balance
            account.save(update_fields=["balance", "updated_at"])

            CreditLedgerEntry.objects.create(
                account=account,
                entry_type=CreditLedgerEntry.EntryType.SALE_ON_CREDIT,
                amount=target_balance,
                balance_after=target_balance,
                reference=f"{prefix}-SALE-{idx}",
                notes=f"[{self.DEMO_PREFIX}] generated credit sale",
                created_by=manager,
            )

            schedule_specs = [
                (today - timedelta(days=35), Decimal("120000.00"), Decimal("20000.00"), PaymentSchedule.Status.PENDING),
                (today - timedelta(days=10), Decimal("90000.00"), Decimal("45000.00"), PaymentSchedule.Status.PARTIAL),
                (today + timedelta(days=7), Decimal("85000.00"), Decimal("0.00"), PaymentSchedule.Status.PENDING),
                (today + timedelta(days=25), Decimal("110000.00"), Decimal("0.00"), PaymentSchedule.Status.PENDING),
            ]
            for due_date, amount_due, amount_paid, status in schedule_specs:
                PaymentSchedule.objects.create(
                    account=account,
                    sale=None,
                    due_date=due_date,
                    amount_due=amount_due,
                    amount_paid=amount_paid,
                    status=status,
                    notes=f"[{self.DEMO_PREFIX}] generated schedule",
                )

    @transaction.atomic
    def _generate_quick_high_refund(self, store: Store, context: dict) -> None:
        manager = random.choice(context["managers"])
        recent_sale = (
            Sale.objects.filter(
                store=store,
                status=Sale.Status.PAID,
                invoice_number__startswith=f"{self.DEMO_PREFIX}-",
            )
            .order_by("-created_at")
            .first()
        )
        if not recent_sale:
            return

        refund_amount = (recent_sale.total * Decimal("0.80")).quantize(Decimal("0.01"))
        refund = Refund.objects.create(
            sale=recent_sale,
            store=store,
            amount=refund_amount,
            reason=f"[{self.DEMO_PREFIX}] quick high refund scenario",
            approved_by=manager,
            processed_by=manager,
            refund_method=Refund.Method.CASH,
            reference=f"{self.DEMO_PREFIX}-REFUND-{recent_sale.pk}",
        )
        refund_time = recent_sale.created_at + timedelta(hours=3)
        Refund.objects.filter(pk=refund.pk).update(created_at=refund_time, updated_at=refund_time)

    @transaction.atomic
    def _tune_stock_levels(self, store: Store) -> None:
        low_stocks = ProductStock.objects.filter(store=store).order_by("updated_at")[:8]
        for index, stock in enumerate(low_stocks):
            if index < 3:
                stock.quantity = 0
            elif index < 6:
                stock.quantity = 3
            else:
                stock.quantity = 8
            stock.reserved_qty = 0
            stock.min_qty = 10
            stock.save(update_fields=["quantity", "reserved_qty", "min_qty", "updated_at"])

    def _run_analytics_pipeline(self, store: Store, days: int) -> dict:
        today = date.today()
        window = max(30, min(days, 120))
        date_from = today - timedelta(days=window - 1)
        date_to = today

        abc = compute_abc_analysis(store, date_from, date_to)
        reorder = compute_dynamic_reorder(store, as_of=today, lookback_days=30)
        credit = compute_credit_scores(store, as_of=today)
        forecast = compute_sales_forecast(store, as_of=today, lookback_days=60, horizon_days=14)
        fraud = detect_fraud_signals(store, date_from=today - timedelta(days=30), date_to=today)
        payload = build_strategic_dashboard(store, date_from=date_from, date_to=date_to)

        return {
            "abc": abc,
            "reorder": reorder,
            "credit": credit,
            "forecast": forecast,
            "fraud": fraud,
            "kpi_revenue": str(payload["revenue"]),
            "kpi_orders": payload["orders"],
            "kpi_forecast_7d": str(payload["forecast_next_7d_qty"]),
            "kpi_fraud_unresolved": payload["fraud"]["unresolved"],
        }

    def _set_created_at(self, obj, dt: datetime) -> None:
        obj.__class__.objects.filter(pk=obj.pk).update(created_at=dt, updated_at=dt)

    def _store_token(self, store: Store) -> str:
        return "".join(ch for ch in store.code.lower() if ch.isalnum())[:20] or "store"

    def _customer_marker(self, store: Store) -> str:
        return f"{self.DEMO_PREFIX}:{store.code}"

    def _build_demo_phone(self, store: Store, index: int) -> str:
        numeric_token = "".join(ch for ch in store.code if ch.isdigit())
        if not numeric_token:
            numeric_token = str(sum(ord(ch) for ch in store.code) % 10000).zfill(4)
        token = numeric_token[:4].zfill(4)
        return f"+2376{token}{index:03d}"
