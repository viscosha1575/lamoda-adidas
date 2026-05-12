# API Reference

Base URL:

```text
http://localhost:3001/api
```

## Root

### `GET /`

Returns basic service info.

Example response:

```json
{
  "service": "lamoda-adidas-server",
  "status": "ok"
}
```

## Health

### `GET /api/health`

Checks API and DB connectivity.

Example response:

```json
{
  "status": "ok",
  "database": "connected"
}
```

## Auth

### `POST /api/auth/session`

Creates or refreshes player session and returns bearer token.

Telegram Mini App auth only.

`initData` must be sent only in headers:

- `X-Telegram-Init-Data`
- `X-Init-Data`

Optional body fields:

- `referralCode`

### Telegram request example

```bash
curl -X POST http://localhost:3001/api/auth/session \
  -H "X-Telegram-Init-Data: query_id=AA...&user=%7B...%7D&auth_date=1710000000" \
  -H "Content-Type: application/json" \
  -d '{
    "referralCode": "PLAYER42"
  }'
```

### Auth response example

```json
{
  "data": {
    "token": "0d4d0c1f-7d3b-4f35-bc4e-6e1a0bb3fd2c",
    "expiresAt": "2026-06-11T12:00:00.000Z",
    "player": {
      "id": 7,
      "telegramUserId": 123456789,
      "username": "player_one",
      "displayName": "Alex Player",
      "authProvider": "telegram_unverified",
      "referralCode": "A1B2C3D4E5F6",
      "referredByCode": "PLAYER42",
      "referralLink": "https://t.me/lamoda_games_bot/search?startapp=A1B2C3D4E5F6",
      "hasReferral": true,
      "isOnline": true,
      "lastSeenAt": "2026-05-12T12:00:00.000Z",
      "isExisting": false
    }
  }
}
```

### Referral behavior

- If `referralCode` is empty or absent, `hasReferral` is `false`.
- If `referralCode` is present, server treats it as inbound referral and stores it as `referredByCode`.
- Server generates separate personal `referralCode` for the player.
- Server returns ready-to-share `referralLink`.
- Full links like `https://t.me/lamoda_games_bot/search?startapp=PLAYER42` become `referredByCode = PLAYER42`.
- On later logins without referral, previous `hasReferral` stays `true`.

### `DELETE /api/auth/current`

Deletes current player by bearer token.

Headers:

```text
Authorization: Bearer <token>
```

Example response:

```json
{
  "data": {
    "deleted": true
  }
}
```

## Game

All `/api/game/*` endpoints require bearer token.

Unity can also authenticate with:

```text
X-Telegram-Init-Data: <initData>
```

`initData` in body or query string is rejected.

Header:

```text
Authorization: Bearer <token>
```

### Session payload shape

```json
{
  "id": 15,
  "status": "active",
  "remainingSeconds": 587,
  "foundSneakerNumbers": [1, 2, 3],
  "pauseCount": 0,
  "startedAt": "2026-05-12T10:00:00.000Z",
  "lastResumedAt": "2026-05-12T10:00:00.000Z",
  "lastPausedAt": null,
  "lastHeartbeatAt": "2026-05-12T10:00:10.000Z",
  "finishedAt": null,
  "expiredAt": null,
  "canCollect": true
}
```

### `GET /api/game/state`

Returns current player game state.

Possible lifecycle values:

- `idle`
- `active`
- `paused`
- `finished`
- `expired`

Example response with active session:

```json
{
  "data": {
    "session": {
      "id": 15,
      "status": "active",
      "remainingSeconds": 587,
      "foundSneakerNumbers": [1, 2],
      "pauseCount": 0,
      "startedAt": "2026-05-12T10:00:00.000Z",
      "lastResumedAt": "2026-05-12T10:00:00.000Z",
      "lastPausedAt": null,
      "lastHeartbeatAt": "2026-05-12T10:00:10.000Z",
      "finishedAt": null,
      "expiredAt": null,
      "canCollect": true
    },
    "lifecycle": "active",
    "reason": null
  }
}
```

Example response with no session:

```json
{
  "data": {
    "session": null,
    "lifecycle": "idle",
    "reason": null
  }
}
```

### `POST /api/game/start`

Alias for Unity:

### `POST /api/game/start-session`

Creates new session or resumes paused one.

Behavior:

- If session is already active, returns it.
- If latest open session is paused, resumes it.
- If there is no open session, creates a new active session.

Important:

- New session starts with `foundSneakerNumbers: [1]`.
- Unity can pass `foundSneakerNumbers` in request body.

Request example:

```json
{
  "foundSneakerNumbers": [1, 4, 7]
}
```

Example response:

```json
{
  "data": {
    "session": {
      "id": 15,
      "status": "active",
      "remainingSeconds": 600,
      "foundSneakerNumbers": [1],
      "pauseCount": 0,
      "startedAt": "2026-05-12T10:00:00.000Z",
      "lastResumedAt": "2026-05-12T10:00:00.000Z",
      "lastPausedAt": null,
      "lastHeartbeatAt": "2026-05-12T10:00:00.000Z",
      "finishedAt": null,
      "expiredAt": null,
      "canCollect": true
    },
    "lifecycle": "active",
    "reason": "new-session"
  }
}
```

### `POST /api/game/pause`

Pauses current session.

Possible `reason`:

- `paused`
- `already-paused`

### `POST /api/game/resume`

Resumes paused session or refreshes heartbeat if already active.

Possible `reason`:

- `resumed`
- `already-active`

### `POST /api/game/heartbeat`

Touches active session to keep it running.

Expected usage:

- frontend sends heartbeat every few seconds during gameplay

### `POST /api/game/activity-log`

Logs game activity and refreshes player online state.

Request example:

```json
{
  "source": "unity",
  "action": "swipe",
  "details": {
    "direction": "left"
  }
}
```

### `POST /api/game/found-sneaker`

Marks sneaker as found.

Request example:

```bash
curl -X POST http://localhost:3001/api/game/found-sneaker \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "sneakerNumber": 4
  }'
```

Rules:

- `sneakerNumber` must be integer from `1` to `10`
- duplicates return `accepted: false`

Response example:

```json
{
  "data": {
    "accepted": true,
    "session": {
      "id": 15,
      "status": "active",
      "remainingSeconds": 540,
      "foundSneakerNumbers": [1, 4],
      "pauseCount": 0,
      "startedAt": "2026-05-12T10:00:00.000Z",
      "lastResumedAt": "2026-05-12T10:00:00.000Z",
      "lastPausedAt": null,
      "lastHeartbeatAt": "2026-05-12T10:01:00.000Z",
      "finishedAt": null,
      "expiredAt": null,
      "canCollect": true
    },
    "lifecycle": "active"
  }
}
```

### `POST /api/game/finish`

Completes session and writes result.

Rules:

- session must be active
- timer must not be expired
- `foundSneakerNumbers.length` must be at least `10`

Response example:

```json
{
  "data": {
    "session": {
      "id": 15,
      "status": "finished",
      "remainingSeconds": 120,
      "foundSneakerNumbers": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      "pauseCount": 0,
      "startedAt": "2026-05-12T10:00:00.000Z",
      "lastResumedAt": null,
      "lastPausedAt": "2026-05-12T10:08:00.000Z",
      "lastHeartbeatAt": "2026-05-12T10:07:55.000Z",
      "finishedAt": "2026-05-12T10:08:00.000Z",
      "expiredAt": null,
      "canCollect": false
    },
    "lifecycle": "finished",
    "reason": "completed"
  }
}
```

## Products

Products endpoints are public.

### `GET /api/products`

Example response:

```json
{
  "data": [
    {
      "id": 1,
      "name": "Ultraboost Light",
      "brand": "adidas",
      "price": 15990,
      "currency": "RUB",
      "stock": 12,
      "created_at": "2026-05-12T10:00:00.000Z",
      "updated_at": "2026-05-12T10:00:00.000Z"
    }
  ]
}
```

### `GET /api/products/:id`

Example:

```bash
curl http://localhost:3001/api/products/1
```

### `POST /api/products`

Request example:

```bash
curl -X POST http://localhost:3001/api/products \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Superstar",
    "brand": "adidas",
    "price": 9990,
    "currency": "RUB",
    "stock": 4
  }'
```

Response example:

```json
{
  "data": {
    "id": 4,
    "name": "Superstar",
    "brand": "adidas",
    "price": 9990,
    "currency": "RUB",
    "stock": 4,
    "created_at": "2026-05-12T10:00:00.000Z",
    "updated_at": "2026-05-12T10:00:00.000Z"
  }
}
```

## Common Error Examples

### Missing token

```json
{
  "error": {
    "message": "Authorization token is required",
    "details": null
  }
}
```

### Invalid token

```json
{
  "error": {
    "message": "Invalid authorization token",
    "details": null
  }
}
```

### Validation error

```json
{
  "error": {
    "message": "Validation error",
    "details": {
      "fieldErrors": {
        "sneakerNumber": [
          "Too small: expected number to be >=1"
        ]
      }
    }
  }
}
```
