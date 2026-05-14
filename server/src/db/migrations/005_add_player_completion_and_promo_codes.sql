ALTER TABLE players
  ADD COLUMN IF NOT EXISTS completed_game BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS time_expired BOOLEAN NOT NULL DEFAULT FALSE;

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

ALTER TABLE game_sessions
  ADD COLUMN IF NOT EXISTS completion_reason TEXT
  CHECK (completion_reason IS NULL OR completion_reason IN ('completed', 'time-ended', 'expired'));

UPDATE game_sessions
SET completion_reason = CASE
  WHEN status = 'expired' THEN 'expired'
  WHEN status = 'finished' AND COALESCE(array_length(found_sneaker_numbers, 1), 0) >= 10 THEN 'completed'
  WHEN status = 'finished' THEN 'time-ended'
  ELSE NULL
END
WHERE completion_reason IS NULL
  AND status IN ('finished', 'expired');

ALTER TABLE game_results
  ADD COLUMN IF NOT EXISTS completion_reason TEXT
  CHECK (completion_reason IN ('completed', 'time-ended', 'expired'));

UPDATE game_results gr
SET completion_reason = CASE
  WHEN gs.status = 'expired' THEN 'expired'
  WHEN gs.status = 'finished' AND COALESCE(array_length(gs.found_sneaker_numbers, 1), 0) >= 10 THEN 'completed'
  ELSE 'time-ended'
END
FROM game_sessions gs
WHERE gs.id = gr.game_session_id
  AND gr.completion_reason IS NULL;
