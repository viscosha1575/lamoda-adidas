# Data Model

Backend uses PostgreSQL with SQL migrations from `server/src/db/migrations`.

## `players`

Stores player identity and auth state.

Columns:

- `id` - primary key
- `telegram_user_id` - unique Telegram user id, nullable
- `anonymous_id` - unique anonymous id, nullable
- `username`
- `first_name`
- `last_name`
- `auth_provider`
- `referral_code` - personal unique referral code of the player
- `referred_by_code` - inbound referral code used by this player
- `has_referral` - boolean flag for referral presence
- `auth_token` - unique bearer token
- `auth_token_expires_at`
- `last_seen_at`
- `created_at`
- `updated_at`

Rules:

- Either `telegram_user_id` or `anonymous_id` must be present.
- Player is upserted by Telegram user id or anonymous id.
- `referral_code` is the player's own share code.
- `referred_by_code` stores who referred the player.
- Once `has_referral` becomes `true`, it stays `true`.

## `game_sessions`

Stores current and historical game attempts.

Columns:

- `id`
- `player_id`
- `status` - `active`, `paused`, `finished`, `expired`
- `remaining_seconds`
- `found_sneaker_numbers`
- `pause_count`
- `started_at`
- `last_resumed_at`
- `last_paused_at`
- `last_heartbeat_at`
- `finished_at`
- `expired_at`
- `created_at`
- `updated_at`

Notes:

- New sessions start with `found_sneaker_numbers = [1]`.
- Open sessions are searched by `status IN ('active', 'paused')`.
- Heartbeat is used to keep an active session alive.

## `game_results`

Stores finished game results.

Columns:

- `id`
- `player_id`
- `game_session_id` - unique, one result per session
- `found_sneaker_numbers`
- `completed_in_seconds`
- `remaining_seconds`
- `eligible_for_raffle`
- `created_at`

## `game_activity_logs`

Stores gameplay actions reported by Unity or frontend.

Columns:

- `id`
- `player_id`
- `game_session_id`
- `source`
- `action`
- `details`
- `created_at`

## `products`

Simple product catalog.

Columns:

- `id`
- `name`
- `brand`
- `price`
- `currency`
- `stock`
- `created_at`
- `updated_at`

## `schema_migrations`

Tracks applied SQL migration files.

Columns:

- `id`
- `name`
- `applied_at`

## Current Migration List

- `001_create_products.sql`
- `002_create_game_tables.sql`
- `003_add_player_referral.sql`
- `004_add_referral_identity_and_activity_logs.sql`
