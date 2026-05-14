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

function serializeSession(session, now, heartbeatGraceSeconds, playerOnlineWindowSeconds) {
  let remainingSeconds = session.remainingSeconds;
  const foundSneakerNumbers = normalizeCollectedSneakers(session.foundSneakerNumbers);

  if (session.status === "active" && session.lastResumedAt) {
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
    pauseCount: session.pauseCount,
    startedAt: session.startedAt,
    lastResumedAt: session.lastResumedAt,
    lastPausedAt: session.lastPausedAt,
    lastHeartbeatAt: session.lastHeartbeatAt,
    finishedAt: session.finishedAt,
    expiredAt: session.expiredAt,
    canCollect: session.status === "active" && remainingSeconds > 0,
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

export function createGameService({
  gameRepository,
  gameDurationSeconds,
  heartbeatGraceSeconds,
  playerOnlineWindowSeconds,
}) {
  async function settleOpenSession(session) {
    if (!session || session.status !== "active" || !session.lastResumedAt) {
      return session;
    }

    const now = new Date();
    const runningState = calculateRunningState(session, now, heartbeatGraceSeconds);

    if (runningState.isExpired) {
      return gameRepository.updateSession(session.id, {
        status: "expired",
        remaining_seconds: 0,
        last_paused_at: runningState.freezeAt,
        last_resumed_at: null,
        expired_at: runningState.freezeAt,
      });
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
    });

    await gameRepository.createGameResult({
      playerId,
      gameSessionId: finishedSession.id,
      foundSneakerNumbers: finishedSession.foundSneakerNumbers,
      completedInSeconds: gameDurationSeconds - remainingSeconds,
      remainingSeconds,
      eligibleForRaffle: hasCollectedAllSneakers(finishedSession.foundSneakerNumbers),
    });

    return {
      session: serializeSession(
        finishedSession,
        now,
        heartbeatGraceSeconds,
        playerOnlineWindowSeconds,
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
        return {
          session: serializeSession(
            openSession,
            now,
            heartbeatGraceSeconds,
            playerOnlineWindowSeconds,
          ),
          lifecycle: openSession.status,
          reason: null,
        };
      }

      const latestSession = await gameRepository.findLatestSessionByPlayerId(playerId);

      if (!latestSession) {
        return createLifecycleResponse("idle");
      }

      if (FINISHED_STATUSES.has(latestSession.status)) {
        return createLifecycleResponse(latestSession.status);
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

        return {
          session: serializeSession(
            touchedSession,
            now,
            heartbeatGraceSeconds,
            playerOnlineWindowSeconds,
          ),
          lifecycle: "active",
          reason: "existing-session",
        };
      }

      if (openSession?.status === "paused") {
        const resumedSession = await gameRepository.updateSession(openSession.id, {
          status: "active",
          last_resumed_at: now,
          last_heartbeat_at: now,
        });

        return {
          session: serializeSession(
            resumedSession,
            now,
            heartbeatGraceSeconds,
            playerOnlineWindowSeconds,
          ),
          lifecycle: "active",
          reason: "resumed-session",
        };
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

      return {
        session: serializeSession(
          createdSession,
          now,
          heartbeatGraceSeconds,
          playerOnlineWindowSeconds,
        ),
        lifecycle: "active",
        reason: "new-session",
      };
    },

    async collectSneaker(playerId, payload) {
      const { sneakerNumber } = sneakerCollectSchema.parse(payload);
      const openSession = await getOpenSession(playerId);
      const now = new Date();

      if (!openSession) {
        throw new HttpError(409, "No active game session. Start a game first.");
      }

      if (openSession.status !== "active") {
        throw new HttpError(409, "Game session is not active");
      }

      const runningState = calculateRunningState(openSession, now, heartbeatGraceSeconds);

      if (runningState.isExpired) {
        await gameRepository.updateSession(openSession.id, {
          status: "expired",
          remaining_seconds: 0,
          last_paused_at: now,
          last_resumed_at: null,
          expired_at: now,
        });

        throw new HttpError(409, "Time is over");
      }

      if (openSession.foundSneakerNumbers.includes(sneakerNumber)) {
        return {
          accepted: false,
          session: serializeSession(
            openSession,
            now,
            heartbeatGraceSeconds,
            playerOnlineWindowSeconds,
          ),
          lifecycle: "active",
        };
      }

      const updatedSession = await gameRepository.updateSession(openSession.id, {
        found_sneaker_numbers: sortUniqueSneakers([
          ...openSession.foundSneakerNumbers,
          sneakerNumber,
        ]),
        last_heartbeat_at: now,
      });

      if (hasCollectedAllSneakers(updatedSession.foundSneakerNumbers)) {
        const finishedResult = await finalizeSession(updatedSession, {
          playerId,
          now,
          remainingSeconds: runningState.remainingSeconds,
          reason: "completed",
        });

        return {
          accepted: true,
          ...finishedResult,
        };
      }

      return {
        accepted: true,
        session: serializeSession(
          updatedSession,
          now,
          heartbeatGraceSeconds,
          playerOnlineWindowSeconds,
        ),
        lifecycle: "active",
      };
    },

    async finishSession(playerId) {
      const openSession = await getOpenSession(playerId);
      const now = new Date();

      if (!openSession) {
        throw new HttpError(409, "No active game session to finish");
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

      if (openSession) {
        session = await gameRepository.updateSession(openSession.id, openSession.status === "paused"
          ? {
              status: "active",
              last_resumed_at: now,
              last_heartbeat_at: now,
            }
          : {
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
          ? serializeSession(session, now, heartbeatGraceSeconds, playerOnlineWindowSeconds)
          : null,
        lifecycle: session?.status ?? "idle",
      };
    },
  };
}
