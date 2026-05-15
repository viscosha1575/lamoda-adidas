export function createAuthRepository({ pool }) {
  return {
    async findPlayerByTelegramUserId(telegramUserId) {
      const result = await pool.query(
        `SELECT id, telegram_user_id, username, first_name, last_name,
                auth_provider, referral_code, referred_by_code, has_referral,
                game_completion_state, raffle_won, code_id, subscribed_to_channel,
                auth_token, auth_token_expires_at,
                last_seen_at, created_at, updated_at
         FROM players
         WHERE telegram_user_id = $1`,
        [String(telegramUserId)],
      );

      return result.rows[0] ?? null;
    },

    async findPlayerByAuthToken(authToken) {
      const result = await pool.query(
        `SELECT id, telegram_user_id, username, first_name, last_name,
                auth_provider, referral_code, referred_by_code, has_referral,
                game_completion_state, raffle_won, code_id, subscribed_to_channel,
                auth_token, auth_token_expires_at,
                last_seen_at, created_at, updated_at
         FROM players
         WHERE auth_token = $1`,
        [authToken],
      );

      return result.rows[0] ?? null;
    },

    async findPlayerByReferralCode(referralCode) {
      const result = await pool.query(
        `SELECT id, telegram_user_id, username, first_name, last_name,
                auth_provider, referral_code, referred_by_code, has_referral,
                game_completion_state, raffle_won, code_id, subscribed_to_channel,
                auth_token, auth_token_expires_at,
                last_seen_at, created_at, updated_at
         FROM players
         WHERE referral_code = $1`,
        [referralCode],
      );

      return result.rows[0] ?? null;
    },

    async touchPlayerLastSeen(playerId) {
      const result = await pool.query(
        `UPDATE players
         SET last_seen_at = NOW(), updated_at = NOW()
         WHERE id = $1
         RETURNING id, telegram_user_id, username, first_name, last_name,
                   auth_provider, referral_code, referred_by_code, has_referral,
                   game_completion_state, raffle_won, code_id, subscribed_to_channel,
                   auth_token, auth_token_expires_at,
                   last_seen_at, created_at, updated_at`,
        [playerId],
      );

      return result.rows[0] ?? null;
    },

    async deletePlayerById(playerId) {
      const result = await pool.query(
        `DELETE FROM players
         WHERE id = $1
         RETURNING id`,
        [playerId],
      );

      return result.rowCount > 0;
    },

    async upsertTelegramPlayer(player) {
      const result = await pool.query(
        `INSERT INTO players (
           telegram_user_id, username, first_name, last_name, auth_provider,
           referral_code, referred_by_code, has_referral, auth_token,
           auth_token_expires_at, last_seen_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (telegram_user_id)
         DO UPDATE SET
           username = EXCLUDED.username,
           first_name = EXCLUDED.first_name,
           last_name = EXCLUDED.last_name,
           auth_provider = EXCLUDED.auth_provider,
           referral_code = COALESCE(players.referral_code, EXCLUDED.referral_code),
           referred_by_code = COALESCE(players.referred_by_code, EXCLUDED.referred_by_code),
           has_referral = players.has_referral OR EXCLUDED.has_referral,
           auth_token = EXCLUDED.auth_token,
           auth_token_expires_at = EXCLUDED.auth_token_expires_at,
           last_seen_at = EXCLUDED.last_seen_at,
           updated_at = NOW()
         RETURNING id, telegram_user_id, username, first_name, last_name,
                   auth_provider, referral_code, referred_by_code, has_referral,
                   game_completion_state, raffle_won, code_id, subscribed_to_channel,
                   auth_token, auth_token_expires_at,
                   last_seen_at, created_at, updated_at`,
        [
          String(player.telegramUserId),
          player.username ?? null,
          player.firstName ?? null,
          player.lastName ?? null,
          player.authProvider,
          player.referralCode ?? null,
          player.referredByCode ?? null,
          player.hasReferral,
          player.authToken,
          player.authTokenExpiresAt,
          player.lastSeenAt,
        ],
      );

      return result.rows[0];
    },

  };
}
