# Feature Flags Plateforme

Le projet utilise des feature flags au niveau:

- Entreprise: valeur par defaut pour toutes les boutiques.
- Boutique: override optionnel (`inherit`, `enabled`, `disabled`).

Les valeurs sont stockees dans:

- `Enterprise.analytics_feature_flags` (JSON)
- `Store.analytics_feature_overrides` (JSON)

## Flags disponibles

- `sales_pos`: active/desactive le module POS (`/pos/`)
- `sales_refund`: active/desactive les remboursements de vente
- `cashier_operations`: active/desactive la caisse (`/cashier/`)
- `stock_management`: active/desactive le module stock (`/stock/`)
- `stock_entries`: active/desactive les ecrans d'entree/ajustement stock
- `purchases_management`: active/desactive les achats (`/purchases/`)
- `credit_management`: active/desactive le credit client (`/credits/`)
- `alerts_center`: active/desactive les alertes (`/alerts/`)
- `reports_center`: active/desactive les rapports (`/reports/`)
- `enabled`: active/desactive le module analytics global
- `dashboard_strategic`: active/desactive le dashboard DG
- `abc_analysis`: active/desactive l'analyse ABC
- `dynamic_reorder`: active/desactive le reappro dynamique
- `credit_scoring`: active/desactive le scoring credit
- `sales_forecast`: active/desactive la prevision des ventes
- `fraud_detection`: active/desactive la detection fraude

## API / Code

Helpers principaux:

- `store.is_feature_enabled("flag_key")`
- `store.effective_feature_flags`
- `enterprise.is_feature_enabled("flag_key")`
- `enterprise.effective_feature_flags`

Compatibilite analytics conservee:

- `store.is_analytics_feature_enabled(...)`
- `store.effective_analytics_feature_flags`

## Comportement runtime

- Les routes sont filtrees par `StoreFeatureFlagsMiddleware`.
- La sidebar masque les modules desactives pour la boutique active.
- Si un module est bloque:
  - Web: message flash + redirection dashboard.
  - API: HTTP 403 JSON avec `feature_flag`.
