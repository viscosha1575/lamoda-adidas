function mapSession(row) {
  return {
    id: Number(row.id),
    playerId: Number(row.player_id),
    status: row.status,
    remainingSeconds: Number(row.remaining_seconds),
    foundSneakerNumbers: Array.isArray(row.found_sneaker_numbers)
      ? row.found_sneaker_numbers.map((value) => Number(value)).sort((left, right) => left - right)
      : [],
    pauseCount: Number(row.pause_count),
    startedAt: row.started_at,
    lastResumedAt: row.last_resumed_at,
    lastPausedAt: row.last_paused_at,
    lastHeartbeatAt: row.last_heartbeat_at,
    finishedAt: row.finished_at,
    expiredAt: row.expired_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapActivityLog(row) {
  return {
    id: Number(row.id),
    playerId: Number(row.player_id),
    gameSessionId: row.game_session_id ? Number(row.game_session_id) : null,
    source: row.source,
    action: row.action,
    details: row.details ?? {},
    createdAt: row.created_at,
  };
}

function buildUpdateQuery(sessionId, valuesToUpdate) {
  const entries = Object.entries(valuesToUpdate);
  const assignments = entries.map(([columnName], index) => `${columnName} = $${index + 2}`);
  const values = entries.map(([, value]) => value);

  return {
    text: `UPDATE game_sessions
           SET ${assignments.join(", ")}, updated_at = NOW()
           WHERE id = $1
           RETURNING id, player_id, status, remaining_seconds, found_sneaker_numbers,
                     pause_count, started_at, last_resumed_at, last_paused_at,
                     last_heartbeat_at, finished_at, expired_at, created_at, updated_at`,
    values: [sessionId, ...values],
  };
}

export function createGameRepository({ pool }) {
  return {
    async findLatestSessionByPlayerId(playerId) {
      const result = await pool.query(
        `SELECT id, player_id, status, remaining_seconds, found_sneaker_numbers,
                pause_count, started_at, last_resumed_at, last_paused_at,
                last_heartbeat_at, finished_at, expired_at, created_at, updated_at
         FROM game_sessions
         WHERE player_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [playerId],
      );

      return result.rows[0] ? mapSession(result.rows[0]) : null;
    },

    async findLatestOpenSessionByPlayerId(playerId) {
      const result = await pool.query(
        `SELECT id, player_id, status, remaining_seconds, found_sneaker_numbers,
                pause_count, started_at, last_resumed_at, last_paused_at,
                last_heartbeat_at, finished_at, expired_at, created_at, updated_at
         FROM game_sessions
         WHERE player_id = $1
           AND status IN ('active', 'paused')
         ORDER BY created_at DESC
         LIMIT 1`,
        [playerId],
      );

      return result.rows[0] ? mapSession(result.rows[0]) : null;
    },

    async createSession(session) {
      const result = await pool.query(
        `INSERT INTO game_sessions (
           player_id, status, remaining_seconds, found_sneaker_numbers,
           pause_count, started_at, last_resumed_at, last_heartbeat_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, player_id, status, remaining_seconds, found_sneaker_numbers,
                   pause_count, started_at, last_resumed_at, last_paused_at,
                   last_heartbeat_at, finished_at, expired_at, created_at, updated_at`,
        [
          session.playerId,
          session.status,
          session.remainingSeconds,
          session.foundSneakerNumbers,
          session.pauseCount,
          session.startedAt,
          session.lastResumedAt,
          session.lastHeartbeatAt,
        ],
      );

      return mapSession(result.rows[0]);
    },

    async updateSession(sessionId, valuesToUpdate) {
      const query = buildUpdateQuery(sessionId, valuesToUpdate);
      const result = await pool.query(query.text, query.values);
      return mapSession(result.rows[0]);
    },

    async createGameResult(resultPayload) {
      const result = await pool.query(
        `INSERT INTO game_results (
           player_id, game_session_id, found_sneaker_numbers,
           completed_in_seconds, remaining_seconds, eligible_for_raffle
         )
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          resultPayload.playerId,
          resultPayload.gameSessionId,
          resultPayload.foundSneakerNumbers,
          resultPayload.completedInSeconds,
          resultPayload.remainingSeconds,
          resultPayload.eligibleForRaffle,
        ],
      );

      return {
        id: Number(result.rows[0].id),
      };
    },

    async createActivityLog(activityLog) {
      const result = await pool.query(
        `INSERT INTO game_activity_logs (
           player_id, game_session_id, source, action, details
         )
         VALUES ($1, $2, $3, $4, $5::jsonb)
         RETURNING id, player_id, game_session_id, source, action, details, created_at`,
        [
          activityLog.playerId,
          activityLog.gameSessionId,
          activityLog.source,
          activityLog.action,
          JSON.stringify(activityLog.details ?? {}),
        ],
      );

      return mapActivityLog(result.rows[0]);
    },
  };
}
