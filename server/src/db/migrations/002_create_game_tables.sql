CREATE TABLE IF NOT EXISTS players (
  id BIGSERIAL PRIMARY KEY,
  telegram_user_id TEXT UNIQUE,
  anonymous_id TEXT UNIQUE,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  auth_provider TEXT NOT NULL,
  auth_token TEXT UNIQUE NOT NULL,
  auth_token_expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (telegram_user_id IS NOT NULL OR anonymous_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS game_sessions (
  id BIGSERIAL PRIMARY KEY,
  player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'finished', 'expired')),
  remaining_seconds INTEGER NOT NULL CHECK (remaining_seconds >= 0),
  found_sneaker_numbers INTEGER[] NOT NULL DEFAULT ARRAY[1],
  pause_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_resumed_at TIMESTAMPTZ,
  last_paused_at TIMESTAMPTZ,
  last_heartbeat_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS game_sessions_player_status_idx
  ON game_sessions (player_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS game_results (
  id BIGSERIAL PRIMARY KEY,
  player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  game_session_id BIGINT NOT NULL UNIQUE REFERENCES game_sessions(id) ON DELETE CASCADE,
  found_sneaker_numbers INTEGER[] NOT NULL,
  completed_in_seconds INTEGER NOT NULL CHECK (completed_in_seconds >= 0),
  remaining_seconds INTEGER NOT NULL CHECK (remaining_seconds >= 0),
  eligible_for_raffle BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
