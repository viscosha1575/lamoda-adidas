CREATE INDEX IF NOT EXISTS game_sessions_last_heartbeat_idx
  ON game_sessions (last_heartbeat_at DESC)
  WHERE last_heartbeat_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS game_activity_logs_action_created_idx
  ON game_activity_logs (action, created_at DESC);

CREATE INDEX IF NOT EXISTS promo_codes_unassigned_id_idx
  ON promo_codes (id)
  WHERE assigned_player_id IS NULL;
