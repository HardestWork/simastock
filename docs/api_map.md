# API Map — Systeme de Gestion Commerciale

> Cartographie exhaustive de tous les endpoints REST (`/api/v1/`).
> Genere automatiquement a partir du code source (mars 2026).

Base URL : `/api/v1/`

---

## Legende

| Symbole | Signification |
|---------|--------------|
| `R` | Router (CRUD auto via DRF ViewSet) |
| `A` | Action custom (`@action`) |
| `V` | APIView standalone |
| `Auth` | Authentification requise (JWT HttpOnly cookie) |
| `Public` | Aucune authentification requise |

---

## 1. Authentification

| Methode | Endpoint | Type | Auth | Description |
|---------|----------|------|------|-------------|
| POST | `/auth/token/` | V | Public | Obtenir JWT (access + refresh en cookies HttpOnly) |
| POST | `/auth/token/refresh/` | V | Public | Rafraichir le token d'acces |
| POST | `/auth/logout/` | V | Public | Supprimer les cookies d'auth |
| GET | `/auth/csrf/` | V | Public | Obtenir un token CSRF |
| GET/PATCH | `/auth/me/` | V | Auth | Profil utilisateur connecte |
| GET | `/auth/module-matrix/` | V | Auth | Matrice modules/fonctionnalites du store |
| POST | `/auth/password/change/` | V | Auth | Changer son mot de passe |
| POST | `/auth/password/reset/` | V | Public | Demander un email de reinitialisation |
| POST | `/auth/password/reset/confirm/` | V | Public | Confirmer reinitialisation (uid + token) |

---

## 2. Entreprises & Magasins

| Methode | Endpoint | Type | Auth | Description |
|---------|----------|------|------|-------------|
| CRUD | `/enterprises/` | R | Auth | Gestion des entreprises |
| POST | `/enterprises/{id}/setup/` | A | Auth | Configuration initiale entreprise |
| CRUD | `/enterprise-subscriptions/` | R | Auth | Abonnements entreprise |
| CRUD | `/billing-modules/` | R | Auth | Modules de facturation |
| CRUD | `/billing-plans/` | R | Auth | Plans de facturation |
| CRUD | `/enterprise-plan-assignments/` | R | Auth | Affectation plans aux entreprises |
| CRUD | `/store-module-entitlements/` | R | Auth | Droits modules par magasin |
| POST | `/store-module-entitlements/bulk-upsert/` | A | Auth | Upsert en masse des droits modules |
| CRUD | `/stores/` | R | Auth | Gestion des magasins |
| GET | `/stores/my-stores/` | A | Auth | Magasins de l'utilisateur connecte |
| PATCH | `/stores/{id}/switch/` | A | Auth | Changer de magasin actif |
| CRUD | `/store-users/` | R | Auth | Utilisateurs par magasin |
| CRUD | `/roles/` | R | Auth | Roles personnalises |

---

## 3. Utilisateurs

| Methode | Endpoint | Type | Auth | Description |
|---------|----------|------|------|-------------|
| CRUD | `/users/` | R | Auth | Gestion des utilisateurs |
| POST | `/users/{id}/toggle-active/` | A | Auth | Activer/desactiver un utilisateur |
| POST | `/users/{id}/assign-stores/` | A | Auth | Affecter des magasins |
| POST | `/users/{id}/reset-password/` | A | Auth | Reinitialiser mot de passe d'un utilisateur |

---

## 4. Catalogue

| Methode | Endpoint | Type | Auth | Description |
|---------|----------|------|------|-------------|
| CRUD | `/categories/` | R | Auth | Categories de produits |
| CRUD | `/brands/` | R | Auth | Marques |
| CRUD | `/products/` | R | Auth | Produits |
| GET | `/products/pos/` | A | Auth | Liste produits optimisee pour POS |
| POST | `/products/{id}/upload-image/` | A | Auth | Upload image produit |
| POST | `/products/import-csv/` | A | Auth | Import produits par CSV |
| GET | `/products/export-csv/` | A | Auth | Export produits en CSV |

---

## 5. Stock

| Methode | Endpoint | Type | Auth | Description |
|---------|----------|------|------|-------------|
| CRUD | `/stock/` | R | Auth | Niveaux de stock par produit/magasin |
| POST | `/stock/bulk-entry/` | A | Auth | Entree de stock en masse |
| POST | `/stock/bulk-adjust/` | A | Auth | Ajustement de stock en masse |
| GET | `/stock/export-csv/` | A | Auth | Export stock en CSV |
| GET | `/stock-movements/` | R (list) | Auth | Historique des mouvements de stock |
| GET | `/stock-movements/export-csv/` | A | Auth | Export mouvements en CSV |
| CRUD | `/stock-transfers/` | R | Auth | Transferts inter-magasins |
| POST | `/stock-transfers/{id}/ship/` | A | Auth | Expedier un transfert |
| POST | `/stock-transfers/{id}/receive/` | A | Auth | Recevoir un transfert |
| POST | `/stock-transfers/{id}/cancel/` | A | Auth | Annuler un transfert |
| CRUD | `/stock-counts/` | R | Auth | Inventaires physiques |
| POST | `/stock-counts/{id}/update-lines/` | A | Auth | Mettre a jour les lignes d'inventaire |
| POST | `/stock-counts/{id}/validate/` | A | Auth | Valider un inventaire |
| POST | `/stock-counts/{id}/cancel/` | A | Auth | Annuler un inventaire |

---

## 6. Clients

| Methode | Endpoint | Type | Auth | Description |
|---------|----------|------|------|-------------|
| CRUD | `/customers/` | R | Auth | Gestion des clients |
| GET | `/customers/{id}/purchase-history/` | A | Auth | Historique d'achats d'un client |
| GET | `/customers/export-csv/` | A | Auth | Export clients en CSV |

---

## 7. Ventes (POS)

| Methode | Endpoint | Type | Auth | Description |
|---------|----------|------|------|-------------|
| CRUD | `/sales/` | R | Auth | Gestion des ventes |
| POST | `/sales/{id}/add-item/` | A | Auth | Ajouter un article a une vente |
| POST | `/sales/{id}/remove-item/` | A | Auth | Retirer un article |
| POST | `/sales/{id}/set-item-quantity/` | A | Auth | Modifier la quantite d'un article |
| POST | `/sales/{id}/set-item-unit-price/` | A | Auth | Modifier le prix unitaire |
| POST | `/sales/{id}/submit/` | A | Auth | Soumettre la vente en caisse |
| POST | `/sales/{id}/cancel/` | A | Auth | Annuler une vente |
| GET | `/sales/{id}/invoice/` | A | Auth | Telecharger facture PDF |
| GET | `/sales/{id}/receipt/` | A | Auth | Telecharger recu PDF |
| GET | `/sales/export-csv/` | A | Auth | Export ventes en CSV |

---

## 8. Devis & Proformas

| Methode | Endpoint | Type | Auth | Description |
|---------|----------|------|------|-------------|
| CRUD | `/quotes/` | R | Auth | Gestion des devis/proformas |
| POST | `/quotes/{id}/add-item/` | A | Auth | Ajouter un article au devis |
| POST | `/quotes/{id}/remove-item/` | A | Auth | Retirer un article |
| POST | `/quotes/{id}/send/` | A | Auth | Envoyer le devis au client |
| POST | `/quotes/{id}/accept/` | A | Auth | Marquer comme accepte |
| POST | `/quotes/{id}/reject/` | A | Auth | Marquer comme rejete |
| POST | `/quotes/{id}/convert/` | A | Auth | Convertir en vente |
| POST | `/quotes/{id}/cancel/` | A | Auth | Annuler un devis |
| GET | `/quotes/{id}/pdf/` | A | Auth | Telecharger PDF |

---

## 9. Paiements & Caisse

| Methode | Endpoint | Type | Auth | Description |
|---------|----------|------|------|-------------|
| GET | `/payments/` | R (list) | Auth | Liste des paiements |
| POST | `/payments/` | R (create) | Auth | Enregistrer un paiement |
| CRUD | `/cash-shifts/` | R | Auth | Gestion des sessions de caisse |
| POST | `/cash-shifts/{id}/open/` | A | Auth | Ouvrir une session |
| POST | `/cash-shifts/{id}/close/` | A | Auth | Fermer une session |
| GET | `/cash-shifts/{id}/pdf-report/` | A | Auth | Rapport PDF de session |

---

## 10. Credits & Echeanciers

| Methode | Endpoint | Type | Auth | Description |
|---------|----------|------|------|-------------|
| CRUD | `/credit-accounts/` | R | Auth | Comptes credit client |
| POST | `/credit-accounts/{id}/pay/` | A | Auth | Enregistrer un paiement credit |
| GET | `/credit-accounts/{id}/statement/` | A | Auth | Releve de compte |
| GET | `/credit-accounts/{id}/statement-pdf/` | A | Auth | Releve PDF |
| GET | `/credit-ledger/` | R (list) | Auth | Journal des ecritures credit |
| CRUD | `/payment-schedules/` | R | Auth | Echeanciers de paiement |

---

## 11. Remboursements

| Methode | Endpoint | Type | Auth | Description |
|---------|----------|------|------|-------------|
| GET | `/refunds/` | R (list) | Auth | Liste des remboursements |
| POST | `/refunds/` | R (create) | Auth | Creer un remboursement (avec avoir) |
| GET | `/refunds/{id}/` | R (detail) | Auth | Detail d'un remboursement |

---

## 12. Fournisseurs & Achats

| Methode | Endpoint | Type | Auth | Description |
|---------|----------|------|------|-------------|
| CRUD | `/suppliers/` | R | Auth | Gestion des fournisseurs |
| CRUD | `/purchase-orders/` | R | Auth | Bons de commande |
| POST | `/purchase-orders/{id}/submit/` | A | Auth | Soumettre un BC |
| POST | `/purchase-orders/{id}/approve/` | A | Auth | Approuver un BC |
| POST | `/purchase-orders/{id}/cancel/` | A | Auth | Annuler un BC |
| CRUD | `/goods-receipts/` | R | Auth | Receptions de marchandises |

---

## 13. Alertes

| Methode | Endpoint | Type | Auth | Description |
|---------|----------|------|------|-------------|
| CRUD | `/alerts/` | R | Auth | Centre d'alertes |
| POST | `/alerts/{id}/read/` | A | Auth | Marquer comme lue |
| POST | `/alerts/read-all/` | A | Auth | Tout marquer comme lu |

---

## 14. Audit

| Methode | Endpoint | Type | Auth | Description |
|---------|----------|------|------|-------------|
| GET | `/audit-logs/` | R (list) | Auth | Journal d'audit (lecture seule) |

---

## 15. Rapports

| Methode | Endpoint | Type | Auth | Description |
|---------|----------|------|------|-------------|
| GET | `/reports/kpis/` | V | Auth | KPIs du tableau de bord |
| GET | `/reports/sales/` | V | Auth | Rapport de ventes (avec filtres) |
| GET | `/reports/cashier-operations/pdf/` | V | Auth | Rapport operations caisse PDF |
| GET | `/reports/stock-trend/` | V | Auth | Tendance valeur stock |
| GET | `/reports/daily-statistics/` | V | Auth | Statistiques quotidiennes |

---

## 16. Analytics Avancees

| Methode | Endpoint | Type | Auth | Description |
|---------|----------|------|------|-------------|
| GET | `/analytics/strategic-kpis/` | V | Auth | KPIs strategiques (Manager+) |
| GET | `/analytics/abc/` | V | Auth | Analyse ABC produits |
| GET | `/analytics/reorder/` | V | Auth | Recommandations reapprovisionnement |
| GET | `/analytics/credit-scores/` | V | Auth | Scores de credit |
| GET | `/analytics/forecast/` | V | Auth | Previsions de ventes |
| GET | `/analytics/forecast-summary/` | V | Auth | Resume des previsions |
| GET | `/analytics/fraud-events/` | V | Auth | Detection de fraudes |
| GET | `/analytics/margin-movers/` | V | Auth | Produits a forte marge |
| GET | `/analytics/orientation/` | V | Auth | Conseils d'orientation strategique |

### Analytics Clients

| Methode | Endpoint | Type | Auth | Description |
|---------|----------|------|------|-------------|
| GET | `/analytics/customers/insights/` | V | Auth | Insights clients |
| GET | `/analytics/customers/top/` | V | Auth | Top clients du mois |
| GET | `/analytics/customers/dormant/` | V | Auth | Clients dormants |
| GET | `/analytics/customers/credit-risk/` | V | Auth | Clients a risque credit |
| GET | `/analytics/customers/churn-risk/` | V | Auth | Clients a risque de desabonnement |
| GET | `/analytics/customers/{id}/score/` | V | Auth | Score d'un client |
| GET | `/analytics/customers/{id}/recommendations/` | V | Auth | Recommandations produits |
| GET | `/analytics/customers/{id}/next-order/` | V | Auth | Prediction prochaine commande |
| GET/PUT | `/analytics/admin/customer-rules/` | V | Auth | Regles analytics client (admin) |

---

## 17. Analytics Caisse

| Methode | Endpoint | Type | Auth | Description |
|---------|----------|------|------|-------------|
| GET | `/cashier-analytics/dashboard/` | V | Auth | Dashboard caissier (score, KPIs, anomalies) |
| GET | `/cashier-analytics/team/` | V | Auth | Vue equipe caissiers (Manager+) |

---

## 18. Analytics Stock

| Methode | Endpoint | Type | Auth | Description |
|---------|----------|------|------|-------------|
| GET | `/stock-analytics/dashboard/` | V | Auth | Dashboard stock (sante, rotation, ruptures) |
| GET | `/stock-analytics/alerts/` | V | Auth | Alertes stock (ruptures critiques) |

---

## 19. Dashboard DG (Direction Generale)

| Methode | Endpoint | Type | Auth | Description |
|---------|----------|------|------|-------------|
| GET | `/dg/dashboard/` | V | Auth | Vue executive (vendeurs + caisse + stock) |

---

## 20. Depenses

| Methode | Endpoint | Type | Auth | Description |
|---------|----------|------|------|-------------|
| CRUD | `/expense-categories/` | R | Auth | Categories de depenses |
| CRUD | `/wallets/` | R | Auth | Portefeuilles/caisses |
| CRUD | `/expenses/` | R | Auth | Gestion des depenses |
| POST | `/expenses/{id}/void/` | A | Auth | Annuler une depense |
| GET | `/expenses/export-csv/` | A | Auth | Export depenses CSV |
| CRUD | `/expense-budgets/` | R | Auth | Budgets mensuels |
| CRUD | `/recurring-expenses/` | R | Auth | Depenses recurrentes |
| POST | `/recurring-expenses/run-due/` | A | Auth | Generer les depenses echues |
| GET | `/expenses/dashboard/` | V | Auth | Dashboard depenses (KPIs, budgets) |

---

## 21. Objectifs Vendeurs

| Methode | Endpoint | Type | Auth | Description |
|---------|----------|------|------|-------------|
| CRUD | `/objective-rules/` | R | Auth | Regles d'objectifs |
| CRUD | `/seller-objectives/` | R | Auth | Objectifs par vendeur |
| CRUD | `/objective-penalty-types/` | R | Auth | Types de penalites |
| CRUD | `/objective-penalties/` | R | Auth | Penalites appliquees |
| POST | `/objective-penalties/{id}/void/` | A | Auth | Annuler une penalite |
| CRUD | `/objective-sprints/` | R | Auth | Sprints de vente |
| GET | `/objective-sprints/current/` | A | Auth | Sprint actif + classement live |
| GET | `/objectives/seller/dashboard/` | V | Auth | Dashboard vendeur (score 360, projection) |
| GET | `/objectives/seller/history/` | V | Auth | Historique mensuel vendeur |
| GET | `/objectives/seller/badges/` | V | Auth | Badges du vendeur |
| GET | `/objectives/seller/ranking/` | V | Auth | Classement multi-periodes |
| GET | `/objectives/seller/credit-quality/` | V | Auth | Qualite credit du vendeur |
| GET | `/objectives/seller/product-mix/` | V | Auth | Mix produits du vendeur |
| GET | `/objectives/seller/coaching/` | V | Auth | Missions coaching |
| GET | `/objectives/leaderboard/` | V | Auth | Classement vendeurs |
| GET/PATCH | `/objectives/leaderboard/settings/` | V | Auth | Parametres classement (Admin+) |
| GET | `/objectives/admin/stats/` | V | Auth | Stats vendeurs (Admin+) |
| POST | `/objectives/recompute/` | V | Auth | Relancer le calcul objectifs |

---

## 22. CRM Commercial

| Methode | Endpoint | Type | Auth | Description |
|---------|----------|------|------|-------------|
| CRUD | `/commercial/regions/` | R | Auth | Regions commerciales |
| CRUD | `/commercial/sectors/` | R | Auth | Secteurs d'activite |
| CRUD | `/commercial/tags/` | R | Auth | Tags CRM |
| CRUD | `/commercial/lead-sources/` | R | Auth | Sources de leads |
| CRUD | `/commercial/prospects/` | R | Auth | Gestion des prospects |
| POST | `/commercial/prospects/{id}/qualify/` | A | Auth | Qualifier un prospect |
| POST | `/commercial/prospects/{id}/convert-to-customer/` | A | Auth | Convertir en client |
| CRUD | `/commercial/opportunities/` | R | Auth | Opportunites commerciales |
| POST | `/commercial/opportunities/{id}/move-stage/` | A | Auth | Changer d'etape pipeline |
| POST | `/commercial/opportunities/{id}/mark-won/` | A | Auth | Marquer comme gagnee |
| POST | `/commercial/opportunities/{id}/mark-lost/` | A | Auth | Marquer comme perdue |
| POST | `/commercial/opportunities/{id}/link-quote/` | A | Auth | Lier un devis |
| CRUD | `/commercial/activities/` | R | Auth | Activites commerciales |
| CRUD | `/commercial/tasks/` | R | Auth | Taches de suivi |
| POST | `/commercial/tasks/{id}/complete/` | A | Auth | Completer une tache |
| CRUD | `/commercial/objectives/` | R | Auth | Objectifs mensuels commerciaux |
| CRUD | `/commercial/incentive-policies/` | R | Auth | Politiques de primes |
| POST | `/commercial/incentive-policies/{id}/set-tiers/` | A | Auth | Configurer les paliers |
| CRUD | `/commercial/incentive-runs/` | R | Auth | Runs de calcul primes |
| POST | `/commercial/incentive-runs/{id}/compute/` | A | Auth | Lancer le calcul |
| POST | `/commercial/incentive-runs/{id}/approve/` | A | Auth | Approuver les primes |
| GET | `/commercial/incentive-runs/{id}/results/` | A | Auth | Resultats des primes |
| GET/POST | `/commercial/exports/` | R | Auth | Exports CRM (CSV, pipeline, etc.) |
| GET | `/commercial/exports/pipeline-csv/` | A | Auth | Export pipeline CSV |
| GET | `/commercial/exports/activities-csv/` | A | Auth | Export activites CSV |
| GET | `/commercial/exports/prospects-csv/` | A | Auth | Export prospects CSV |
| GET | `/commercial/exports/funnel/` | A | Auth | Donnees entonnoir |

---

## 23. GRH (Gestion des Ressources Humaines)

| Methode | Endpoint | Type | Auth | Description |
|---------|----------|------|------|-------------|
| CRUD | `/hrm/departments/` | R | Auth | Departements |
| CRUD | `/hrm/positions/` | R | Auth | Postes |
| CRUD | `/hrm/employees/` | R | Auth | Employes |
| POST | `/hrm/employees/{id}/terminate/` | A | Auth | Resilier un employe |
| GET | `/hrm/employees/export-csv/` | A | Auth | Export employes CSV |
| CRUD | `/hrm/contracts/` | R | Auth | Contrats de travail |
| CRUD | `/hrm/attendance-policies/` | R | Auth | Politiques de presence |
| CRUD | `/hrm/attendances/` | R | Auth | Pointages |
| POST | `/hrm/attendances/bulk-create/` | A | Auth | Pointage en masse |
| GET | `/hrm/attendances/monthly-summary/` | A | Auth | Synthese mensuelle presence |
| CRUD | `/hrm/leave-types/` | R | Auth | Types de conges |
| CRUD | `/hrm/leave-balances/` | R | Auth | Soldes de conges |
| POST | `/hrm/leave-balances/bulk-init/` | A | Auth | Initialisation en masse |
| CRUD | `/hrm/leave-requests/` | R | Auth | Demandes de conges |
| POST | `/hrm/leave-requests/{id}/approve/` | A | Auth | Approuver un conge |
| POST | `/hrm/leave-requests/{id}/reject/` | A | Auth | Rejeter un conge |
| POST | `/hrm/leave-requests/{id}/cancel/` | A | Auth | Annuler un conge |
| CRUD | `/hrm/payroll-periods/` | R | Auth | Periodes de paie |
| POST | `/hrm/payroll-periods/{id}/generate-payslips/` | A | Auth | Generer les bulletins |
| POST | `/hrm/payroll-periods/{id}/close/` | A | Auth | Cloturer la periode |
| CRUD | `/hrm/payslips/` | R | Auth | Bulletins de paie |
| POST | `/hrm/payslips/{id}/recalculate/` | A | Auth | Recalculer un bulletin |
| GET | `/hrm/payslips/{id}/pdf/` | A | Auth | Telecharger bulletin PDF |
| CRUD | `/hrm/payslip-lines/` | R | Auth | Lignes de bulletin |
| CRUD | `/hrm/salary-components/` | R | Auth | Composantes salariales |
| CRUD | `/hrm/employee-salary-components/` | R | Auth | Composantes par employe |
| CRUD | `/hrm/evaluation-templates/` | R | Auth | Modeles d'evaluation |
| CRUD | `/hrm/evaluation-criteria/` | R | Auth | Criteres d'evaluation |
| CRUD | `/hrm/performance-reviews/` | R | Auth | Evaluations de performance |
| POST | `/hrm/performance-reviews/{id}/submit/` | A | Auth | Soumettre une evaluation |
| POST | `/hrm/performance-reviews/{id}/acknowledge/` | A | Auth | Accuser reception |
| CRUD | `/hrm/performance-scores/` | R | Auth | Scores d'evaluation |
| CRUD | `/hrm/disciplinary-actions/` | R | Auth | Actions disciplinaires |
| CRUD | `/hrm/documents/` | R | Auth | Documents employes |
| CRUD | `/hrm/holidays/` | R | Auth | Jours feries |

---

## 24. Verification de documents

| Methode | Endpoint | Type | Auth | Description |
|---------|----------|------|------|-------------|
| GET | `/documents/verify/{token}/` | V | Public | Verification d'authenticite d'un document |

---

## Resume

| Domaine | ViewSets | APIViews | Actions custom | Total endpoints |
|---------|----------|----------|----------------|-----------------|
| Auth | 0 | 9 | 0 | 9 |
| Entreprises & Magasins | 8 | 0 | 4 | ~44 |
| Utilisateurs | 1 | 0 | 3 | 8 |
| Catalogue | 3 | 0 | 4 | 19 |
| Stock | 4 | 0 | 9 | 29 |
| Clients | 1 | 0 | 2 | 7 |
| Ventes | 1 | 0 | 9 | 14 |
| Devis | 1 | 0 | 8 | 13 |
| Paiements & Caisse | 2 | 0 | 3 | 13 |
| Credits | 3 | 0 | 3 | 18 |
| Remboursements | 1 | 0 | 0 | 3 |
| Achats | 3 | 0 | 3 | 18 |
| Alertes | 1 | 0 | 2 | 7 |
| Audit | 1 | 0 | 0 | 2 |
| Rapports | 0 | 5 | 0 | 5 |
| Analytics | 0 | 18 | 0 | 18 |
| Analytics Caisse | 0 | 2 | 0 | 2 |
| Analytics Stock | 0 | 2 | 0 | 2 |
| DG | 0 | 1 | 0 | 1 |
| Depenses | 5 | 1 | 3 | 28 |
| Objectifs | 5 | 11 | 2 | 30 |
| CRM Commercial | 12 | 0 | 14 | 74 |
| GRH | 21 | 0 | 15 | 120 |
| Documents | 0 | 1 | 0 | 1 |
| **Total** | **~73** | **~50** | **~84** | **~466** |
