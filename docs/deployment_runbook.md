# Runbook de deploiement - Systeme de gestion boutique

## 1) Pre-deploiement (J-1 a J-0)

1. Renseigner toutes les valeurs `CHANGE_ME_*` dans `.env.production`.
2. Verifier la conf prod:
   ```bash
   docker compose -f docker-compose.prod.yml exec -T web bash -lc "cd /app/src && python manage.py check --deploy --settings=config.settings.prod"
   ```
3. Verifier les migrations en attente:
   ```bash
   docker compose -f docker-compose.prod.yml exec -T web python manage.py makemigrations --check --dry-run
   ```
4. Lancer les tests:
   ```bash
   docker compose -f docker-compose.prod.yml exec -T web bash -lc "cd /app && pytest -q --reuse-db"
   ```

## 2) Sauvegardes avant release

1. Backup DB PostgreSQL:
   ```bash
   docker compose -f docker-compose.prod.yml exec -T db sh -lc 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > backup_pre_release.sql
   ```
2. Backup media:
   ```bash
   tar -czf media_pre_release.tar.gz media
   ```

## 3) Deploiement (rolling simple)

1. Recuperer la version cible (exemple):
   ```bash
   git fetch origin
   git checkout <tag-ou-commit>
   ```
2. Builder les images:
   ```bash
   docker compose -f docker-compose.prod.yml build web worker beat frontend
   ```
3. Appliquer migrations:
   ```bash
   docker compose -f docker-compose.prod.yml run --rm web bash -lc "cd /app/src && python manage.py migrate --noinput"
   ```
4. Collecter les statics:
   ```bash
   docker compose -f docker-compose.prod.yml run --rm web bash -lc "cd /app/src && python manage.py collectstatic --noinput --settings=config.settings.prod"
   ```
5. Redemarrer services applicatifs:
   ```bash
   docker compose -f docker-compose.prod.yml up -d web worker beat frontend
   ```

## 4) Post-deploiement (validation)

1. Health checks:
   ```bash
   docker compose -f docker-compose.prod.yml ps
   docker compose -f docker-compose.prod.yml logs --tail=100 web
   ```
2. Sanity API:
   ```bash
   curl -I https://api.example.com/api/v1/auth/csrf/
   ```
3. Smoke fonctionnel (manuel):
   - connexion
   - creation vente + encaissement
   - impression facture/recu
   - credit + paiement credit
   - analytics / rapports

## 5) Injection donnees de demo (optionnel preprod)

```bash
docker compose -f docker-compose.prod.yml exec -T web python manage.py seed_data
# ou
docker compose -f docker-compose.prod.yml exec -T web python manage.py seed_demo_data
# ou
docker compose -f docker-compose.prod.yml exec -T web python manage.py seed_analytics_demo
```

## 6) Rollback

### Cas A: rollback applicatif (sans revert schema)

1. Revenir a la release precedente:
   ```bash
   git checkout <ancien-tag-ou-commit>
   ```
2. Rebuild + restart:
   ```bash
   docker compose -f docker-compose.prod.yml build web worker beat frontend
   docker compose -f docker-compose.prod.yml up -d web worker beat frontend
   ```

### Cas B: rollback complet (schema + donnees)

1. Stopper les ecritures (maintenance mode/restriction acces).
2. Restaurer DB depuis backup:
   ```bash
   cat backup_pre_release.sql | docker compose -f docker-compose.prod.yml exec -T db sh -lc 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"'
   ```
3. Restaurer media:
   ```bash
   tar -xzf media_pre_release.tar.gz
   ```
4. Redemarrer stack:
   ```bash
   docker compose -f docker-compose.prod.yml up -d
   ```

## 7) Critere Go/No-Go

- `check --deploy` vert
- tests verts
- migrations appliquees
- smoke test vente/encaissement/facture/credit OK
- monitoring/alerts sans erreurs critiques 15-30 min
