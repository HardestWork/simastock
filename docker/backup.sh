#!/bin/sh
# PostgreSQL daily backup with 14-day retention.
# Called by the db-backup service in docker-compose.prod.yml.
set -eu

BACKUP_DIR="/backups"
RETENTION_DAYS=14
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="${BACKUP_DIR}/${POSTGRES_DB:-boutique_db}_${TIMESTAMP}.sql.gz"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting backup → ${FILENAME}"

PGPASSWORD="${POSTGRES_PASSWORD}" pg_dump \
  -h db \
  -U "${POSTGRES_USER:-postgres}" \
  -d "${POSTGRES_DB:-boutique_db}" \
  --no-owner \
  --no-acl \
  | gzip > "${FILENAME}"

SIZE=$(du -h "${FILENAME}" | cut -f1)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup complete: ${FILENAME} (${SIZE})"

# Purge backups older than RETENTION_DAYS
DELETED=$(find "${BACKUP_DIR}" -name "*.sql.gz" -mtime +${RETENTION_DAYS} -print -delete | wc -l)
if [ "${DELETED}" -gt 0 ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Purged ${DELETED} backup(s) older than ${RETENTION_DAYS} days"
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Done. Backups on disk:"
ls -lh "${BACKUP_DIR}"/*.sql.gz 2>/dev/null || echo "  (none)"
