# Modularization And Paid Packaging Blueprint

## 1) Business Goal

Build a product structure that allows:

- clean feature placement (each page in the right business area),
- paid module activation per enterprise and per store,
- strict access enforcement (no hidden unauthorized action leaks),
- future evolution without immediate microservice migration.

Current architecture (Django modular monolith) is compatible with this target.

## 2) Target Product Modules

### 2.1 Module catalog

| Code | Module Name | Main Value | Depends On |
|---|---|---|---|
| `CORE` | Platform Core | auth, users, stores, roles, audit, settings | none |
| `SELL` | Sales POS | draft sales, submit sales, quotes | `CORE` |
| `CASH` | Cashier Ops | cash shifts, payments, receipts | `SELL` |
| `CUSTOMER` | Customer + Credit | customers, credit accounts, schedules, recovery | `SELL`, `CASH` |
| `STOCK` | Stock Ops | levels, movements, transfers, inventory counts | `CORE` |
| `PURCHASE` | Purchases | suppliers, purchase orders, goods receipts | `STOCK` |
| `EXPENSE` | Expense Control | expenses, wallets, budgets, recurring | `CORE` |
| `SELLER_PERF` | Seller Performance | objectives, rankings, coaching, penalties | `SELL`, `CASH` |
| `ANALYTICS_MANAGER` | Manager Analytics | analytics page, reports, statistics | `SELL`, `CASH`, `STOCK` |
| `ANALYTICS_CASHIER` | Cashier Analytics | cashier personal/team analytics | `CASH` |
| `ANALYTICS_STOCK` | Stock Analytics | stock analytics dashboard and alerts | `STOCK` |
| `ANALYTICS_DG` | DG Dashboard | executive cross-domain dashboard | `ANALYTICS_MANAGER`, `ANALYTICS_CASHIER`, `ANALYTICS_STOCK` |
| `CLIENT_INTEL` | Client Intelligence AI | customer score, churn, next order, recommendations | `CUSTOMER`, `ANALYTICS_MANAGER` |
| `ALERTS` | Alerts Center | alerts list and notification center | `CORE` |

### 2.2 Paid packs

| Pack | Included Modules | Target |
|---|---|---|
| Starter | `CORE`, `SELL` | small POS only |
| Retail Ops | Starter + `CASH`, `STOCK` | operational retail |
| Business | Retail Ops + `CUSTOMER`, `PURCHASE`, `EXPENSE`, `ALERTS` | full store management |
| Performance | Business + `SELLER_PERF`, `ANALYTICS_MANAGER`, `ANALYTICS_CASHIER`, `ANALYTICS_STOCK` | manager led stores |
| Executive AI | Performance + `ANALYTICS_DG`, `CLIENT_INTEL` | HQ / DG analysis |

## 3) Access Model (Hard Rule)

A user action is allowed only when all checks pass:

1. module enabled (enterprise/store entitlement),
2. feature flag enabled (fine toggle),
3. user capability/role authorized.

Formula:

`ALLOW = module_enabled && feature_enabled && capability_ok`

This prevents the issue you reported before (button visible but action denied).

## 4) DB Design For Paid Modules

Use existing subscription objects, add module entitlement layer.

### 4.1 New tables (recommended)

#### `billing_module`

- `id` UUID PK
- `code` varchar(50) unique (example: `CASH`)
- `name` varchar(120)
- `description` text
- `is_active` bool
- `created_at`, `updated_at`

Indexes:

- unique(`code`)
- index(`is_active`)

#### `billing_module_dependency`

- `id` UUID PK
- `module_id` FK -> `billing_module`
- `depends_on_module_id` FK -> `billing_module`

Constraints:

- unique(`module_id`, `depends_on_module_id`)
- check module != depends_on_module

#### `billing_plan`

- `id` UUID PK
- `code` varchar(50) unique
- `name` varchar(120)
- `billing_cycle` enum(`MONTHLY`,`QUARTERLY`,`YEARLY`,`CUSTOM`)
- `base_price_fcfa` bigint
- `currency` varchar(10) default `FCFA`
- `is_active` bool
- `created_at`, `updated_at`

#### `billing_plan_module`

- `id` UUID PK
- `plan_id` FK -> `billing_plan`
- `module_id` FK -> `billing_module`
- `included` bool default true

Constraint:

- unique(`plan_id`, `module_id`)

#### `enterprise_plan_assignment`

- `id` UUID PK
- `enterprise_id` FK -> `stores_enterprise`
- `plan_id` FK -> `billing_plan`
- `status` enum(`TRIAL`,`ACTIVE`,`PAST_DUE`,`CANCELED`,`EXPIRED`)
- `starts_on` date
- `ends_on` date nullable
- `auto_renew` bool
- `source_subscription_id` FK nullable -> existing `stores_enterprisesubscription`
- `created_at`, `updated_at`

Indexes:

- (`enterprise_id`, `status`)
- (`starts_on`, `ends_on`)

#### `store_module_entitlement`

- `id` UUID PK
- `store_id` FK -> `stores_store`
- `module_id` FK -> `billing_module`
- `state` enum(`INHERIT`,`ENABLED`,`DISABLED`)
- `reason` varchar(255) nullable
- `created_by_id` FK nullable -> `accounts_user`
- `created_at`, `updated_at`

Constraint:

- unique(`store_id`, `module_id`)

#### `feature_entitlement_override` (optional, for very fine pricing)

- `id` UUID PK
- `store_id` FK -> `stores_store`
- `module_id` FK -> `billing_module`
- `feature_key` varchar(80)
- `state` enum(`INHERIT`,`ENABLED`,`DISABLED`)
- `created_at`, `updated_at`

Constraint:

- unique(`store_id`, `module_id`, `feature_key`)

### 4.2 FCFA precision

Use integer cents model if needed (`amount_fcfa` bigint) or Decimal in DB with strict scale.
For high values in FCFA, prefer integer-based storage in billing tables.

## 5) Mapping To Existing Feature Flags

Existing keys in `stores/models.py` remain usable. Map them to module codes:

| Existing Feature Flag | Module |
|---|---|
| `sales_pos`, `sales_refund` | `SELL` |
| `cashier_operations` | `CASH` |
| `stock_management`, `stock_entries` | `STOCK` |
| `purchases_management` | `PURCHASE` |
| `credit_management` | `CUSTOMER` |
| `expenses_management` | `EXPENSE` |
| `alerts_center` | `ALERTS` |
| `reports_center` | `ANALYTICS_MANAGER` |
| `dashboard_strategic`, `abc_analysis`, `dynamic_reorder`, `credit_scoring`, `sales_forecast`, `fraud_detection` | `ANALYTICS_MANAGER` |
| `advanced_permissions` | `CORE` |

Recommendation:

- keep current flags as technical toggles,
- add module entitlements as commercial gate,
- resolve both in one service.

## 6) Frontend Route To Module Mapping (current app)

Source: `frontend/src/App.tsx`

| Route Prefix | Module | Notes |
|---|---|---|
| `/dashboard` | `CORE` | common landing |
| `/pos`, `/quotes` | `SELL` | seller flow |
| `/cashier`, `/cashier/payment/:saleId`, `/cashier/receipt/:saleId` | `CASH` | cashier ops |
| `/cashier/analytics`, `/cashier/team-analytics` | `ANALYTICS_CASHIER` | analytics addon |
| `/catalog` | `SELL` (read), `STOCK` (manage) | split display vs management |
| `/stock/*` | `STOCK` | stock operations |
| `/stock/analytics` | `ANALYTICS_STOCK` | analytics addon |
| `/customers/*`, `/credits/*` | `CUSTOMER` | customer + credit |
| `/expenses/*` | `EXPENSE` | expense control |
| `/purchases/*` | `PURCHASE` | procurement |
| `/objectives/*` | `SELLER_PERF` | seller performance |
| `/reports`, `/statistics`, `/analytics` | `ANALYTICS_MANAGER` | manager analytics |
| `/dg/dashboard` | `ANALYTICS_DG` | executive view |
| `/alerts` | `ALERTS` | alerts center |
| `/settings/*`, `/profile` | `CORE` | platform/admin |

## 7) API Mapping (current `src/api/urls.py`)

| API Prefix | Module |
|---|---|
| `/auth/*` | `CORE` |
| `/stores`, `/users`, `/roles`, `/store-users`, `/audit-logs`, `/enterprises`, `/enterprise-subscriptions` | `CORE` |
| `/sales`, `/quotes`, `/refunds` | `SELL` |
| `/payments`, `/cash-shifts` | `CASH` |
| `/customers`, `/credit-accounts`, `/credit-ledger`, `/payment-schedules` | `CUSTOMER` |
| `/stock`, `/stock-movements`, `/stock-transfers`, `/stock-counts`, `/categories`, `/brands`, `/products` | `STOCK` |
| `/suppliers`, `/purchase-orders`, `/goods-receipts` | `PURCHASE` |
| `/expenses`, `/expense-categories`, `/wallets`, `/expense-budgets`, `/recurring-expenses` | `EXPENSE` |
| `/objective-*`, `/objectives/*`, `/seller-objectives` | `SELLER_PERF` |
| `/reports/*`, `/analytics/strategic-kpis`, `/analytics/abc`, `/analytics/reorder`, `/analytics/credit-scores`, `/analytics/forecast`, `/analytics/fraud-events`, `/analytics/forecast-summary`, `/analytics/margin-movers`, `/analytics/orientation` | `ANALYTICS_MANAGER` |
| `/cashier-analytics/*` | `ANALYTICS_CASHIER` |
| `/stock-analytics/*` | `ANALYTICS_STOCK` |
| `/dg/dashboard` | `ANALYTICS_DG` |
| `/analytics/customers/*`, `/analytics/admin/customer-rules` | `CLIENT_INTEL` |
| `/alerts/*` | `ALERTS` |

## 8) UI Reorganization (to fix "tab not at right place")

Rebuild sidebar with business groups:

1. Sell
2. Cash
3. Customer
4. Stock
5. Purchases
6. Expense
7. Performance
8. Executive
9. Administration

Rules:

- hide group if module not enabled,
- hide page entry if role/capability fails,
- hide action buttons in pages if capability fails (not just disable).

## 9) Enforcement Implementation Design

### 9.1 Backend

Create a resolver:

- `resolve_store_module_matrix(store, date)` returns `{module_code: bool}`

Then add permission classes:

- `ModuleEnabled("SELL")`
- `ModuleEnabled("CASH")`
- etc

Use in DRF views and critical Django views.

### 9.2 Frontend

Expose a bootstrap endpoint:

- `GET /api/v1/me/module-matrix?store=<id>`

Response:

```json
{
  "store_id": "...",
  "modules": {
    "SELL": true,
    "CASH": false,
    "CUSTOMER": true
  },
  "features": {
    "sales_pos": true,
    "cashier_operations": false
  },
  "capabilities": ["CAN_SELL", "CAN_VIEW_REPORTS"]
}
```

Use this matrix in:

- sidebar filtering,
- route guards,
- action-level rendering.

## 10) Rollout Plan (4 phases)

### Phase 1 (week 1): Catalog and mapping

- add module tables and seed data,
- add full route/API mapping constants,
- create admin page for module activation per enterprise/store.

### Phase 2 (week 2): Read-only enforcement

- expose module matrix endpoint,
- hide menus/pages in frontend based on matrix,
- log violations (without hard block) in backend.

### Phase 3 (week 3): Hard enforcement

- activate backend permission blocking by module,
- remove unauthorized action buttons everywhere.

### Phase 4 (week 4): Commercial packs

- add plan assignment UI and billing workflows,
- migration script for existing tenants to default pack.

## 11) Acceptance Criteria

- no route visible if module disabled,
- no API action accepted if module disabled,
- no button shown for unauthorized capability,
- enterprise can enable/disable paid modules without deploy,
- audit log records every module entitlement change,
- old tenants keep service continuity after migration.

## 12) Minimal Migration Policy For Existing Clients

- default existing active clients to `Business` pack equivalent,
- store-level overrides set to `INHERIT`,
- run dry-run report before applying,
- keep rollback script for assignment table only.

