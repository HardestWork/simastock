# Conformite SYSCOHADA — Architecture Module Comptabilite

> Document technique de reference pour l'ajout d'un module comptable conforme
> au SYSCOHADA (revise 2017) au Systeme de Gestion Commerciale.
> Version : Mars 2026

---

## Table des matieres

- [A. Exigences SYSCOHADA traduites en fonctionnalites](#a-exigences-syscohada)
- [B. Architecture fonctionnelle — Modules et flux](#b-architecture-fonctionnelle)
- [C. Schema base de donnees](#c-schema-base-de-donnees)
- [D. Regles d'ecritures automatiques (mapping)](#d-regles-decritures-automatiques)
- [E. Checklist conformite et tests](#e-checklist-conformite)
- [F. Recommandations UX](#f-recommandations-ux)
- [G. Roadmap de mise en conformite](#g-roadmap)

---

## A. Exigences SYSCOHADA

### A.1 Plan comptable (PCGO)

| Exigence SYSCOHADA | Fonctionnalite SaaS |
|---|---|
| Plan Comptable General OHADA obligatoire | Table `chart_of_accounts` avec arborescence de comptes normalisee |
| Classes 1-8 + classe 9 (analytique) | 8 classes imposees + analytique optionnelle par magasin |
| Comptes parametrables par entreprise | Chaque Enterprise a son propre plan comptable, pre-rempli depuis un template PCGO |
| Sous-comptes illimites | Hierarchie parent/enfant sans limite de profondeur |
| Comptes auxiliaires (clients/fournisseurs) | Comptes 411xxx / 401xxx lies automatiquement aux tiers |

**Classes PCGO obligatoires :**

| Classe | Intitule | Exemples de comptes |
|--------|----------|---------------------|
| 1 | Ressources durables | 10 Capital, 12 Report a nouveau, 16 Emprunts |
| 2 | Actif immobilise | 21 Immobilisations corporelles, 28 Amortissements |
| 3 | Stocks | 31 Marchandises, 37 Stocks de produits |
| 4 | Tiers | 401 Fournisseurs, 411 Clients, 421 Personnel, 443 TVA |
| 5 | Tresorerie | 512 Banque, 571 Caisse, 585 Mobile money |
| 6 | Charges | 601 Achats, 604 Services, 64 Charges personnel |
| 7 | Produits | 701 Ventes marchandises, 706 Services |
| 8 | Comptes speciaux | 80 Engagements hors bilan |

### A.2 Journaux obligatoires

| Journal | Code | Description |
|---------|------|-------------|
| Journal des ventes | VE | Toutes les factures de vente |
| Journal des achats | AC | Toutes les factures fournisseurs |
| Journal de caisse | CA | Mouvements especes |
| Journal de banque | BQ | Mouvements bancaires |
| Journal mobile money | MM | Mouvements mobile money |
| Journal des operations diverses | OD | Salaires, provisions, regularisations, corrections |
| Journal des a-nouveaux | AN | Ouverture d'exercice |

### A.3 Inaltirabilite et tracabilite

| Exigence | Implementation |
|----------|---------------|
| Numerotation continue et ininterrompue | Sequence par journal+exercice, contrainte DB `UNIQUE(journal, fiscal_year, sequence_number)` |
| Interdiction de suppression | Pas de `DELETE` sur ecritures validees, seulement contre-passation |
| Interdiction de modification post-validation | Statut `DRAFT` → `VALIDATED` → `POSTED`, verrouillage apres validation |
| Piste d'audit complete | Chaque ecriture stocke : auteur, date creation, date validation, IP, source |
| Clôture de periode irrevocable | Flag `is_closed` sur Period, interdit toute ecriture dans une periode close |
| Pieces justificatives | Lien `attachments` vers les documents (factures, recus) |

### A.4 TVA SYSCOHADA

| Exigence | Implementation |
|----------|---------------|
| TVA collectee (ventes) | Compte 4431 "TVA facturee sur ventes" |
| TVA deductible (achats) | Compte 4451 "TVA recuperable sur achats" |
| Multi-taux | Table `tax_rates` avec taux parametrables (19.25%, 0%, exonere) |
| Declaration periodique | Extraction : TVA collectee - TVA deductible = TVA a reverser |
| Exonerations | Flag `is_exempt` sur le taux, pas de calcul de TVA |

### A.5 Etats financiers obligatoires

| Etat | Phase | Description |
|------|-------|-------------|
| Balance generale | P1 | Soldes debit/credit de tous les comptes |
| Grand livre | P1 | Detail de toutes les ecritures par compte |
| Journal centralise | P1 | Toutes les ecritures dans l'ordre chronologique |
| Bilan | P2 | Actif / Passif a la date de cloture |
| Compte de resultat | P2 | Charges / Produits sur l'exercice |
| TAFIRE | P2 | Tableau Financier des Ressources et Emplois |
| Annexes | P2 | Notes explicatives |

### A.6 Exercice et periodes

| Exigence | Implementation |
|----------|---------------|
| Exercice de 12 mois | Table `fiscal_years` avec dates debut/fin |
| Periodes mensuelles | Table `accounting_periods` (12 periodes + 1 ouverture + 1 cloture) |
| Cloture mensuelle | Verrouillage de la periode, balance de controle |
| Cloture annuelle | Generation ecritures de solde, report a nouveau |

---

## B. Architecture fonctionnelle

### B.1 Nouveau module : `accounting`

```
src/accounting/
  models.py          # Modeles comptables (plan, journaux, ecritures, periodes)
  services.py        # Moteur d'ecritures automatiques
  engine.py          # Mappings operationnels → ecritures
  reports.py         # Generation balance, grand livre, journal
  admin.py           # Admin Django
  migrations/
```

### B.2 Diagramme des flux

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   POS/Vente  │     │   Achats     │     │  Depenses    │
│  (sales)     │     │ (purchases)  │     │ (expenses)   │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────┐
│              accounting.services                        │
│  post_sale_entry()    post_purchase_entry()              │
│  post_payment_entry() post_expense_entry()               │
│  post_refund_entry()  post_credit_payment_entry()        │
├─────────────────────────────────────────────────────────┤
│  Validation : equilibre D/C, periode ouverte, sequence  │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│              Base de donnees comptable                   │
│  journal_entries + journal_entry_lines                   │
│  chart_of_accounts + fiscal_years + periods             │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│              Etats financiers                           │
│  Balance | Grand Livre | Journal | Bilan | CR | TAFIRE  │
└─────────────────────────────────────────────────────────┘
```

### B.3 Principe multi-magasins

| Niveau | Scope |
|--------|-------|
| Plan comptable | Par entreprise (un seul plan pour toute l'entreprise) |
| Journaux | Par entreprise (journaux partages) |
| Ecritures | Par entreprise, avec champ `store` optionnel pour ventilation analytique |
| Exercices/Periodes | Par entreprise |
| Etats financiers | Par entreprise (consolide) ou filtre par magasin (analytique) |

### B.4 Parametres comptables par entreprise

```
AccountingSettings (1:1 avec Enterprise)
├── default_sales_account        (701)
├── default_purchase_account     (601)
├── default_cash_account         (571)
├── default_bank_account         (512)
├── default_mobile_money_account (585)
├── default_customer_account     (411)
├── default_supplier_account     (401)
├── default_vat_collected        (4431)
├── default_vat_deductible       (4451)
├── default_discount_given       (673)
├── default_discount_received    (773)
├── default_refund_account       (709)
├── default_expense_accounts     (mapping categorie → compte)
├── auto_post_entries            (bool: poster auto ou garder en brouillon)
└── entry_numbering_mode         (par journal ou global)
```

---

## C. Schema base de donnees

### C.1 Table `chart_of_accounts`

```python
class Account(models.Model):
    """Plan comptable OHADA — comptes parametrables par entreprise."""

    class AccountType(models.TextChoices):
        ASSET = "ASSET", "Actif"
        LIABILITY = "LIABILITY", "Passif"
        EQUITY = "EQUITY", "Capitaux propres"
        INCOME = "INCOME", "Produit"
        EXPENSE = "EXPENSE", "Charge"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    enterprise = models.ForeignKey("stores.Enterprise", on_delete=models.CASCADE,
                                   related_name="accounts")
    code = models.CharField("numero de compte", max_length=20, db_index=True)
    name = models.CharField("intitule", max_length=255)
    account_type = models.CharField(max_length=20, choices=AccountType.choices)
    parent = models.ForeignKey("self", on_delete=models.CASCADE, null=True,
                               blank=True, related_name="children")
    is_active = models.BooleanField(default=True)
    is_system = models.BooleanField(default=False)  # Comptes non-supprimables
    allow_entries = models.BooleanField(default=True)  # False pour comptes de regroupement
    notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["enterprise", "code"],
                                    name="uq_account_enterprise_code"),
        ]
        ordering = ["code"]
        indexes = [
            models.Index(fields=["enterprise", "account_type"]),
        ]
```

### C.2 Table `journals`

```python
class Journal(models.Model):
    """Journaux comptables obligatoires SYSCOHADA."""

    class JournalType(models.TextChoices):
        SALES = "VE", "Ventes"
        PURCHASES = "AC", "Achats"
        CASH = "CA", "Caisse"
        BANK = "BQ", "Banque"
        MOBILE = "MM", "Mobile Money"
        MISCELLANEOUS = "OD", "Operations diverses"
        OPENING = "AN", "A-nouveaux"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    enterprise = models.ForeignKey("stores.Enterprise", on_delete=models.CASCADE,
                                   related_name="journals")
    code = models.CharField("code journal", max_length=10)
    name = models.CharField("intitule", max_length=100)
    journal_type = models.CharField(max_length=5, choices=JournalType.choices)
    default_debit_account = models.ForeignKey(Account, on_delete=models.SET_NULL,
                                              null=True, blank=True, related_name="+")
    default_credit_account = models.ForeignKey(Account, on_delete=models.SET_NULL,
                                               null=True, blank=True, related_name="+")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["enterprise", "code"],
                                    name="uq_journal_enterprise_code"),
        ]
```

### C.3 Table `fiscal_years`

```python
class FiscalYear(models.Model):
    """Exercice comptable (12 mois en principe)."""

    class Status(models.TextChoices):
        OPEN = "OPEN", "Ouvert"
        CLOSED = "CLOSED", "Cloture"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    enterprise = models.ForeignKey("stores.Enterprise", on_delete=models.CASCADE,
                                   related_name="fiscal_years")
    name = models.CharField(max_length=50)  # ex: "Exercice 2026"
    start_date = models.DateField()
    end_date = models.DateField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.OPEN)
    closed_at = models.DateTimeField(null=True, blank=True)
    closed_by = models.ForeignKey("accounts.User", on_delete=models.SET_NULL,
                                  null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["enterprise", "name"],
                                    name="uq_fiscal_year_name"),
        ]
        ordering = ["-start_date"]
```

### C.4 Table `accounting_periods`

```python
class AccountingPeriod(models.Model):
    """Periode comptable mensuelle au sein d'un exercice."""

    class Status(models.TextChoices):
        OPEN = "OPEN", "Ouverte"
        CLOSED = "CLOSED", "Cloturee"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    fiscal_year = models.ForeignKey(FiscalYear, on_delete=models.CASCADE,
                                    related_name="periods")
    name = models.CharField(max_length=50)  # ex: "Janvier 2026"
    start_date = models.DateField()
    end_date = models.DateField()
    period_number = models.PositiveSmallIntegerField()  # 0=ouverture, 1-12=mois, 13=cloture
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.OPEN)
    closed_at = models.DateTimeField(null=True, blank=True)
    closed_by = models.ForeignKey("accounts.User", on_delete=models.SET_NULL,
                                  null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["fiscal_year", "period_number"],
                                    name="uq_period_number"),
        ]
        ordering = ["period_number"]
```

### C.5 Table `journal_entries` (ecritures)

```python
class JournalEntry(models.Model):
    """Piece comptable — en-tete d'ecriture."""

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Brouillon"
        VALIDATED = "VALIDATED", "Validee"
        POSTED = "POSTED", "Postee"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    enterprise = models.ForeignKey("stores.Enterprise", on_delete=models.CASCADE,
                                   related_name="journal_entries")
    journal = models.ForeignKey(Journal, on_delete=models.PROTECT,
                                related_name="entries")
    fiscal_year = models.ForeignKey(FiscalYear, on_delete=models.PROTECT,
                                    related_name="entries")
    period = models.ForeignKey(AccountingPeriod, on_delete=models.PROTECT,
                               related_name="entries")
    sequence_number = models.PositiveIntegerField()
    entry_date = models.DateField("date de l'ecriture", db_index=True)
    label = models.CharField("libelle", max_length=255)
    reference = models.CharField("reference piece", max_length=100, blank=True, default="")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)

    # Lien vers l'operation source (polymorphe via GenericForeignKey ou champs optionnels)
    source_type = models.CharField("type source", max_length=50, blank=True, default="")
    source_id = models.UUIDField("ID source", null=True, blank=True)

    # Ventilation analytique optionnelle
    store = models.ForeignKey("stores.Store", on_delete=models.SET_NULL, null=True,
                              blank=True, related_name="journal_entries")

    # Audit
    created_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT,
                                   related_name="journal_entries_created")
    validated_by = models.ForeignKey("accounts.User", on_delete=models.SET_NULL,
                                    null=True, blank=True,
                                    related_name="journal_entries_validated")
    validated_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Contre-passation
    is_reversal = models.BooleanField(default=False)
    reversed_entry = models.ForeignKey("self", on_delete=models.SET_NULL, null=True,
                                       blank=True, related_name="reversal_entries")

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["journal", "fiscal_year", "sequence_number"],
                name="uq_entry_sequence",
            ),
        ]
        indexes = [
            models.Index(fields=["enterprise", "entry_date"]),
            models.Index(fields=["journal", "entry_date"]),
            models.Index(fields=["source_type", "source_id"]),
        ]
        ordering = ["entry_date", "sequence_number"]
```

### C.6 Table `journal_entry_lines` (lignes d'ecriture)

```python
class JournalEntryLine(models.Model):
    """Ligne d'ecriture comptable — debit ou credit."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    entry = models.ForeignKey(JournalEntry, on_delete=models.CASCADE,
                              related_name="lines")
    account = models.ForeignKey(Account, on_delete=models.PROTECT,
                                related_name="entry_lines")
    label = models.CharField("libelle ligne", max_length=255, blank=True, default="")
    debit = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    credit = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    # Lettrage tiers
    partner_type = models.CharField(max_length=20, blank=True, default="")
    partner_id = models.UUIDField(null=True, blank=True)  # Customer.id ou Supplier.id
    reconciliation_code = models.CharField("code lettrage", max_length=20,
                                           blank=True, default="", db_index=True)
    reconciled_at = models.DateTimeField(null=True, blank=True)

    # Analytique
    store = models.ForeignKey("stores.Store", on_delete=models.SET_NULL, null=True,
                              blank=True, related_name="entry_lines")

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["account", "entry"]),
            models.Index(fields=["partner_type", "partner_id"]),
            models.Index(fields=["reconciliation_code"]),
        ]

    def clean(self):
        if self.debit and self.credit:
            raise ValidationError("Une ligne ne peut pas avoir debit ET credit.")
        if not self.debit and not self.credit:
            raise ValidationError("Une ligne doit avoir un debit OU un credit.")
```

### C.7 Table `tax_rates`

```python
class TaxRate(models.Model):
    """Taux de TVA parametrable par entreprise."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    enterprise = models.ForeignKey("stores.Enterprise", on_delete=models.CASCADE,
                                   related_name="tax_rates")
    name = models.CharField(max_length=100)  # ex: "TVA 19.25%", "Exonere"
    rate = models.DecimalField(max_digits=5, decimal_places=2)  # 19.25, 0.00
    is_exempt = models.BooleanField(default=False)
    collected_account = models.ForeignKey(Account, on_delete=models.PROTECT,
                                         related_name="+", null=True, blank=True)
    deductible_account = models.ForeignKey(Account, on_delete=models.PROTECT,
                                          related_name="+", null=True, blank=True)
    is_default = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["enterprise", "name"],
                                    name="uq_tax_rate_name"),
        ]
```

### C.8 Table `accounting_settings`

```python
class AccountingSettings(models.Model):
    """Parametres comptables par defaut pour une entreprise."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    enterprise = models.OneToOneField("stores.Enterprise", on_delete=models.CASCADE,
                                     related_name="accounting_settings")

    # Comptes par defaut
    sales_account = models.ForeignKey(Account, on_delete=models.PROTECT,
                                      related_name="+", null=True, blank=True)
    purchase_account = models.ForeignKey(Account, on_delete=models.PROTECT,
                                        related_name="+", null=True, blank=True)
    cash_account = models.ForeignKey(Account, on_delete=models.PROTECT,
                                    related_name="+", null=True, blank=True)
    bank_account = models.ForeignKey(Account, on_delete=models.PROTECT,
                                    related_name="+", null=True, blank=True)
    mobile_money_account = models.ForeignKey(Account, on_delete=models.PROTECT,
                                            related_name="+", null=True, blank=True)
    customer_account = models.ForeignKey(Account, on_delete=models.PROTECT,
                                        related_name="+", null=True, blank=True)
    supplier_account = models.ForeignKey(Account, on_delete=models.PROTECT,
                                        related_name="+", null=True, blank=True)
    vat_collected_account = models.ForeignKey(Account, on_delete=models.PROTECT,
                                             related_name="+", null=True, blank=True)
    vat_deductible_account = models.ForeignKey(Account, on_delete=models.PROTECT,
                                              related_name="+", null=True, blank=True)
    discount_granted_account = models.ForeignKey(Account, on_delete=models.PROTECT,
                                                related_name="+", null=True, blank=True)
    refund_account = models.ForeignKey(Account, on_delete=models.PROTECT,
                                      related_name="+", null=True, blank=True)
    stock_account = models.ForeignKey(Account, on_delete=models.PROTECT,
                                     related_name="+", null=True, blank=True)
    stock_variation_account = models.ForeignKey(Account, on_delete=models.PROTECT,
                                               related_name="+", null=True, blank=True)

    # Comportement
    auto_post_entries = models.BooleanField(default=True)
    default_tax_rate = models.ForeignKey(TaxRate, on_delete=models.SET_NULL,
                                        null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
```

### C.9 Contraintes DB critiques

```sql
-- 1. Equilibre debit/credit obligatoire par ecriture
ALTER TABLE journal_entries ADD CONSTRAINT ck_entry_balanced
CHECK (
  (SELECT COALESCE(SUM(debit), 0) FROM journal_entry_lines WHERE entry_id = id) =
  (SELECT COALESCE(SUM(credit), 0) FROM journal_entry_lines WHERE entry_id = id)
);
-- Note: implemente via validation Django (service layer) car CHECK sur sous-requete
-- non supporte par PostgreSQL. Trigger ou contrainte applicative.

-- 2. Pas d'ecriture dans une periode close
-- Implemente via service layer : verifier period.status == OPEN avant insert.

-- 3. Pas de modification d'ecriture validee
-- Implemente via service layer : si status != DRAFT, reject update.

-- 4. Sequence continue par journal+exercice
CREATE UNIQUE INDEX uq_entry_seq ON accounting_journalentry(journal_id, fiscal_year_id, sequence_number);
```

### C.10 Diagramme relationnel

```
Enterprise
  ├── Account (plan comptable)
  ├── Journal
  ├── FiscalYear
  │     └── AccountingPeriod
  ├── TaxRate
  ├── AccountingSettings (1:1)
  └── JournalEntry
        ├── journal → Journal
        ├── fiscal_year → FiscalYear
        ├── period → AccountingPeriod
        ├── store → Store (analytique)
        └── JournalEntryLine[]
              ├── account → Account
              ├── partner_id → Customer | Supplier
              └── reconciliation_code (lettrage)
```

---

## D. Regles d'ecritures automatiques

### D.1 Vente payee en especes (avec TVA 19.25%)

**Scenario** : Vente de 100 000 FCFA HT, TVA 19.25%

| Etape | Journal | Compte | Libelle | Debit | Credit |
|-------|---------|--------|---------|-------|--------|
| Facture | VE | 411000 Clients | Vente FAC-001 - Client X | 119 250 | |
| | VE | 701000 Ventes marchandises | Vente FAC-001 | | 100 000 |
| | VE | 443100 TVA collectee | TVA FAC-001 19.25% | | 19 250 |
| Encaissement | CA | 571000 Caisse | Reglement FAC-001 especes | 119 250 | |
| | CA | 411000 Clients | Reglement FAC-001 | | 119 250 |

**Si paiement immediat (vente comptoir)** — ecriture simplifiee :

| Journal | Compte | Libelle | Debit | Credit |
|---------|--------|---------|-------|--------|
| CA | 571000 Caisse | Vente FAC-001 especes | 119 250 | |
| CA | 701000 Ventes marchandises | Vente FAC-001 | | 100 000 |
| CA | 443100 TVA collectee | TVA FAC-001 | | 19 250 |

### D.2 Vente payee par mobile money

| Journal | Compte | Libelle | Debit | Credit |
|---------|--------|---------|-------|--------|
| MM | 585000 Mobile Money | Vente FAC-002 MoMo | 119 250 | |
| MM | 701000 Ventes marchandises | Vente FAC-002 | | 100 000 |
| MM | 443100 TVA collectee | TVA FAC-002 | | 19 250 |

### D.3 Vente payee par virement bancaire

| Journal | Compte | Libelle | Debit | Credit |
|---------|--------|---------|-------|--------|
| BQ | 521000 Banque | Vente FAC-003 virement | 119 250 | |
| BQ | 701000 Ventes marchandises | Vente FAC-003 | | 100 000 |
| BQ | 443100 TVA collectee | TVA FAC-003 | | 19 250 |

### D.4 Vente a credit + encaissements partiels

**Vente** : 200 000 FCFA HT, TVA 19.25% = 238 500 FCFA TTC

**Etape 1 — Facture :**

| Journal | Compte | Libelle | Debit | Credit |
|---------|--------|---------|-------|--------|
| VE | 411000 Clients | FAC-004 Client Y (credit) | 238 500 | |
| VE | 701000 Ventes marchandises | FAC-004 | | 200 000 |
| VE | 443100 TVA collectee | TVA FAC-004 | | 38 500 |

**Etape 2 — 1er encaissement 100 000 FCFA especes :**

| Journal | Compte | Libelle | Debit | Credit |
|---------|--------|---------|-------|--------|
| CA | 571000 Caisse | Encais. partiel FAC-004 | 100 000 | |
| CA | 411000 Clients | Encais. partiel FAC-004 | | 100 000 |

**Etape 3 — 2e encaissement 138 500 FCFA mobile money :**

| Journal | Compte | Libelle | Debit | Credit |
|---------|--------|---------|-------|--------|
| MM | 585000 Mobile Money | Solde FAC-004 | 138 500 | |
| MM | 411000 Clients | Solde FAC-004 | | 138 500 |

### D.5 Vente avec remise

**Vente** : 100 000 HT, remise 10% = 90 000 HT, TVA 19.25% = 17 325

| Journal | Compte | Libelle | Debit | Credit |
|---------|--------|---------|-------|--------|
| VE | 411000 Clients | FAC-005 avec remise | 107 325 | |
| VE | 701000 Ventes marchandises | FAC-005 | | 100 000 |
| VE | 673000 Rabais/remises accordes | Remise FAC-005 10% | 10 000 | |
| VE | 443100 TVA collectee | TVA FAC-005 (sur 90 000) | | 17 325 |

**Alternative simplifiee** (comptabilisation nette) :

| Journal | Compte | Libelle | Debit | Credit |
|---------|--------|---------|-------|--------|
| VE | 411000 Clients | FAC-005 net de remise | 107 325 | |
| VE | 701000 Ventes marchandises | FAC-005 (net) | | 90 000 |
| VE | 443100 TVA collectee | TVA FAC-005 | | 17 325 |

> Recommandation : utiliser la methode nette (la remise est deduite du CA). Pas de compte 673 sauf si l'entreprise veut un suivi specifique des remises.

### D.6 Devis / Proforma → Aucun impact comptable

Les devis et proformas **ne generent aucune ecriture comptable**. L'ecriture est generee uniquement lors de la conversion en vente (creation du Sale).

### D.7 Achat fournisseur + reception

**Bon de commande 500 000 FCFA HT, TVA 19.25%**

**Etape 1 — Facture fournisseur (a la reception) :**

| Journal | Compte | Libelle | Debit | Credit |
|---------|--------|---------|-------|--------|
| AC | 601000 Achats marchandises | BC-001 Fournisseur Z | 500 000 | |
| AC | 445100 TVA deductible | TVA BC-001 | 96 250 | |
| AC | 401000 Fournisseurs | BC-001 Fournisseur Z | | 596 250 |

**Etape 2 — Paiement fournisseur (virement bancaire) :**

| Journal | Compte | Libelle | Debit | Credit |
|---------|--------|---------|-------|--------|
| BQ | 401000 Fournisseurs | Reglement BC-001 | 596 250 | |
| BQ | 521000 Banque | Reglement BC-001 | | 596 250 |

> Note : dans votre systeme actuel, les achats (PurchaseOrder) n'ont pas de champ `payment_status`. Phase 1 : generer l'ecriture d'achat a la reception. Le paiement fournisseur sera un ajout Phase 2.

### D.8 Depense simple

**Depense transport 25 000 FCFA par caisse**

| Journal | Compte | Libelle | Debit | Credit |
|---------|--------|---------|-------|--------|
| CA | 624000 Transports | Dep DEP-001 transport | 25 000 | |
| CA | 571000 Caisse | Dep DEP-001 | | 25 000 |

**Mapping wallet.type → compte :**

| Type wallet | Compte |
|-------------|--------|
| CASH | 571000 Caisse |
| BANK | 521000 Banque |
| MOBILE_MONEY | 585000 Mobile Money |

**Mapping categorie depense → compte (configurable) :**

| Categorie | Compte PCGO |
|-----------|-------------|
| Loyer | 622 Locations |
| Transport | 624 Transports |
| Fournitures | 604 Achats fournitures |
| Salaires | 661 Remunerations |
| Telephone | 628 Telecommunications |
| Electricite | 605 Eau/Electricite |
| Reparations | 615 Entretien/reparations |

### D.9 Remboursement / Avoir

**Remboursement 50 000 FCFA sur vente de 119 250 TTC (especes)**

| Journal | Compte | Libelle | Debit | Credit |
|---------|--------|---------|-------|--------|
| VE | 709000 RRR accordes | Avoir AVO-001 | 41 929 | |
| VE | 443100 TVA collectee | Annul. TVA AVO-001 | 8 071 | |
| VE | 411000 Clients | Avoir AVO-001 | | 50 000 |

**Si remboursement en especes :**

| Journal | Compte | Libelle | Debit | Credit |
|---------|--------|---------|-------|--------|
| CA | 411000 Clients | Rembours. AVO-001 | 50 000 | |
| CA | 571000 Caisse | Rembours. AVO-001 | | 50 000 |

### D.10 Annulation de depense (void)

L'annulation d'une depense genere une **contre-passation** :

| Journal | Compte | Libelle | Debit | Credit |
|---------|--------|---------|-------|--------|
| CA | 571000 Caisse | Annul. DEP-001 | 25 000 | |
| CA | 624000 Transports | Annul. DEP-001 | | 25 000 |

### D.11 Paiement credit client

**Encaissement 100 000 FCFA sur credit client (especes)**

| Journal | Compte | Libelle | Debit | Credit |
|---------|--------|---------|-------|--------|
| CA | 571000 Caisse | Encais. credit Client X | 100 000 | |
| CA | 411000 Clients | Encais. credit Client X | | 100 000 |

### D.12 Transfert stock (inter-magasins)

**Impact comptable (si inventaire permanent active) :**

Aucune ecriture comptable standard pour un transfert interne. Impact uniquement analytique (mouvement de valeur stock entre centres de cout/magasins).

Si l'entreprise active la comptabilisation des stocks :

| Journal | Compte | Libelle | Debit | Credit |
|---------|--------|---------|-------|--------|
| OD | 311000 Stock marchandises (Mag B) | Transfert T-001 → Mag B | 150 000 | |
| OD | 311000 Stock marchandises (Mag A) | Transfert T-001 ← Mag A | | 150 000 |

> Recommandation Phase 1 : ne pas comptabiliser les transferts stock. Les mouvements de stock sont traces dans `InventoryMovement` et la valorisation dans `KPISnapshot`.

### D.13 Paiement mixte (multi-mode)

**Vente 119 250 TTC — 50 000 especes + 69 250 mobile money**

**Ecriture de vente (identique) :**

| Journal | Compte | Debit | Credit |
|---------|--------|-------|--------|
| VE | 411000 | 119 250 | |
| VE | 701000 | | 100 000 |
| VE | 443100 | | 19 250 |

**Encaissements :**

| Journal | Compte | Debit | Credit |
|---------|--------|-------|--------|
| CA | 571000 Caisse | 50 000 | |
| CA | 411000 Clients | | 50 000 |
| MM | 585000 Mobile | 69 250 | |
| MM | 411000 Clients | | 69 250 |

### D.14 Synthese mapping operation → methode service

| Operation source | Methode service | Journaux |
|-----------------|----------------|----------|
| Sale validee (PAID) | `post_sale_entry(sale)` | VE + CA/BQ/MM |
| Sale a credit | `post_sale_entry(sale)` | VE |
| Payment sur vente | `post_payment_entry(payment)` | CA/BQ/MM |
| Refund | `post_refund_entry(refund)` | VE + CA/BQ/MM |
| PurchaseOrder recue | `post_purchase_entry(po)` | AC |
| Expense postee | `post_expense_entry(expense)` | CA/BQ/MM |
| Expense annulee | `post_expense_void_entry(expense)` | CA/BQ/MM |
| Credit payment | `post_credit_payment_entry(ledger_entry)` | CA/BQ/MM |
| CashShift fermeture | (pas d'ecriture, les paiements sont deja comptabilises) | — |

---

## E. Checklist conformite

### E.1 Checklist fonctionnelle

| # | Exigence | Phase | Statut |
|---|----------|-------|--------|
| 1 | Plan comptable PCGO parametrable | P1 | A faire |
| 2 | Journaux obligatoires (VE, AC, CA, BQ, MM, OD, AN) | P1 | A faire |
| 3 | Ecritures en partie double (debit = credit) | P1 | A faire |
| 4 | Numerotation continue par journal | P1 | A faire |
| 5 | Interdiction suppression ecriture validee | P1 | A faire |
| 6 | Contre-passation pour annulation | P1 | A faire |
| 7 | Piste d'audit (auteur, date, IP) | P1 | Existe (AuditLog) |
| 8 | Exercice + periodes mensuelles | P1 | A faire |
| 9 | Cloture de periode (verrouillage) | P1 | A faire |
| 10 | TVA collectee/deductible | P1 | A faire (TVA existe sur Sale mais pas comptabilisee) |
| 11 | Balance generale | P1 | A faire |
| 12 | Grand livre | P1 | A faire |
| 13 | Journal centralise | P1 | A faire |
| 14 | Ecritures auto ventes | P1 | A faire |
| 15 | Ecritures auto achats | P1 | A faire |
| 16 | Ecritures auto depenses | P1 | A faire |
| 17 | Ecritures auto remboursements | P1 | A faire |
| 18 | Ecritures auto paiements credit | P1 | A faire |
| 19 | Lettrage tiers (clients) | P2 | A faire |
| 20 | Lettrage tiers (fournisseurs) | P2 | A faire |
| 21 | Bilan | P2 | A faire |
| 22 | Compte de resultat | P2 | A faire |
| 23 | TAFIRE | P2 | A faire |
| 24 | Annexes | P2 | A faire |
| 25 | Cloture exercice + report a nouveau | P2 | A faire |
| 26 | Immobilisations + amortissements | P3 | A faire |
| 27 | Analytique avancee (centres de cout) | P3 | A faire |

### E.2 Tests unitaires essentiels

```python
# tests/test_accounting.py

class TestAccountingEngine:

    def test_sale_entry_balanced(self):
        """Verifier que total debit == total credit pour une vente."""

    def test_sale_with_vat_entry(self):
        """Verifier que la TVA collectee est correctement comptabilisee."""

    def test_sale_without_vat_entry(self):
        """Verifier qu'aucun compte TVA n'est mouvemente si TVA desactivee."""

    def test_credit_sale_no_cash_entry(self):
        """Verifier qu'une vente a credit genere uniquement une ecriture VE (pas de CA)."""

    def test_payment_entry_cash(self):
        """Verifier que le paiement especes debite 571 et credite 411."""

    def test_payment_entry_mobile(self):
        """Verifier que le paiement mobile debite 585 et credite 411."""

    def test_mixed_payment_two_entries(self):
        """Verifier qu'un paiement mixte genere une ecriture par mode."""

    def test_refund_reversal_entry(self):
        """Verifier que le remboursement genere une ecriture inverse."""

    def test_expense_entry(self):
        """Verifier que la depense debite le compte charge et credite la tresorerie."""

    def test_expense_void_reversal(self):
        """Verifier que l'annulation de depense genere une contre-passation."""

    def test_purchase_entry(self):
        """Verifier que l'achat debite 601+4451 et credite 401."""

    def test_cannot_delete_validated_entry(self):
        """Verifier que la suppression d'une ecriture validee leve une erreur."""

    def test_cannot_post_in_closed_period(self):
        """Verifier qu'on ne peut pas poster dans une periode close."""

    def test_sequence_number_continuous(self):
        """Verifier que les numeros de sequence sont continus sans trous."""

    def test_period_close_locks_entries(self):
        """Verifier que la cloture de periode empeche les nouvelles ecritures."""

    def test_balance_equals_zero(self):
        """Verifier que la balance generale est equilibree (sum debit = sum credit)."""

    def test_customer_lettrage(self):
        """Verifier que le lettrage relie facture et paiement du meme client."""

    def test_credit_payment_entry(self):
        """Verifier que le paiement credit genere l'ecriture correcte."""
```

### E.3 Tests d'integration

```python
class TestAccountingIntegration:

    def test_full_sale_flow(self):
        """POS: creer vente → paiement → verifier ecritures VE + CA generees."""

    def test_credit_sale_then_partial_payments(self):
        """Vente credit → 2 encaissements → verifier 1 ecriture VE + 2 ecritures CA."""

    def test_sale_then_refund(self):
        """Vente → remboursement → verifier ecriture inverse."""

    def test_purchase_receive_flow(self):
        """BC → reception → verifier ecriture AC generee."""

    def test_expense_post_then_void(self):
        """Depense → annulation → verifier ecriture + contre-passation."""

    def test_month_end_close(self):
        """Cloture mensuelle → verifier qu'on ne peut plus poster."""

    def test_grand_livre_matches_balance(self):
        """Verifier coherence grand livre ↔ balance."""

    def test_vat_declaration_extraction(self):
        """Extraire TVA collectee - TVA deductible sur une periode."""
```

---

## F. Recommandations UX

### F.1 Ecrans a creer (Phase 1)

| Ecran | Chemin | Role |
|-------|--------|------|
| Plan comptable | /accounting/chart | ADMIN, MANAGER |
| Liste des comptes avec arborescence | Arbre pliable, recherche, filtre par classe |
| Journaux | /accounting/journals | ADMIN, MANAGER |
| Liste des journaux + configuration | |
| Saisie manuelle | /accounting/entries/new | ADMIN, MANAGER |
| Formulaire debit/credit + validation equilibre | |
| Liste ecritures | /accounting/entries | ADMIN, MANAGER |
| Filtres : journal, periode, compte, statut | |
| Grand livre | /accounting/ledger | ADMIN, MANAGER |
| Filtre par compte + export PDF/CSV | |
| Balance | /accounting/balance | ADMIN, MANAGER |
| Balance generale avec totaux debit/credit/solde | |
| Journal centralise | /accounting/journal-report | ADMIN, MANAGER |
| Toutes les ecritures chronologiques + export | |
| Exercices/Periodes | /accounting/periods | ADMIN |
| Gestion exercices, cloture mensuelle | |
| Parametres comptables | /settings/accounting | ADMIN |
| Comptes par defaut, mapping depenses | |

### F.2 Integration dans l'existant

| Element existant | Ajout |
|-----------------|-------|
| Detail vente (SaleDetailPage) | Lien "Voir l'ecriture comptable" si elle existe |
| Detail depense (ExpenseListPage) | Lien "Voir l'ecriture comptable" |
| Detail achat (PurchaseDetailPage) | Lien "Voir l'ecriture comptable" |
| Detail credit (CreditDetailPage) | Lien vers les ecritures associees |
| Sidebar | Nouvelle section "Comptabilite" avec sous-menus |
| Parametres | Onglet "Comptabilite" pour les comptes par defaut |

### F.3 Principes UX

1. **Automatique par defaut** : les ecritures sont generees automatiquement. L'ecran de saisie manuelle est pour les OD uniquement.
2. **Consultation, pas de saisie** : 90% des utilisateurs ne verront que les rapports (balance, grand livre). La saisie manuelle est reservee aux comptables.
3. **Pas de blocage** : si le module comptable est desactive (feature flag), l'application fonctionne normalement comme aujourd'hui.
4. **Progressive** : le module comptable peut etre active entreprise par entreprise.

---

## G. Roadmap

### Phase 1 — Fondations (4-6 semaines)

**Objectif** : journaux + ecritures automatiques + etats de base

| Tache | Effort | Priorite |
|-------|--------|----------|
| Creer app `src/accounting/` avec modeles | 3j | P0 |
| Migration DB + template PCGO | 2j | P0 |
| Service d'ecritures automatiques (engine.py) | 5j | P0 |
| Hooks signals/post-save sur Sale, Payment, Expense, Refund | 3j | P0 |
| API ViewSets (CRUD comptes, journaux, ecritures, periodes) | 3j | P0 |
| Frontend : plan comptable + liste ecritures | 3j | P1 |
| Frontend : balance generale | 2j | P1 |
| Frontend : grand livre | 2j | P1 |
| Frontend : journal centralise | 1j | P1 |
| Frontend : parametres comptables | 2j | P1 |
| TVA multi-taux | 2j | P1 |
| Tests unitaires + integration | 3j | P0 |
| Feature flag `ACCOUNTING` dans le billing | 1j | P0 |

**Total Phase 1 : ~30 jours dev**

### Phase 2 — Conformite complete (3-4 semaines)

| Tache | Effort |
|-------|--------|
| Lettrage tiers (auto + manuel) | 4j |
| Cloture mensuelle (workflow + controles) | 3j |
| Cloture exercice + report a nouveau | 3j |
| Bilan (generation PDF) | 3j |
| Compte de resultat (generation PDF) | 2j |
| TAFIRE (generation PDF) | 3j |
| Paiement fournisseur (ajout sur PurchaseOrder) | 3j |
| Export officiel : FEC (Fichier des Ecritures Comptables) | 2j |

**Total Phase 2 : ~23 jours dev**

### Phase 3 — Extensions (optionnel)

| Tache | Effort |
|-------|--------|
| Immobilisations + amortissements lineaires | 5j |
| Provisions | 3j |
| Analytique avancee (centres de cout par magasin) | 4j |
| Budget comptable vs budget depenses | 3j |
| Multi-devises | 5j |
| Notes annexes automatiques | 3j |

**Total Phase 3 : ~23 jours dev**

---

## Annexe : Comptes PCGO les plus utilises dans un commerce

```
10     Capital
12     Report a nouveau
16     Emprunts

21     Immobilisations corporelles
28     Amortissements

31     Stocks de marchandises
371    Marchandises en cours de route

401    Fournisseurs
4011   Fournisseurs locaux
411    Clients
4111   Clients locaux
421    Personnel, remunerations dues
431    Securite sociale
4431   TVA facturee sur ventes
4432   TVA sur prestations de services
4451   TVA recuperable sur achats
4452   TVA recuperable sur immobilisations
4441   Etat, TVA due

512    Banques locales
521    Banques locales (OHADA utilise 52x)
571    Caisse siege
585    Transferts de fonds (Mobile Money)

601    Achats de marchandises
604    Achats de matieres et fournitures
605    Autres achats (eau, electricite)
613    Locations (loyer)
615    Entretien et reparations
622    Locations et charges locatives
624    Transports
628    Frais de telecommunications
661    Remunerations directes
673    Rabais, remises, ristournes accordes

701    Ventes de marchandises
706    Services vendus
709    RRR accordes (remises/avoirs)
773    Rabais, remises, ristournes obtenus
```

---

*Document genere pour le Systeme de Gestion Commerciale — Mars 2026*
