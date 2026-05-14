function mapPlayerRow(row) {
  return {
    id: Number(row.id),
    telegramUserId: row.telegram_user_id ? Number(row.telegram_user_id) : null,
    username: row.username ?? null,
    firstName: row.first_name ?? null,
    lastName: row.last_name ?? null,
    referralCode: row.referral_code ?? null,
    referredByCode: row.referred_by_code ?? null,
    hasReferral: Boolean(row.has_referral),
    completedGame: Boolean(row.completed_game),
    timeExpired: Boolean(row.time_expired),
    promoCode: row.promo_code ?? null,
    authProvider: row.auth_provider ?? null,
    lastSeenAt: row.last_seen_at ?? null,
    latestHeartbeatAt: row.latest_heartbeat_at ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
    totalSessions: Number(row.total_sessions ?? 0),
    finishedSessions: Number(row.finished_sessions ?? 0),
    bestDurationSeconds: Number(row.best_duration_seconds ?? 0),
    averageDurationSeconds: Number(row.average_duration_seconds ?? 0),
    lastSessionAt: row.last_session_at ?? null,
  };
}

function mapSessionRow(row) {
  return {
    id: Number(row.id),
    playerId: Number(row.player_id),
    status: row.status,
    remainingSeconds: Number(row.remaining_seconds ?? 0),
    foundSneakersCount: Number(row.found_sneakers_count ?? 0),
    pauseCount: Number(row.pause_count ?? 0),
    startedAt: row.started_at ?? null,
    lastResumedAt: row.last_resumed_at ?? null,
    lastPausedAt: row.last_paused_at ?? null,
    lastHeartbeatAt: row.last_heartbeat_at ?? null,
    finishedAt: row.finished_at ?? null,
    expiredAt: row.expired_at ?? null,
    player: {
      id: Number(row.player_ref_id ?? row.player_id),
      username: row.username ?? null,
      firstName: row.first_name ?? null,
      lastName: row.last_name ?? null,
    },
  };
}

function mapActivityLogRow(row) {
  return {
    id: Number(row.id),
    playerId: Number(row.player_id),
    gameSessionId: row.game_session_id ? Number(row.game_session_id) : null,
    source: row.source,
    action: row.action,
    details: row.details ?? {},
    createdAt: row.created_at ?? null,
  };
}

export function createAdminRepository({ pool }) {
  return {
    async getAnalyticsOverview({ rangeStart, onlineThreshold, bucketInterval }) {
      const summaryResult = await pool.query(
        `SELECT
            (SELECT COUNT(*)::int FROM players) AS total_players_count,
            (SELECT COUNT(*)::int
               FROM players
              WHERE ($1::timestamptz IS NULL OR created_at >= $1)) AS new_players_count,
            (SELECT COUNT(*)::int
               FROM game_sessions
              WHERE ($1::timestamptz IS NULL OR started_at >= $1)) AS sessions_started_count,
            (SELECT COUNT(*)::int
               FROM game_sessions
              WHERE status = 'finished'
                AND ($1::timestamptz IS NULL OR COALESCE(finished_at, updated_at, started_at) >= $1)) AS finished_sessions_count,
            (SELECT COUNT(DISTINCT player_id)::int
               FROM game_sessions
              WHERE status = 'finished'
                AND ($1::timestamptz IS NULL OR COALESCE(finished_at, updated_at, started_at) >= $1)) AS players_with_finished_game_count,
            (SELECT COUNT(*)::int
               FROM players
              WHERE referred_by_code IS NOT NULL
                AND ($1::timestamptz IS NULL OR created_at >= $1)) AS referrals_in_period_count,
            (SELECT COUNT(*)::int
               FROM players
              WHERE referred_by_code IS NOT NULL) AS total_referred_players_count,
            (SELECT COUNT(*)::int
               FROM players
              WHERE id IN (
                SELECT DISTINCT player_id
                  FROM game_sessions
                 WHERE last_heartbeat_at >= $2
              )) AS currently_online_players_count,
            (SELECT COALESCE(ROUND(AVG(completed_in_seconds)), 0)::int
               FROM game_results
              WHERE ($1::timestamptz IS NULL OR created_at >= $1)) AS average_completion_seconds,
            (SELECT COALESCE(ROUND(AVG(COALESCE(array_length(found_sneaker_numbers, 1), 0))), 0)::int
               FROM game_sessions
              WHERE ($1::timestamptz IS NULL OR started_at >= $1)) AS average_found_sneakers_count`,
        [rangeStart, onlineThreshold],
      );

      const recentSessionsResult = await pool.query(
        `SELECT gs.id, gs.player_id, gs.status, gs.remaining_seconds,
                COALESCE(array_length(gs.found_sneaker_numbers, 1), 0) AS found_sneakers_count,
                gs.pause_count, gs.started_at, gs.last_resumed_at, gs.last_paused_at,
                gs.last_heartbeat_at, gs.finished_at, gs.expired_at,
                p.id AS player_ref_id, p.username, p.first_name, p.last_name
           FROM game_sessions gs
           JOIN players p ON p.id = gs.player_id
          WHERE ($1::timestamptz IS NULL OR gs.started_at >= $1)
          ORDER BY gs.started_at DESC
          LIMIT 20`,
        [rangeStart],
      );

      const playerSeriesResult = await pool.query(
        `SELECT date_trunc($2, created_at) AS bucket_start,
                COUNT(*)::int AS value
           FROM players
          WHERE ($1::timestamptz IS NULL OR created_at >= $1)
          GROUP BY 1
          ORDER BY 1 ASC`,
        [rangeStart, bucketInterval],
      );

      const playersBeforeRangeResult = await pool.query(
        `SELECT COUNT(*)::int AS value
           FROM players
          WHERE ($1::timestamptz IS NOT NULL AND created_at < $1)`,
        [rangeStart],
      );

      const startedSeriesResult = await pool.query(
        `SELECT date_trunc($2, started_at) AS bucket_start,
                COUNT(*)::int AS value
           FROM game_sessions
          WHERE ($1::timestamptz IS NULL OR started_at >= $1)
          GROUP BY 1
          ORDER BY 1 ASC`,
        [rangeStart, bucketInterval],
      );

      const finishedSeriesResult = await pool.query(
        `SELECT date_trunc($2, COALESCE(finished_at, updated_at, started_at)) AS bucket_start,
                COUNT(*)::int AS value
           FROM game_sessions
          WHERE status = 'finished'
            AND ($1::timestamptz IS NULL OR COALESCE(finished_at, updated_at, started_at) >= $1)
          GROUP BY 1
          ORDER BY 1 ASC`,
        [rangeStart, bucketInterval],
      );

      return {
        summary: summaryResult.rows[0] ?? null,
        recentSessions: recentSessionsResult.rows.map(mapSessionRow),
        series: {
          playersBeforeRangeCount: Number(playersBeforeRangeResult.rows[0]?.value ?? 0),
          newPlayers: playerSeriesResult.rows,
          sessionsStarted: startedSeriesResult.rows,
          sessionsFinished: finishedSeriesResult.rows,
        },
      };
    },

    async findPlayers({
      search,
      limit,
      offset,
      sortColumn,
      sortDirection,
    }) {
      const searchValue = `%${String(search || "").trim()}%`;

      const totalResult = await pool.query(
        `SELECT COUNT(*)::int AS total_items
           FROM players p
          WHERE (
            $1 = '%%'
            OR CAST(p.id AS TEXT) ILIKE $1
            OR COALESCE(p.telegram_user_id, '') ILIKE $1
            OR COALESCE(p.username, '') ILIKE $1
            OR COALESCE(p.first_name, '') ILIKE $1
            OR COALESCE(p.last_name, '') ILIKE $1
            OR COALESCE(p.referral_code, '') ILIKE $1
            OR COALESCE(p.referred_by_code, '') ILIKE $1
          )`,
        [searchValue],
      );

      const playersResult = await pool.query(
        `WITH session_stats AS (
           SELECT player_id,
                  COUNT(*)::int AS total_sessions,
                  MAX(started_at) AS last_session_at,
                  MAX(last_heartbeat_at) AS latest_heartbeat_at
             FROM game_sessions
            GROUP BY player_id
         ),
         result_stats AS (
           SELECT player_id,
                  COUNT(*)::int AS finished_sessions,
                  COALESCE(MIN(completed_in_seconds), 0)::int AS best_duration_seconds,
                  COALESCE(ROUND(AVG(completed_in_seconds)), 0)::int AS average_duration_seconds
             FROM game_results
            GROUP BY player_id
         )
         SELECT p.id, p.telegram_user_id, p.username, p.first_name, p.last_name,
                p.referral_code, p.referred_by_code, p.has_referral,
                p.completed_game, p.time_expired, pc.code AS promo_code, p.auth_provider,
                p.last_seen_at, p.created_at, p.updated_at,
                ss.latest_heartbeat_at,
                COALESCE(ss.total_sessions, 0) AS total_sessions,
                COALESCE(rs.finished_sessions, 0) AS finished_sessions,
                COALESCE(rs.best_duration_seconds, 0) AS best_duration_seconds,
                COALESCE(rs.average_duration_seconds, 0) AS average_duration_seconds,
                ss.last_session_at
           FROM players p
           LEFT JOIN session_stats ss ON ss.player_id = p.id
           LEFT JOIN result_stats rs ON rs.player_id = p.id
           LEFT JOIN promo_codes pc ON pc.assigned_player_id = p.id
          WHERE (
            $1 = '%%'
            OR CAST(p.id AS TEXT) ILIKE $1
            OR COALESCE(p.telegram_user_id, '') ILIKE $1
            OR COALESCE(p.username, '') ILIKE $1
            OR COALESCE(p.first_name, '') ILIKE $1
            OR COALESCE(p.last_name, '') ILIKE $1
            OR COALESCE(p.referral_code, '') ILIKE $1
            OR COALESCE(p.referred_by_code, '') ILIKE $1
          )
          ORDER BY ${sortColumn} ${sortDirection}, p.id DESC
          LIMIT $2 OFFSET $3`,
        [searchValue, limit, offset],
      );

      return {
        totalItems: Number(totalResult.rows[0]?.total_items ?? 0),
        items: playersResult.rows.map(mapPlayerRow),
      };
    },

    async findPlayerById(playerId) {
      const result = await pool.query(
        `SELECT p.id, p.telegram_user_id, p.username, p.first_name, p.last_name,
                p.referral_code, p.referred_by_code, p.has_referral,
                p.completed_game, p.time_expired, pc.code AS promo_code, p.auth_provider,
                p.last_seen_at, p.created_at, p.updated_at,
                (SELECT MAX(last_heartbeat_at) FROM game_sessions WHERE player_id = p.id) AS latest_heartbeat_at,
                (SELECT COUNT(*)::int FROM game_sessions WHERE player_id = p.id) AS total_sessions,
                (SELECT COUNT(*)::int FROM game_results WHERE player_id = p.id) AS finished_sessions,
                (SELECT COALESCE(SUM(completed_in_seconds), 0)::int FROM game_results WHERE player_id = p.id) AS total_duration_seconds,
                (SELECT COALESCE(MIN(completed_in_seconds), 0)::int FROM game_results WHERE player_id = p.id) AS best_duration_seconds,
                (SELECT COALESCE(ROUND(AVG(completed_in_seconds)), 0)::int FROM game_results WHERE player_id = p.id) AS average_duration_seconds,
                (SELECT MAX(started_at) FROM game_sessions WHERE player_id = p.id) AS last_session_at,
                (SELECT COUNT(*)::int FROM game_activity_logs WHERE player_id = p.id) AS total_activity_logs
           FROM players p
           LEFT JOIN promo_codes pc ON pc.assigned_player_id = p.id
          WHERE p.id = $1`,
        [playerId],
      );

      return result.rows[0] ?? null;
    },

    async findRecentSessionsByPlayerId(playerId, limit = 20) {
      const result = await pool.query(
        `SELECT gs.id, gs.player_id, gs.status, gs.remaining_seconds,
                COALESCE(array_length(gs.found_sneaker_numbers, 1), 0) AS found_sneakers_count,
                gs.pause_count, gs.started_at, gs.last_resumed_at, gs.last_paused_at,
                gs.last_heartbeat_at, gs.finished_at, gs.expired_at,
                p.id AS player_ref_id, p.username, p.first_name, p.last_name
           FROM game_sessions gs
           JOIN players p ON p.id = gs.player_id
          WHERE gs.player_id = $1
          ORDER BY gs.started_at DESC
          LIMIT $2`,
        [playerId, limit],
      );

      return result.rows.map(mapSessionRow);
    },

    async findActivityLogsByPlayerId(playerId, limit = 50) {
      const result = await pool.query(
        `SELECT id, player_id, game_session_id, source, action, details, created_at
           FROM game_activity_logs
          WHERE player_id = $1
          ORDER BY created_at DESC
          LIMIT $2`,
        [playerId, limit],
      );

      return result.rows.map(mapActivityLogRow);
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
  };
}
