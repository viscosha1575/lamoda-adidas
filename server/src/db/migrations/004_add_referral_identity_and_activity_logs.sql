ALTER TABLE players
  ADD COLUMN IF NOT EXISTS referred_by_code TEXT,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE players
SET referred_by_code = referral_code
WHERE referred_by_code IS NULL
  AND referral_code IS NOT NULL;

UPDATE players
SET referral_code = CONCAT(
  'REF',
  UPPER(SUBSTRING(MD5(id::text || COALESCE(telegram_user_id, anonymous_id, created_at::text)) FROM 1 FOR 10))
)
WHERE referral_code IS NULL
   OR referral_code = referred_by_code;

UPDATE players
SET has_referral = (referred_by_code IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS players_referral_code_idx
  ON players (referral_code);

CREATE TABLE IF NOT EXISTS game_activity_logs (
  id BIGSERIAL PRIMARY KEY,
  player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  game_session_id BIGINT REFERENCES game_sessions(id) ON DELETE SET NULL,
  source TEXT NOT NULL,
  action TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS game_activity_logs_player_created_idx
  ON game_activity_logs (player_id, created_at DESC);

CREATE INDEX IF NOT EXISTS game_activity_logs_session_created_idx
  ON game_activity_logs (game_session_id, created_at DESC);
