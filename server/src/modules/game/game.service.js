import { addSeconds, diffWholeSeconds } from "../../lib/dates.js";
import { HttpError } from "../../lib/http-error.js";
import {
  activityLogSchema,
  sneakerCollectSchema,
  startSessionSchema,
} from "./game.schema.js";

const FINISHED_STATUSES = new Set(["finished", "expired"]);
const DEFAULT_OPEN_SNEAKER = 1;
const TOTAL_SNEAKER_COUNT = 10;

function sortUniqueSneakers(numbers) {
  return [...new Set(numbers)]
    .filter((value) => Number.isInteger(value) && value >= 1 && value <= TOTAL_SNEAKER_COUNT)
    .sort((left, right) => left - right);
}

function normalizeCollectedSneakers(numbers = []) {
  return sortUniqueSneakers([DEFAULT_OPEN_SNEAKER, ...numbers]);
}

function hasCollectedAllSneakers(numbers = []) {
  return normalizeCollectedSneakers(numbers).length >= TOTAL_SNEAKER_COUNT;
}

function buildFoundSneakers(numbers = []) {
  const collectedSneakers = new Set(normalizeCollectedSneakers(numbers));

  return Array.from({ length: TOTAL_SNEAKER_COUNT }, (_value, index) => {
    const sneakerNumber = index + 1;

    return {
      sneakerNumber,
      found: collectedSneakers.has(sneakerNumber),
    };
  });
}

function createLifecycleResponse(lifecycle, reason = null) {
  return {
    session: null,
    lifecycle,
    reason,
  };
}

function resolveCompletionReason(session) {
  if (session?.completionReason) {
    return session.completionReason;
  }

  if (session?.status === "expired") {
    return "expired";
  }

  if (session?.status === "finished") {
    return hasCollectedAllSneakers(session.foundSneakerNumbers)
      ? "completed"
      : "time-ended";
  }

  return null;
}

function canSessionCollect(session, remainingSeconds) {
  const foundSneakerNumbers = normalizeCollectedSneakers(session.foundSneakerNumbers);

  if (hasCollectedAllSneakers(foundSneakerNumbers)) {
    return false;
  }

  if (session.status === "paused") {
    return false;
  }

  if (session.status === "active") {
    return remainingSeconds > 0;
  }

  return FINISHED_STATUSES.has(session.status);
}

function serializeSession(
  session,
  now,
  heartbeatGraceSeconds,
  playerOnlineWindowSeconds,
  rewardState = null,
) {
  let remainingSeconds = session.remainingSeconds;
  const foundSneakerNumbers = normalizeCollectedSneakers(session.foundSneakerNumbers);

  if (FINISHED_STATUSES.has(session.status)) {
    remainingSeconds = 0;
  } else if (session.status === "active" && session.lastResumedAt) {
    const lastHeartbeatAt = session.lastHeartbeatAt ?? session.lastResumedAt;
    const freezeAt = addSeconds(new Date(lastHeartbeatAt), heartbeatGraceSeconds);
    const effectiveNow = now.getTime() > freezeAt.getTime() ? freezeAt : now;
    const elapsedSeconds = diffWholeSeconds(effectiveNow, new Date(session.lastResumedAt));
    remainingSeconds = Math.max(0, session.remainingSeconds - elapsedSeconds);
  }

  return {
    id: session.id,
    status: session.status,
    remainingSeconds,
    foundSneakers: buildFoundSneakers(foundSneakerNumbers),
    promoCode: rewardState?.promoCode ?? null,
    pauseCount: session.pauseCount,
    startedAt: session.startedAt,
    lastResumedAt: session.lastResumedAt,
    lastPausedAt: session.lastPausedAt,
    lastHeartbeatAt: session.lastHeartbeatAt,
    finishedAt: session.finishedAt,
    expiredAt: session.expiredAt,
    completionReason: resolveCompletionReason(session),
    canCollect: canSessionCollect(session, remainingSeconds),
    isOnline: Boolean(
      session.lastHeartbeatAt
      && now.getTime() - new Date(session.lastHeartbeatAt).getTime()
        <= playerOnlineWindowSeconds * 1000
    ),
  };
}

function calculateRunningState(session, now, heartbeatGraceSeconds) {
  const lastResumedAt = new Date(session.lastResumedAt);
  const lastHeartbeatAt = new Date(session.lastHeartbeatAt ?? session.lastResumedAt);
  const freezeAt = addSeconds(lastHeartbeatAt, heartbeatGraceSeconds);
  const effectiveNow = now.getTime() > freezeAt.getTime() ? freezeAt : now;
  const elapsedSeconds = diffWholeSeconds(effectiveNow, lastResumedAt);
  const remainingSeconds = Math.max(0, session.remainingSeconds - elapsedSeconds);

  return {
    remainingSeconds,
    freezeAt,
    isStale: now.getTime() > freezeAt.getTime(),
    isExpired: remainingSeconds <= 0,
  };
}

function buildGameResultPayload(session, gameDurationSeconds, {
  remainingSeconds,
  reason,
}) {
  return {
    playerId: session.playerId,
    gameSessionId: session.id,
    foundSneakerNumbers: normalizeCollectedSneakers(session.foundSneakerNumbers),
    completedInSeconds: Math.max(0, gameDurationSeconds - remainingSeconds),
    remainingSeconds,
    eligibleForRaffle: reason === "completed",
    completionReason: reason,
  };
}

export function createGameService({
  gameRepository,
  gameDurationSeconds,
  heartbeatGraceSeconds,
  playerOnlineWindowSeconds,
}) {
  async function getPlayerRewardState(playerId) {
    const rewardState = await gameRepository.findPlayerRewardStateById(playerId);

    return rewardState ?? {
      completedGame: false,
      timeExpired: false,
      promoCode: null,
    };
  }

  async function persistSessionOutcome(session, {
    reason,
    remainingSeconds,
  }) {
    await gameRepository.markPlayerOutcome(session.playerId, {
      completedGame: reason === "completed",
      timeExpired: reason !== "completed",
    });

    await gameRepository.upsertGameResult(
      buildGameResultPayload(session, gameDurationSeconds, {
        remainingSeconds,
        reason,
      }),
    );

    if (hasCollectedAllSneakers(session.foundSneakerNumbers)) {
      await gameRepository.assignPromoCodeToPlayer(session.playerId);
    }

    return getPlayerRewardState(session.playerId);
  }

  async function buildSessionResponse(session, now, lifecycle, reason = null) {
    const rewardState = await getPlayerRewardState(session.playerId);

    return {
      session: serializeSession(
        session,
        now,
        heartbeatGraceSeconds,
        playerOnlineWindowSeconds,
        rewardState,
      ),
      lifecycle,
      reason,
    };
  }

  async function expireSession(session, {
    atTime,
    remainingSeconds = 0,
  }) {
    const expiredSession = await gameRepository.updateSession(session.id, {
      status: "expired",
      remaining_seconds: 0,
      last_paused_at: atTime,
      last_resumed_at: null,
      expired_at: atTime,
      completion_reason: "expired",
    });

    const rewardState = await persistSessionOutcome(expiredSession, {
      reason: "expired",
      remainingSeconds,
    });

    return {
      session: expiredSession,
      rewardState,
    };
  }

  async function settleOpenSession(session) {
    if (!session || session.status !== "active" || !session.lastResumedAt) {
      return session;
    }

    const now = new Date();
    const runningState = calculateRunningState(session, now, heartbeatGraceSeconds);

    if (runningState.isExpired) {
      const expired = await expireSession(session, {
        atTime: runningState.freezeAt,
        remainingSeconds: 0,
      });

      return expired.session;
    }

    if (runningState.isStale) {
      return gameRepository.updateSession(session.id, {
        status: "paused",
        remaining_seconds: runningState.remainingSeconds,
        last_paused_at: runningState.freezeAt,
        last_resumed_at: null,
        pause_count: session.pauseCount + 1,
      });
    }

    return session;
  }

  async function getOpenSession(playerId) {
    const session = await gameRepository.findLatestOpenSessionByPlayerId(playerId);
    return settleOpenSession(session);
  }

  async function getLatestPlayableSession(playerId) {
    const openSession = await getOpenSession(playerId);

    if (openSession) {
      return openSession;
    }

    return gameRepository.findLatestSessionByPlayerId(playerId);
  }

  async function finalizeSession(session, {
    playerId,
    now,
    remainingSeconds,
    reason,
  }) {
    const finishedSession = await gameRepository.updateSession(session.id, {
      status: "finished",
      remaining_seconds: remainingSeconds,
      last_paused_at: now,
      last_resumed_at: null,
      finished_at: now,
      completion_reason: reason,
    });

    const rewardState = await persistSessionOutcome(finishedSession, {
      reason,
      remainingSeconds,
    });

    return {
      session: serializeSession(
        finishedSession,
        now,
        heartbeatGraceSeconds,
        playerOnlineWindowSeconds,
        rewardState,
      ),
      lifecycle: "finished",
      reason,
    };
  }

  return {
    async getState(playerId) {
      const now = new Date();
      const openSession = await getOpenSession(playerId);

      if (openSession) {
        return buildSessionResponse(
          openSession,
          now,
          openSession.status,
          resolveCompletionReason(openSession),
        );
      }

      const latestSession = await gameRepository.findLatestSessionByPlayerId(playerId);

      if (!latestSession) {
        return createLifecycleResponse("idle");
      }

      if (FINISHED_STATUSES.has(latestSession.status)) {
        return buildSessionResponse(
          latestSession,
          now,
          latestSession.status,
          resolveCompletionReason(latestSession),
        );
      }

      return createLifecycleResponse("idle");
    },

    async startSession(playerId, payload = {}) {
      const now = new Date();
      const openSession = await getOpenSession(playerId);
      startSessionSchema.parse(payload);

      if (openSession?.status === "active") {
        const touchedSession = await gameRepository.updateSession(openSession.id, {
          last_heartbeat_at: now,
        });

        return buildSessionResponse(
          touchedSession,
          now,
          "active",
          "existing-session",
        );
      }

      if (openSession?.status === "paused") {
        const resumedSession = await gameRepository.updateSession(openSession.id, {
          status: "active",
          last_resumed_at: now,
          last_heartbeat_at: now,
        });

        return buildSessionResponse(
          resumedSession,
          now,
          "active",
          "resumed-session",
        );
      }

      const createdSession = await gameRepository.createSession({
        playerId,
        status: "active",
        remainingSeconds: gameDurationSeconds,
        foundSneakerNumbers: [DEFAULT_OPEN_SNEAKER],
        pauseCount: 0,
        startedAt: now,
        lastResumedAt: now,
        lastHeartbeatAt: now,
      });

      return buildSessionResponse(
        createdSession,
        now,
        "active",
        "new-session",
      );
    },

    async collectSneaker(playerId, payload) {
      const { sneakerNumber } = sneakerCollectSchema.parse(payload);
      const now = new Date();
      let session = await getLatestPlayableSession(playerId);
      let runningState = null;

      if (!session) {
        throw new HttpError(409, "No active game session. Start a game first.");
      }

      if (session.status === "paused") {
        throw new HttpError(409, "Game session is not active");
      }

      if (session.status === "active") {
        runningState = calculateRunningState(session, now, heartbeatGraceSeconds);

        if (runningState.isExpired) {
          const expired = await expireSession(session, {
            atTime: runningState.freezeAt,
            remainingSeconds: 0,
          });

          session = expired.session;
          runningState = null;
        }
      }

      if (session.foundSneakerNumbers.includes(sneakerNumber)) {
        const rewardState = await getPlayerRewardState(playerId);

        return {
          accepted: false,
          session: serializeSession(
            session,
            now,
            heartbeatGraceSeconds,
            playerOnlineWindowSeconds,
            rewardState,
          ),
          lifecycle: session.status,
          reason: resolveCompletionReason(session),
        };
      }

      const nextFoundSneakerNumbers = sortUniqueSneakers([
        ...session.foundSneakerNumbers,
        sneakerNumber,
      ]);

      const updatedSession = await gameRepository.updateSession(session.id, {
        found_sneaker_numbers: nextFoundSneakerNumbers,
        ...(session.status === "active" ? { last_heartbeat_at: now } : {}),
      });

      if (session.status === "active" && hasCollectedAllSneakers(updatedSession.foundSneakerNumbers)) {
        const finishedResult = await finalizeSession(updatedSession, {
          playerId,
          now,
          remainingSeconds: runningState?.remainingSeconds ?? updatedSession.remainingSeconds,
          reason: "completed",
        });

        return {
          accepted: true,
          ...finishedResult,
        };
      }

      let rewardState = null;
      const completionReason = resolveCompletionReason(updatedSession);

      if (FINISHED_STATUSES.has(updatedSession.status)) {
        rewardState = await persistSessionOutcome(updatedSession, {
          reason: completionReason,
          remainingSeconds: 0,
        });
      } else if (hasCollectedAllSneakers(updatedSession.foundSneakerNumbers)) {
        await gameRepository.assignPromoCodeToPlayer(playerId);
      }

      return {
        accepted: true,
        session: serializeSession(
          updatedSession,
          now,
          heartbeatGraceSeconds,
          playerOnlineWindowSeconds,
          rewardState ?? await getPlayerRewardState(playerId),
        ),
        lifecycle: updatedSession.status,
        reason: completionReason,
      };
    },

    async finishSession(playerId) {
      const openSession = await getOpenSession(playerId);
      const now = new Date();

      if (!openSession) {
        throw new HttpError(409, "No active game session to finish");
      }

      if (FINISHED_STATUSES.has(openSession.status)) {
        return buildSessionResponse(
          openSession,
          now,
          openSession.status,
          resolveCompletionReason(openSession),
        );
      }

      return finalizeSession(openSession, {
        playerId,
        now,
        remainingSeconds: 0,
        reason: "time-ended",
      });
    },

    async logActivity(playerId, payload) {
      const { source, action, details } = activityLogSchema.parse(payload);
      const now = new Date();
      const openSession = await getOpenSession(playerId);

      let session = openSession;

      if (openSession?.status === "paused") {
        session = await gameRepository.updateSession(openSession.id, {
          status: "active",
          last_resumed_at: now,
          last_heartbeat_at: now,
        });
      } else if (openSession?.status === "active") {
        session = await gameRepository.updateSession(openSession.id, {
          last_heartbeat_at: now,
        });
      }

      const activityLog = await gameRepository.createActivityLog({
        playerId,
        gameSessionId: session?.id ?? null,
        source,
        action,
        details: details ?? {},
      });

      return {
        logged: true,
        activityLog,
        session: session
          ? serializeSession(
              session,
              now,
              heartbeatGraceSeconds,
              playerOnlineWindowSeconds,
              await getPlayerRewardState(playerId),
            )
          : null,
        lifecycle: session?.status ?? "idle",
      };
    },
  };
}
