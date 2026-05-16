#!/usr/bin/env bash
# ARISE API — WSL Ubuntu bootstrap (Node + pnpm)
#
# One-time setup di WSL Ubuntu pas pindah project ke ~/project/arise/.
# Idempotent.
#
# Usage:
#   cd ~/project/arise/arise-api
#   bash scripts/bootstrap-wsl.sh

set -euo pipefail

echo "═══════════════════════════════════════════════════════════"
echo "  ARISE API — WSL Ubuntu Bootstrap"
echo "═══════════════════════════════════════════════════════════"
echo

# ── Detect WSL ──
if ! grep -qiE "(microsoft|wsl)" /proc/sys/kernel/osrelease 2>/dev/null; then
  echo "⚠  Script ini di-design untuk WSL Ubuntu. Lu kayanya di OS lain — proceed at own risk."
  read -r -p "Lanjut? [y/N] " yn
  [[ "${yn,,}" == "y" ]] || exit 1
fi

# ── Node.js 22 LTS via NodeSource ──
NODE_VERSION_REQUIRED=20

if command -v node >/dev/null 2>&1; then
  CURRENT_NODE=$(node -v | sed 's/v//' | cut -d. -f1)
  if [[ "${CURRENT_NODE}" -ge "${NODE_VERSION_REQUIRED}" ]]; then
    echo "✓  Node $(node -v) sudah ke-install"
  else
    echo "ℹ  Node version (${CURRENT_NODE}) below required (${NODE_VERSION_REQUIRED}). Upgrading..."
    install_node=1
  fi
else
  install_node=1
fi

if [[ "${install_node:-0}" == "1" ]]; then
  echo "ℹ  Installing Node 22 LTS via NodeSource..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
  echo "✓  Node $(node -v) installed"
fi

# ── pnpm via corepack (built-in di Node 16.13+) ──
echo
echo "ℹ  Enabling corepack + pnpm..."
sudo corepack enable
corepack prepare pnpm@11.1.0 --activate
echo "✓  pnpm $(pnpm --version)"

# ── (Optional) Redis — defer ke Phase 2 ──
echo
echo "ℹ  Redis: deferred ke Phase 2 (pake @nestjs/schedule cron in-process untuk Phase 1)."
echo "   Kalo lu mau install Redis sekarang:"
echo "     sudo apt install -y redis-server"
echo "     sudo systemctl enable --now redis-server"

# ── Install project deps ──
echo
echo "ℹ  Installing project deps..."
pnpm install

# ── Next steps ──
cat <<EOF

═══════════════════════════════════════════════════════════
✓  Bootstrap done!

Next:
  1. cp .env.example .env
     → edit .env, generate JWT secrets:
       openssl rand -hex 32   (paste ke JWT_ACCESS_SECRET)
       openssl rand -hex 32   (paste ke JWT_REFRESH_SECRET)

  2. pnpm db:setup
     → create user 'arise' + database 'arise_dev' di airis_postgres
     → paste password yang lu set ke DATABASE_URL di .env

  3. pnpm prisma:generate
     pnpm prisma:migrate --name init

  4. pnpm dev
     → http://localhost:3000/v1/health
     → http://localhost:3000/docs
═══════════════════════════════════════════════════════════
EOF
