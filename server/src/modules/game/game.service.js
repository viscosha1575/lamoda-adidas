import { addSeconds, diffWholeSeconds } from "../../lib/dates.js";
import { HttpError } from "../../lib/http-error.js";
import {
  activityLogSchema,
  sneakerCollectSchema,
  startSessionSchema,
} from "./game.schema.js";

const DEFAULT_OPEN_SNEAKER = 1;
const TOTAL_SNEAKER_COUNT = 10;
const PLAYER_GAME_COMPLETION_STATE = {
  COMPLETED: "completed",
  TIME_ENDED: "time-ended",
  COMPLETED_AFTER_TIME: "completed-after-time",
};

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

function isSessionComplete(session) {
  return hasCollectedAllSneakers(session?.foundSneakerNumbers);
}

function resolveCompletionReason(session) {
  if (session?.completionReason) {
    return session.completionReason;
  }

  if (session?.status === "finished") {
    if (hasCollectedAllSneakers(session.foundSneakerNumbers)) {
      return Number(session.remainingSeconds ?? 0) > 0
        ? PLAYER_GAME_COMPLETION_STATE.COMPLETED
        : PLAYER_GAME_COMPLETION_STATE.COMPLETED_AFTER_TIME;
    }

    return PLAYER_GAME_COMPLETION_STATE.TIME_ENDED;
  }

  return null;
}

function buildPlayerOutcomeState(reason) {
  if (reason === PLAYER_GAME_COMPLETION_STATE.COMPLETED_AFTER_TIME) {
    return {
      gameCompletionState: PLAYER_GAME_COMPLETION_STATE.COMPLETED_AFTER_TIME,
    };
  }

  if (reason === PLAYER_GAME_COMPLETION_STATE.COMPLETED) {
    return {
      gameCompletionState: PLAYER_GAME_COMPLETION_STATE.COMPLETED,
    };
  }

  return {
    gameCompletionState: PLAYER_GAME_COMPLETION_STATE.TIME_ENDED,
  };
}

function canSessionCollect(session) {
  const foundSneakerNumbers = normalizeCollectedSneakers(session.foundSneakerNumbers);

  if (hasCollectedAllSneakers(foundSneakerNumbers)) {
    return false;
  }

  if (session.status === "active") {
    return true;
  }

  return session.status === "finished";
}

function isSessionEligibleForRaffle(session, remainingSeconds) {
  const completionReason = resolveCompletionReason(session);

  if (session.status === "finished") {
    return completionReason === PLAYER_GAME_COMPLETION_STATE.COMPLETED;
  }

  return session.status === "active" && remainingSeconds > 0;
}

function resolveTimerCountedUntil(session, now, heartbeatGraceSeconds) {
  const lastResumedAt = new Date(session.lastResumedAt);
  const lastHeartbeatAt = session.lastHeartbeatAt
    ? new Date(session.lastHeartbeatAt)
    : lastResumedAt;
  const frozenAt = addSeconds(lastHeartbeatAt, heartbeatGraceSeconds);
  const countedUntil = frozenAt.getTime() < now.getTime() ? frozenAt : now;

  if (countedUntil.getTime() < lastResumedAt.getTime()) {
    return lastResumedAt;
  }

  return countedUntil;
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

  if (session.status === "finished") {
    remainingSeconds = 0;
  } else if (session.status === "active" && session.lastResumedAt) {
    remainingSeconds = calculateRunningState(session, now, heartbeatGraceSeconds).remainingSeconds;
  }

  return {
    id: session.id,
    status: session.status,
    remainingSeconds,
    foundSneakers: buildFoundSneakers(foundSneakerNumbers),
    promoCode: rewardState?.promoCode ?? null,
    startedAt: session.startedAt,
    lastResumedAt: session.lastResumedAt,
    lastHeartbeatAt: session.lastHeartbeatAt,
    finishedAt: session.finishedAt,
    completionReason: resolveCompletionReason(session),
    eligibleForRaffle: isSessionEligibleForRaffle(session, remainingSeconds),
    canCollect: canSessionCollect(session),
    isOnline: Boolean(
      session.lastHeartbeatAt
      && now.getTime() - new Date(session.lastHeartbeatAt).getTime()
        <= playerOnlineWindowSeconds * 1000
    ),
  };
}

function calculateRunningState(session, now, heartbeatGraceSeconds) {
  const lastResumedAt = new Date(session.lastResumedAt);
  const countedUntil = resolveTimerCountedUntil(session, now, heartbeatGraceSeconds);
  const expiryAt = addSeconds(lastResumedAt, session.remainingSeconds);
  const elapsedSeconds = diffWholeSeconds(countedUntil, lastResumedAt);
  const remainingSeconds = Math.max(0, session.remainingSeconds - elapsedSeconds);

  return {
    remainingSeconds,
    expiryAt,
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
  telegramSubscriptionChecker = null,
}) {
  async function getPlayerRewardState(playerId) {
    const rewardState = await gameRepository.findPlayerRewardStateById(playerId);

    return rewardState ?? {
      gameCompletionState: null,
      promoCode: null,
    };
  }

  async function persistSessionOutcome(session, {
    reason,
    remainingSeconds,
  }) {
    await gameRepository.markPlayerOutcome(
      session.playerId,
      buildPlayerOutcomeState(reason),
    );

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

  function buildTimerResumeValues(session, now, runningState) {
    const valuesToUpdate = {
      last_heartbeat_at: now,
    };

    if (session.status === "active" && session.lastResumedAt && runningState.remainingSeconds > 0) {
      valuesToUpdate.remaining_seconds = runningState.remainingSeconds;
      valuesToUpdate.last_resumed_at = now;
    }

    return valuesToUpdate;
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

  async function checkSubscription(player) {
    if (!player?.telegramUserId) {
      throw new HttpError(400, "Telegram user is required for subscription check");
    }

    const subscribedToChannel = Boolean(player?.subscribedToChannel);

    if (!telegramSubscriptionChecker?.isConfigured) {
      return {
        available: false,
        subscribed: false,
        memberStatus: null,
        channelUrl: telegramSubscriptionChecker?.channelUrl ?? null,
        subscribedToChannel,
      };
    }

    const result = await telegramSubscriptionChecker.checkSubscription(player.telegramUserId);
    const persistedSubscribedToChannel = result.subscribed
      ? await gameRepository.markPlayerSubscribedToChannel(player.id)
      : subscribedToChannel;

    return {
      available: true,
      subscribed: result.subscribed,
      memberStatus: result.memberStatus,
      channelUrl: result.channelUrl ?? null,
      subscribedToChannel: persistedSubscribedToChannel,
    };
  }

  async function markSessionTimedOut(session, atTime) {
    if (session.status !== "active" || isSessionComplete(session)) {
      return session;
    }

    const timedOutSession = await gameRepository.updateSession(session.id, {
      remaining_seconds: 0,
      completion_reason: PLAYER_GAME_COMPLETION_STATE.TIME_ENDED,
      last_heartbeat_at: session.lastHeartbeatAt ?? atTime,
    });

    await persistSessionOutcome(timedOutSession, {
      reason: PLAYER_GAME_COMPLETION_STATE.TIME_ENDED,
      remainingSeconds: 0,
    });

    return timedOutSession;
  }

  async function forceSessionTimedOut(session, atTime) {
    if (session.status !== "active" || isSessionComplete(session)) {
      return session;
    }

    const timedOutSession = await gameRepository.updateSession(session.id, {
      remaining_seconds: 0,
      completion_reason: PLAYER_GAME_COMPLETION_STATE.TIME_ENDED,
      last_heartbeat_at: atTime,
    });

    await persistSessionOutcome(timedOutSession, {
      reason: PLAYER_GAME_COMPLETION_STATE.TIME_ENDED,
      remainingSeconds: 0,
    });

    return timedOutSession;
  }

  async function settleOpenSession(session) {
    if (!session || session.status !== "active" || !session.lastResumedAt) {
      return session;
    }

    const now = new Date();
    const runningState = calculateRunningState(session, now, heartbeatGraceSeconds);

    if (
      runningState.isExpired
      && !isSessionComplete(session)
      && resolveCompletionReason(session) !== PLAYER_GAME_COMPLETION_STATE.TIME_ENDED
    ) {
      return markSessionTimedOut(session, runningState.expiryAt);
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
    checkSubscription,
    async startSession(playerId, payload = {}) {
      const now = new Date();
      const openSession = await getOpenSession(playerId);
      startSessionSchema.parse(payload);

      if (openSession?.status === "active") {
        const runningState = openSession.lastResumedAt
          ? calculateRunningState(openSession, now, heartbeatGraceSeconds)
          : {
              remainingSeconds: Number(openSession.remainingSeconds ?? 0),
              isExpired: Number(openSession.remainingSeconds ?? 0) <= 0,
            };

        if (
          runningState.isExpired
          && !isSessionComplete(openSession)
        ) {
          const timedOutSession = await markSessionTimedOut(
            openSession,
            runningState.expiryAt ?? now,
          );

          return buildSessionResponse(
            timedOutSession,
            now,
            "active",
            resolveCompletionReason(timedOutSession),
          );
        }

        const valuesToUpdate = buildTimerResumeValues(openSession, now, runningState);
        const touchedSession = await gameRepository.updateSession(openSession.id, valuesToUpdate);

        return buildSessionResponse(
          touchedSession,
          now,
          "active",
          "existing-session",
        );
      }

      const latestSession = await gameRepository.findLatestSessionByPlayerId(playerId);

      if (latestSession?.status === "finished") {
        return buildSessionResponse(
          latestSession,
          now,
          "finished",
          resolveCompletionReason(latestSession),
        );
      }

      const createdSession = await gameRepository.createSession({
        playerId,
        status: "active",
        remainingSeconds: gameDurationSeconds,
        foundSneakerNumbers: [DEFAULT_OPEN_SNEAKER],
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

    async restartSessionForReferral(playerId) {
      const session = await gameRepository.findLatestSessionByPlayerId(playerId);

      if (!session) {
        return null;
      }

      const now = new Date();
      await gameRepository.deleteGameResultBySessionId(session.id);
      await gameRepository.markPlayerOutcome(playerId, {
        gameCompletionState: null,
      });

      const restartedSession = await gameRepository.updateSession(session.id, {
        status: "active",
        remaining_seconds: gameDurationSeconds,
        found_sneaker_numbers: [DEFAULT_OPEN_SNEAKER],
        last_resumed_at: now,
        last_heartbeat_at: now,
        finished_at: null,
        completion_reason: null,
      });

      return buildSessionResponse(
        restartedSession,
        now,
        "active",
        "referral-reset",
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

      if (session.status === "active") {
        runningState = calculateRunningState(session, now, heartbeatGraceSeconds);

        if (
          runningState.isExpired
          && !isSessionComplete(session)
          && resolveCompletionReason(session) !== PLAYER_GAME_COMPLETION_STATE.TIME_ENDED
        ) {
          session = await markSessionTimedOut(session, runningState.expiryAt);
          runningState = {
            ...runningState,
            remainingSeconds: 0,
          };
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
      const shouldPromoteFinishedTimeoutToAfterTime = session.status === "finished"
        && hasCollectedAllSneakers(nextFoundSneakerNumbers);

      const updatedSession = await gameRepository.updateSession(session.id, {
        found_sneaker_numbers: nextFoundSneakerNumbers,
        ...(session.status === "active"
          ? buildTimerResumeValues(session, now, runningState ?? {
            remainingSeconds: Number(session.remainingSeconds ?? 0),
          })
          : {}),
        ...(shouldPromoteFinishedTimeoutToAfterTime
          ? { completion_reason: PLAYER_GAME_COMPLETION_STATE.COMPLETED_AFTER_TIME }
          : {}),
      });

      await gameRepository.createActivityLog({
        playerId,
        gameSessionId: updatedSession.id,
        source: "server",
        action: "found-sneaker",
        details: {
          sneakerNumber,
          foundSneakerNumbers: updatedSession.foundSneakerNumbers,
          sessionStatus: updatedSession.status,
        },
      });

      if (
        session.status === "active"
        && hasCollectedAllSneakers(updatedSession.foundSneakerNumbers)
      ) {
        const completionReason = Number(runningState?.remainingSeconds ?? updatedSession.remainingSeconds) <= 0
          ? PLAYER_GAME_COMPLETION_STATE.COMPLETED_AFTER_TIME
          : PLAYER_GAME_COMPLETION_STATE.COMPLETED;
        const finishedResult = await finalizeSession(updatedSession, {
          playerId,
          now,
          remainingSeconds: runningState?.remainingSeconds ?? updatedSession.remainingSeconds,
          reason: completionReason,
        });

        return {
          accepted: true,
          ...finishedResult,
        };
      }

      let rewardState = null;
      const completionReason = shouldPromoteFinishedTimeoutToAfterTime
        ? PLAYER_GAME_COMPLETION_STATE.COMPLETED_AFTER_TIME
        : resolveCompletionReason(updatedSession);

      if (updatedSession.status === "finished") {
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
        const latestSession = await gameRepository.findLatestSessionByPlayerId(playerId);

        if (latestSession && latestSession.status === "finished") {
          return buildSessionResponse(
            latestSession,
            now,
            latestSession.status,
            resolveCompletionReason(latestSession),
          );
        }

        throw new HttpError(409, "No active game session to finish");
      }

      if (openSession.status === "finished") {
        return buildSessionResponse(
          openSession,
          now,
          openSession.status,
          resolveCompletionReason(openSession),
        );
      }

      if (!isSessionComplete(openSession)) {
        const currentSession = openSession.status === "active"
          ? await forceSessionTimedOut(openSession, now)
          : openSession;

        return buildSessionResponse(
          currentSession,
          now,
          currentSession.status,
          resolveCompletionReason(currentSession),
        );
      }

      return finalizeSession(openSession, {
        playerId,
        now,
        remainingSeconds: openSession.remainingSeconds,
        reason: Number(openSession.remainingSeconds ?? 0) > 0
          ? PLAYER_GAME_COMPLETION_STATE.COMPLETED
          : PLAYER_GAME_COMPLETION_STATE.COMPLETED_AFTER_TIME,
      });
    },

    async logActivity(playerId, payload) {
      const { source, action, details } = activityLogSchema.parse(payload);
      const now = new Date();
      const openSession = await getOpenSession(playerId);

      let session = openSession;

      if (openSession?.status === "active") {
        const runningState = openSession.lastResumedAt
          ? calculateRunningState(openSession, now, heartbeatGraceSeconds)
          : {
              remainingSeconds: Number(openSession.remainingSeconds ?? 0),
            };

        session = await gameRepository.updateSession(
          openSession.id,
          buildTimerResumeValues(openSession, now, runningState),
        );
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
