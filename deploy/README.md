# OpenVPN Dashboard — Deployment Guide

## Prerequisites

| Package | Notes |
|---------|-------|
| **Node.js 18+** | `node --version` must be ≥ 18 |
| **npm** | Bundled with Node.js |
| **openssl** | Used to read certificate expiry dates |
| **socat** | Required for the management-socket disconnect feature |
| **git** | Only needed if deploying via `git pull` |
| **prisma CLI** | Installed as a dev dependency; invoked via `npx prisma` |

On Ubuntu/Debian:
```bash
sudo apt install -y openssl socat git
# Install Node.js 18+ via NodeSource or nvm:
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

---

## Clone / Copy to Server

```bash
# Option A — git clone
git clone https://github.com/your-org/openvpn-dashboard.git \
  /home/<APP_USER>/apps/openvpn-dashboard

# Option B — rsync from local machine
rsync -avz --exclude node_modules --exclude .next \
  ./openvpn-dashboard/ <APP_USER>@server:/home/<APP_USER>/apps/openvpn-dashboard/
```

---

## Configure `.env`

Copy the example file and fill in every variable:

```bash
cp .env.example .env
nano .env
```

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | SQLite database path | `file:./prisma/prod.db` |
| `SESSION_SECRET` | Random 32+ char secret for cookie encryption | `openssl rand -hex 32` |
| `BOOTSTRAP_ADMIN_USERNAME` | Initial admin username | `admin` |
| `BOOTSTRAP_ADMIN_PASSWORD` | Initial admin password (min 12 chars) | `MyStr0ngPass!` |
| `OPENVPN_STATUS_LOG` | Path to OpenVPN status.log | `/var/log/openvpn/status.log` |
| `OPENVPN_PKI_ISSUED_DIR` | Path to PKI issued certs directory | `/etc/openvpn/server/easy-rsa/pki/issued` |
| `OPENVPN_PKI_PRIVATE_DIR` | Path to PKI private keys directory | `/etc/openvpn/server/easy-rsa/pki/private` |
| `OPENVPN_CCD_DIR` | Client config directory (CCD) | `/etc/openvpn/server/ccd` |
| `OPENVPN_SERVER_CONF` | Path to server.conf | `/etc/openvpn/server/server.conf` |
| `OPENVPN_INSTALL_SCRIPT` | Path to openvpn-install.sh (for revoke) | `/opt/openvpn-install/openvpn-install.sh` |
| `MANUAL_CLIENT_OVPN_SCRIPT` | Path to manual-client-ovpn.sh (for create) | `/opt/openvpn-install/manual-client-ovpn.sh` |
| `OPENVPN_OVPN_OUTPUT_DIR` | Directory where .ovpn files are written | `/etc/openvpn/server/easy-rsa/pki` |
| `OPENVPN_CA_CERT` | Path to ca.crt | `/etc/openvpn/server/easy-rsa/pki/ca.crt` |
| `OPENVPN_MGMT_SOCK` | OpenVPN management socket path | `/var/run/openvpn-server/server.sock` |
| `OPENVPN_SERVER_HOST` | Public IP or hostname of the VPN server | `203.0.113.1` |
| `NEXT_PUBLIC_APP_URL` | Public URL of the dashboard (used for CSRF checks) | `https://vpn.example.com` |
| `PORT` | Port the Node.js server listens on | `3000` |

> **Security note:** `SESSION_SECRET` must be a strong random value in production.
> Generate one with: `openssl rand -hex 32`

---

## Run `install.sh`

```bash
cd /home/<APP_USER>/apps/openvpn-dashboard
sh deploy/install.sh --user <APP_USER> --app-dir /home/<APP_USER>/apps/openvpn-dashboard
```

This script will:
1. `git pull` (if in a git repo)
2. `npm ci --omit=dev` — install production dependencies
3. `npx prisma migrate deploy` — apply database migrations
4. `npm run build` — build the Next.js standalone app
5. `npm run db:seed` — create the initial admin user (idempotent)

---

## Install the systemd Service

```bash
# Edit the service file — replace <APP_USER> with the actual OS user
nano deploy/openvpn-dashboard.service

sudo cp deploy/openvpn-dashboard.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now openvpn-dashboard

# Check status
sudo systemctl status openvpn-dashboard

# View logs
sudo journalctl -u openvpn-dashboard -f
```

The service starts the app with:
```
node .next/standalone/server.js
```

This requires that `npm run build` has been run successfully (standalone output mode is enabled in `next.config.ts`).

---

## Configure Reverse Proxy

### Option A — Nginx

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/openvpn-dashboard
# Edit the file — replace "your-domain.com"
sudo ln -s /etc/nginx/sites-available/openvpn-dashboard \
           /etc/nginx/sites-enabled/openvpn-dashboard
sudo nginx -t && sudo systemctl reload nginx

# Add TLS via certbot
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### Option B — Caddy (automatic HTTPS)

```bash
# Edit deploy/Caddyfile — replace "your-domain.com"
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Caddy automatically obtains and renews TLS certificates.

---

## Required Linux Permissions

The service user (`<APP_USER>`) needs **read access** to these paths:

| Path | Purpose |
|------|---------|
| `OPENVPN_STATUS_LOG` | Read connected client list |
| `OPENVPN_PKI_ISSUED_DIR/*.crt` | Read client certificates |
| `OPENVPN_PKI_PRIVATE_DIR/*.key` | Read client private keys (for .ovpn generation) |
| `OPENVPN_CCD_DIR/` | Read CCD files |
| `OPENVPN_SERVER_CONF` | Read server configuration |
| `OPENVPN_CA_CERT` | Read CA certificate |
| `OPENVPN_OVPN_OUTPUT_DIR/*.ovpn` | Read pre-built .ovpn files (if present) |

The management socket (`OPENVPN_MGMT_SOCK`) must be **readable and writable** by the service user (or group). If OpenVPN runs as root, add the service user to the `openvpn` group:

```bash
sudo usermod -aG openvpn <APP_USER>
```

---

## Sudoers: Passwordless Script Execution

The client **create** and **revoke** operations invoke shell scripts that require elevated privileges. Grant passwordless sudo access using `visudo`:

```bash
sudo visudo -f /etc/sudoers.d/openvpn-dashboard
```

Add (replace `<APP_USER>` and script paths as needed):

```
# OpenVPN Dashboard — allow the app user to run management scripts without password
<APP_USER> ALL=(ALL) NOPASSWD: /opt/openvpn-install/openvpn-install.sh
<APP_USER> ALL=(ALL) NOPASSWD: /opt/openvpn-install/manual-client-ovpn.sh
```

Then update the env vars to invoke the scripts via sudo:

```env
OPENVPN_INSTALL_SCRIPT="sudo /opt/openvpn-install/openvpn-install.sh"
MANUAL_CLIENT_OVPN_SCRIPT="sudo /opt/openvpn-install/manual-client-ovpn.sh"
```

> **Alternative:** Run the app as `root` (not recommended) or use setuid wrappers.

---

## Upgrading

After pulling new code, re-run the install script:

```bash
cd /home/<APP_USER>/apps/openvpn-dashboard
sh deploy/install.sh
sudo systemctl restart openvpn-dashboard
```

---

## Troubleshooting

- **App fails to start:** Check `journalctl -u openvpn-dashboard -n 50` and ensure `.env` is present and correct.
- **Database errors:** Run `npx prisma migrate deploy` manually and check `DATABASE_URL`.
- **No clients showing:** Verify `OPENVPN_STATUS_LOG` path and that the service user can read it.
- **Cannot revoke/create clients:** Check sudoers config and script paths.
- **Management socket errors:** Ensure `socat` is installed and the socket path is correct.
