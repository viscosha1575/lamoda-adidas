ALTER TABLE players
  ADD COLUMN IF NOT EXISTS game_completion_state TEXT
  CHECK (
    game_completion_state IS NULL
    OR game_completion_state IN ('completed', 'time-ended', 'completed-after-time')
  ),
  ADD COLUMN IF NOT EXISTS raffle_won BOOLEAN;

CREATE TABLE IF NOT EXISTS promo_codes (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  assigned_player_id BIGINT UNIQUE REFERENCES players(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS promo_codes_assigned_player_idx
  ON promo_codes (assigned_player_id)
  WHERE assigned_player_id IS NOT NULL;
