"""Seed richer demo data for end-to-end feature testing.

This command complements ``seed_data`` by generating realistic transactional
data: sales in multiple statuses, payments/cash shifts, purchase flows,
alerts and analytics snapshots.
"""

from __future__ import annotations

import random
from datetime import date, timedelta
from decimal import Decimal

from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone


class Command(BaseCommand):
    help = "Seed transactional demo data (sales/payments/analytics) for testing the SPA."

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Wipe base data (seed_data --flush) before generating demo transactions.",
        )
        parser.add_argument(
            "--days",
            type=int,
            default=30,
            help="How many past days to spread demo sales across (default: 30).",
        )
        parser.add_argument(
            "--sales",
            type=int,
            default=120,
            help="How many sales to generate (default: 120).",
        )
        parser.add_argument(
            "--seed",
            type=int,
            default=42,
            help="Random seed for reproducible demo generation (default: 42).",
        )
        parser.add_argument(
            "--no-analytics",
            action="store_true",
            help="Do not precompute analytics tables.",
        )
        parser.add_argument(
            "--no-alerts",
            action="store_true",
            help="Do not generate alerts.",
        )
        parser.add_argument(
            "--no-purchases",
            action="store_true",
            help="Do not generate purchase orders / goods receipts.",
        )

    def handle(self, *args, **options):
        from accounts.models import User
        from catalog.models import Product
        from customers.models import Customer
        from sales.models import Sale
        from stock.models import ProductStock
        from stores.models import Enterprise, Store, StoreUser

        random.seed(int(options["seed"]))

        if options["reset"]:
            self.stdout.write("Resetting base data (seed_data --flush)...")
            call_command("seed_data", flush=True)
        else:
            # Ensure demo users have known passwords even on persistent volumes.
            call_command("seed_data", reset_passwords=True)

        enterprise = Enterprise.objects.filter(code="ENT-001").first() or Enterprise.objects.first()
        if not enterprise:
            raise RuntimeError("No enterprise found; run seed_data first.")

        store1 = Store.objects.filter(code="BQ-001").first() or Store.objects.first()
        if not store1:
            raise RuntimeError("No store found; run seed_data first.")

        # Create a second store to exercise multi-store behaviour.
        store2, _ = Store.objects.get_or_create(
            code="BQ-002",
            defaults={
                "enterprise": enterprise,
                "name": "Boutique Nord",
                "address": "Avenue de la Paix, Douala",
                "phone": "+237 6XX XXX 222",
                "email": "nord@boutique.cm",
                "currency": store1.currency,
                "vat_enabled": store1.vat_enabled,
                "vat_rate": store1.vat_rate,
            },
        )
        if store2.enterprise_id != enterprise.id:
            store2.enterprise = enterprise
            store2.save(update_fields=["enterprise", "updated_at"])

        demo_users = {
            "admin": User.objects.get(email="admin@boutique.cm"),
            "manager": User.objects.get(email="manager@boutique.cm"),
            "seller1": User.objects.get(email="vendeur1@boutique.cm"),
            "seller2": User.objects.get(email="vendeur2@boutique.cm"),
            "cashier": User.objects.get(email="caissier@boutique.cm"),
            "stocker": User.objects.get(email="magasinier@boutique.cm"),
        }

        # Ensure user-store links for store2.
        for user in demo_users.values():
            StoreUser.objects.get_or_create(store=store2, user=user, defaults={"is_default": False})

        # Ensure stock records exist for store2 (copy quantities from store1).
        for ps in ProductStock.objects.filter(store=store1).select_related("product"):
            ProductStock.objects.get_or_create(
                store=store2,
                product=ps.product,
                defaults={
                    "quantity": max(int(ps.quantity), 0),
                    "reserved_qty": 0,
                    "min_qty": max(int(ps.min_qty), 3),
                },
            )

        # Create extra customers (seed_data already creates a few).
        existing_customer_count = Customer.objects.filter(enterprise=enterprise).count()
        target_customers = max(existing_customer_count, 25)
        if existing_customer_count < target_customers:
            self.stdout.write(f"Creating customers: {target_customers - existing_customer_count} ...")
        for i in range(existing_customer_count, target_customers):
            phone = f"+237 690 10 {i:03d}"
            Customer.objects.get_or_create(
                enterprise=enterprise,
                phone=phone,
                defaults={
                    "first_name": f"Client{i+1}",
                    "last_name": "Demo",
                    "email": "",
                    "address": "Douala",
                },
            )

        customers = list(Customer.objects.filter(enterprise=enterprise).order_by("created_at")[:50])
        products = list(Product.objects.filter(enterprise=enterprise, is_active=True).order_by("created_at"))
        if not customers or not products:
            raise RuntimeError("Missing customers or products; run seed_data first.")

        # Create one closed shift (yesterday) and one open shift (today) for cashier.
        from cashier.services import open_shift, close_shift, get_current_shift, process_payment

        def _ensure_shift(store: Store):
            shift = get_current_shift(demo_users["cashier"], store)
            if shift:
                return shift
            return open_shift(store, demo_users["cashier"], opening_float=Decimal("50000"))

        shift1 = _ensure_shift(store1)

        # Create demo sales.
        self.stdout.write(f"Generating {int(options['sales'])} sales across {int(options['days'])} days...")

        from sales.services import (
            add_item_to_sale,
            create_sale,
            submit_sale_to_cashier,
        )

        stores = [store1, store2]
        sale_ids: list[str] = []

        for idx in range(int(options["sales"])):
            store = random.choice(stores)
            seller = random.choice([demo_users["seller1"], demo_users["seller2"], demo_users["manager"]])
            customer = random.choice(customers)

            # Spread sales across the last N days.
            days_back = random.randint(0, max(int(options["days"]) - 1, 0))
            sale_dt = timezone.now() - timedelta(days=days_back, hours=random.randint(0, 10), minutes=random.randint(0, 59))

            sale = create_sale(store=store, seller=seller, customer=customer)

            # Add 1-4 distinct products
            for _ in range(random.randint(1, 4)):
                product = random.choice(products)
                # Respect available stock: choose a small qty.
                try:
                    ps = ProductStock.objects.filter(store=store, product=product).first()
                    available = int(getattr(ps, "available_qty", 0) or 0) if ps else 0
                    max_qty = min(max(available, 0), 3)
                except Exception:
                    max_qty = 0
                if max_qty < 1:
                    continue
                qty = random.randint(1, max_qty)
                try:
                    add_item_to_sale(sale=sale, product=product, qty=qty, actor=seller)
                except Exception:
                    # Skip products that fail validation (e.g., no stock) and continue.
                    continue
            # refresh totals computed inside service transactions
            sale.refresh_from_db()
            if not sale.items.exists() or (sale.total or Decimal("0.00")) <= 0:
                # Keep as draft for testing "empty/invalid" flows without polluting cashier.
                Sale.objects.filter(pk=sale.pk).update(created_at=sale_dt, updated_at=sale_dt)
                sale_ids.append(str(sale.pk))
                continue

            # Some draft sales should exist for testing.
            if idx % 12 == 0:
                Sale.objects.filter(pk=sale.pk).update(created_at=sale_dt, updated_at=sale_dt)
                sale_ids.append(str(sale.pk))
                continue

            # Submit most sales.
            try:
                sale = submit_sale_to_cashier(sale, actor=seller)
            except Exception:
                Sale.objects.filter(pk=sale.pk).update(created_at=sale_dt, updated_at=sale_dt)
                sale_ids.append(str(sale.pk))
                continue

            # Make some pending, some partial, most paid.
            r = random.random()
            if r < 0.20:
                # Pending payment: make it look old enough for alerts.
                sale.submitted_at = sale_dt - timedelta(hours=4)
                sale.save(update_fields=["submitted_at", "updated_at"])
            else:
                # Payments require an open shift in the same store.
                shift = shift1 if store.id == store1.id else _ensure_shift(store2)

                # Optional reservation in partial mode.
                if r < 0.35:
                    sale.reserve_stock = True
                    sale.save(update_fields=["reserve_stock", "updated_at"])

                # Pay either partially or fully.
                amount_due = Decimal(str(sale.amount_due or "0.00"))
                if amount_due <= 0:
                    pass
                else:
                    full = r >= 0.35
                    pay_amount = amount_due if full else (amount_due * Decimal("0.50")).quantize(Decimal("0.01"))
                    # CREDIT can fail when customer accounts have low limits; keep demo seeding robust.
                    methods = ["CASH", "MOBILE_MONEY", "BANK_TRANSFER", "CREDIT"]
                    method = random.choice(methods)
                    if method == "CREDIT":
                        try:
                            from credits.services import get_or_create_account
                            account = get_or_create_account(store=sale.store, customer=sale.customer)
                            # Ensure a generous demo credit limit to avoid seed failures.
                            desired_limit = max(account.credit_limit or Decimal("0.00"), Decimal("5000000.00"))
                            if account.credit_limit != desired_limit:
                                account.credit_limit = desired_limit
                                account.save(update_fields=["credit_limit", "updated_at"])
                        except Exception:
                            # If credits isn't configured, fall back to cash.
                            method = "CASH"
                    try:
                        process_payment(
                            sale=sale,
                            payments_data=[{"method": method, "amount": str(pay_amount), "reference": f"DEMO-{idx:04d}"}],
                            cashier=demo_users["cashier"],
                            shift=shift,
                        )
                    except ValueError:
                        # Fall back to CASH so the dataset still contains paid sales.
                        process_payment(
                            sale=sale,
                            payments_data=[{"method": "CASH", "amount": str(pay_amount), "reference": f"DEMO-{idx:04d}-FB"}],
                            cashier=demo_users["cashier"],
                            shift=shift,
                        )

            # Backdate created_at for analytics and listing.
            Sale.objects.filter(pk=sale.pk).update(created_at=sale_dt, updated_at=sale_dt)
            sale_ids.append(str(sale.pk))

        # Ensure at least a couple of "analytics/fraud" signals exist for demo UX.
        # This avoids empty Fraud tab on a fresh dataset.
        try:
            from sales.services import recalculate_sale
            demo_store = store1
            demo_customer = customers[0]
            demo_seller = demo_users["manager"]
            demo_shift = _ensure_shift(demo_store)

            def _add_one_item_or_skip(target_sale) -> bool:
                # Pick a product that can be added (stock might be 0 for some).
                candidates = products[:]
                random.shuffle(candidates)
                for prod in candidates[: min(12, len(candidates))]:
                    try:
                        add_item_to_sale(sale=target_sale, product=prod, qty=1, actor=demo_seller)
                        return True
                    except Exception:
                        continue
                return False

            # 1) High discount sale (triggers HIGH_DISCOUNT_THRESHOLD)
            sale = create_sale(store=demo_store, seller=demo_seller, customer=demo_customer)
            if not _add_one_item_or_skip(sale):
                raise RuntimeError("No product could be added for fraud demo (discount).")
            sale.discount_percent = Decimal("60.00")
            recalculate_sale(sale)
            sale = submit_sale_to_cashier(sale, actor=demo_seller)
            process_payment(
                sale=sale,
                payments_data=[{"method": "CASH", "amount": str(sale.amount_due), "reference": "DEMO-FRAUD-DISCOUNT"}],
                cashier=demo_users["cashier"],
                shift=demo_shift,
            )

            # 2) Split payment sale (triggers SPLIT_PAYMENT_PATTERN)
            sale2 = create_sale(store=demo_store, seller=demo_seller, customer=demo_customer)
            if not _add_one_item_or_skip(sale2):
                raise RuntimeError("No product could be added for fraud demo (split payment).")
            sale2 = submit_sale_to_cashier(sale2, actor=demo_seller)
            due = Decimal(str(sale2.amount_due or "0.00")).quantize(Decimal("0.01"))
            if due > 0:
                a = (due / Decimal("3")).quantize(Decimal("0.01"))
                b = (due / Decimal("3")).quantize(Decimal("0.01"))
                c = (due - a - b).quantize(Decimal("0.01"))
                process_payment(
                    sale=sale2,
                    payments_data=[
                        {"method": "CASH", "amount": str(a), "reference": "DEMO-FRAUD-SPLIT-1"},
                        {"method": "MOBILE_MONEY", "amount": str(b), "reference": "DEMO-FRAUD-SPLIT-2"},
                        {"method": "BANK_TRANSFER", "amount": str(c), "reference": "DEMO-FRAUD-SPLIT-3"},
                    ],
                    cashier=demo_users["cashier"],
                    shift=demo_shift,
                )
        except Exception:
            # Not critical; analytics can still be computed from the main dataset.
            pass

        # Close a shift to enable testing "closed shift" screens/pdfs.
        try:
            with transaction.atomic():
                shift1.refresh_from_db()
                if shift1.status == shift1.Status.OPEN and shift1.payments.exists():
                    # Close with expected cash (no variance) for clean demo.
                    shift1.calculate_expected_cash()
                    close_shift(shift1, closing_cash=shift1.expected_cash, notes="Demo close")
        except Exception:
            # Not critical for demo.
            pass

        # Re-open a fresh shift for today's cashier operations.
        try:
            _ensure_shift(store1)
        except Exception:
            pass

        # Purchases: create a few POs and receipts and add stock.
        if not options["no_purchases"]:
            self._seed_purchases(stores=stores, enterprise=enterprise, actor=demo_users["manager"], products=products)

        # Alerts: create low-stock alerts by pushing a couple products below threshold.
        if not options["no_alerts"]:
            self._seed_alerts(store=store1, actor=demo_users["stocker"], products=products)

        # Analytics: compute summary tables from the sales history.
        if not options["no_analytics"]:
            self._seed_analytics(store=store1, days=int(options["days"]))
            self._seed_analytics(store=store2, days=int(options["days"]))

        self.stdout.write(self.style.SUCCESS(
            f"Demo seed complete: stores={len(stores)}, sales={len(sale_ids)}"
        ))

    def _seed_purchases(self, *, stores, enterprise, actor, products):
        from purchases.models import Supplier, PurchaseOrder, PurchaseOrderLine, GoodsReceipt, GoodsReceiptLine
        from stock.services import adjust_stock
        from stock.models import InventoryMovement

        suppliers = []
        for name in ["Sofitech", "NetWorld", "DistribPlus"]:
            s, _ = Supplier.objects.get_or_create(
                enterprise=enterprise,
                name=name,
                defaults={"contact_name": "Demo", "phone": "+237 699 000 000", "email": "demo@supplier.cm"},
            )
            suppliers.append(s)

        for i in range(5):
            store = random.choice(stores)
            supplier = random.choice(suppliers)
            po_number = f"PO-DEMO-{store.code}-{i+1:03d}"
            po, created = PurchaseOrder.objects.get_or_create(
                po_number=po_number,
                defaults={
                    "store": store,
                    "supplier": supplier,
                    "created_by": actor,
                    "status": PurchaseOrder.Status.SUBMITTED,
                    "notes": "Bon de commande demo",
                },
            )
            if not created:
                continue

            lines = []
            for product in random.sample(products, k=min(4, len(products))):
                qty = random.randint(2, 15)
                unit_cost = Decimal(str(product.cost_price or "0.00"))
                if unit_cost <= 0:
                    unit_cost = Decimal("1000.00")
                line = PurchaseOrderLine.objects.create(
                    purchase_order=po,
                    product=product,
                    quantity_ordered=qty,
                    unit_cost=unit_cost,
                )
                lines.append(line)

            # Create a receipt and "receive" all quantities (and increase stock).
            receipt = GoodsReceipt.objects.create(
                store=store,
                purchase_order=po,
                received_by=actor,
                receipt_number=f"GR-DEMO-{store.code}-{i+1:03d}",
                notes="Reception demo",
            )
            for line in lines:
                GoodsReceiptLine.objects.create(
                    receipt=receipt,
                    purchase_order_line=line,
                    quantity_received=line.quantity_ordered,
                )
                line.quantity_received = line.quantity_ordered
                line.save(update_fields=["quantity_received", "updated_at"])
                adjust_stock(
                    store=store,
                    product=line.product,
                    qty_delta=int(line.quantity_ordered),
                    movement_type=InventoryMovement.MovementType.PURCHASE,
                    reason=f"Reception {receipt.receipt_number}",
                    actor=actor,
                    reference=po.po_number,
                )

            po.status = PurchaseOrder.Status.RECEIVED
            po.subtotal = sum((l.line_total for l in lines), Decimal("0.00"))
            po.save(update_fields=["status", "subtotal", "updated_at"])

    def _seed_alerts(self, *, store, actor, products):
        from stock.services import adjust_stock
        from stock.models import InventoryMovement, ProductStock
        from alerts.services import sync_low_stock_alerts_for_store

        # Force a couple of products into low stock for demo.
        for product in random.sample(products, k=min(2, len(products))):
            ps = ProductStock.objects.filter(store=store, product=product).first()
            if not ps:
                continue
            target = max(0, int(ps.min_qty) - 1)
            delta = target - int(ps.quantity)
            if delta == 0:
                continue
            try:
                adjust_stock(
                    store=store,
                    product=product,
                    qty_delta=delta,
                    movement_type=InventoryMovement.MovementType.ADJUST,
                    reason="Demo: trigger low-stock alert",
                    actor=actor,
                    reference="DEMO",
                )
            except Exception:
                continue

        sync_low_stock_alerts_for_store(store)

    def _seed_analytics(self, *, store, days: int):
        from analytics.services import (
            compute_abc_analysis,
            compute_dynamic_reorder,
            compute_credit_scores,
            compute_sales_forecast,
            detect_fraud_signals,
        )

        today = date.today()
        date_from = today - timedelta(days=max(days - 1, 1))
        date_to = today

        compute_abc_analysis(store, date_from, date_to)
        compute_dynamic_reorder(store, as_of=today)
        compute_credit_scores(store, as_of=today)
        compute_sales_forecast(store, as_of=today)
        detect_fraud_signals(store, date_from=date_from, date_to=date_to)
