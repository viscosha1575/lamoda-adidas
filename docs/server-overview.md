# Server Overview

## Stack

- Node.js
- Express 5
- PostgreSQL
- Zod for request validation
- Native Node test runner with `supertest`

## Entry Point

Server bootstrap lives in `server/src/server.js`.

Startup order:

1. Load environment variables.
2. Create PostgreSQL pool.
3. Run SQL migrations from `server/src/db/migrations`.
4. Build repositories, services, controllers, routers.
5. Start Express server.

## Project Structure

```text
server/
  src/
    app.js
    server.js
    dependencies.js
    config/
    db/
    lib/
    middlewares/
    modules/
      auth/
      game/
      health/
      products/
```

## Modules

### Health

- Public readiness endpoint.
- Confirms that Express is alive and DB connection works.

### Auth

- Creates player sessions.
- Supports Telegram Mini App auth only.
- Issues bearer token.
- Deletes current player.
- Detects and stores referral state during session creation.

### Game

- Tracks one player game session lifecycle.
- Supports state polling, start, pause, resume, heartbeat, item collection, finish.
- Stores final result in `game_results`.

### Products

- Public catalog endpoints for adidas products.
- Supports list, details, and creation.

## Environment Variables

Current `.env.example`:

```env
PORT=3001
DATABASE_URL=postgres://postgres:postgres@localhost:5432/lamoda_adidas
NODE_ENV=development
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173
TELEGRAM_TRUST_CLIENT_USER=true
AUTH_TOKEN_TTL_DAYS=30
GAME_DURATION_SECONDS=600
HEARTBEAT_GRACE_SECONDS=15
```

### Variable Meaning

- `PORT` - HTTP port for Express.
- `DATABASE_URL` - PostgreSQL connection string.
- `NODE_ENV` - `development`, `test`, or `production`.
- `CORS_ORIGINS` - comma-separated whitelist for frontend origins.
- `TELEGRAM_BOT_TOKEN` - optional bot token for Telegram signature verification.
- `TELEGRAM_TRUST_CLIENT_USER` - fallback trust mode if bot token is absent.
- `AUTH_TOKEN_TTL_DAYS` - auth token lifetime.
- `GAME_DURATION_SECONDS` - full game timer.
- `HEARTBEAT_GRACE_SECONDS` - grace period before active session freezes and becomes paused.

## Routing Map

Root:

- `GET /`

API:

- `GET /api/health`
- `POST /api/auth/session`
- `DELETE /api/auth/current`
- `GET /api/game/state`
- `POST /api/game/start`
- `POST /api/game/pause`
- `POST /api/game/resume`
- `POST /api/game/heartbeat`
- `POST /api/game/found-sneaker`
- `POST /api/game/finish`
- `GET /api/products`
- `GET /api/products/:id`
- `POST /api/products`

## Middleware

### CORS

- Uses `CORS_ORIGINS` allowlist.

### Auth

- Reads `Authorization: Bearer <token>`.
- Or reads `X-Telegram-Init-Data` / `X-Init-Data`.
- Loads player from DB by token.
- Rejects missing, invalid, or expired token with `401`.

### Error Handler

- Standard format:

```json
{
  "error": {
    "message": "Some message",
    "details": null
  }
}
```

### Validation

- Module routers convert `ZodError` into `400 Validation error`.

## Local Development Commands

```bash
cd server
npm install
npm run db:up
cp .env.example .env
npm run dev
```

Run tests:

```bash
npm test
```
