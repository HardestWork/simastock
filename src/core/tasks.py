"""Core Celery tasks — database backup."""
import logging
import subprocess
from datetime import datetime
from pathlib import Path

from celery import shared_task
from django.conf import settings

logger = logging.getLogger("boutique")

BACKUP_DIR = Path(settings.PROJECT_DIR) / "backups"


@shared_task(name="core.backup_database")
def backup_database():
    """Dump the PostgreSQL database to a gzipped SQL file.

    Keeps the last 7 backups and deletes older ones.
    """
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)

    db = settings.DATABASES["default"]
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"backup_{timestamp}.sql.gz"
    filepath = BACKUP_DIR / filename

    env = {
        "PGPASSWORD": db.get("PASSWORD", ""),
    }

    cmd = [
        "pg_dump",
        "-h", db.get("HOST", "localhost"),
        "-p", str(db.get("PORT", "5432")),
        "-U", db.get("USER", "postgres"),
        "-d", db.get("NAME", "boutique_db"),
        "--no-owner",
        "--no-acl",
    ]

    try:
        import gzip
        result = subprocess.run(
            cmd,
            capture_output=True,
            env={**__import__("os").environ, **env},
            timeout=600,
        )
        if result.returncode != 0:
            logger.error("pg_dump failed: %s", result.stderr.decode())
            return {"status": "error", "message": result.stderr.decode()[:500]}

        with gzip.open(filepath, "wb") as f:
            f.write(result.stdout)

        logger.info("Database backup created: %s", filepath)

        # Cleanup: keep last 7 backups
        backups = sorted(BACKUP_DIR.glob("backup_*.sql.gz"), reverse=True)
        for old in backups[7:]:
            old.unlink()
            logger.info("Deleted old backup: %s", old.name)

        return {"status": "ok", "file": str(filepath), "size_mb": round(filepath.stat().st_size / 1048576, 2)}
    except Exception as exc:
        logger.exception("Backup failed")
        return {"status": "error", "message": str(exc)[:500]}
