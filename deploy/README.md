# Production Deploy

Files in this folder are intended for production deployment of the project on `lamoda-specials.ru` and `admin.lamoda-specials.ru`.

## Files

- `docker-compose.prod.yml` - Traefik + game frontend + admin frontend + backend + PostgreSQL.
- `.env.example` - environment template for production variables.
- `traefik/acme.json` - Let's Encrypt storage file. Create it on the server with `chmod 600`.

## Expected Result

- `https://lamoda-specials.ru` -> frontend
- `https://admin.lamoda-specials.ru` -> admin frontend
- `https://lamoda-specials.ru/api/*` -> backend
- `https://admin.lamoda-specials.ru/api/*` -> backend
- `http://lamoda-specials.ru` -> redirects to `https://lamoda-specials.ru`
- `http://admin.lamoda-specials.ru` -> redirects to `https://admin.lamoda-specials.ru`
- TLS certificate is issued automatically by Traefik via Let's Encrypt

## Server Preparation

```bash
mkdir -p /opt/lamoda-adidas/deploy/traefik
touch /opt/lamoda-adidas/deploy/traefik/acme.json
chmod 600 /opt/lamoda-adidas/deploy/traefik/acme.json
cp /opt/lamoda-adidas/deploy/.env.example /opt/lamoda-adidas/deploy/.env
```

## What Must Be Configured

1. DNS

- Add `A` record for `lamoda-specials.ru` -> your server IP
- Add `A` record for `admin.lamoda-specials.ru` -> the same server IP

2. Production env file

Set these values in `deploy/.env`:

- `DOMAIN=lamoda-specials.ru`
- `ADMIN_DOMAIN=admin.lamoda-specials.ru`
- `LETSENCRYPT_EMAIL=...`
- `POSTGRES_DB=...`
- `POSTGRES_USER=...`
- `POSTGRES_PASSWORD=...`
- `TELEGRAM_BOT_TOKEN=...`
- `TELEGRAM_TRUST_CLIENT_USER=false` or your desired mode
- `TELEGRAM_APP_URL=...`
- `REQUEST_BODY_SECRET=` a long random secret used by admin frontend and server together

3. Secret shared by admin and server

`REQUEST_BODY_SECRET` must be the same in both places:

- passed into the `admin` image at build time
- passed into the `server` container at runtime

Without this, admin API requests will not be decrypted correctly in production.

## Start

```bash
docker compose --env-file /opt/lamoda-adidas/deploy/.env -f /opt/lamoda-adidas/deploy/docker-compose.prod.yml up -d --build
```

## GitHub Actions

Automatic deploy is configured in `.github/workflows/deploy.yml`.

Add these repository secrets in GitHub:

- `PROD_HOST` - server IP or hostname, for example `185.125.46.86`
- `PROD_PORT` - SSH port, usually `22`
- `PROD_USER` - SSH user, for example `root`
- `PROD_PASSWORD` - SSH password for the server user

Deploy runs automatically on every push to `main` and can also be started manually from the Actions tab.

## DNS

Before the certificate is issued:

- `lamoda-specials.ru` must point to the server IP
- `admin.lamoda-specials.ru` must point to the same server IP
