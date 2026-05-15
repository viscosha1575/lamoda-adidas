function mapSession(row) {
  return {
    id: Number(row.id),
    playerId: Number(row.player_id),
    status: row.status,
    remainingSeconds: Number(row.remaining_seconds),
    foundSneakerNumbers: Array.isArray(row.found_sneaker_numbers)
      ? row.found_sneaker_numbers.map((value) => Number(value)).sort((left, right) => left - right)
      : [],
    startedAt: row.started_at,
    lastResumedAt: row.last_resumed_at,
    lastHeartbeatAt: row.last_heartbeat_at,
    finishedAt: row.finished_at,
    completionReason: row.completion_reason ?? null,
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
                     started_at, last_resumed_at, last_heartbeat_at, finished_at, completion_reason,
                     created_at, updated_at`,
    values: [sessionId, ...values],
  };
}

export function createGameRepository({ pool }) {
  return {
    async findLatestSessionByPlayerId(playerId) {
      const result = await pool.query(
        `SELECT id, player_id, status, remaining_seconds, found_sneaker_numbers,
                started_at, last_resumed_at, last_heartbeat_at, finished_at, completion_reason,
                created_at, updated_at
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
                started_at, last_resumed_at, last_heartbeat_at, finished_at, completion_reason,
                created_at, updated_at
         FROM game_sessions
         WHERE player_id = $1
           AND status = 'active'
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
           started_at, last_resumed_at, last_heartbeat_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, player_id, status, remaining_seconds, found_sneaker_numbers,
                   started_at, last_resumed_at, last_heartbeat_at, finished_at, completion_reason,
                   created_at, updated_at`,
        [
          session.playerId,
          session.status,
          session.remainingSeconds,
          session.foundSneakerNumbers,
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

    async deleteGameResultBySessionId(gameSessionId) {
      await pool.query(
        `DELETE FROM game_results
         WHERE game_session_id = $1`,
        [gameSessionId],
      );
    },

    async upsertGameResult(resultPayload) {
      const result = await pool.query(
        `INSERT INTO game_results (
           player_id, game_session_id, found_sneaker_numbers,
           completed_in_seconds, remaining_seconds, eligible_for_raffle, completion_reason
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (game_session_id)
         DO UPDATE SET
           found_sneaker_numbers = EXCLUDED.found_sneaker_numbers,
           completed_in_seconds = EXCLUDED.completed_in_seconds,
           remaining_seconds = EXCLUDED.remaining_seconds,
           eligible_for_raffle = game_results.eligible_for_raffle OR EXCLUDED.eligible_for_raffle,
           completion_reason = EXCLUDED.completion_reason
         RETURNING id`,
        [
          resultPayload.playerId,
          resultPayload.gameSessionId,
          resultPayload.foundSneakerNumbers,
          resultPayload.completedInSeconds,
          resultPayload.remainingSeconds,
          resultPayload.eligibleForRaffle,
          resultPayload.completionReason,
        ],
      );

      return {
        id: Number(result.rows[0].id),
      };
    },

    async findPlayerRewardStateById(playerId) {
      const result = await pool.query(
        `SELECT p.game_completion_state, pc.code AS promo_code
           FROM players p
           LEFT JOIN promo_codes pc ON pc.assigned_player_id = p.id
          WHERE p.id = $1`,
        [playerId],
      );

      const row = result.rows[0];

      if (!row) {
        return null;
      }

      return {
        gameCompletionState: row.game_completion_state ?? null,
        promoCode: row.promo_code ?? null,
      };
    },

    async markPlayerOutcome(playerId, {
      gameCompletionState = null,
    } = {}) {
      await pool.query(
        `UPDATE players
         SET game_completion_state = $2,
             updated_at = NOW()
         WHERE id = $1`,
        [playerId, gameCompletionState],
      );
    },

    async markPlayerSubscribedToChannel(playerId) {
      const result = await pool.query(
        `UPDATE players
         SET subscribed_to_channel = TRUE,
             updated_at = NOW()
         WHERE id = $1
         RETURNING subscribed_to_channel`,
        [playerId],
      );

      return Boolean(result.rows[0]?.subscribed_to_channel);
    },

    async assignPromoCodeToPlayer(playerId) {
      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        const existingResult = await client.query(
          `SELECT code
             FROM promo_codes
            WHERE assigned_player_id = $1
            LIMIT 1`,
          [playerId],
        );

        if (existingResult.rows[0]?.code) {
          await client.query("COMMIT");
          return existingResult.rows[0].code;
        }

        const availableResult = await client.query(
          `SELECT id, code
             FROM promo_codes
            WHERE assigned_player_id IS NULL
            ORDER BY id ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED`,
        );

        if (!availableResult.rows[0]) {
          await client.query("COMMIT");
          return null;
        }

        const assignedResult = await client.query(
          `UPDATE promo_codes
              SET assigned_player_id = $1,
                  assigned_at = NOW(),
                  updated_at = NOW()
            WHERE id = $2
              AND assigned_player_id IS NULL
          RETURNING code`,
          [playerId, availableResult.rows[0].id],
        );

        await client.query("COMMIT");
        return assignedResult.rows[0]?.code ?? null;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
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
