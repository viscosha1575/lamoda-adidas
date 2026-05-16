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

Creates or refreshes player session, returns bearer token, and includes current game state snapshot.

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
      "subscribedToChannel": false,
      "isOnline": true,
      "lastSeenAt": "2026-05-12T12:00:00.000Z",
      "isExisting": false
    },
    "session": {
      "id": 15,
      "status": "active",
      "remainingSeconds": 587,
      "foundSneakers": [
        { "sneakerNumber": 1, "found": true },
        { "sneakerNumber": 2, "found": true },
        { "sneakerNumber": 3, "found": false }
      ],
      "pauseCount": 0,
      "startedAt": "2026-05-12T10:00:00.000Z",
      "lastResumedAt": "2026-05-12T10:00:00.000Z",
      "lastPausedAt": null,
      "lastHeartbeatAt": "2026-05-12T10:00:10.000Z",
      "finishedAt": null,
      "expiredAt": null,
      "canCollect": true,
      "isOnline": true
    },
    "lifecycle": "active",
    "reason": null
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

Deletes current player by Telegram initData.

Headers:

```text
X-Telegram-Init-Data: <initData>
```

Example response:

```json
{
  "data": {
    "deleted": true
  }
}
```

### `PATCH /api/auth/current/referral`

Simulates a real inbound referral for current player by Telegram initData.

Headers:

```text
X-Telegram-Init-Data: <initData>
```

Behavior:

- Request body is not required.
- Server finds another player with a `referralCode` and applies that code to the current player as `referredByCode`.
- Server sets `hasReferral = true`.
- If this is the first applied referral for the current player, server also triggers the same referral reset flow for the inviter as in the normal `POST /api/auth/session` flow.
- If there is no other player available to act as referral owner, server returns `409`.

Example response:

```json
{
  "data": {
    "player": {
      "id": 7,
      "telegramUserId": 123456789,
      "username": "player_one",
      "displayName": "Alex Player",
      "authProvider": "telegram_unverified",
      "referralCode": "A1B2C3D4E5F6",
      "referredByCode": "PLAYER42",
      "utmSlug": null,
      "referralLink": "https://t.me/lamoda_games_bot/search?startapp=A1B2C3D4E5F6",
      "hasReferral": true,
      "subscribedToChannel": false,
      "gameCompletionState": null,
      "raffleWon": null,
      "codeId": null,
      "isOnline": true,
      "lastSeenAt": "2026-05-12T12:00:00.000Z"
    }
  }
}
```

## Game

All `/api/game/*` endpoints require Telegram initData in headers:

```text
X-Telegram-Init-Data: <initData>
```

`initData` in body or query string is rejected.

### Session payload shape

```json
{
  "id": 15,
  "status": "active",
  "remainingSeconds": 587,
  "foundSneakers": [
    { "sneakerNumber": 1, "found": true },
    { "sneakerNumber": 2, "found": true },
    { "sneakerNumber": 3, "found": true }
  ],
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

### `GET /api/game/subscription-status`

Checks current Telegram channel subscription status and, when confirmed, permanently stores `subscribedToChannel = true` for the player.

Example response:

```json
{
  "data": {
    "available": true,
    "subscribed": true,
    "memberStatus": "member",
    "channelUrl": "https://t.me/lamoda_na_svyazi",
    "subscribedToChannel": true
  }
}
```

### `POST /api/game/start-session`

Creates new session or returns the current one.

Behavior:

- If session is already active, returns it.
- If `remainingSeconds > 0`, refreshes heartbeat and resumes the timer from the saved remainder.
- If `remainingSeconds = 0`, does not restart the timer.
- If there is no open session, creates a new active session.

Important:

- New session starts with sneaker `1` already marked as found in `foundSneakers`.
- Extra sneakers are not preloaded at start.

Example response:

```json
{
  "data": {
    "session": {
      "id": 15,
      "status": "active",
      "remainingSeconds": 600,
      "foundSneakers": [
        { "sneakerNumber": 1, "found": true },
        { "sneakerNumber": 2, "found": false },
        { "sneakerNumber": 3, "found": false }
      ],
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
  -H "X-Telegram-Init-Data: <initData>" \
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
      "foundSneakers": [
        { "sneakerNumber": 1, "found": true },
        { "sneakerNumber": 2, "found": false },
        { "sneakerNumber": 3, "found": false },
        { "sneakerNumber": 4, "found": true }
      ],
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
- all 10 entries in `foundSneakers` must be marked with `found: true`

Response example:

```json
{
  "data": {
    "session": {
      "id": 15,
      "status": "finished",
      "remainingSeconds": 120,
      "foundSneakers": [
        { "sneakerNumber": 1, "found": true },
        { "sneakerNumber": 2, "found": true },
        { "sneakerNumber": 3, "found": true },
        { "sneakerNumber": 4, "found": true },
        { "sneakerNumber": 5, "found": true },
        { "sneakerNumber": 6, "found": true },
        { "sneakerNumber": 7, "found": true },
        { "sneakerNumber": 8, "found": true },
        { "sneakerNumber": 9, "found": true },
        { "sneakerNumber": 10, "found": true }
      ],
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
