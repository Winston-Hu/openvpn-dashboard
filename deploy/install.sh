#!/bin/sh
# OpenVPN Dashboard — deployment helper script
# Usage: sh install.sh [--user <username>] [--app-dir <path>]
#
# Defaults:
#   --user     : current user ($USER or $(id -un))
#   --app-dir  : ~/apps/openvpn-dashboard
#
# The script will:
#   1. Pull latest code (if in a git repo)
#   2. Install production dependencies (npm ci --omit=dev)
#   3. Run database migrations (prisma migrate deploy)
#   4. Build the Next.js app (npm run build)
#   5. Seed the database (idempotent — does not overwrite existing admin)
#   6. Print next steps

set -eu

# ── Defaults ──────────────────────────────────────────────────────────────────
APP_USER="${USER:-$(id -un)}"
APP_DIR="${HOME}/apps/openvpn-dashboard"

# ── Argument parsing ──────────────────────────────────────────────────────────
while [ $# -gt 0 ]; do
  case "$1" in
    --user)
      APP_USER="$2"
      shift 2
      ;;
    --app-dir)
      APP_DIR="$2"
      shift 2
      ;;
    *)
      printf 'Unknown argument: %s\n' "$1" >&2
      printf 'Usage: %s [--user <username>] [--app-dir <path>]\n' "$0" >&2
      exit 1
      ;;
  esac
done

# ── Helpers ───────────────────────────────────────────────────────────────────
info()  { printf '\033[0;34m[install] %s\033[0m\n' "$*"; }
ok()    { printf '\033[0;32m[install] %s\033[0m\n' "$*"; }
warn()  { printf '\033[0;33m[install] WARNING: %s\033[0m\n' "$*" >&2; }
die()   { printf '\033[0;31m[install] ERROR: %s\033[0m\n' "$*" >&2; exit 1; }

# ── Prerequisite checks ───────────────────────────────────────────────────────
command -v node  >/dev/null 2>&1 || die 'node is not installed or not in PATH'
command -v npm   >/dev/null 2>&1 || die 'npm is not installed or not in PATH'

NODE_MAJOR="$(node --version | sed 's/^v//' | cut -d. -f1)"
if [ "${NODE_MAJOR}" -lt 18 ]; then
  die "Node.js 18+ is required (found $(node --version))"
fi

info "Using app directory: ${APP_DIR}"
info "Running as user:     ${APP_USER}"

# ── Navigate to app directory ─────────────────────────────────────────────────
if [ ! -d "${APP_DIR}" ]; then
  die "App directory '${APP_DIR}' does not exist. Clone the repo there first."
fi

cd "${APP_DIR}"

# ── 1. Pull latest code ───────────────────────────────────────────────────────
if [ -d ".git" ]; then
  info "Pulling latest code from git..."
  git pull --ff-only || warn "git pull failed — continuing with existing code"
else
  info "Not a git repo — skipping git pull"
fi

# ── 2. Install production dependencies ───────────────────────────────────────
info "Installing production dependencies..."
npm ci --omit=dev

# ── 3. Run database migrations ────────────────────────────────────────────────
info "Running database migrations..."
npx prisma migrate deploy

# ── 4. Build the app ─────────────────────────────────────────────────────────
info "Building Next.js app..."
npm run build

# ── 5. Seed the database (idempotent) ────────────────────────────────────────
info "Seeding database (idempotent)..."
npm run db:seed

ok "Build complete!"

# ── 6. Next steps ─────────────────────────────────────────────────────────────
printf '\n'
printf '====================================================================\n'
printf '  NEXT STEPS\n'
printf '====================================================================\n'
printf '\n'
printf '1. Ensure .env is configured at:\n'
printf '     %s/.env\n' "${APP_DIR}"
printf '   Required variables: DATABASE_URL, SESSION_SECRET,\n'
printf '   BOOTSTRAP_ADMIN_USERNAME, BOOTSTRAP_ADMIN_PASSWORD,\n'
printf '   OPENVPN_STATUS_LOG, OPENVPN_PKI_ISSUED_DIR, etc.\n'
printf '   See deploy/README.md for full variable list.\n'
printf '\n'
printf '2. Install the systemd service (once):\n'
printf '   Edit deploy/openvpn-dashboard.service — replace <APP_USER> with "%s"\n' "${APP_USER}"
printf '   sudo cp deploy/openvpn-dashboard.service /etc/systemd/system/\n'
printf '   sudo systemctl daemon-reload\n'
printf '   sudo systemctl enable --now openvpn-dashboard\n'
printf '\n'
printf '3. Configure your reverse proxy (Nginx or Caddy):\n'
printf '   See deploy/nginx.conf or deploy/Caddyfile\n'
printf '\n'
printf '4. To start/restart the service after a deploy:\n'
printf '   sudo systemctl restart openvpn-dashboard\n'
printf '\n'
printf '5. View logs:\n'
printf '   sudo journalctl -u openvpn-dashboard -f\n'
printf '\n'
printf 'The app starts with: node .next/standalone/server.js\n'
printf '====================================================================\n'
