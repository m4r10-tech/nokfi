#!/usr/bin/env bash
# ==========================================================================
# Nokfi — backup de la base de datos SQLite (nokfi.db)
#
# Por qué `sqlite3 .backup` y no `cp`: la BD corre en modo WAL y PM2 la tiene
# abierta en caliente. Copiar el archivo a pelo puede capturar un estado a
# mitad de escritura (BD corrupta al restaurar). `.backup` usa la API de
# backup de SQLite → copia consistente aunque haya escrituras en curso.
#
# Además VERIFICA la copia (`PRAGMA integrity_check`) antes de darla por
# buena — un backup que no restaura no es un backup.
#
# Uso manual:
#   ./scripts/backup-db.sh
# Restaurar (con PM2 parado):
#   pm2 stop nokfi-backend
#   cp db/backups/nokfi-YYYYMMDD-HHMMSS.db db/nokfi.db
#   pm2 start nokfi-backend
#
# Cron recomendado en el VPS (crontab -e del usuario deploy), diario 03:30:
#   30 3 * * * /home/deploy/nokfi-fase3/backend/scripts/backup-db.sh >> /home/deploy/nokfi-fase3/backend/db/backups/backup.log 2>&1
#
# Retención: se borran copias de más de RETENTION_DAYS días (default 14).
# ==========================================================================
set -euo pipefail

# Rutas relativas a este script → funciona igual en dev y en el VPS.
BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_FILE="${DB_PATH:-$BACKEND_DIR/db/nokfi.db}"
BACKUP_DIR="$BACKEND_DIR/db/backups"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

if [[ ! -f "$DB_FILE" ]]; then
  echo "[backup] ERROR: no existe la base de datos en $DB_FILE" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/nokfi-$STAMP.db"

sqlite3 "$DB_FILE" ".backup '$OUT'"

# Verificación post-copia: la copia debe abrirse y pasar integrity_check.
CHECK="$(sqlite3 "$OUT" 'PRAGMA integrity_check;' 2>/dev/null || echo 'ERROR')"
if [[ "$CHECK" != "ok" ]]; then
  echo "[backup] ERROR: integrity_check de la copia devolvió: $CHECK" >&2
  rm -f "$OUT"
  exit 1
fi

# Rotación: borrar copias más viejas que RETENTION_DAYS.
find "$BACKUP_DIR" -name 'nokfi-*.db' -mtime +"$RETENTION_DAYS" -delete

echo "[backup] OK → $OUT ($(du -h "$OUT" | cut -f1))"
