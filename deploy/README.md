# Production Deploy

Files in this folder are intended for production deployment of the project on `lamoda-specials.ru`.

## Files

- `docker-compose.prod.yml` - Traefik + frontend + backend + PostgreSQL.
- `.env.example` - environment template for production variables.
- `traefik/acme.json` - Let's Encrypt storage file. Create it on the server with `chmod 600`.

## Expected Result

- `https://lamoda-specials.ru` -> frontend
- `https://lamoda-specials.ru/api/*` -> backend
- `http://lamoda-specials.ru` -> redirects to `https://lamoda-specials.ru`
- TLS certificate is issued automatically by Traefik via Let's Encrypt

## Server Preparation

```bash
mkdir -p /opt/lamoda-adidas/deploy/traefik
touch /opt/lamoda-adidas/deploy/traefik/acme.json
chmod 600 /opt/lamoda-adidas/deploy/traefik/acme.json
cp /opt/lamoda-adidas/deploy/.env.example /opt/lamoda-adidas/deploy/.env
```

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

Before the certificate is issued, the A record for `lamoda-specials.ru` must point to the server IP.
