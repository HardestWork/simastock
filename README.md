# Boutique Manager Pro — Système de Gestion de Boutique

Système complet de gestion de boutique d'équipements électroniques et réseaux.
Multi-boutique, séparation vendeur/caissier, crédit client, statistiques, alertes intelligentes.

## Stack technique

| Composant | Technologie |
|-----------|-------------|
| Backend | Python 3.11+, Django 5.x |
| API | Django REST Framework + JWT |
| Base de données | PostgreSQL 16 |
| Cache/Queue | Redis 7, Celery |
| Frontend | Django Templates, Tailwind CSS (Metronic), HTMX, Alpine.js |
| PDF | WeasyPrint |
| Excel | openpyxl |
| Infra | Docker, docker-compose |

## Architecture des apps Django

```
src/
├── config/          # Settings, URLs, WSGI, Celery
│   └── settings/    # base.py, dev.py, prod.py
├── core/            # Models abstraits, utils, PDF, logging, middleware
├── accounts/        # User custom, auth, RBAC
├── stores/          # Store, StoreUser, Sequence, AuditLog
├── catalog/         # Category, Brand, Product, Import/Export
├── stock/           # ProductStock, InventoryMovement, Transfer, StockCount
├── sales/           # Sale, SaleItem, Refund (POS vendeur)
├── cashier/         # CashShift, Payment (encaissement)
├── customers/       # Customer
├── credits/         # CustomerAccount, CreditLedgerEntry, PaymentSchedule
├── reports/         # KPISnapshot, Dashboard, Rapports
├── alerts/          # Alert, Celery tasks intelligentes
├── api/             # DRF ViewSets, Serializers, Permissions
│   └── v1/
├── templates/       # Templates Metronic (Tailwind)
│   ├── base/        # Layout principal
│   ├── components/  # Sidebar, topbar
│   ├── dashboard/   # Tableau de bord
│   ├── pos/         # POS vendeur
│   ├── cashier/     # Caisse
│   ├── catalog/     # Produits
│   ├── stock/       # Stock
│   ├── customers/   # Clients
│   ├── credits/     # Crédit
│   ├── reports/     # Rapports
│   └── pdf/         # Templates PDF (facture, ticket, shift)
└── static/          # CSS, JS, images
```

## Rôles utilisateurs (RBAC)

| Rôle | Droits principaux |
|------|-------------------|
| **ADMIN** | Accès total, gestion utilisateurs/boutiques |
| **MANAGER** | Supervision, validation remises/annulations, rapports |
| **SALES** | Création ventes (DRAFT), soumission à la caisse |
| **CASHIER** | Encaissement, gestion shifts caisse, impression tickets |
| **STOCKER** | Mouvements stock, inventaires, transferts |

## Flux de vente (Vendeur → Caissier)

```
DRAFT → PENDING_PAYMENT → PARTIALLY_PAID → PAID
  ↓                                          ↓
CANCELLED (Manager)              REFUNDED (Manager)
```

1. **Vendeur** crée une vente (DRAFT), ajoute des articles, sélectionne le client
2. **Vendeur** soumet à la caisse → statut `PENDING_PAYMENT` (verrouillé)
3. **Caissier** voit la vente en attente, encaisse (multi-modes: espèces, mobile money, virement)
4. Paiement complet → `PAID`, stock décrémenté
5. Paiement partiel → `PARTIALLY_PAID`, option de réservation stock

## Installation rapide (Docker)

### Prérequis
- Docker Desktop (Windows/Mac/Linux)
- Git

### Commandes

```bash
# 1. Cloner le projet
git clone <url-repo>
cd "Systeme de gestion boutique"

# 2. Copier le fichier d'environnement
cp .env.example .env

# 3. Lancer les services
docker-compose up -d --build

# 4. Créer les tables
docker-compose exec web python manage.py migrate

# 5. Créer le superutilisateur
docker-compose exec web python manage.py createsuperuser

# 6. Charger les données de démonstration
docker-compose exec web python manage.py seed_data

# If the DB already contains the demo users and the passwords below do not work:
docker-compose exec web python manage.py seed_data --reset-passwords

# Or to wipe existing demo data and recreate it:
docker-compose exec web python manage.py seed_data --flush

# Rich demo data (paid/partial sales, cashier shifts, purchases, alerts, analytics):
docker-compose exec web python manage.py seed_demo_data --reset

# 7. Accéder à l'application
# → http://localhost:8000
```

### Comptes de démo (après seed_data)

| Email | Mot de passe | Rôle |
|-------|-------------|------|
| admin@boutique.cm | admin123! | ADMIN |
| manager@boutique.cm | manager123! | MANAGER |
| vendeur1@boutique.cm | vendeur123! | SALES |
| caissier@boutique.cm | caissier123! | CASHIER |
| magasinier@boutique.cm | stock123! | STOCKER |

## Installation locale (sans Docker)

### Windows

```powershell
# 1. Créer l'environnement virtuel
python -m venv venv
venv\Scripts\activate

# 2. Installer les dépendances
pip install -r requirements\dev.txt

# 3. Configurer la base PostgreSQL
# Créer la base "boutique_db" dans pgAdmin ou psql

# 4. Configurer .env
cp .env.example .env
# Modifier DATABASE_URL: postgres://user:password@localhost:5432/boutique_db
# Modifier REDIS_URL: redis://localhost:6379/0

# 5. Migrations + seed
cd src
python manage.py migrate
python manage.py seed_data
python manage.py seed_data --reset-passwords  # if demo passwords do not work
python manage.py seed_demo_data --reset
python manage.py createsuperuser

# 6. Lancer le serveur
python manage.py runserver

# 7. Lancer Celery (dans un autre terminal)
celery -A config worker -l info
celery -A config beat -l info
```

### Linux / macOS

```bash
# 1. Créer l'environnement virtuel
python3 -m venv venv
source venv/bin/activate

# 2. Installer les dépendances
pip install -r requirements/dev.txt

# 3. Configurer PostgreSQL
sudo -u postgres createdb boutique_db

# 4. Configurer .env
cp .env.example .env
# Modifier les variables d'environnement selon votre config

# 5. Migrations + seed
cd src
python manage.py migrate
python manage.py seed_data
python manage.py seed_data --reset-passwords  # if demo passwords do not work
python manage.py createsuperuser

# 6. Lancer
python manage.py runserver

# 7. Celery (autre terminal)
celery -A config worker -l info &
celery -A config beat -l info &
```

## API REST (DRF)

Base URL: `http://localhost:8000/api/v1/`

### Authentification JWT

```bash
# Obtenir un token
curl -X POST http://localhost:8000/api/v1/auth/token/ \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@boutique.cm", "password": "admin123!"}'

# Utiliser le token
curl http://localhost:8000/api/v1/products/ \
  -H "Authorization: Bearer <access_token>"
```

### Endpoints principaux

| Endpoint | Méthodes | Description |
|----------|----------|-------------|
| `/api/v1/auth/token/` | POST | Obtenir JWT |
| `/api/v1/auth/token/refresh/` | POST | Rafraîchir JWT |
| `/api/v1/stores/` | CRUD | Gestion boutiques |
| `/api/v1/users/` | CRUD | Gestion utilisateurs |
| `/api/v1/products/` | CRUD | Catalogue produits |
| `/api/v1/categories/` | CRUD | Catégories |
| `/api/v1/brands/` | CRUD | Marques |
| `/api/v1/stock/` | GET | Niveaux de stock |
| `/api/v1/stock-movements/` | GET, POST | Mouvements stock |
| `/api/v1/customers/` | CRUD | Clients |
| `/api/v1/sales/` | CRUD + actions | Ventes |
| `/api/v1/sales/{id}/submit/` | POST | Soumettre à la caisse |
| `/api/v1/sales/{id}/cancel/` | POST | Annuler |
| `/api/v1/payments/` | GET, POST | Paiements |
| `/api/v1/cash-shifts/` | CRUD + actions | Shifts caisse |
| `/api/v1/credit-accounts/` | CRUD | Comptes crédit |
| `/api/v1/credit-ledger/` | GET | Historique crédit |
| `/api/v1/alerts/` | GET + actions | Alertes |
| `/api/v1/reports/kpis/` | GET | KPIs tableau de bord |
| `/api/v1/reports/sales/` | GET | Rapport ventes |

## Connexion Google (OAuth)

Le projet supporte la connexion/inscription via Google avec `django-allauth`.

### 1. Créer les identifiants OAuth Google

- Ouvrir Google Cloud Console.
- Créer un projet (ou réutiliser un existant).
- Activer l'API `Google People API` (ou `Google Identity` selon console).
- Créer un `OAuth Client ID` de type `Web application`.
- Ajouter l'URL de redirection autorisée :
  - Local: `http://127.0.0.1:8000/accounts/google/login/callback/`
  - Docker: `http://localhost:8000/accounts/google/login/callback/`

### 2. Configurer `.env`

Ajouter:

```env
SITE_ID=1
GOOGLE_OAUTH_CLIENT_ID=xxxxxxxxxxxxxxxx.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=xxxxxxxxxxxxxxxx
```

### 3. Redémarrer l'application

```bash
docker-compose up -d --build
# ou en local
python manage.py runserver
```

Un bouton `Continuer avec Google` apparaît sur l'écran de connexion.
Si l'utilisateur n'existe pas encore, son compte est créé automatiquement.

## Tests

```bash
# Lancer tous les tests
cd src
pytest

# Tests spécifiques
pytest tests/sales/test_sale_flow.py -v
pytest tests/sales/test_rbac.py -v
pytest tests/cashier/test_shift.py -v
pytest tests/credits/test_credit_ledger.py -v

# Avec couverture
pytest --cov=. --cov-report=html
```

## Celery : Jobs programmés

| Job | Fréquence | Description |
|-----|-----------|-------------|
| `check_low_stock` | Toutes les 2h | Alerte stock faible/rupture |
| `check_pending_payments` | Toutes les 30min | Alerte ventes en attente trop longtemps |
| `check_abnormal_discounts` | 22h quotidien | Détection remises anormales |
| `check_cash_variance` | 23h quotidien | Écarts caisse répétés |
| `check_overdue_credits` | 8h quotidien | Crédits en retard |
| `daily_kpi_snapshot` | 1h quotidien | Snapshot KPIs pour historique |

## Déploiement production

### Checklist

- [ ] Modifier `SECRET_KEY` dans `.env` (générer une clé aléatoire)
- [ ] Mettre `DEBUG=False`
- [ ] Configurer `ALLOWED_HOSTS`
- [ ] Configurer `SECURE_SSL_REDIRECT=True`
- [ ] Configurer `CSRF_TRUSTED_ORIGINS` (domaines HTTPS reels)
- [ ] Activer verification email (`ACCOUNT_EMAIL_VERIFICATION=mandatory`)
- [ ] Mettre en place PostgreSQL de production
- [ ] Configurer Redis de production
- [ ] Configurer les emails SMTP
- [ ] Mettre en place Nginx comme reverse proxy
- [ ] Configurer les certificats SSL (Let's Encrypt)
- [ ] Lancer `collectstatic`
- [ ] Configurer les sauvegardes PostgreSQL

### Nginx (exemple)

```nginx
server {
    listen 80;
    server_name boutique.example.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name boutique.example.com;

    ssl_certificate /etc/letsencrypt/live/boutique.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/boutique.example.com/privkey.pem;

    location /static/ {
        alias /app/staticfiles/;
    }

    location /media/ {
        alias /app/src/media/;
    }

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Gunicorn

```bash
gunicorn config.wsgi:application \
  --bind 0.0.0.0:8000 \
  --workers 4 \
  --timeout 120 \
  --access-logfile /var/log/gunicorn/access.log \
  --error-logfile /var/log/gunicorn/error.log
```

## Structure de la base de données

```
accounts.User ──────────────────┐
  │                              │
stores.Store ──── stores.StoreUser
  │
  ├── stores.Sequence
  ├── stores.AuditLog
  │
  ├── catalog.Category
  ├── catalog.Brand
  ├── catalog.Product ──── catalog.ProductImage
  │     │                  catalog.ProductSpec
  │     │
  │     └── stock.ProductStock (per store)
  │         stock.InventoryMovement
  │
  ├── customers.Customer
  │     └── credits.CustomerAccount
  │           ├── credits.CreditLedgerEntry
  │           └── credits.PaymentSchedule
  │
  ├── sales.Sale ──── sales.SaleItem
  │     │              sales.Refund
  │     │
  │     └── cashier.Payment
  │
  ├── cashier.CashShift
  │
  ├── alerts.Alert
  │
  └── reports.KPISnapshot
```

## Licence

Projet propriétaire — Tous droits réservés.

## Updates 2026-02-15

- New Django app: `purchases/`
- New models: `Supplier`, `PurchaseOrder`, `PurchaseOrderLine`, `GoodsReceipt`, `GoodsReceiptLine`
- New API endpoints:
  - `GET/POST /api/v1/suppliers/`
  - `GET/POST /api/v1/purchase-orders/`
  - `GET/POST /api/v1/goods-receipts/`
  - `POST /api/v1/stores/{id}/assign-users/`
- RBAC hardening:
  - Cashier cannot edit draft sales.
  - Seller cannot open shift or process payment.
- Reliability hardening:
  - Atomic invoice sequence generation with row locking.
  - Credit overdue alert task fixed on `PaymentSchedule`.
