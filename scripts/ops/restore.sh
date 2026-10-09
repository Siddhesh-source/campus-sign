#!/usr/bin/env bash
# Restore a backup made by backup.sh into the database and storage directory.
# DESTRUCTIVE: replaces the target database contents and storage directory.
#
#   scripts/ops/restore.sh <backup-dir> --yes
set -euo pipefail
# Normalise Windows paths (C:\...) for tar/sha256sum under Git Bash.
posix() { if command -v cygpath >/dev/null 2>&1; then cygpath -u "$1"; else echo "$1"; fi; }
DIR="$(posix "${1:?usage: restore.sh <backup-dir> --yes}")"
[ "${2:-}" = "--yes" ] || { echo "Refusing to restore without --yes (this replaces the database and storage)."; exit 1; }
STORAGE="$(posix "${STORAGE_DIR:-./storage}")"
: "${DATABASE_URL:?DATABASE_URL is required}"
DB_URL="${DATABASE_URL%%\?*}"

( cd "$DIR" && sha256sum -c SHA256SUMS )
if command -v pg_restore >/dev/null 2>&1; then
  pg_restore --clean --if-exists --no-owner --dbname "$DB_URL" "$DIR/db.dump"
else
  docker exec -i campusign-db-1 pg_restore --clean --if-exists --no-owner -U campusign -d "$(basename "$DB_URL")" < "$DIR/db.dump"
fi
rm -rf "$STORAGE.restore-tmp" && mkdir -p "$STORAGE.restore-tmp"
tar -xzf "$DIR/storage.tgz" -C "$STORAGE.restore-tmp"
rm -rf "$STORAGE" && mv "$STORAGE.restore-tmp" "$STORAGE"
echo "Restored from $DIR. Next: pnpm prisma migrate deploy, then pnpm ledger:reconcile to confirm the ledger agrees."
