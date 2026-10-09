#!/usr/bin/env bash
# Backup: Postgres (custom-format dump) + private document storage + manifest.
# The Fabric ledger is replicated across peers and is NOT the system of record;
# back up its volumes separately if you need fast ledger recovery (see runbook).
#
#   scripts/ops/backup.sh [out-dir]        default ./backups
# Env: DATABASE_URL, STORAGE_DIR (default ./storage). Never back up .env or SIGNING_KEK
# alongside the data: the KEK lives in your secret manager.
set -euo pipefail
# Normalise Windows paths (C:\...) for tar/sha256sum under Git Bash.
posix() { if command -v cygpath >/dev/null 2>&1; then cygpath -u "$1"; else echo "$1"; fi; }
OUT="$(posix "${1:-./backups}")"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DIR="$OUT/campussign-$STAMP"
STORAGE="$(posix "${STORAGE_DIR:-./storage}")"
mkdir -p "$DIR"
: "${DATABASE_URL:?DATABASE_URL is required}"
DB_URL="${DATABASE_URL%%\?*}"

if command -v pg_dump >/dev/null 2>&1; then
  pg_dump --format=custom --no-owner --file "$DIR/db.dump" "$DB_URL"
else
  # No local client: use the database container's pg_dump.
  docker exec campusign-db-1 pg_dump --format=custom --no-owner -U campusign campusign > "$DIR/db.dump"
fi
mkdir -p "$STORAGE"
tar -czf "$DIR/storage.tgz" -C "$STORAGE" .   # archive the contents, so restore can target any path

( cd "$DIR" && sha256sum db.dump storage.tgz > SHA256SUMS )
cat > "$DIR/manifest.txt" <<MANIFEST
campussign backup
created: $STAMP
git: $(git rev-parse --short HEAD 2>/dev/null || echo unknown)
migrations: $(ls prisma/migrations | grep -v toml | tail -1)
files: db.dump storage.tgz (see SHA256SUMS)
NOTE: signing keys in db.dump are encrypted; restoring them requires the SIGNING_KEK in use at backup time.
MANIFEST
echo "Backup written to $DIR"
