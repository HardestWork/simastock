# Module Intelligent ERP (Architecture)

Ce module est concu pour rester scalable, propre, et evolutif vers IA avancee.

## Objectifs couverts
- Analyse ABC automatique des produits.
- Seuil dynamique de reappro base sur les ventes reelles.
- Score client credit avec classification A-E.
- Prevision simple des ventes (moyennes mobiles 7j/30j).
- Detection de fraude par regles + anomalies statistiques.
- Dashboard strategique DG (KPI avances).

## Architecture
- `analytics/models.py`
  - `ABCAnalysis`
  - `ReorderRecommendation`
  - `CustomerCreditScore`
  - `SalesForecast`
  - `FraudEvent`
- `analytics/services.py`
  - Fonctions de calcul pures par domaine.
  - Aucune logique HTTP.
  - Reutilisable par API, tasks Celery, CLI.
- `analytics/tasks.py`
  - Pipeline asynchrone et planifiable.
  - Idempotence par suppression/recreation des snapshots du jour/periode.
- `analytics/views.py`
  - Dashboard web strategique.
  - Option de recalcul manuel auditee.
- `api/v1/analytics_views.py`
  - Endpoints REST securises par roles (`ADMIN`, `MANAGER`).
  - Scope boutique obligatoire/controle.

## Scalabilite
- Snapshots persistes: evite le recalcul lourd a chaque affichage.
- Bulk insert (`bulk_create`) et agregations SQL (`annotate`, `Sum`, `Count`).
- Traitements periodicites decouples via Celery.
- Separation stricte `models/services/tasks/views` pour maintenance.

## Securite et audit
- Endpoints analytics limites a `MANAGER/ADMIN`.
- Verification d'acces boutique sur chaque endpoint.
- Recalcul manuel trace via `stores.services.create_audit_log`.

## Feature Flags (Entreprise/Boutique)
- Niveau entreprise: `Enterprise.analytics_feature_flags` (defaults globaux).
- Niveau boutique: `Store.analytics_feature_overrides` (override local).
- Resolution effective:
  1. Base entreprise
  2. Override boutique par cle
  3. Cle globale `enabled` peut couper tout le module
- Cles disponibles:
  - `enabled`
  - `dashboard_strategic`
  - `abc_analysis`
  - `dynamic_reorder`
  - `credit_scoring`
  - `sales_forecast`
  - `fraud_detection`

## Extensibilite IA avancee
- Points d'extension prets:
  - remplacer `compute_sales_forecast` par modele ML.
  - enrichir `detect_fraud_signals` par scoring probabiliste.
  - brancher un feature store externe.
- Strategie recommande:
  1. Conserver snapshots SQL comme couche de serving.
  2. Entrainer hors ligne (Airflow/ML pipeline).
  3. Ecrire les predictions/scorings dans les memes tables.
  4. Garder API/UI inchangées.

## Endpoints REST exposes
- `GET /api/v1/analytics/strategic-kpis/`
- `GET /api/v1/analytics/abc/`
- `GET /api/v1/analytics/reorder/`
- `GET /api/v1/analytics/credit-scores/`
- `GET /api/v1/analytics/forecast/`
- `GET /api/v1/analytics/fraud-events/`

## Ecran web
- `GET /analytics/strategic/`
