#!/usr/bin/env bash
# ARISE API — One-shot DB setup
#
# Creates user `arise` + database `arise_dev` di container `airis_postgres`
# (Postgres 16-alpine, host port 5433). Idempotent — aman re-run.
#
# Prerequisites:
#   - Container `airis_postgres` running (cek: docker ps)
#   - Lu tau Postgres superuser di airis_postgres (default biasanya `postgres`)
#
# Usage:
#   pnpm db:setup
#   # atau langsung:
#   bash scripts/setup-db.sh
#
# Env override (optional):
#   PG_CONTAINER=airis_postgres
#   PG_SUPERUSER=postgres
#   ARISE_DB=arise_dev
#   ARISE_USER=arise
#   ARISE_PASSWORD=(prompted kalo gak di-set)

set -euo pipefail

PG_CONTAINER="${PG_CONTAINER:-airis_postgres}"
PG_SUPERUSER="${PG_SUPERUSER:-airis_user}"
PG_SUPERUSER_DB="${PG_SUPERUSER_DB:-airis_db}"
ARISE_DB="${ARISE_DB:-arise_dev}"
ARISE_USER="${ARISE_USER:-arise}"

# ── Sanity checks ──
if ! command -v docker >/dev/null 2>&1; then
  echo "❌ docker CLI not found. Install Docker Desktop / docker-ce dulu."
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -q "^${PG_CONTAINER}$"; then
  echo "❌ Container '${PG_CONTAINER}' gak running. Run dulu:"
  echo "   docker start ${PG_CONTAINER}"
  exit 1
fi

# ── Password prompt (no echo) ──
if [[ -z "${ARISE_PASSWORD:-}" ]]; then
  read -r -s -p "Set password untuk user '${ARISE_USER}': " ARISE_PASSWORD
  echo
  if [[ ${#ARISE_PASSWORD} -lt 8 ]]; then
    echo "❌ Password minimal 8 chars."
    exit 1
  fi
fi

echo "ℹ  Setup database '${ARISE_DB}' + user '${ARISE_USER}' di '${PG_CONTAINER}'..."

# ── Idempotent SQL ──
# Pakai DO block buat conditional create — gak error kalo udah exist.
docker exec -i "${PG_CONTAINER}" psql -U "${PG_SUPERUSER}" -d "${PG_SUPERUSER_DB}" -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${ARISE_USER}') THEN
    CREATE ROLE ${ARISE_USER} LOGIN PASSWORD '${ARISE_PASSWORD}';
    RAISE NOTICE 'Created role ${ARISE_USER}';
  ELSE
    ALTER ROLE ${ARISE_USER} WITH PASSWORD '${ARISE_PASSWORD}';
    RAISE NOTICE 'Updated password for ${ARISE_USER}';
  END IF;
END
\$\$;
SQL

# CREATE DATABASE harus di luar transaction
DB_EXISTS=$(docker exec -i "${PG_CONTAINER}" psql -U "${PG_SUPERUSER}" -d "${PG_SUPERUSER_DB}" -tAc "SELECT 1 FROM pg_database WHERE datname='${ARISE_DB}'" || echo "")

if [[ -z "${DB_EXISTS}" ]]; then
  docker exec -i "${PG_CONTAINER}" psql -U "${PG_SUPERUSER}" -d "${PG_SUPERUSER_DB}" -c "CREATE DATABASE ${ARISE_DB} OWNER ${ARISE_USER};"
  echo "✓  Created database ${ARISE_DB}"
else
  echo "ℹ  Database ${ARISE_DB} already exists"
fi

# Grant + extensions (pgcrypto buat token gen later)
docker exec -i "${PG_CONTAINER}" psql -U "${PG_SUPERUSER}" -d "${ARISE_DB}" -v ON_ERROR_STOP=1 <<SQL
GRANT ALL PRIVILEGES ON DATABASE ${ARISE_DB} TO ${ARISE_USER};
GRANT ALL ON SCHEMA public TO ${ARISE_USER};
CREATE EXTENSION IF NOT EXISTS pgcrypto;
SQL

# ── Connection test ──
if docker exec -i "${PG_CONTAINER}" psql -U "${ARISE_USER}" -d "${ARISE_DB}" -c "SELECT 1;" >/dev/null 2>&1; then
  echo "✓  Connection test OK"
else
  echo "⚠  Connection test failed — cek pg_hba.conf di container"
fi

cat <<EOF

═══════════════════════════════════════════════════════════
✓  DB setup done!

Update .env lu dengan:
  DATABASE_URL=postgresql://${ARISE_USER}:<password>@localhost:5433/${ARISE_DB}?schema=public

(<password> = yang baru aja lu masukin, escape kalo ada char khusus)

Next:
  pnpm prisma:generate
  pnpm prisma:migrate --name init
  pnpm dev
═══════════════════════════════════════════════════════════
EOF
