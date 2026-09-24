# Deployment guide

This guide sets the system up on one Linux server (Ubuntu 24.04 is assumed) with PostgreSQL, the API and the web app on the same machine behind nginx with HTTPS. It is enough for a business with a handful of users; see [Scaling](#scaling) for more. To run it on Render instead, see [Render](#render).

```text
browser ──HTTPS──▶ nginx :443 ──▶ web (Next.js) 127.0.0.1:3000 ──/api/*──▶ API (NestJS) 127.0.0.1:4000 ──▶ PostgreSQL
```

The browser only ever talks to the web app's origin. The web app forwards `/api/*` to the API, so session cookies stay first-party and no CORS configuration is needed. Only nginx listens publicly.

## 1. Prerequisites

```bash
sudo apt update
sudo apt install -y postgresql nginx certbot python3-certbot-nginx
# Node.js 22 LTS or newer (for example from https://github.com/nodesource/distributions)
sudo npm install -g pnpm@12
sudo useradd --system --create-home --home-dir /opt/spms spms
```

## 2. Database

```bash
sudo -u postgres createuser spms --pwprompt
sudo -u postgres createdb spms --owner spms
```

Use a strong password; it goes into `DATABASE_URL` below.

## 3. Get the code

```bash
sudo -u spms -i
git clone <your repository> /opt/spms/app
cd /opt/spms/app
pnpm install --frozen-lockfile
```

## 4. Configuration

`/opt/spms/app/apps/api/.env`:

| Variable | Production value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `postgresql://spms:PASSWORD@localhost:5432/spms?schema=public` |
| `JWT_SECRET` | output of `openssl rand -hex 48` (the API refuses to start with a short or example value) |
| `COOKIE_SECURE` | `true` (required in production; cookies are only sent over HTTPS) |
| `HOST` | `127.0.0.1`, so only the web app can reach the API |
| `PORT` | `4000` |
| `UPLOAD_DIR` | `/opt/spms/uploads` (organization logo and expense receipts) |
| `RECURRING_JOB_ENABLED` | `true` |
| `API_DOCS_ENABLED` | leave unset; interactive docs stay off in production |
| `ACCESS_TOKEN_TTL_MINUTES`, `REFRESH_TOKEN_TTL_DAYS` | defaults 15 and 7 |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | the first admin; used only by `pnpm db:seed` |

`TEST_DATABASE_URL` is not needed on a server.

`/opt/spms/app/apps/web/.env.production.local`:

```bash
API_URL=http://127.0.0.1:4000
```

The web app's `/api` forwarding is fixed when it is built, so this file must exist before `pnpm build`. Use `127.0.0.1` rather than `localhost`, which can resolve to an IPv6 address the API is not listening on.

```bash
mkdir -p /opt/spms/uploads /opt/spms/backups
chmod 700 /opt/spms/uploads /opt/spms/backups /opt/spms/app/apps/api/.env
```

## 5. Build, create the schema and the first admin

```bash
cd /opt/spms/app
pnpm build            # shared package, API (apps/api/dist) and web app (apps/web/.next)
```

```bash
pnpm --filter @spms/api run db:deploy     # applies migrations; never use migrate dev or reset in production
pnpm db:seed                              # roles, lists, numbering and the first admin (safe to rerun)
```

Sign in with the seeded admin as soon as the site is up and change the password.

## 6. Services

`/etc/systemd/system/spms-api.service`:

```ini
[Unit]
Description=SPMS API
After=network.target postgresql.service

[Service]
User=spms
WorkingDirectory=/opt/spms/app/apps/api
EnvironmentFile=/opt/spms/app/apps/api/.env
ExecStart=/usr/bin/node dist/main.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

`/etc/systemd/system/spms-web.service`:

```ini
[Unit]
Description=SPMS web app
After=network.target spms-api.service

[Service]
User=spms
WorkingDirectory=/opt/spms/app/apps/web
Environment=NODE_ENV=production
Environment=API_URL=http://127.0.0.1:4000
ExecStart=/usr/bin/env pnpm start --hostname 127.0.0.1
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now spms-api spms-web
curl http://127.0.0.1:4000/api/v1/health     # {"status":"ok","database":"up"}
```

## 7. nginx and HTTPS

`/etc/nginx/sites-available/spms`:

```nginx
server {
    listen 80;
    server_name books.example.com;

    client_max_body_size 6m;   # expense receipts are limited to 5 MB

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/spms /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d books.example.com    # adds HTTPS and redirects HTTP to it
```

## 8. Backups

Back up both the database and the uploads folder; receipts and the logo are files, not database rows.

```bash
# /etc/cron.d/spms-backup: every night at 01:30, keeping 30 days
30 1 * * * spms pg_dump --format=custom spms > /opt/spms/backups/spms-$(date +\%F).dump && tar -czf /opt/spms/backups/uploads-$(date +\%F).tar.gz -C /opt/spms uploads && find /opt/spms/backups -mtime +30 -delete
```

Copy the backups off the server as well. To restore:

```bash
sudo systemctl stop spms-web spms-api
sudo -u postgres dropdb spms && sudo -u postgres createdb spms --owner spms
sudo -u spms pg_restore --dbname spms /opt/spms/backups/spms-YYYY-MM-DD.dump
sudo -u spms tar -xzf /opt/spms/backups/uploads-YYYY-MM-DD.tar.gz -C /opt/spms
sudo systemctl start spms-api spms-web
```

Test a restore on a spare machine now and then.

## 9. Upgrades

```bash
sudo -u spms -i
cd /opt/spms/app
pg_dump --format=custom spms > /opt/spms/backups/before-upgrade-$(date +%F).dump
git pull
pnpm install --frozen-lockfile
pnpm build            # apps/web/.env.production.local must still set API_URL
pnpm --filter @spms/api run db:deploy
exit
sudo systemctl restart spms-api spms-web
```

Migrations only add to the schema or change it in place; read `apps/api/prisma/migrations/*/migration.sql` for anything that drops data before upgrading.

## 10. Checklist

- [ ] `NODE_ENV=production`, a random `JWT_SECRET`, `COOKIE_SECURE=true` (the API will not start otherwise)
- [ ] API bound to `127.0.0.1`; only nginx is reachable from outside (`sudo ufw allow 'Nginx Full' && sudo ufw allow OpenSSH && sudo ufw enable`)
- [ ] HTTPS certificate installed and renewing (`sudo certbot renew --dry-run`)
- [ ] Seeded admin password changed; each person has their own user with the narrowest role that fits
- [ ] Nightly database and uploads backups copied off the server, and a restore tested
- [ ] Organization profile, taxes, payment terms and numbering set before the first invoice

## Monitoring

- `GET /api/v1/health` reports whether the API can reach the database; point an uptime monitor at `https://books.example.com/api/v1/health`.
- Logs: `journalctl -u spms-api -f` and `journalctl -u spms-web -f`. Recurring invoice failures are logged, and each affected profile shows the reason on its page.
- **Settings → Audit log** records every change to transactions and settings, with the user and IP address.

## Scaling

- The recurring invoice job is safe to run from several API processes (each period is claimed under a row lock and protected by a unique key), so you can run more than one API behind the web app.
- Uploads are stored on local disk. With more than one API server, point `UPLOAD_DIR` at shared storage.
- Sign-in attempt limits are kept in each API process's memory; with several API processes each keeps its own count.
- PostgreSQL can move to a managed service by changing `DATABASE_URL`; keep backups and point-in-time recovery turned on there.

## Render

[`render.yaml`](../render.yaml) is a Render Blueprint that sets up the same layout without a server to look after:

| Resource | Type | What it does |
|---|---|---|
| `spms-web` | Web service (public, HTTPS) | Next.js; forwards `/api/*` to the API over Render's private network |
| `spms-api` | Private service | NestJS API with a 1 GB disk at `/var/data` for uploads; not reachable from the internet |
| `spms-db` | PostgreSQL 16 | Reachable only from services in the same account |

All three are in the Frankfurt region, the closest to West Africa; change `region` on every entry together if you want another.

1. Push the repository to GitHub.
2. In the Render dashboard choose **New → Blueprint**, connect GitHub and pick the repository.
3. Enter `SEED_ADMIN_EMAIL` and a strong `SEED_ADMIN_PASSWORD` when asked. `JWT_SECRET` is generated for you.
4. Apply. The API is built first; before it starts, its pre-deploy step applies migrations and creates the first admin. The web app is built with the API's private hostname (`API_HOST`), so if the web app was built before the API existed, choose **Manual Deploy → Clear build cache & deploy** on `spms-web` once.
5. Open the `spms-web` URL (`https://spms-web-….onrender.com`), sign in and change the password. To use your own domain, add it under `spms-web` → **Settings → Custom Domains**.

Every push to `main` redeploys both services. Migrations run automatically on each API deploy.

Notes:

- The API needs a paid instance for a private service and a disk, and Render's free PostgreSQL is deleted after 30 days, so the Blueprint uses the Starter and Basic plans. See Render's pricing page for current prices.
- Because the API has a disk, Render stops the old instance before starting the new one, so each API deploy has a short gap.
- Render backs up paid PostgreSQL databases (see the database's **Recovery** tab). The uploads disk has daily snapshots; for your own copies, use `pg_dump` with the external connection string and download the disk contents from the service's **Shell**.
- `TRUST_PROXY=loopback, uniquelocal` lets the API take the client IP from the web app's `X-Forwarded-For` header, which it reaches over a private address, so the audit log and sign-in limits see real client IPs.
