"""
Management command to seed the OHADA chart of accounts (PCGO),
default journals, fiscal year, periods and accounting settings
for a given enterprise.

Usage:
    python manage.py load_pcgo <enterprise_uuid>
"""

import datetime
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from accounting.models import (
    Account,
    AccountingPeriod,
    AccountingSettings,
    FiscalYear,
    Journal,
    TaxRate,
)
from stores.models import Enterprise


# ---------------------------------------------------------------------------
# PCGO Chart of accounts (essential subset for a boutique/retail business)
# ---------------------------------------------------------------------------
# (code, name, account_type, parent_code_or_None)
PCGO_ACCOUNTS = [
    # Classe 1 — Ressources durables
    ("10", "Capital", "EQUITY", None),
    ("101", "Capital social", "EQUITY", "10"),
    ("12", "Report a nouveau", "EQUITY", None),
    ("121", "Report a nouveau crediteur", "EQUITY", "12"),
    ("129", "Report a nouveau debiteur", "EQUITY", "12"),
    ("16", "Emprunts et dettes assimilees", "LIABILITY", None),
    ("162", "Emprunts aupres des etablissements de credit", "LIABILITY", "16"),

    # Classe 2 — Actif immobilise
    ("21", "Immobilisations corporelles", "ASSET", None),
    ("213", "Constructions", "ASSET", "21"),
    ("215", "Installations et agencements", "ASSET", "21"),
    ("218", "Autres immobilisations corporelles", "ASSET", "21"),
    ("24", "Materiel", "ASSET", None),
    ("244", "Materiel et mobilier de bureau", "ASSET", "24"),
    ("245", "Materiel de transport", "ASSET", "24"),
    ("28", "Amortissements", "ASSET", None),
    ("281", "Amortissements des immobilisations corporelles", "ASSET", "28"),

    # Classe 3 — Stocks
    ("31", "Marchandises", "ASSET", None),
    ("311", "Marchandises A", "ASSET", "31"),

    # Classe 4 — Tiers
    ("40", "Fournisseurs et comptes rattaches", "LIABILITY", None),
    ("401", "Fournisseurs", "LIABILITY", "40"),
    ("41", "Clients et comptes rattaches", "ASSET", None),
    ("411", "Clients", "ASSET", "41"),
    ("42", "Personnel", "LIABILITY", None),
    ("421", "Personnel — remunerations dues", "LIABILITY", "42"),
    ("43", "Organismes sociaux", "LIABILITY", None),
    ("431", "Securite sociale", "LIABILITY", "43"),
    ("44", "Etat et collectivites publiques", "LIABILITY", None),
    ("4431", "TVA facturee sur ventes", "LIABILITY", "44"),
    ("4451", "TVA recuperable sur achats", "ASSET", "44"),
    ("4452", "TVA recuperable sur immobilisations", "ASSET", "44"),
    ("447", "Etat — impots retenus a la source", "LIABILITY", "44"),
    ("449", "Etat — credit de TVA", "ASSET", "44"),

    # Classe 5 — Tresorerie
    ("51", "Banques", "ASSET", None),
    ("521", "Banque locale", "ASSET", "51"),
    ("57", "Caisse", "ASSET", None),
    ("571", "Caisse en monnaie locale", "ASSET", "57"),
    ("58", "Virements internes", "ASSET", None),
    ("585", "Mobile Money", "ASSET", "58"),

    # Classe 6 — Charges
    ("60", "Achats", "EXPENSE", None),
    ("601", "Achats de marchandises", "EXPENSE", "60"),
    ("6031", "Variation des stocks de marchandises", "EXPENSE", "60"),
    ("604", "Achats de fournitures consommables", "EXPENSE", "60"),
    ("605", "Autres achats", "EXPENSE", "60"),
    ("61", "Transports", "EXPENSE", None),
    ("613", "Transports pour le compte de tiers", "EXPENSE", "61"),
    ("62", "Services exterieurs", "EXPENSE", None),
    ("622", "Locations et charges locatives", "EXPENSE", "62"),
    ("624", "Entretien, reparations et maintenance", "EXPENSE", "62"),
    ("625", "Primes d'assurances", "EXPENSE", "62"),
    ("626", "Etudes, recherches et documentation", "EXPENSE", "62"),
    ("628", "Frais de telecommunication", "EXPENSE", "62"),
    ("63", "Autres services exterieurs", "EXPENSE", None),
    ("631", "Frais bancaires", "EXPENSE", "63"),
    ("632", "Remunerations d'intermediaires et honoraires", "EXPENSE", "63"),
    ("633", "Frais de formation du personnel", "EXPENSE", "63"),
    ("66", "Charges de personnel", "EXPENSE", None),
    ("661", "Remunerations directes versees au personnel", "EXPENSE", "66"),
    ("664", "Charges sociales", "EXPENSE", "66"),
    ("67", "Frais financiers et charges assimilees", "EXPENSE", None),
    ("671", "Interets des emprunts", "EXPENSE", "67"),
    ("673", "Escomptes accordes", "EXPENSE", "67"),
    ("68", "Dotations aux amortissements", "EXPENSE", None),
    ("681", "Dotations aux amortissements d'exploitation", "EXPENSE", "68"),

    # Classe 7 — Produits
    ("70", "Ventes", "INCOME", None),
    ("701", "Ventes de marchandises", "INCOME", "70"),
    ("706", "Services vendus", "INCOME", "70"),
    ("707", "Produits accessoires", "INCOME", "70"),
    ("709", "Rabais, remises et ristournes accordes", "INCOME", "70"),
    ("71", "Subventions d'exploitation", "INCOME", None),
    ("73", "Variations de stocks de produits", "INCOME", None),
    ("75", "Autres produits", "INCOME", None),
    ("758", "Produits divers", "INCOME", "75"),
    ("77", "Revenus financiers et produits assimiles", "INCOME", None),
    ("773", "Escomptes obtenus", "INCOME", "77"),

    # Classe 8 — Comptes speciaux
    ("80", "Comptes de bilan d'ouverture", "EQUITY", None),
]

# Leaf accounts that accept entries (all accounts with 3+ digit codes)
LEAF_CODES = {code for code, *_ in PCGO_ACCOUNTS if len(code) >= 3}

# Default journals
DEFAULT_JOURNALS = [
    ("VE", "Journal des Ventes", "VE"),
    ("AC", "Journal des Achats", "AC"),
    ("CA", "Journal de Caisse", "CA"),
    ("BQ", "Journal de Banque", "BQ"),
    ("MM", "Journal Mobile Money", "MM"),
    ("OD", "Journal des Operations Diverses", "OD"),
    ("AN", "Journal des A-Nouveaux", "AN"),
]


class Command(BaseCommand):
    help = "Charge le plan comptable PCGO OHADA et les journaux par defaut pour une entreprise."

    def add_arguments(self, parser):
        parser.add_argument(
            "enterprise_id",
            type=str,
            help="UUID de l'entreprise cible.",
        )
        parser.add_argument(
            "--year",
            type=int,
            default=None,
            help="Annee de l'exercice fiscal a creer (defaut: annee en cours).",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        enterprise_id = options["enterprise_id"]
        year = options["year"] or datetime.date.today().year

        try:
            enterprise = Enterprise.objects.get(pk=enterprise_id)
        except Enterprise.DoesNotExist:
            raise CommandError(f"Enterprise introuvable: {enterprise_id}")

        self.stdout.write(f"Entreprise: {enterprise.name} ({enterprise.pk})")

        # 1. Accounts
        accounts_created = self._load_accounts(enterprise)
        self.stdout.write(self.style.SUCCESS(f"  Comptes: {accounts_created} crees"))

        # 2. Journals
        journals_created = self._load_journals(enterprise)
        self.stdout.write(self.style.SUCCESS(f"  Journaux: {journals_created} crees"))

        # 3. Fiscal Year + Periods
        fy, fy_created = self._load_fiscal_year(enterprise, year)
        if fy_created:
            periods_created = self._load_periods(fy)
            self.stdout.write(
                self.style.SUCCESS(
                    f"  Exercice {fy.name}: cree avec {periods_created} periodes"
                )
            )
        else:
            self.stdout.write(f"  Exercice {fy.name}: deja existant")

        # 4. Tax Rate
        tax_rate, tax_created = self._load_default_tax_rate(enterprise)
        if tax_created:
            self.stdout.write(self.style.SUCCESS(f"  Taux TVA: {tax_rate} cree"))
        else:
            self.stdout.write(f"  Taux TVA: {tax_rate} deja existant")

        # 5. Accounting Settings
        settings_created = self._load_settings(enterprise, tax_rate)
        if settings_created:
            self.stdout.write(self.style.SUCCESS("  Parametres comptables: crees"))
        else:
            self.stdout.write("  Parametres comptables: deja existants")

        self.stdout.write(self.style.SUCCESS("\nChargement PCGO termine."))

    def _load_accounts(self, enterprise):
        existing = set(
            Account.objects.filter(enterprise=enterprise).values_list("code", flat=True)
        )
        # Build parent lookup
        account_map = {}
        to_create = []

        for code, name, account_type, parent_code in PCGO_ACCOUNTS:
            if code in existing:
                obj = Account.objects.get(enterprise=enterprise, code=code)
                account_map[code] = obj
                continue
            parent = account_map.get(parent_code) if parent_code else None
            obj = Account(
                enterprise=enterprise,
                code=code,
                name=name,
                account_type=account_type,
                parent=parent,
                is_system=True,
                allow_entries=code in LEAF_CODES,
                is_active=True,
            )
            to_create.append(obj)
            account_map[code] = obj

        # Save one by one to preserve parent FK order
        created = 0
        for obj in to_create:
            if obj.parent and not obj.parent.pk:
                # Parent was also just created — ensure it's saved first
                obj.parent.save()
            obj.save()
            created += 1

        return created

    def _load_journals(self, enterprise):
        existing = set(
            Journal.objects.filter(enterprise=enterprise).values_list("code", flat=True)
        )
        created = 0
        for code, name, jtype in DEFAULT_JOURNALS:
            if code in existing:
                continue
            Journal.objects.create(
                enterprise=enterprise,
                code=code,
                name=name,
                journal_type=jtype,
                is_active=True,
            )
            created += 1
        return created

    def _load_fiscal_year(self, enterprise, year):
        start = datetime.date(year, 1, 1)
        end = datetime.date(year, 12, 31)
        name = f"Exercice {year}"

        fy, created = FiscalYear.objects.get_or_create(
            enterprise=enterprise,
            start_date=start,
            defaults={
                "name": name,
                "end_date": end,
                "status": FiscalYear.Status.OPEN,
            },
        )
        return fy, created

    def _load_periods(self, fy):
        import calendar

        created = 0
        year = fy.start_date.year

        # Period 0 — Opening
        AccountingPeriod.objects.get_or_create(
            fiscal_year=fy,
            period_number=0,
            defaults={
                "start_date": fy.start_date,
                "end_date": fy.start_date,
                "status": AccountingPeriod.Status.OPEN,
            },
        )
        created += 1

        # Periods 1-12 — Monthly
        for month in range(1, 13):
            last_day = calendar.monthrange(year, month)[1]
            AccountingPeriod.objects.get_or_create(
                fiscal_year=fy,
                period_number=month,
                defaults={
                    "start_date": datetime.date(year, month, 1),
                    "end_date": datetime.date(year, month, last_day),
                    "status": AccountingPeriod.Status.OPEN,
                },
            )
            created += 1

        # Period 13 — Closing
        AccountingPeriod.objects.get_or_create(
            fiscal_year=fy,
            period_number=13,
            defaults={
                "start_date": fy.end_date,
                "end_date": fy.end_date,
                "status": AccountingPeriod.Status.OPEN,
            },
        )
        created += 1

        return created

    def _load_default_tax_rate(self, enterprise):
        return TaxRate.objects.get_or_create(
            enterprise=enterprise,
            rate=Decimal("19.25"),
            defaults={
                "name": "TVA 19.25%",
                "is_exempt": False,
                "is_active": True,
            },
        )

    def _load_settings(self, enterprise, tax_rate):
        if AccountingSettings.objects.filter(enterprise=enterprise).exists():
            return False

        # Look up default accounts
        def _acct(code):
            try:
                return Account.objects.get(enterprise=enterprise, code=code)
            except Account.DoesNotExist:
                return None

        # Link tax rate to TVA accounts
        acct_4431 = _acct("4431")
        acct_4451 = _acct("4451")
        if acct_4431 and not tax_rate.collected_account:
            tax_rate.collected_account = acct_4431
        if acct_4451 and not tax_rate.deductible_account:
            tax_rate.deductible_account = acct_4451
        tax_rate.save()

        AccountingSettings.objects.create(
            enterprise=enterprise,
            default_sales_account=_acct("701"),
            default_purchase_account=_acct("601"),
            default_cash_account=_acct("571"),
            default_bank_account=_acct("521"),
            default_mobile_money_account=_acct("585"),
            default_customer_account=_acct("411"),
            default_supplier_account=_acct("401"),
            default_vat_collected_account=acct_4431,
            default_vat_deductible_account=acct_4451,
            default_discount_account=_acct("673"),
            default_refund_account=_acct("709"),
            default_stock_account=_acct("31"),
            default_stock_variation_account=_acct("6031"),
            default_other_income_account=_acct("706"),
            auto_post_entries=True,
            default_tax_rate=tax_rate,
        )
        return True
