# API Reference — Systeme de Gestion Commerciale

> Documentation detaillee de chaque endpoint REST (`/api/v1/`).
> Genere automatiquement a partir du code source (mars 2026).

Base URL : `/api/v1/`
Auth : JWT via cookies HttpOnly (`access_token`, `refresh_token`)

---

## Table des matieres

1. [Authentification](#1-authentification)
2. [Entreprises](#2-entreprises)
3. [Abonnements & Facturation](#3-abonnements--facturation)
4. [Magasins](#4-magasins)
5. [Utilisateurs & Roles](#5-utilisateurs--roles)
6. [Catalogue](#6-catalogue)
7. [Stock](#7-stock)
8. [Clients](#8-clients)
9. [Ventes (POS)](#9-ventes-pos)
10. [Devis & Proformas](#10-devis--proformas)
11. [Paiements](#11-paiements)
12. [Caisse](#12-caisse)
13. [Credits & Echeanciers](#13-credits--echeanciers)
14. [Remboursements](#14-remboursements)
15. [Fournisseurs & Achats](#15-fournisseurs--achats)
16. [Alertes](#16-alertes)
17. [Audit](#17-audit)
18. [Rapports](#18-rapports)
19. [Analytics Avancees](#19-analytics-avancees)
20. [Analytics Clients](#20-analytics-clients)
21. [Analytics Caisse](#21-analytics-caisse)
22. [Analytics Stock](#22-analytics-stock)
23. [Dashboard DG](#23-dashboard-dg)
24. [Depenses](#24-depenses)
25. [Objectifs Vendeurs](#25-objectifs-vendeurs)
26. [CRM Commercial](#26-crm-commercial)
27. [GRH](#27-grh)
28. [Verification Documents](#28-verification-documents)

---

## 1. Authentification

### POST `/auth/token/`
Obtenir un pair de tokens JWT. Les tokens sont definis dans des cookies HttpOnly.

**Permission** : Public
**Throttle** : `auth_burst`

**Body** :
```json
{
  "email": "user@example.com",
  "password": "secret"
}
```

**Reponse 200** :
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "first_name": "John",
    "last_name": "Doe",
    "phone": "+221...",
    "role": "SALES",
    "is_active": true,
    "is_superuser": false
  }
}
```

---

### POST `/auth/token/refresh/`
Rafraichir le token d'acces via le cookie `refresh_token`.

**Permission** : Public
**Throttle** : `auth_sustained`

**Body** (optionnel si cookie present) :
```json
{ "refresh": "eyJ..." }
```

**Reponse 200** :
```json
{ "detail": "Token refreshed." }
```

---

### POST `/auth/logout/`
Supprime les cookies d'authentification.

**Permission** : Public
**Reponse** : `204 No Content`

---

### GET `/auth/csrf/`
Retourne un token CSRF et positionne le cookie CSRF.

**Permission** : Public

**Reponse 200** :
```json
{ "csrfToken": "abc123..." }
```

---

### GET `/auth/me/`
Profil de l'utilisateur connecte.

**Permission** : Authentifie

**Reponse 200** :
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "first_name": "John",
  "last_name": "Doe",
  "phone": "+221...",
  "role": "SALES",
  "is_active": true,
  "is_superuser": false
}
```

### PATCH `/auth/me/`
Mettre a jour le profil (first_name, last_name, phone).

**Body** :
```json
{
  "first_name": "Jean",
  "last_name": "Dupont",
  "phone": "+221777000000"
}
```

---

### GET `/auth/module-matrix/`
Matrice des modules et fonctionnalites actives pour le magasin courant.

**Permission** : Authentifie
**Query params** : `store` (UUID, optionnel)

**Reponse 200** :
```json
{
  "store_id": "uuid",
  "modules": { "SALES_POS": true, "STOCK": true, ... },
  "features": { "sales_pos": true, "stock_management": true, ... },
  "capabilities": ["CAN_SELL", "CAN_STOCK", ...]
}
```

---

### POST `/auth/password/change/`
Changer son mot de passe.

**Permission** : Authentifie

**Body** :
```json
{
  "old_password": "ancien",
  "new_password": "nouveau123!"
}
```

---

### POST `/auth/password/reset/`
Demander un email de reinitialisation (idempotent).

**Permission** : Public
**Throttle** : `auth_burst`

**Body** :
```json
{ "email": "user@example.com" }
```

**Reponse 200** :
```json
{ "detail": "Si un compte correspond a cet email, un lien de reinitialisation a ete envoye." }
```

---

### POST `/auth/password/reset/confirm/`
Confirmer la reinitialisation avec uid et token.

**Permission** : Public
**Throttle** : `auth_burst`

**Body** :
```json
{
  "uid": "base64uid",
  "token": "resettoken",
  "new_password1": "nouveau123!",
  "new_password2": "nouveau123!"
}
```

---

## 2. Entreprises

### CRUD `/enterprises/`
**ViewSet** : `EnterpriseViewSet`
**Permissions** : SuperAdmin (create/destroy), CanManageStores (update), Authentifie (list/retrieve)

**Filtres** : `is_active`
**Recherche** : `name`, `code`
**Tri** : `name`, `created_at`, `subscription_end`, `is_active`

**Champs principaux** :
| Champ | Type | Lecture seule | Description |
|-------|------|---------------|-------------|
| id | UUID | oui | |
| name | string | | Nom de l'entreprise |
| code | string | | Code unique |
| legal_name | string | | Raison sociale |
| currency | string | | Devise (defaut: FCFA) |
| vat_enabled | bool | | TVA activee |
| vat_rate | decimal | | Taux TVA |
| is_active | bool | | |
| analytics_feature_flags | JSON | | Drapeaux fonctionnalites |
| effective_feature_flags | JSON | oui | Drapeaux resolus |
| subscription_start | date | | Debut abonnement |
| subscription_end | date | | Fin abonnement |
| subscription_status | string | oui | Statut calcule |

### POST `/enterprises/{id}/setup/`
Configuration initiale : cree entreprise + magasin + utilisateur admin.

**Body** (EnterpriseSetupSerializer) :
```json
{
  "enterprise_name": "Ma Societe",
  "enterprise_code": "MSOC",
  "store_name": "Magasin Principal",
  "store_code": "MP01",
  "user_email": "admin@masociete.com",
  "user_first_name": "Admin",
  "user_last_name": "User",
  "user_password": "securepass123",
  "user_password_confirm": "securepass123"
}
```

### POST `/enterprises/{id}/toggle-active/`
Activer/desactiver une entreprise.
**Permission** : SuperAdmin

### POST `/enterprises/{id}/reset/`
Reinitialiser une entreprise (supprime les donnees).
**Permission** : SuperAdmin

---

## 3. Abonnements & Facturation

### CRUD `/enterprise-subscriptions/`
**Permission** : SuperAdmin
**Filtres** : `enterprise`, `status`, `billing_cycle`, `auto_renew`
**Recherche** : `plan_code`, `plan_name`, `enterprise__name`
**Tri** : `starts_on`, `ends_on`, `created_at`, `amount`, `status`

### GET `/billing-modules/`
Liste des modules de facturation (lecture seule).
**Permission** : SuperAdmin
**Filtres** : `is_active`

### GET `/billing-plans/`
Liste des plans de facturation (lecture seule).
**Permission** : SuperAdmin
**Filtres** : `is_active`, `billing_cycle`

### CRUD `/enterprise-plan-assignments/`
Affectation de plans aux entreprises.
**Permission** : SuperAdmin

#### GET `/enterprise-plan-assignments/current/`
Affectation active actuelle.

### CRUD `/store-module-entitlements/`
Droits modules par magasin.
**Permission** : SuperAdmin

#### POST `/store-module-entitlements/bulk-upsert/`
Upsert en masse.
```json
{
  "store": "uuid",
  "overrides": [
    { "module_code": "SALES_POS", "state": "ACTIVE" },
    { "module_code": "CRM", "state": "DISABLED", "reason": "Non souscrit" }
  ]
}
```

#### GET `/store-module-entitlements/matrix/`
Matrice complete modules/magasins.

---

## 4. Magasins

### CRUD `/stores/`
**ViewSet** : `StoreViewSet`
**Permissions** : CanManageStores (write), Authentifie (read)
**Filtres** : `is_active`
**Recherche** : `name`, `code`
**Tri** : `name`, `created_at`

**Champs principaux** :
| Champ | Type | Lecture seule | Description |
|-------|------|---------------|-------------|
| id | UUID | oui | |
| enterprise | UUID | oui | |
| name | string | | Nom du magasin |
| code | string | | Code unique |
| stock_decrement_on | string | | `PAYMENT` ou `VALIDATION` |
| allow_negative_stock | bool | | Autoriser stock negatif |
| invoice_header/footer/terms | string | | Parametres facture |
| analytics_feature_overrides | JSON | | Drapeaux specifiques |
| effective_feature_flags | JSON | oui | Drapeaux resolus |

### GET `/stores/my-stores/`
Magasins de l'utilisateur connecte avec `is_default`, `enterprise_name`, `my_capabilities`, `effective_feature_flags`.

### POST `/stores/{id}/assign-users/`
Affecter des utilisateurs a un magasin.

### CRUD `/store-users/`
Gestion des liens utilisateur-magasin.
**Filtres** : `store`

**Champs** : `id`, `store`, `user`, `user_email`, `user_name`, `user_role`, `is_default`, `capabilities`, `effective_capabilities`

---

## 5. Utilisateurs & Roles

### CRUD `/users/`
**ViewSet** : `UserViewSet`
**Permission** : CanManageUsers
**Filtres** : `role`, `is_active`
**Recherche** : `email`, `first_name`, `last_name`
**Tri** : `last_name`, `date_joined`, `role`, `is_active`

**Creation** (UserCreateSerializer) :
```json
{
  "email": "user@example.com",
  "first_name": "Jean",
  "last_name": "Dupont",
  "phone": "+221...",
  "role": "SALES",
  "custom_role": "uuid-or-null",
  "password": "motdepasse123",
  "password_confirm": "motdepasse123"
}
```

**Roles disponibles** : `ADMIN`, `MANAGER`, `SALES`, `COMMERCIAL`, `HR`, `CASHIER`, `STOCKER`

### POST `/users/{id}/toggle-active/`
Activer/desactiver un utilisateur.

### POST `/users/{id}/assign-stores/`
Affecter des magasins a un utilisateur.

### POST `/users/{id}/reset-password/`
Reinitialiser le mot de passe (genere un nouveau).

### CRUD `/roles/`
Roles personnalises (CustomRole).
**Filtres** : `base_role`, `is_active`
**Recherche** : `name`

---

## 6. Catalogue

### CRUD `/categories/`
**Permission** : ManagerOrAdmin (write), Authentifie + ModuleStockEnabled (read)
**Filtres** : `is_active`, `parent`
**Recherche** : `name`
**Champs** : `id`, `enterprise`, `name`, `slug`, `description`, `parent`, `parent_name`, `is_active`

### CRUD `/brands/`
**Permission** : ManagerOrAdmin (write), Authentifie + ModuleStockEnabled (read)
**Filtres** : `is_active`
**Recherche** : `name`
**Champs** : `id`, `enterprise`, `name`, `slug`, `is_active`

### CRUD `/products/`
**Permission** : ManagerOrAdmin + ModuleStockEnabled (write), Authentifie + ModuleSellOrStockEnabled (read)
**Filtres** : `category`, `brand`, `is_active`
**Recherche** : `name`, `sku`, `barcode`
**Tri** : `name`, `sku`, `cost_price`, `selling_price`, `is_active`, `created_at`

**Champs principaux** :
| Champ | Type | Lecture seule | Description |
|-------|------|---------------|-------------|
| id | UUID | oui | |
| name | string | | |
| sku | string | | Reference unique |
| barcode | string | | Code-barres |
| product_type | string | | `PHYSICAL` ou `SERVICE` |
| track_stock | bool | | Suivi de stock |
| cost_price | decimal | | Prix d'achat |
| selling_price | decimal | | Prix de vente |
| images | array | oui | Images produit |
| specs | array | oui | Specifications |

### GET `/products/pos/`
Liste optimisee pour le POS (champs reduits, `available_qty`, `has_stock`).

### POST `/products/{id}/upload-image/`
Upload image produit (MultiPart).

### POST `/products/import-csv/`
Import CSV de produits.

### GET `/products/export-csv/`
Export CSV.

---

## 7. Stock

### GET `/stock/`
Niveaux de stock (lecture seule).
**Permission** : FeatureStockManagementEnabled
**Filtres** : `store`, `product`
**Recherche** : `product__name`, `product__sku`, `product__barcode`
**Tri** : `quantity`, `product__name`, `reserved_qty`, `min_qty`

**Champs** : `id`, `store`, `product`, `product_name`, `product_sku`, `quantity`, `reserved_qty`, `min_qty`, `available_qty`

### POST `/stock/bulk-entry/`
Entree de stock en masse.
```json
{
  "entries": [
    { "product_id": "uuid", "quantity": 50 },
    { "product_id": "uuid", "quantity": 100 }
  ],
  "reference": "BON-001",
  "reason": "Reception fournisseur"
}
```

### POST `/stock/bulk-adjust/`
Ajustement de stock en masse (positif ou negatif).
```json
{
  "adjustments": [
    { "product_id": "uuid", "quantity": -5 },
    { "product_id": "uuid", "quantity": 10 }
  ],
  "reason": "Inventaire physique"
}
```

### GET `/stock/export-csv/`
Export stock en CSV.

### GET/POST `/stock-movements/`
Historique des mouvements de stock.
**Filtres** : `store`, `product`, `movement_type`
**Tri** : `created_at`, `product__name`, `movement_type`, `quantity`

**Types de mouvement** : `ENTRY`, `SALE`, `RETURN`, `ADJUSTMENT`, `TRANSFER_OUT`, `TRANSFER_IN`

### CRUD `/stock-transfers/`
Transferts inter-magasins.
**Filtres** : `from_store`, `to_store`, `status`

**Creation** :
```json
{
  "to_store": "uuid",
  "notes": "Transfert produits",
  "lines": [
    { "product_id": "uuid", "quantity": 10 }
  ]
}
```

#### POST `/stock-transfers/{id}/approve/`
Approuver (Manager+).

#### POST `/stock-transfers/{id}/receive/`
Recevoir le transfert.

### CRUD `/stock-counts/`
Inventaires physiques.
**Filtres** : `store`, `status`

#### POST `/stock-counts/{id}/update-lines/`
```json
{
  "lines": [
    { "id": "uuid", "counted_qty": 45 }
  ]
}
```

#### POST `/stock-counts/{id}/complete/`
Valider l'inventaire (applique les ecarts au stock).

---

## 8. Clients

### CRUD `/customers/`
**Permission** : ModuleCustomerEnabled
**Filtres** : `is_active`
**Recherche** : `first_name`, `last_name`, `phone`
**Tri** : `last_name`, `created_at`, `is_active`

**Champs** : `id`, `enterprise`, `first_name`, `last_name`, `phone`, `email`, `address`, `company`, `full_name`, `is_default`, `created_by`, `created_by_name`, `created_at`

### GET `/customers/{id}/purchase-history/`
Historique d'achats avec details des ventes.

### GET `/customers/export-csv/`
### POST `/customers/import-csv/`

---

## 9. Ventes (POS)

### CRUD `/sales/`
**ViewSet** : `SaleViewSet`
**Permissions** : IsSales + FeatureSalesPOSEnabled (write), Authentifie (read)
**Filtres** : `store`, `status`, `seller`, `customer`, `is_credit_sale`
**Recherche** : `invoice_number`, `customer__first_name`, `customer__last_name`, `customer__phone`, `seller__first_name`, `seller__last_name`
**Tri** : `created_at`, `total`, `invoice_number`, `status`, `amount_due`

**Champs principaux** :
| Champ | Type | Lecture seule | Description |
|-------|------|---------------|-------------|
| id | UUID | oui | |
| invoice_number | string | oui | Auto-genere (FAC-STORE-YEAR-XXXXX) |
| status | string | | DRAFT, PENDING_PAYMENT, PAID, PARTIALLY_PAID, CANCELLED, REFUNDED |
| payment_status | string | oui | N/A, UNPAID, PARTIAL, PAID |
| subtotal | decimal | oui | |
| discount_amount | decimal | | Remise fixe |
| discount_percent | decimal | | Remise % |
| tax_amount | decimal | oui | |
| total | decimal | oui | |
| amount_paid | decimal | oui | |
| amount_due | decimal | oui | |
| items | array | oui | Lignes de vente |
| is_credit_sale | bool | | Vente a credit |

**Statuts** : `DRAFT` → `PENDING_PAYMENT` → `PAID` / `PARTIALLY_PAID` → `REFUNDED` / `CANCELLED`

### POST `/sales/` (creation)
```json
{
  "customer_id": "uuid-or-null",
  "store_id": "uuid",
  "discount_percent": 0,
  "notes": ""
}
```

### POST `/sales/{id}/add-item/`
```json
{
  "product_id": "uuid",
  "quantity": 2,
  "discount_amount": 0,
  "unit_price_override": null
}
```

### POST `/sales/{id}/remove-item/`
```json
{ "item_id": "uuid" }
```

### POST `/sales/{id}/set-item-quantity/`
```json
{ "item_id": "uuid", "quantity": 5 }
```

### POST `/sales/{id}/set-item-unit-price/`
```json
{ "item_id": "uuid", "unit_price": 15000 }
```

### POST `/sales/{id}/submit/`
Soumet la vente en caisse (change status vers PENDING_PAYMENT).

### POST `/sales/{id}/cancel/`
Annuler la vente (Manager+). Restaure le stock si deja decremente.

### GET `/sales/{id}/invoice/`
Telecharger la facture PDF.

### GET `/sales/{id}/receipt/`
Telecharger le recu PDF.

### GET `/sales/export-csv/`
Export CSV des ventes.

---

## 10. Devis & Proformas

### CRUD `/quotes/`
**ViewSet** : `QuoteViewSet`
**Permissions** : IsSales (create), ManagerOrAdmin (accept/refuse/convert/cancel), Authentifie (read)
**Filtres** : `store`, `status`, `customer`, `created_by`
**Recherche** : `quote_number`, `customer__first_name`, `customer__last_name`, `customer__phone`
**Tri** : `created_at`, `total`, `quote_number`, `status`, `valid_until`

**Champs principaux** :
| Champ | Type | Lecture seule | Description |
|-------|------|---------------|-------------|
| id | UUID | oui | |
| quote_number | string | oui | Auto-genere (DEV- ou PRO-) |
| status | string | | DRAFT, SENT, ACCEPTED, REFUSED, CONVERTED, CANCELLED |
| document_type | string | | `DEVIS` ou `PROFORMA` |
| total | decimal | oui | |
| valid_until | date | | Date d'expiration |
| cancelled_at | datetime | oui | |
| cancellation_reason | string | | |
| converted_sale_id | UUID | oui | |
| is_expired | bool | oui | |

### POST `/quotes/` (creation)
```json
{
  "store_id": "uuid",
  "customer_id": "uuid-or-null",
  "document_type": "DEVIS",
  "discount_percent": 0,
  "notes": "",
  "conditions": "",
  "valid_until": "2026-04-01"
}
```

### POST `/quotes/{id}/add-item/`
```json
{
  "product_id": "uuid",
  "quantity": 3,
  "discount_amount": 0,
  "unit_price_override": null
}
```

### POST `/quotes/{id}/remove-item/`
```json
{ "item_id": "uuid" }
```

### POST `/quotes/{id}/send/`
Envoyer au client (status → SENT).

### POST `/quotes/{id}/accept/`
Marquer comme accepte (Manager+).

### POST `/quotes/{id}/refuse/`
Marquer comme refuse.
```json
{ "reason": "Trop cher" }
```

### POST `/quotes/{id}/convert/`
Convertir en vente (cree une Sale avec les memes articles).

### POST `/quotes/{id}/cancel/`
Annuler le devis.
```json
{ "reason": "Client ne repond plus" }
```

### POST `/quotes/{id}/duplicate/`
Dupliquer le devis.

### GET `/quotes/{id}/pdf/`
Telecharger PDF (titre dynamique : DEVIS ou FACTURE PROFORMA).

---

## 11. Paiements

### GET/POST `/payments/`
**Permission** : CanProcessPayment (create), Authentifie (list)
**Filtres** : `sale`, `method`, `store`, `shift`

**Creation** (PaymentCreateSerializer) :
```json
{
  "sale_id": "uuid",
  "payments": [
    { "method": "CASH", "amount": 50000, "reference": "" },
    { "method": "MOBILE_MONEY", "amount": 25000, "reference": "TX123" }
  ]
}
```

**Methodes de paiement** : `CASH`, `CARD`, `MOBILE_MONEY`, `BANK_TRANSFER`, `CHECK`

---

## 12. Caisse

### CRUD `/cash-shifts/`
**Permission** : IsCashier + FeatureCashierOperationsEnabled
**Filtres** : `store`, `cashier`, `status`
**Tri** : `opened_at`, `closed_at`

### POST `/cash-shifts/open/`
Ouvrir une session de caisse.
```json
{
  "store": "uuid",
  "opening_float": 50000
}
```

### GET `/cash-shifts/current/`
Session de caisse active du caissier connecte.

### POST `/cash-shifts/{id}/close/`
Fermer la session.
```json
{
  "closing_cash": 245000,
  "notes": "RAS"
}
```

### GET `/cash-shifts/{id}/pdf-report/`
Rapport de session en PDF.

---

## 13. Credits & Echeanciers

### CRUD `/credit-accounts/`
**Permission** : ManagerOrAdmin + FeatureCreditManagementEnabled
**Filtres** : `store`, `customer`, `is_active`
**Tri** : `balance`, `created_at`, `credit_limit`, `is_active`

**Champs** : `id`, `store`, `customer`, `customer_name`, `customer_phone`, `credit_limit`, `balance`, `available_credit`, `is_active`

### POST `/credit-accounts/{id}/pay/`
Enregistrer un paiement de credit.
```json
{
  "amount": 25000,
  "method": "CASH",
  "reference": ""
}
```

### GET `/credit-accounts/{id}/statement/`
Releve de compte (JSON).

### GET `/credit-accounts/{id}/statement-pdf/`
Releve de compte en PDF.

### GET `/credit-accounts/{id}/payments/{entry_id}/receipt/`
Recu de paiement credit PDF.

### GET `/credit-ledger/`
Journal des ecritures credit (lecture seule).
**Filtres** : `account`

### CRUD `/payment-schedules/`
Echeanciers (list, retrieve, update).
**Filtres** : `account`, `status`
**Tri** : `due_date`, `created_at`

---

## 14. Remboursements

### GET/POST `/refunds/`
**Permission** : CanApproveRefund (create), Authentifie (list)
**Filtres** : `store`, `sale`, `refund_method`
**Tri** : `created_at`, `amount`

**Creation** (RefundCreateSerializer) :
```json
{
  "sale_id": "uuid",
  "amount": 15000,
  "reason": "Article defectueux",
  "refund_method": "CASH",
  "restore_stock": true
}
```

**Reponse** inclut `credit_note_number` (AVO-STORE-YEAR-XXXXX) genere automatiquement.

---

## 15. Fournisseurs & Achats

### CRUD `/suppliers/`
**Permission** : ManagerOrAdmin + FeaturePurchasesManagementEnabled
**Filtres** : `is_active`
**Recherche** : `name`, `contact_name`, `phone`

### CRUD `/purchase-orders/`
**Permission** : ManagerOrAdmin + IsStoreMember + FeaturePurchasesManagementEnabled
**Filtres** : `store`, `supplier`, `status`
**Recherche** : `po_number`
**Tri** : `created_at`, `po_number`, `status`, `subtotal`

**Statuts** : `DRAFT` → `SUBMITTED` → `APPROVED` → `RECEIVED` / `CANCELLED`

**Creation** :
```json
{
  "store": "uuid",
  "supplier": "uuid",
  "notes": "",
  "submit_now": false,
  "lines": [
    { "product_id": "uuid", "quantity_ordered": 50, "unit_cost": 5000 }
  ]
}
```

### POST `/purchase-orders/{id}/submit/`
Soumettre pour approbation.

### POST `/purchase-orders/{id}/cancel/`
```json
{ "reason": "Fournisseur indisponible" }
```

### CRUD `/goods-receipts/`
Receptions de marchandises.
**Filtres** : `store`, `purchase_order`
**Recherche** : `receipt_number`

**Creation** :
```json
{
  "store": "uuid",
  "purchase_order": "uuid",
  "lines": [
    { "purchase_order_line_id": "uuid", "quantity_received": 48 }
  ]
}
```

---

## 16. Alertes

### GET `/alerts/`
**Permission** : FeatureAlertsCenterEnabled
**Filtres** : `store`, `alert_type`, `severity`, `is_read`
**Tri** : `created_at`, `severity`

**Types** : `LOW_STOCK`, `OUT_OF_STOCK`, `CREDIT_LIMIT`, `PAYMENT_DUE`, etc.
**Severites** : `INFO`, `WARNING`, `CRITICAL`

### POST `/alerts/{id}/mark-read/`
Marquer comme lue.

### POST `/alerts/mark-all-read/`
Tout marquer comme lu.

---

## 17. Audit

### GET `/audit-logs/`
Lecture seule, journal complet d'audit.
**Permission** : ManagerOrAdmin + FeatureReportsCenterEnabled
**Filtres** : `store`, `action`, `entity_type`
**Recherche** : `action`, `entity_type`, `entity_id`
**Tri** : `created_at`

**Champs** : `id`, `actor`, `actor_name`, `store`, `action`, `entity_type`, `entity_id`, `before_json`, `after_json`, `ip_address`, `created_at`

---

## 18. Rapports

### GET `/reports/kpis/`
KPIs du tableau de bord.
**Permission** : FeatureReportsCenterEnabled
**Query params** : `store` (requis), `date_from`, `date_to`

**Reponse** :
```json
{
  "total_sales": 5000000,
  "total_orders": 150,
  "average_basket": 33333,
  "gross_margin": 1500000,
  "total_discounts": 200000,
  "total_refunds": 50000,
  "net_sales": 4750000,
  "credit_outstanding": 800000,
  "stock_value": 12000000,
  "top_products": [...],
  "sales_trend": [...]
}
```

### GET `/reports/sales/`
Rapport de ventes detaille.
**Permission** : ManagerOrAdmin + FeatureReportsCenterEnabled
**Query params** : `store`, `date_from`, `date_to`, `seller`, `group_by`

### GET `/reports/cashier-operations/pdf/`
Rapport operations caisse en PDF.
**Permission** : ManagerOrAdmin + FeatureReportsCenterEnabled
**Query params** : `store`, `date_from`, `date_to`, `cashier`

### GET `/reports/stock-trend/`
Tendance valeur du stock.
**Permission** : ManagerOrAdmin + FeatureReportsCenterEnabled
**Query params** : `store`, `months`

### GET `/reports/daily-statistics/`
Statistiques du jour.
**Permission** : ManagerOrAdmin + FeatureReportsCenterEnabled
**Query params** : `store`, `date`

---

## 19. Analytics Avancees

> Toutes les routes analytics requierent `IsAuthenticated` + `FeatureAnalyticsEnabled` + `IsManagerOrAdmin`.

### GET `/analytics/strategic-kpis/`
KPIs strategiques (CA, marge, panier moyen, tendances).
**Query params** : `store`, `period` (YYYY-MM)

### GET `/analytics/abc/`
Analyse ABC des produits (classification A/B/C par CA).
**Query params** : `store`

### GET `/analytics/reorder/`
Recommandations de reapprovisionnement.
**Query params** : `store`

### GET `/analytics/credit-scores/`
Scores de credit des clients.
**Query params** : `store`

### GET `/analytics/forecast/`
Previsions de ventes.
**Query params** : `store`

### GET `/analytics/forecast-summary/`
Resume des previsions.
**Query params** : `store`

### GET `/analytics/fraud-events/`
Detection de fraudes.
**Query params** : `store`

### GET `/analytics/margin-movers/`
Produits a forte marge/impact.
**Query params** : `store`, `period`

### GET `/analytics/orientation/`
Conseils d'orientation strategique.
**Query params** : `store`

---

## 20. Analytics Clients

### GET `/analytics/customers/insights/`
Vue d'ensemble des metriques clients.
**Query params** : `store`

### GET `/analytics/customers/top/`
Top clients du mois.
**Query params** : `store`, `period`

### GET `/analytics/customers/dormant/`
Clients dormants (sans achat recent).
**Query params** : `store`

### GET `/analytics/customers/credit-risk/`
Clients a risque credit.
**Query params** : `store`

### GET `/analytics/customers/churn-risk/`
Clients a risque de desabonnement.
**Query params** : `store`

### GET `/analytics/customers/{customer_id}/score/`
Score detaille d'un client.

### GET `/analytics/customers/{customer_id}/recommendations/`
Recommandations produits pour un client.

### GET `/analytics/customers/{customer_id}/next-order/`
Prediction de la prochaine commande.

### GET/PUT `/analytics/admin/customer-rules/`
Configuration des regles analytics client.
**Permission** : ManagerOrAdmin

---

## 21. Analytics Caisse

### GET `/cashier-analytics/dashboard/`
Dashboard individual du caissier connecte.
**Permission** : IsStoreMember + IsCashier + FeatureCashierOperationsEnabled
**Query params** : `store` (requis), `period` (YYYY-MM)

**Reponse** : `cashier`, `period`, `kpis`, `score`, `anomalies`, `payment_methods`, `shifts`

### GET `/cashier-analytics/team/`
Vue equipe caissiers (Admin/Manager).
**Permission** : IsStoreMember + FeatureCashierOperationsEnabled
**Query params** : `store` (requis), `period` (YYYY-MM)

**Reponse** : `period`, `team` (array de caissiers avec scores et KPIs)

---

## 22. Analytics Stock

### GET `/stock-analytics/dashboard/`
Dashboard sante du stock.
**Permission** : IsStoreMember + FeatureStockManagementEnabled + role ADMIN/MANAGER/STOCKER
**Query params** : `store` (requis), `period` (YYYY-MM)

**Reponse** : `kpis`, `score`, `top_rotation`, `bottom_rotation`, `dead_stock`, `rupture_risk`, `suspicious_adjustments`

### GET `/stock-analytics/alerts/`
Alertes stock rapides (ruptures critiques).
**Query params** : `store` (requis)

**Reponse** : `low_stock_count`, `out_of_stock_count`, `dead_stock_count`, `critical_ruptures`, `warning_ruptures`

---

## 23. Dashboard DG

### GET `/dg/dashboard/`
Vue executive direction generale.
**Permission** : IsStoreMember + ModuleAnalyticsDGEnabled + role ADMIN/MANAGER
**Query params** : `store` (requis), `period` (YYYY-MM)

**Reponse** :
```json
{
  "period": "2026-03",
  "global_score": 72.5,
  "scores": { "sellers": 65.0, "cashiers": 80.0, "stock": 72.5 },
  "revenue": { "total_sales": "...", "total_collected": "...", ... },
  "team": { "seller_count": 5, "cashier_count": 3 },
  "stock_summary": { "health_score": 72.5, ... },
  "top_sellers": [...],
  "top_cashiers": [...],
  "org_alerts": [...]
}
```

---

## 24. Depenses

### CRUD `/expense-categories/`
**Permission** : FeatureExpensesManagementEnabled + CanManageExpenseCategories
**Filtres** : `store`, `type`, `is_active`
**Recherche** : `name`

### CRUD `/wallets/`
**Permission** : FeatureExpensesManagementEnabled + CanManageExpenseWallets
**Filtres** : `store`, `type`, `is_active`
**Recherche** : `name`

### CRUD `/expenses/`
**Permissions dynamiques** :
- list/retrieve : CanViewExpenseReports
- create : CanCreateExpense
- update : CanEditExpense
- void/destroy : CanVoidExpense

**Filtres** : `store`, `status`, `category`, `wallet`, `created_by`, `expense_date`
**Recherche** : `expense_number`, `description`, `supplier_name`
**Tri** : `created_at`, `expense_date`, `amount`, `expense_number`, `status`

### POST `/expenses/{id}/void/`
Annuler une depense.
```json
{ "reason": "Erreur de saisie" }
```

### GET `/expenses/export-csv/`

### CRUD `/expense-budgets/`
Budgets mensuels par categorie.
**Permission** : CanSetExpenseBudgets
**Filtres** : `store`, `category`, `period`

### CRUD `/recurring-expenses/`
Modeles de depenses recurrentes.
**Filtres** : `store`, `frequency`, `is_active`, `next_run_date`

### POST `/recurring-expenses/run-due/`
Generer manuellement les depenses echues.
```json
{ "store": "uuid", "run_date": "2026-03-01" }
```

### GET `/expenses/dashboard/`
Dashboard depenses (KPIs, budgets, comparaison mensuelle).
**Permission** : CanViewExpenseReports
**Query params** : `store`, `period` (YYYY-MM)

**Reponse** : `total_expenses`, `previous_total_expenses`, `comparison`, `by_category`, `by_wallet`, `top_5_categories`, `revenue_total`, `expense_ratio_percent`, `budgets`

---

## 25. Objectifs Vendeurs

### CRUD `/objective-rules/`
Regles d'objectifs (paliers, bonus).
**Permission** : ModuleSellerPerformanceEnabled + IsAdminOrManager

### CRUD `/seller-objectives/`
Objectifs individuels par vendeur/periode.
**Permission** : ModuleSellerPerformanceEnabled + IsAdminOrManager
**Query params filtre** : `period`

### CRUD `/objective-penalty-types/`
Types de penalites.
**Permission** : ModuleSellerPerformanceEnabled + IsAdminOrManager

### CRUD `/objective-penalties/`
Penalites appliquees.
**Query params filtre** : `period`, `seller_id`

#### POST `/objective-penalties/{id}/void/`
Annuler une penalite.

### CRUD `/objective-sprints/`
Sprints de vente (challenges temporaires).

#### GET `/objective-sprints/current/`
Sprint actif avec classement live.

### GET `/objectives/seller/dashboard/`
Dashboard vendeur complet.
**Permission** : Authentifie + ModuleSellerPerformanceEnabled (role SALES)
**Query params** : `period` (YYYY-MM)

**Reponse** : stats, projection, ranking, score_360, risk, profile, has_active_rule

### GET `/objectives/seller/history/`
Historique mensuel.
**Query params** : `year` (YYYY)

### GET `/objectives/seller/badges/`
Badges gagnes.

### GET `/objectives/seller/ranking/`
Classement multi-periodes.
**Query params** : `period`

### GET `/objectives/seller/credit-quality/`
Qualite credit du vendeur.
**Query params** : `period`

### GET `/objectives/seller/product-mix/`
Mix produits du vendeur.
**Query params** : `period`

### GET `/objectives/seller/coaching/`
Missions coaching du jour.
**Query params** : `period`

### GET `/objectives/leaderboard/`
Classement vendeurs (avec masquage selon visibilite).
**Query params** : `period`

### GET/PATCH `/objectives/leaderboard/settings/`
Parametres du classement (Admin/Manager).

### GET `/objectives/admin/stats/`
Stats de tous les vendeurs (Admin/Manager).
**Query params** : `period`

### POST `/objectives/recompute/`
Relancer le calcul des objectifs.
```json
{
  "period": "2026-03",
  "seller_id": "uuid-optionnel"
}
```

---

## 26. CRM Commercial

### CRUD `/commercial/regions/`
Regions commerciales.

### CRUD `/commercial/sectors/`
Secteurs d'activite.

### CRUD `/commercial/tags/`
Tags CRM.

### CRUD `/commercial/lead-sources/`
Sources de leads.

### CRUD `/commercial/prospects/`
Gestion des prospects.

#### POST `/commercial/prospects/{id}/qualify/`
Qualifier un prospect (changer le stade).

#### POST `/commercial/prospects/{id}/convert-to-customer/`
Convertir en client.

### CRUD `/commercial/opportunities/`
Pipeline d'opportunites.

#### POST `/commercial/opportunities/{id}/move-stage/`
Changer d'etape dans le pipeline.

#### POST `/commercial/opportunities/{id}/mark-won/`
Marquer comme gagnee.

#### POST `/commercial/opportunities/{id}/mark-lost/`
Marquer comme perdue.

#### POST `/commercial/opportunities/{id}/link-quote/`
Lier un devis existant.

### CRUD `/commercial/activities/`
Activites commerciales (appels, emails, visites).

### CRUD `/commercial/tasks/`
Taches de suivi.

#### POST `/commercial/tasks/{id}/complete/`
Completer une tache.

### CRUD `/commercial/objectives/`
Objectifs mensuels commerciaux.

### CRUD `/commercial/incentive-policies/`
Politiques de primes.

#### POST `/commercial/incentive-policies/{id}/set-tiers/`
Configurer les paliers de primes.

### CRUD `/commercial/incentive-runs/`
Runs de calcul de primes.

#### POST `/commercial/incentive-runs/{id}/compute/`
Lancer le calcul.

#### POST `/commercial/incentive-runs/{id}/approve/`
Approuver les primes.

#### GET `/commercial/incentive-runs/{id}/results/`
Resultats du calcul.

### `/commercial/exports/`
Exports CRM.

#### GET `/commercial/exports/pipeline-csv/`
Export pipeline CSV.

#### GET `/commercial/exports/activities-csv/`
Export activites CSV.

#### GET `/commercial/exports/prospects-csv/`
Export prospects CSV.

#### GET `/commercial/exports/funnel/`
Donnees entonnoir de conversion.

---

## 27. GRH

> Tous les endpoints GRH requierent `ModuleHRMEnabled` + `CanManageHRM` ou `CanViewHRM`.

### CRUD `/hrm/departments/`
### CRUD `/hrm/positions/`
### CRUD `/hrm/employees/`

#### POST `/hrm/employees/{id}/terminate/`
Resilier un employe.

#### GET `/hrm/employees/export-csv/`

### CRUD `/hrm/contracts/`
### CRUD `/hrm/attendance-policies/`
### CRUD `/hrm/attendances/`

#### POST `/hrm/attendances/bulk-create/`
Pointage en masse.

#### GET `/hrm/attendances/monthly-summary/`
Synthese mensuelle.

### CRUD `/hrm/leave-types/`
### CRUD `/hrm/leave-balances/`

#### POST `/hrm/leave-balances/bulk-init/`
Initialisation en masse des soldes.

### CRUD `/hrm/leave-requests/`

#### POST `/hrm/leave-requests/{id}/approve/`
#### POST `/hrm/leave-requests/{id}/reject/`
#### POST `/hrm/leave-requests/{id}/cancel/`

### CRUD `/hrm/payroll-periods/`

#### POST `/hrm/payroll-periods/{id}/generate-payslips/`
Generer les bulletins de paie.

#### POST `/hrm/payroll-periods/{id}/close/`
Cloturer la periode de paie.

### CRUD `/hrm/payslips/`

#### POST `/hrm/payslips/{id}/recalculate/`
Recalculer un bulletin.

#### GET `/hrm/payslips/{id}/pdf/`
Telecharger bulletin PDF.

### CRUD `/hrm/payslip-lines/`
### CRUD `/hrm/salary-components/`
### CRUD `/hrm/employee-salary-components/`
### CRUD `/hrm/evaluation-templates/`
### CRUD `/hrm/evaluation-criteria/`
### CRUD `/hrm/performance-reviews/`

#### POST `/hrm/performance-reviews/{id}/submit/`
Soumettre l'evaluation.

#### POST `/hrm/performance-reviews/{id}/acknowledge/`
Accuser reception.

### CRUD `/hrm/performance-scores/`
### CRUD `/hrm/disciplinary-actions/`
### CRUD `/hrm/documents/`
### CRUD `/hrm/holidays/`

---

## 28. Verification Documents

### GET `/documents/verify/{token}/`
Verification d'authenticite d'un document (facture, devis, recu).
**Permission** : Public (aucune authentification requise)
**Parametre** : `token` (string unique genere a la creation du document)

**Reponse 200** :
```json
{
  "valid": true,
  "document_type": "INVOICE",
  "number": "FAC-MP01-2026-00042",
  "date": "2026-03-01",
  "store": "Magasin Principal",
  "total": 125000
}
```

---

## Pagination

Tous les endpoints pagines utilisent `StandardResultsSetPagination` :

```json
{
  "count": 150,
  "next": "https://api.example.com/api/v1/products/?page=2",
  "previous": null,
  "results": [...]
}
```

Taille par defaut : **25 elements**. Modifiable via `?page_size=50` (max 100).

---

## Codes d'erreur

| Code | Signification |
|------|--------------|
| 200 | Succes |
| 201 | Cree |
| 204 | Supprime (pas de contenu) |
| 400 | Requete invalide (validation) |
| 401 | Non authentifie |
| 403 | Acces refuse (permission insuffisante) |
| 404 | Ressource introuvable |
| 429 | Trop de requetes (throttle) |
| 500 | Erreur serveur |
