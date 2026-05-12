# Lamoda Adidas Server Docs

This folder contains practical documentation for the backend in `server/`.

## Files

- `server-overview.md` - architecture, startup, dependencies, environment variables.
- `api-reference.md` - all HTTP endpoints with request and response examples.
- `data-model.md` - PostgreSQL tables and how server entities are stored.
- `frontend-integration.md` - инструкция для фронтенда: порядок запросов, примеры и состояния.
- `sequences.md` - end-to-end flows for auth, referral, gameplay, and products.

## Quick Start

1. Install dependencies:

```bash
cd server
npm install
```

2. Start PostgreSQL:

```bash
npm run db:up
```

3. Create env file:

```bash
cp .env.example .env
```

4. Start the backend:

```bash
npm run dev
```

On startup the server runs SQL migrations automatically and then listens on `http://localhost:3001`.

## HTTP Conventions

- Base URL: `http://localhost:3001/api`
- Successful responses use envelope: `{ "data": ... }`
- Errors use envelope:

```json
{
  "error": {
    "message": "Validation error",
    "details": null
  }
}
```

## Auth Conventions

- Protected routes require `X-Telegram-Init-Data`.
- Auth token is created by `POST /api/auth/session`.
- Player model returned by auth includes `hasReferral`.

## Notes

- Game session state is server-driven.
- Referral is detected during auth session creation.
- Products API is public.
