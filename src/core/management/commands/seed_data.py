"""Seed database with initial data for development/demo."""
from decimal import Decimal
from django.core.management.base import BaseCommand
from django.utils.text import slugify


class Command(BaseCommand):
    help = "Seed database with enterprise, store, categories, brands, products, and users"

    DEMO_USERS = [
        {"email": "admin@boutique.cm", "first_name": "Admin", "last_name": "Systeme", "role": "ADMIN", "password": "admin123!"},
        {"email": "manager@boutique.cm", "first_name": "Marie", "last_name": "Ngo", "role": "MANAGER", "password": "manager123!"},
        {"email": "vendeur1@boutique.cm", "first_name": "Jean", "last_name": "Kamga", "role": "SALES", "password": "vendeur123!"},
        {"email": "vendeur2@boutique.cm", "first_name": "Paul", "last_name": "Tchoupo", "role": "SALES", "password": "vendeur123!"},
        {"email": "caissier@boutique.cm", "first_name": "Fatou", "last_name": "Bello", "role": "CASHIER", "password": "caissier123!"},
        {"email": "magasinier@boutique.cm", "first_name": "Ibrahim", "last_name": "Moussa", "role": "STOCKER", "password": "stock123!"},
    ]

    def add_arguments(self, parser):
        parser.add_argument("--flush", action="store_true", help="Delete existing data first")
        parser.add_argument(
            "--reset-passwords",
            action="store_true",
            help="Reset demo users passwords to default values (useful when the DB already contains these users).",
        )

    def handle(self, *args, **options):
        if options["flush"]:
            self.stdout.write("Flushing existing data...")
            self._flush()

        self.stdout.write("Seeding data...")
        enterprise = self._create_enterprise()
        store = self._create_store(enterprise)
        users = self._create_users(store, reset_passwords=options["reset_passwords"])
        categories = self._create_categories(enterprise)
        brands = self._create_brands(enterprise)
        products = self._create_products(categories, brands, enterprise, store)
        self._create_customers(enterprise, store)
        self._create_sequences(store)

        self.stdout.write(self.style.SUCCESS(
            f"Seed complete: 1 enterprise, 1 store, {len(users)} users, "
            f"{len(categories)} categories, {len(brands)} brands, "
            f"{len(products)} products"
        ))

    def _flush(self):
        from sales.models import Sale, SaleItem, Refund
        from cashier.models import Payment, CashShift
        from stock.models import ProductStock, InventoryMovement
        from catalog.models import Product, Category, Brand
        from customers.models import Customer
        from credits.models import CustomerAccount, CreditLedgerEntry
        from stores.models import Store, StoreUser, AuditLog, Sequence, Enterprise
        from alerts.models import Alert
        from accounts.models import User

        for model in [CreditLedgerEntry, CustomerAccount, Payment, Refund,
                      SaleItem, Sale, CashShift, InventoryMovement, ProductStock,
                      Product, Category, Brand, Customer, Alert, AuditLog,
                      Sequence, StoreUser, Store, Enterprise]:
            model.objects.all().delete()

        # Delete demo users (including the demo admin superuser) so that the
        # next seed run recreates them with known credentials.
        demo_emails = [u["email"] for u in self.DEMO_USERS]
        User.objects.filter(email__in=demo_emails).delete()
        # Also clear any remaining non-superusers to keep the dev DB consistent.
        User.objects.filter(is_superuser=False).delete()

    def _create_enterprise(self):
        from stores.models import Enterprise
        enterprise, created = Enterprise.objects.get_or_create(
            code="ENT-001",
            defaults={
                "name": "TechShop Cameroun",
                "legal_name": "TechShop SARL",
                "registration_number": "RC/DLA/2024/B/1234",
                "tax_id": "M012400012345A",
                "currency": "FCFA",
                "vat_enabled": True,
                "vat_rate": Decimal("19.25"),
                "email": "contact@techshop.cm",
                "phone": "+237 233 000 000",
                "website": "https://techshop.cm",
            }
        )
        if created:
            self.stdout.write(f"  Enterprise: {enterprise.name}")
        return enterprise

    def _create_store(self, enterprise):
        from stores.models import Store
        store, created = Store.objects.get_or_create(
            code="BQ-001",
            defaults={
                "enterprise": enterprise,
                "name": "Boutique Centrale",
                "address": "123 Avenue de la Republique, Douala",
                "phone": "+237 6XX XXX XXX",
                "email": "contact@boutique-centrale.cm",
                "currency": "FCFA",
            }
        )
        if not created and store.enterprise_id is None:
            store.enterprise = enterprise
            store.save(update_fields=["enterprise", "updated_at"])
        if created:
            self.stdout.write(f"  Store: {store.name}")
        return store

    def _create_users(self, store, *, reset_passwords: bool = False):
        from accounts.models import User
        from stores.models import StoreUser

        created_users = []
        for ud in self.DEMO_USERS:
            is_admin = ud["role"] == "ADMIN"
            user, created = User.objects.get_or_create(
                email=ud["email"],
                defaults={
                    "first_name": ud["first_name"],
                    "last_name": ud["last_name"],
                    "role": ud["role"],
                    "is_staff": is_admin,
                    "is_superuser": is_admin,
                }
            )

            # Keep demo users in a consistent, known state for local/dev usage.
            # Password reset is opt-in to avoid surprising overwrites on existing DBs.
            changed_fields = []
            for field, expected in [
                ("first_name", ud["first_name"]),
                ("last_name", ud["last_name"]),
                ("role", ud["role"]),
                ("is_staff", is_admin),
                ("is_superuser", is_admin),
                ("is_active", True),
            ]:
                if getattr(user, field) != expected:
                    setattr(user, field, expected)
                    changed_fields.append(field)

            if created or reset_passwords:
                user.set_password(ud["password"])
                changed_fields.append("password")

            if created or changed_fields:
                user.save()
                if created:
                    self.stdout.write(f"  User: {user.email} ({user.role})")
                elif reset_passwords:
                    self.stdout.write(f"  User updated: {user.email} ({', '.join(sorted(set(changed_fields)))})")

            StoreUser.objects.get_or_create(
                store=store, user=user,
                defaults={"is_default": True}
            )
            created_users.append(user)

        return created_users

    def _create_categories(self, enterprise):
        from catalog.models import Category

        categories_data = [
            {"name": "Equipements Reseau", "children": [
                "Routeurs", "Switches", "Points d'acces WiFi", "Modems", "Firewalls",
            ]},
            {"name": "Cablage & Connectique", "children": [
                "Cables Ethernet", "Cables Fibre Optique", "Connecteurs RJ45", "Baies & Racks", "Patch Panels",
            ]},
            {"name": "Ordinateurs & Peripheriques", "children": [
                "Laptops", "Desktops", "Moniteurs", "Claviers & Souris", "Imprimantes",
            ]},
            {"name": "Surveillance & Securite", "children": [
                "Cameras IP", "NVR/DVR", "Accessoires Videosurveillance",
            ]},
            {"name": "Energie & Protection", "children": [
                "Onduleurs (UPS)", "Parasurtenseurs", "Batteries",
            ]},
            {"name": "Stockage & Serveurs", "children": [
                "Disques Durs", "SSD", "NAS", "Serveurs",
            ]},
            {"name": "Telephonie", "children": [
                "Telephones IP", "Standards telephoniques", "Casques",
            ]},
        ]

        created = []
        for cat_data in categories_data:
            parent, _ = Category.objects.get_or_create(
                enterprise=enterprise,
                name=cat_data["name"],
                defaults={"slug": slugify(cat_data["name"])}
            )
            created.append(parent)
            for child_name in cat_data.get("children", []):
                child, _ = Category.objects.get_or_create(
                    enterprise=enterprise,
                    name=child_name,
                    parent=parent,
                    defaults={"slug": slugify(child_name)}
                )
                created.append(child)

        self.stdout.write(f"  Categories: {len(created)}")
        return created

    def _create_brands(self, enterprise):
        from catalog.models import Brand

        brand_names = [
            "Cisco", "MikroTik", "TP-Link", "Ubiquiti", "Netgear",
            "HP", "Dell", "Lenovo", "Samsung", "Hikvision",
            "Dahua", "APC", "D-Link", "Huawei", "Tenda",
        ]

        brands = []
        for name in brand_names:
            brand, _ = Brand.objects.get_or_create(
                enterprise=enterprise,
                name=name,
                defaults={"slug": slugify(name)}
            )
            brands.append(brand)

        self.stdout.write(f"  Brands: {len(brands)}")
        return brands

    def _create_products(self, categories, brands, enterprise, store):
        from catalog.models import Product, Category, Brand
        from stock.models import ProductStock

        products_data = [
            {"name": "Routeur Cisco ISR 1100", "sku": "CISCO-ISR1100", "barcode": "7891234000001", "category": "Routeurs", "brand": "Cisco", "cost": 350000, "sell": 485000, "stock": 8},
            {"name": "Switch Cisco SG350-28", "sku": "CISCO-SG350", "barcode": "7891234000002", "category": "Switches", "brand": "Cisco", "cost": 280000, "sell": 390000, "stock": 12},
            {"name": "MikroTik hAP ac3", "sku": "MT-HAPAC3", "barcode": "7891234000003", "category": "Points d'acces WiFi", "brand": "MikroTik", "cost": 45000, "sell": 72000, "stock": 25},
            {"name": "MikroTik CCR2004-1G-12S+2XS", "sku": "MT-CCR2004", "barcode": "7891234000004", "category": "Routeurs", "brand": "MikroTik", "cost": 420000, "sell": 580000, "stock": 5},
            {"name": "TP-Link Archer AX50", "sku": "TPL-AX50", "barcode": "7891234000005", "category": "Routeurs", "brand": "TP-Link", "cost": 38000, "sell": 55000, "stock": 30},
            {"name": "Switch TP-Link TL-SG108", "sku": "TPL-SG108", "barcode": "7891234000006", "category": "Switches", "brand": "TP-Link", "cost": 15000, "sell": 25000, "stock": 50},
            {"name": "Ubiquiti UniFi AP AC Pro", "sku": "UBI-UAPACPRO", "barcode": "7891234000007", "category": "Points d'acces WiFi", "brand": "Ubiquiti", "cost": 95000, "sell": 145000, "stock": 15},
            {"name": "Ubiquiti EdgeRouter X", "sku": "UBI-ERX", "barcode": "7891234000008", "category": "Routeurs", "brand": "Ubiquiti", "cost": 32000, "sell": 52000, "stock": 20},
            {"name": "Cable Ethernet Cat6 (305m)", "sku": "CAB-CAT6-305", "barcode": "7891234000009", "category": "Cables Ethernet", "brand": "D-Link", "cost": 35000, "sell": 55000, "stock": 40},
            {"name": "Connecteurs RJ45 Cat6 (100pcs)", "sku": "RJ45-CAT6-100", "barcode": "7891234000010", "category": "Connecteurs RJ45", "brand": "D-Link", "cost": 8000, "sell": 15000, "stock": 100},
            {"name": "Patch Panel 24 ports Cat6", "sku": "PP-24-CAT6", "barcode": "7891234000011", "category": "Patch Panels", "brand": "D-Link", "cost": 22000, "sell": 38000, "stock": 15},
            {"name": "Baie serveur 42U", "sku": "RACK-42U", "barcode": "7891234000012", "category": "Baies & Racks", "brand": "APC", "cost": 280000, "sell": 420000, "stock": 3},
            {"name": "HP ProBook 450 G10", "sku": "HP-PB450G10", "barcode": "7891234000013", "category": "Laptops", "brand": "HP", "cost": 380000, "sell": 520000, "stock": 10},
            {"name": "Dell OptiPlex 7010 SFF", "sku": "DELL-OPT7010", "barcode": "7891234000014", "category": "Desktops", "brand": "Dell", "cost": 320000, "sell": 450000, "stock": 7},
            {"name": "Lenovo ThinkPad E14 Gen 5", "sku": "LEN-TPE14G5", "barcode": "7891234000015", "category": "Laptops", "brand": "Lenovo", "cost": 420000, "sell": 580000, "stock": 8},
            {"name": "Moniteur Samsung 24\" FHD", "sku": "SAM-MON24FHD", "barcode": "7891234000016", "category": "Moniteurs", "brand": "Samsung", "cost": 85000, "sell": 130000, "stock": 20},
            {"name": "Hikvision DS-2CD2143G2-I", "sku": "HIK-2CD2143", "barcode": "7891234000017", "category": "Cameras IP", "brand": "Hikvision", "cost": 55000, "sell": 85000, "stock": 30},
            {"name": "Hikvision NVR 8 canaux", "sku": "HIK-NVR8CH", "barcode": "7891234000018", "category": "NVR/DVR", "brand": "Hikvision", "cost": 120000, "sell": 185000, "stock": 8},
            {"name": "Dahua IPC-HFW2431S", "sku": "DH-HFW2431", "barcode": "7891234000019", "category": "Cameras IP", "brand": "Dahua", "cost": 42000, "sell": 68000, "stock": 25},
            {"name": "APC Smart-UPS 1500VA", "sku": "APC-SMT1500", "barcode": "7891234000020", "category": "Onduleurs (UPS)", "brand": "APC", "cost": 180000, "sell": 265000, "stock": 10},
            {"name": "APC Back-UPS 650VA", "sku": "APC-BK650", "barcode": "7891234000021", "category": "Onduleurs (UPS)", "brand": "APC", "cost": 42000, "sell": 65000, "stock": 35},
            {"name": "Parasurtenseur APC 8 prises", "sku": "APC-SURGE8", "barcode": "7891234000022", "category": "Parasurtenseurs", "brand": "APC", "cost": 12000, "sell": 22000, "stock": 50},
            {"name": "Samsung SSD 870 EVO 1TB", "sku": "SAM-SSD870-1T", "barcode": "7891234000023", "category": "SSD", "brand": "Samsung", "cost": 52000, "sell": 78000, "stock": 20},
            {"name": "WD Purple 4TB (Surveillance)", "sku": "WD-PURP4TB", "barcode": "7891234000024", "category": "Disques Durs", "brand": "HP", "cost": 65000, "sell": 95000, "stock": 15},
            {"name": "Netgear ReadyNAS 2-Bay", "sku": "NET-RN2BAY", "barcode": "7891234000025", "category": "NAS", "brand": "Netgear", "cost": 195000, "sell": 285000, "stock": 4},
            {"name": "Fibre Optique Monomode 500m", "sku": "FO-SM-500M", "barcode": "7891234000026", "category": "Cables Fibre Optique", "brand": "D-Link", "cost": 45000, "sell": 72000, "stock": 10},
            {"name": "Huawei EchoLife HG8245H", "sku": "HW-HG8245H", "barcode": "7891234000027", "category": "Modems", "brand": "Huawei", "cost": 18000, "sell": 32000, "stock": 40},
            {"name": "Tenda AC1200 WiFi Router", "sku": "TEN-AC1200", "barcode": "7891234000028", "category": "Routeurs", "brand": "Tenda", "cost": 15000, "sell": 28000, "stock": 35},
            {"name": "Dell PowerEdge T150", "sku": "DELL-PE-T150", "barcode": "7891234000029", "category": "Serveurs", "brand": "Dell", "cost": 850000, "sell": 1150000, "stock": 2},
            {"name": "Imprimante HP LaserJet Pro M404n", "sku": "HP-LJP-M404", "barcode": "7891234000030", "category": "Imprimantes", "brand": "HP", "cost": 180000, "sell": 265000, "stock": 6},
        ]

        products = []
        for pd in products_data:
            cat = Category.objects.filter(enterprise=enterprise, name=pd["category"]).first()
            brand = Brand.objects.filter(enterprise=enterprise, name=pd["brand"]).first()
            product, created = Product.objects.get_or_create(
                enterprise=enterprise,
                sku=pd["sku"],
                defaults={
                    "name": pd["name"],
                    "slug": slugify(pd["name"]),
                    "barcode": pd["barcode"],
                    "category": cat,
                    "brand": brand,
                    "cost_price": Decimal(str(pd["cost"])),
                    "selling_price": Decimal(str(pd["sell"])),
                }
            )
            # Ensure a stock record exists even if the product already existed
            # (e.g. persistent DB volumes where ProductStock was wiped).
            ProductStock.objects.get_or_create(
                store=store,
                product=product,
                defaults={
                    "quantity": int(pd["stock"]),
                    "min_qty": max(3, int(pd["stock"]) // 5),
                },
            )
            products.append(product)

        self.stdout.write(f"  Products: {len(products)}")
        return products

    def _create_customers(self, enterprise, store):
        from customers.models import Customer
        from credits.models import CustomerAccount

        # Ensure default walk-in customer exists for POS flows.
        try:
            from customers.services import get_or_create_default_customer
            get_or_create_default_customer(enterprise=enterprise)
        except Exception:
            pass

        customers_data = [
            {"first_name": "Entreprise", "last_name": "TechCorp", "phone": "+237 677 000 001", "company": "TechCorp SARL", "email": "info@techcorp.cm", "credit_limit": 2000000},
            {"first_name": "Pierre", "last_name": "Essomba", "phone": "+237 677 000 002", "email": "pessomba@email.cm", "credit_limit": 500000},
            {"first_name": "Amina", "last_name": "Djoulde", "phone": "+237 677 000 003", "email": "", "credit_limit": 300000},
            {"first_name": "Bureau", "last_name": "MINPOSTEL", "phone": "+237 677 000 004", "company": "MINPOSTEL", "email": "achats@minpostel.cm", "credit_limit": 5000000},
            {"first_name": "Joseph", "last_name": "Nkoudou", "phone": "+237 677 000 005", "email": "", "credit_limit": 0},
        ]

        for cd in customers_data:
            credit_limit = cd.pop("credit_limit", 0)
            customer, created = Customer.objects.get_or_create(
                enterprise=enterprise,
                phone=cd["phone"],
                defaults=cd
            )
            # Ensure a credit account exists even if the customer already existed
            # (e.g. persistent DB volumes where CustomerAccount was wiped).
            if credit_limit > 0:
                account, _ = CustomerAccount.objects.get_or_create(
                    store=store,
                    customer=customer,
                    defaults={"credit_limit": Decimal(str(credit_limit))},
                )
                desired = Decimal(str(credit_limit))
                if account.credit_limit != desired:
                    account.credit_limit = desired
                    account.save(update_fields=["credit_limit", "updated_at"])

        self.stdout.write(f"  Customers: {len(customers_data)}")

    def _create_sequences(self, store):
        from stores.models import Sequence

        Sequence.objects.get_or_create(
            store=store, prefix="FAC",
            defaults={"next_number": 1}
        )
        Sequence.objects.get_or_create(
            store=store, prefix="AV",
            defaults={"next_number": 1}
        )
        self.stdout.write("  Sequences: FAC, AV")
