import test from "node:test";
import assert from "node:assert/strict";

import { createGameService } from "./game.service.js";

function createGameServiceForTest(gameRepository) {
  return createGameService({
    gameRepository,
    gameDurationSeconds: 300,
    heartbeatGraceSeconds: 15,
    playerOnlineWindowSeconds: 15,
  });
}

function createGameServiceWithSubscriptionChecker(gameRepository, telegramSubscriptionChecker) {
  return createGameService({
    gameRepository,
    gameDurationSeconds: 300,
    heartbeatGraceSeconds: 15,
    playerOnlineWindowSeconds: 15,
    telegramSubscriptionChecker,
  });
}

function withRewardRepository(overrides = {}) {
  let assignedPromoCode = null;
  let subscribedToChannel = false;

  return {
    get assignedPromoCode() {
      return assignedPromoCode;
    },
    get subscribedToChannel() {
      return subscribedToChannel;
    },
    repository: {
      async findPlayerRewardStateById() {
        return {
          gameCompletionState: null,
          promoCode: assignedPromoCode,
        };
      },
      async markPlayerOutcome() {},
      async assignPromoCodeToPlayer() {
        return assignedPromoCode;
      },
      async upsertGameResult() {
        return { id: 1 };
      },
      async findLatestSessionByPlayerId() {
        return null;
      },
      async deleteGameResultBySessionId() {},
      async markPlayerSubscribedToChannel() {
        subscribedToChannel = true;
        return subscribedToChannel;
      },
      setAssignedPromoCode(value) {
        assignedPromoCode = value;
      },
      ...overrides,
    },
  };
}

test("startSession always starts with sneaker 1 opened by default", async () => {
  const rewardAwareRepository = withRewardRepository({
    async findLatestOpenSessionByPlayerId() {
      return null;
    },
    async createSession(session) {
      assert.deepEqual(session.foundSneakerNumbers, [1]);

      return {
        id: 15,
        playerId: session.playerId,
        status: session.status,
        remainingSeconds: session.remainingSeconds,
        foundSneakerNumbers: session.foundSneakerNumbers,
        startedAt: session.startedAt,
        lastResumedAt: session.lastResumedAt,
        lastHeartbeatAt: session.lastHeartbeatAt,
        finishedAt: null,
        completionReason: null,
      };
    },
  });

  const gameService = createGameServiceForTest(rewardAwareRepository.repository);
  const result = await gameService.startSession(3, {
    foundSneakerNumbers: [4, 7, 7],
  });

  assert.equal(result.lifecycle, "active");
  assert.equal(result.reason, "new-session");
  assert.deepEqual(result.session.foundSneakers, [
    { sneakerNumber: 1, found: true },
    { sneakerNumber: 2, found: false },
    { sneakerNumber: 3, found: false },
    { sneakerNumber: 4, found: false },
    { sneakerNumber: 5, found: false },
    { sneakerNumber: 6, found: false },
    { sneakerNumber: 7, found: false },
    { sneakerNumber: 8, found: false },
    { sneakerNumber: 9, found: false },
    { sneakerNumber: 10, found: false },
  ]);
  assert.equal(result.session.remainingSeconds, 300);
  assert.equal(result.session.promoCode, null);
});

test("startSession resumes existing active session and restarts timer from current remaining time", async () => {
  const now = Date.now();
  const openSession = {
    id: 16,
    playerId: 3,
    status: "active",
    remainingSeconds: 300,
    foundSneakerNumbers: [1, 2, 3],
    startedAt: new Date(now - 120_000),
    lastResumedAt: new Date(now - 12_000),
    lastHeartbeatAt: new Date(now - 2_000),
    finishedAt: null,
    completionReason: null,
  };

  const rewardAwareRepository = withRewardRepository({
    async findLatestOpenSessionByPlayerId() {
      return openSession;
    },
    async updateSession(_sessionId, valuesToUpdate) {
      assert.equal(valuesToUpdate.last_heartbeat_at instanceof Date, true);
      assert.equal(valuesToUpdate.last_resumed_at instanceof Date, true);
      assert.equal(valuesToUpdate.remaining_seconds <= 300, true);
      assert.equal(valuesToUpdate.remaining_seconds >= 287, true);

      return {
        ...openSession,
        remainingSeconds: valuesToUpdate.remaining_seconds,
        lastResumedAt: valuesToUpdate.last_resumed_at,
        lastHeartbeatAt: valuesToUpdate.last_heartbeat_at,
      };
    },
  });

  const gameService = createGameServiceForTest(rewardAwareRepository.repository);
  const result = await gameService.startSession(3);

  assert.equal(result.lifecycle, "active");
  assert.equal(result.reason, "existing-session");
  assert.equal(result.session.status, "active");
  assert.equal(result.session.remainingSeconds <= 300, true);
  assert.equal(result.session.remainingSeconds >= 287, true);
});

test("checkSubscription returns Telegram membership status for current player", async () => {
  const rewardAwareRepository = withRewardRepository();
  const gameService = createGameServiceWithSubscriptionChecker(
    rewardAwareRepository.repository,
    {
      isConfigured: true,
      channelUrl: "https://t.me/lamoda_channel",
      async checkSubscription(telegramUserId) {
        assert.equal(telegramUserId, 123456789);
        return {
          subscribed: true,
          memberStatus: "member",
          channelUrl: "https://t.me/lamoda_channel",
        };
      },
    },
  );

  const result = await gameService.checkSubscription({
    id: 5,
    telegramUserId: 123456789,
    subscribedToChannel: false,
  });

  assert.deepEqual(result, {
    available: true,
    subscribed: true,
    memberStatus: "member",
    channelUrl: "https://t.me/lamoda_channel",
    subscribedToChannel: true,
  });
  assert.equal(rewardAwareRepository.subscribedToChannel, true);
});

test("checkSubscription reports unavailable when Telegram checker is not configured", async () => {
  const gameService = createGameServiceWithSubscriptionChecker(
    withRewardRepository().repository,
    {
      isConfigured: false,
      channelUrl: "https://t.me/lamoda_channel",
    },
  );

  const result = await gameService.checkSubscription({
    id: 5,
    telegramUserId: 123456789,
    subscribedToChannel: false,
  });

  assert.deepEqual(result, {
    available: false,
    subscribed: false,
    memberStatus: null,
    channelUrl: "https://t.me/lamoda_channel",
    subscribedToChannel: false,
  });
});

test("checkSubscription keeps saved subscription flag when Telegram now reports unsubscribed", async () => {
  const rewardAwareRepository = withRewardRepository({
    async markPlayerSubscribedToChannel() {
      throw new Error("should not update subscription flag");
    },
  });
  const gameService = createGameServiceWithSubscriptionChecker(
    rewardAwareRepository.repository,
    {
      isConfigured: true,
      channelUrl: "https://t.me/lamoda_channel",
      async checkSubscription() {
        return {
          subscribed: false,
          memberStatus: "left",
          channelUrl: "https://t.me/lamoda_channel",
        };
      },
    },
  );

  const result = await gameService.checkSubscription({
    id: 5,
    telegramUserId: 123456789,
    subscribedToChannel: true,
  });

  assert.deepEqual(result, {
    available: true,
    subscribed: false,
    memberStatus: "left",
    channelUrl: "https://t.me/lamoda_channel",
    subscribedToChannel: true,
  });
});

test("logActivity stores source and action and refreshes online activity", async () => {
  const now = Date.now();
  const session = {
    id: 25,
    playerId: 5,
    status: "active",
    remainingSeconds: 300,
    foundSneakerNumbers: [1, 2],
    startedAt: new Date(now - 120_000),
    lastResumedAt: new Date(now - 60_000),
    lastHeartbeatAt: new Date(now - 30_000),
    finishedAt: null,
    completionReason: null,
  };

  const rewardAwareRepository = withRewardRepository({
    async findLatestOpenSessionByPlayerId() {
      return session;
    },
    async updateSession(_sessionId, valuesToUpdate) {
      assert.equal(valuesToUpdate.remaining_seconds, 255);
      assert.ok(valuesToUpdate.last_resumed_at instanceof Date);
      assert.ok(valuesToUpdate.last_heartbeat_at instanceof Date);

      return {
        ...session,
        remainingSeconds: valuesToUpdate.remaining_seconds,
        lastResumedAt: valuesToUpdate.last_resumed_at,
        lastHeartbeatAt: valuesToUpdate.last_heartbeat_at,
      };
    },
    async createActivityLog(activityLog) {
      assert.equal(activityLog.playerId, 5);
      assert.equal(activityLog.gameSessionId, 25);
      assert.equal(activityLog.source, "unity");
      assert.equal(activityLog.action, "swipe");
      assert.deepEqual(activityLog.details, { direction: "left" });

      return {
        id: 99,
        ...activityLog,
        createdAt: new Date(),
      };
    },
  });

  const gameService = createGameServiceForTest(rewardAwareRepository.repository);
  const result = await gameService.logActivity(5, {
    source: "unity",
    action: "swipe",
    details: { direction: "left" },
  });

  assert.equal(result.logged, true);
  assert.equal(result.lifecycle, "active");
  assert.equal(result.activityLog.source, "unity");
  assert.equal(result.activityLog.action, "swipe");
  assert.equal(result.session.remainingSeconds, 255);
  assert.equal(result.session.isOnline, true);
});

test("restartSessionForReferral resets timer and found sneakers", async () => {
  const session = {
    id: 35,
    playerId: 5,
    status: "active",
    remainingSeconds: 121,
    foundSneakerNumbers: [1, 2, 3],
    startedAt: new Date("2026-05-12T10:00:00.000Z"),
    lastResumedAt: new Date("2026-05-12T10:03:00.000Z"),
    lastHeartbeatAt: new Date("2026-05-12T10:03:02.000Z"),
    finishedAt: null,
    completionReason: null,
  };

  const rewardAwareRepository = withRewardRepository({
    async findLatestSessionByPlayerId(playerId) {
      assert.equal(playerId, 5);
      return session;
    },
    async deleteGameResultBySessionId(gameSessionId) {
      assert.equal(gameSessionId, 35);
    },
    async updateSession(_sessionId, valuesToUpdate) {
      assert.equal(valuesToUpdate.status, "active");
      assert.equal(valuesToUpdate.remaining_seconds, 300);
      assert.deepEqual(valuesToUpdate.found_sneaker_numbers, [1]);
      assert.ok(valuesToUpdate.last_resumed_at instanceof Date);
      assert.ok(valuesToUpdate.last_heartbeat_at instanceof Date);
      assert.equal(valuesToUpdate.finished_at, null);
      assert.equal(valuesToUpdate.completion_reason, null);

      return {
        ...session,
        status: "active",
        remainingSeconds: valuesToUpdate.remaining_seconds,
        foundSneakerNumbers: valuesToUpdate.found_sneaker_numbers,
        lastResumedAt: valuesToUpdate.last_resumed_at,
        lastHeartbeatAt: valuesToUpdate.last_heartbeat_at,
        finishedAt: valuesToUpdate.finished_at,
        completionReason: valuesToUpdate.completion_reason,
      };
    },
    async markPlayerOutcome(playerId, payload) {
      assert.equal(playerId, 5);
      assert.deepEqual(payload, {
        gameCompletionState: null,
      });
    },
  });

  const gameService = createGameServiceForTest(rewardAwareRepository.repository);
  const result = await gameService.restartSessionForReferral(5);

  assert.equal(result.lifecycle, "active");
  assert.equal(result.reason, "referral-reset");
  assert.equal(result.session.status, "active");
  assert.equal(result.session.remainingSeconds, 300);
  assert.equal(result.session.canCollect, true);
});

test("restartSessionForReferral resets completed session for replay", async () => {
  const session = {
    id: 44,
    playerId: 11,
    status: "finished",
    remainingSeconds: 0,
    foundSneakerNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    startedAt: new Date("2026-05-12T10:00:00.000Z"),
    lastResumedAt: new Date("2026-05-12T10:03:00.000Z"),
    lastHeartbeatAt: new Date("2026-05-12T10:03:02.000Z"),
    finishedAt: new Date("2026-05-12T10:05:00.000Z"),
    completionReason: "completed",
  };

  let deletedGameResultId = null;
  let markedOutcomePlayerId = null;
  const rewardAwareRepository = withRewardRepository({
    async findLatestSessionByPlayerId(playerId) {
      assert.equal(playerId, 11);
      return session;
    },
    async deleteGameResultBySessionId(gameSessionId) {
      deletedGameResultId = gameSessionId;
    },
    async updateSession(_sessionId, valuesToUpdate) {
      assert.equal(valuesToUpdate.status, "active");
      assert.equal(valuesToUpdate.remaining_seconds, 300);
      assert.deepEqual(valuesToUpdate.found_sneaker_numbers, [1]);
      assert.equal(valuesToUpdate.finished_at, null);
      assert.equal(valuesToUpdate.completion_reason, null);

      return {
        ...session,
        status: "active",
        remainingSeconds: valuesToUpdate.remaining_seconds,
        foundSneakerNumbers: valuesToUpdate.found_sneaker_numbers,
        lastResumedAt: valuesToUpdate.last_resumed_at,
        lastHeartbeatAt: valuesToUpdate.last_heartbeat_at,
        finishedAt: null,
        completionReason: null,
      };
    },
    async markPlayerOutcome(playerId, payload) {
      markedOutcomePlayerId = playerId;
      assert.deepEqual(payload, {
        gameCompletionState: null,
      });
    },
  });

  const gameService = createGameServiceForTest(rewardAwareRepository.repository);
  const result = await gameService.restartSessionForReferral(11);

  assert.equal(deletedGameResultId, 44);
  assert.equal(markedOutcomePlayerId, 11);
  assert.equal(result.lifecycle, "active");
  assert.equal(result.reason, "referral-reset");
  assert.equal(result.session.remainingSeconds, 300);
});

test("collectSneaker finishes timed-out active session and assigns promo code on tenth sneaker", async () => {
  const timedOutSession = {
    id: 42,
    playerId: 8,
    status: "active",
    remainingSeconds: 0,
    foundSneakerNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    startedAt: new Date("2026-05-12T10:00:00.000Z"),
    lastResumedAt: null,
    lastHeartbeatAt: new Date("2026-05-12T10:03:00.000Z"),
    finishedAt: null,
    completionReason: "time-ended",
  };

  let updateCallCount = 0;
  let markedOutcome = null;
  const rewardAwareRepository = withRewardRepository({
    async findLatestOpenSessionByPlayerId() {
      return timedOutSession;
    },
    async updateSession(_sessionId, valuesToUpdate) {
      updateCallCount += 1;

      if (updateCallCount === 1) {
        assert.deepEqual(valuesToUpdate, {
          found_sneaker_numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
          last_heartbeat_at: valuesToUpdate.last_heartbeat_at,
        });
        assert.ok(valuesToUpdate.last_heartbeat_at instanceof Date);

        return {
          ...timedOutSession,
          foundSneakerNumbers: valuesToUpdate.found_sneaker_numbers,
          lastHeartbeatAt: valuesToUpdate.last_heartbeat_at,
        };
      }

      assert.equal(valuesToUpdate.status, "finished");
      assert.equal(valuesToUpdate.completion_reason, "completed-after-time");
      assert.equal(valuesToUpdate.remaining_seconds, 0);

      return {
        ...timedOutSession,
        status: "finished",
        remainingSeconds: valuesToUpdate.remaining_seconds,
        foundSneakerNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        lastResumedAt: null,
        lastHeartbeatAt: timedOutSession.lastHeartbeatAt,
        finishedAt: valuesToUpdate.finished_at,
        completionReason: "completed-after-time",
      };
    },
    async markPlayerOutcome(playerId, payload) {
      assert.equal(playerId, 8);
      markedOutcome = payload;
    },
    async upsertGameResult(resultPayload) {
      assert.equal(resultPayload.playerId, 8);
      assert.equal(resultPayload.gameSessionId, 42);
      assert.deepEqual(resultPayload.foundSneakerNumbers, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      assert.equal(resultPayload.remainingSeconds, 0);
      assert.equal(resultPayload.eligibleForRaffle, false);
      assert.equal(resultPayload.completionReason, "completed-after-time");

      return { id: 202 };
    },
    async assignPromoCodeToPlayer(playerId) {
      assert.equal(playerId, 8);
      rewardAwareRepository.repository.setAssignedPromoCode("AFTER-TIME-PROMO");
      return "AFTER-TIME-PROMO";
    },
    async createActivityLog(activityLog) {
      assert.equal(activityLog.gameSessionId, 42);
      assert.equal(activityLog.details.sessionStatus, "active");
      return {
        id: 302,
        ...activityLog,
        createdAt: new Date(),
      };
    },
    async findPlayerRewardStateById() {
      return {
        gameCompletionState: "completed-after-time",
        promoCode: rewardAwareRepository.assignedPromoCode,
      };
    },
  });

  const gameService = createGameServiceForTest(rewardAwareRepository.repository);
  const result = await gameService.collectSneaker(8, { sneakerNumber: 10 });

  assert.deepEqual(markedOutcome, {
    gameCompletionState: "completed-after-time",
  });
  assert.equal(result.accepted, true);
  assert.equal(result.lifecycle, "finished");
  assert.equal(result.reason, "completed-after-time");
  assert.equal(result.session.status, "finished");
  assert.equal(result.session.remainingSeconds, 0);
  assert.equal(result.session.promoCode, "AFTER-TIME-PROMO");
  assert.equal(result.session.canCollect, false);
});

test("collectSneaker auto-finishes session when the tenth sneaker is found", async () => {
  const now = new Date();
  const openSession = {
    id: 41,
    playerId: 7,
    status: "active",
    remainingSeconds: 540,
    foundSneakerNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    startedAt: new Date(now.getTime() - 60_000),
    lastResumedAt: new Date(now.getTime() - 5_000),
    lastHeartbeatAt: new Date(now.getTime() - 1_000),
    finishedAt: null,
    completionReason: null,
  };

  let updateCallCount = 0;
  let markedOutcome = null;
  let createdActivityLog = null;
  const rewardAwareRepository = withRewardRepository({
    async findLatestOpenSessionByPlayerId() {
      return openSession;
    },
    async updateSession(_sessionId, valuesToUpdate) {
      updateCallCount += 1;

      if (updateCallCount === 1) {
        assert.deepEqual(valuesToUpdate.found_sneaker_numbers, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

        return {
          ...openSession,
          foundSneakerNumbers: valuesToUpdate.found_sneaker_numbers,
          lastHeartbeatAt: valuesToUpdate.last_heartbeat_at,
        };
      }

      assert.equal(valuesToUpdate.status, "finished");
      assert.equal(valuesToUpdate.completion_reason, "completed");
      assert.equal(valuesToUpdate.remaining_seconds >= 0, true);

      return {
        ...openSession,
        status: "finished",
        remainingSeconds: valuesToUpdate.remaining_seconds,
        foundSneakerNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        lastResumedAt: null,
        lastHeartbeatAt: openSession.lastHeartbeatAt,
        finishedAt: valuesToUpdate.finished_at,
        completionReason: "completed",
      };
    },
    async markPlayerOutcome(playerId, payload) {
      assert.equal(playerId, 7);
      markedOutcome = payload;
    },
    async upsertGameResult(resultPayload) {
      assert.equal(resultPayload.playerId, 7);
      assert.equal(resultPayload.gameSessionId, 41);
      assert.deepEqual(resultPayload.foundSneakerNumbers, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      assert.equal(resultPayload.eligibleForRaffle, true);
      assert.equal(resultPayload.completionReason, "completed");

      return { id: 201 };
    },
    async assignPromoCodeToPlayer(playerId) {
      assert.equal(playerId, 7);
      rewardAwareRepository.repository.setAssignedPromoCode("PROMO-10");
      return "PROMO-10";
    },
    async createActivityLog(activityLog) {
      createdActivityLog = activityLog;
      return {
        id: 301,
        ...activityLog,
        createdAt: new Date(),
      };
    },
    async findPlayerRewardStateById() {
      return {
        gameCompletionState: "completed",
        promoCode: rewardAwareRepository.assignedPromoCode,
      };
    },
  });

  const gameService = createGameServiceForTest(rewardAwareRepository.repository);
  const result = await gameService.collectSneaker(7, { sneakerNumber: 10 });

  assert.deepEqual(markedOutcome, {
    gameCompletionState: "completed",
  });
  assert.equal(result.accepted, true);
  assert.equal(result.lifecycle, "finished");
  assert.equal(result.reason, "completed");
  assert.equal(result.session.status, "finished");
  assert.equal(result.session.remainingSeconds >= 0, true);
  assert.equal(result.session.promoCode, "PROMO-10");
  assert.equal(result.session.canCollect, false);
  assert.deepEqual(createdActivityLog, {
    playerId: 7,
    gameSessionId: 41,
    source: "server",
    action: "found-sneaker",
    details: {
      sneakerNumber: 10,
      foundSneakerNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      sessionStatus: "active",
    },
  });
});

test("finishSession marks incomplete session as time-ended and keeps it active", async () => {
  const openSession = {
    id: 52,
    playerId: 9,
    status: "active",
    remainingSeconds: 553,
    foundSneakerNumbers: [1, 4],
    startedAt: new Date("2026-05-12T10:00:00.000Z"),
    lastResumedAt: null,
    lastHeartbeatAt: new Date("2026-05-14T09:36:34.267Z"),
    finishedAt: null,
    completionReason: null,
  };

  let markedOutcome = null;
  const rewardAwareRepository = withRewardRepository({
    async findLatestOpenSessionByPlayerId() {
      return openSession;
    },
    async updateSession(_sessionId, valuesToUpdate) {
      assert.equal(valuesToUpdate.remaining_seconds, 0);
      assert.equal(valuesToUpdate.completion_reason, "time-ended");
      assert.ok(valuesToUpdate.last_heartbeat_at instanceof Date);

      return {
        ...openSession,
        remainingSeconds: 0,
        lastHeartbeatAt: valuesToUpdate.last_heartbeat_at,
        completionReason: "time-ended",
      };
    },
    async markPlayerOutcome(playerId, payload) {
      assert.equal(playerId, 9);
      markedOutcome = payload;
    },
    async upsertGameResult(resultPayload) {
      assert.equal(resultPayload.playerId, 9);
      assert.equal(resultPayload.gameSessionId, 52);
      assert.equal(resultPayload.remainingSeconds, 0);
      assert.equal(resultPayload.completionReason, "time-ended");
      assert.equal(resultPayload.eligibleForRaffle, false);
      return { id: 202 };
    },
    async findPlayerRewardStateById() {
      return {
        gameCompletionState: "time-ended",
        promoCode: null,
      };
    },
  });

  const gameService = createGameServiceForTest(rewardAwareRepository.repository);
  const result = await gameService.finishSession(9);

  assert.deepEqual(markedOutcome, {
    gameCompletionState: "time-ended",
  });
  assert.equal(result.lifecycle, "active");
  assert.equal(result.reason, "time-ended");
  assert.equal(result.session.status, "active");
  assert.equal(result.session.remainingSeconds, 0);
  assert.equal(result.session.canCollect, true);
});

test("finishSession returns latest closed session instead of throwing when server already closed it", async () => {
  const finishedSession = {
    id: 153,
    playerId: 19,
    status: "finished",
    remainingSeconds: 0,
    foundSneakerNumbers: [1, 2, 3, 4],
    startedAt: new Date("2026-05-14T18:40:00.000Z"),
    lastResumedAt: null,
    lastHeartbeatAt: new Date("2026-05-14T18:49:58.000Z"),
    finishedAt: new Date("2026-05-14T18:50:00.000Z"),
    completionReason: "time-ended",
  };

  const rewardAwareRepository = withRewardRepository({
    async findLatestOpenSessionByPlayerId() {
      return null;
    },
    async findLatestSessionByPlayerId(playerId) {
      assert.equal(playerId, 19);
      return finishedSession;
    },
    async updateSession() {
      throw new Error("should not update already closed session");
    },
    async findPlayerRewardStateById() {
      return {
        gameCompletionState: "time-ended",
        promoCode: null,
      };
    },
  });

  const gameService = createGameServiceForTest(rewardAwareRepository.repository);
  const result = await gameService.finishSession(19);

  assert.equal(result.lifecycle, "finished");
  assert.equal(result.reason, "time-ended");
  assert.equal(result.session.status, "finished");
  assert.equal(result.session.id, 153);
  assert.equal(result.session.remainingSeconds, 0);
});

test("collectSneaker keeps counting on finished session and returns promo code after 10 of 10", async () => {
  const finishedSession = {
    id: 77,
    playerId: 12,
    status: "finished",
    remainingSeconds: 0,
    foundSneakerNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    startedAt: new Date("2026-05-14T10:00:00.000Z"),
    lastResumedAt: null,
    lastHeartbeatAt: new Date("2026-05-14T10:10:00.000Z"),
    finishedAt: new Date("2026-05-14T10:10:00.000Z"),
    completionReason: "time-ended",
  };

  let markedOutcome = null;
  let createdActivityLog = null;
  const rewardAwareRepository = withRewardRepository({
    async findLatestOpenSessionByPlayerId() {
      return null;
    },
    async findLatestSessionByPlayerId() {
      return finishedSession;
    },
    async updateSession(_sessionId, valuesToUpdate) {
      assert.deepEqual(valuesToUpdate, {
        found_sneaker_numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        completion_reason: "completed-after-time",
      });

      return {
        ...finishedSession,
        foundSneakerNumbers: valuesToUpdate.found_sneaker_numbers,
        completionReason: valuesToUpdate.completion_reason,
      };
    },
    async markPlayerOutcome(playerId, payload) {
      assert.equal(playerId, 12);
      markedOutcome = payload;
    },
    async upsertGameResult(resultPayload) {
      assert.deepEqual(resultPayload.foundSneakerNumbers, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      assert.equal(resultPayload.remainingSeconds, 0);
      assert.equal(resultPayload.eligibleForRaffle, false);
      assert.equal(resultPayload.completionReason, "completed-after-time");

      return { id: 303 };
    },
    async assignPromoCodeToPlayer(playerId) {
      assert.equal(playerId, 12);
      rewardAwareRepository.repository.setAssignedPromoCode("AFTER-TIME");
      return "AFTER-TIME";
    },
    async createActivityLog(activityLog) {
      createdActivityLog = activityLog;
      return {
        id: 302,
        ...activityLog,
        createdAt: new Date(),
      };
    },
    async findPlayerRewardStateById() {
      return {
        gameCompletionState: "completed-after-time",
        promoCode: rewardAwareRepository.assignedPromoCode,
      };
    },
  });

  const gameService = createGameServiceForTest(rewardAwareRepository.repository);
  const result = await gameService.collectSneaker(12, { sneakerNumber: 10 });

  assert.deepEqual(markedOutcome, {
    gameCompletionState: "completed-after-time",
  });
  assert.equal(result.accepted, true);
  assert.equal(result.lifecycle, "finished");
  assert.equal(result.reason, "completed-after-time");
  assert.equal(result.session.status, "finished");
  assert.equal(result.session.remainingSeconds, 0);
  assert.equal(result.session.promoCode, "AFTER-TIME");
  assert.equal(result.session.canCollect, false);
  assert.deepEqual(createdActivityLog, {
    playerId: 12,
    gameSessionId: 77,
    source: "server",
    action: "found-sneaker",
    details: {
      sneakerNumber: 10,
      foundSneakerNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      sessionStatus: "finished",
    },
  });
});

test("collectSneaker does not create activity log for already found sneaker", async () => {
  const now = Date.now();
  const openSession = {
    id: 91,
    playerId: 18,
    status: "active",
    remainingSeconds: 420,
    foundSneakerNumbers: [1, 2, 3],
    startedAt: new Date(now - 120_000),
    lastResumedAt: new Date(now - 5_000),
    lastHeartbeatAt: new Date(now - 1_000),
    finishedAt: null,
    completionReason: null,
  };

  const rewardAwareRepository = withRewardRepository({
    async findLatestOpenSessionByPlayerId() {
      return openSession;
    },
    async createActivityLog() {
      throw new Error("should not log duplicate sneaker collection");
    },
    async findPlayerRewardStateById() {
      return {
        gameCompletionState: null,
        promoCode: null,
      };
    },
  });

  const gameService = createGameServiceForTest(rewardAwareRepository.repository);
  const result = await gameService.collectSneaker(18, { sneakerNumber: 3 });

  assert.equal(result.accepted, false);
  assert.equal(result.session.status, "active");
  assert.deepEqual(result.session.foundSneakers.slice(0, 3), [
    { sneakerNumber: 1, found: true },
    { sneakerNumber: 2, found: true },
    { sneakerNumber: 3, found: true },
  ]);
});

test("startSession keeps incomplete timed-out session active and marks time-ended", async () => {
  const now = Date.now();
  const activeSession = {
    id: 79,
    playerId: 14,
    status: "active",
    remainingSeconds: 5,
    foundSneakerNumbers: [1, 2],
    startedAt: new Date(now - 20_000),
    lastResumedAt: new Date(now - 10_000),
    lastHeartbeatAt: new Date(now - 1_000),
    finishedAt: null,
    completionReason: null,
  };

  let markedOutcome = null;
  const rewardAwareRepository = withRewardRepository({
    async findLatestOpenSessionByPlayerId() {
      return activeSession;
    },
    async updateSession(_sessionId, valuesToUpdate) {
      assert.equal(valuesToUpdate.remaining_seconds, 0);
      assert.equal(valuesToUpdate.completion_reason, "time-ended");

      return {
        ...activeSession,
        status: "active",
        remainingSeconds: 0,
        lastHeartbeatAt: valuesToUpdate.last_heartbeat_at,
        finishedAt: null,
        completionReason: "time-ended",
      };
    },
    async markPlayerOutcome(playerId, payload) {
      assert.equal(playerId, 14);
      markedOutcome = payload;
    },
    async upsertGameResult(resultPayload) {
      assert.equal(resultPayload.playerId, 14);
      assert.equal(resultPayload.remainingSeconds, 0);
      assert.equal(resultPayload.eligibleForRaffle, false);
      assert.equal(resultPayload.completionReason, "time-ended");
      return { id: 404 };
    },
    async findPlayerRewardStateById() {
      return {
        gameCompletionState: "time-ended",
        promoCode: null,
      };
    },
  });

  const gameService = createGameServiceForTest(rewardAwareRepository.repository);
  const result = await gameService.startSession(14);

  assert.deepEqual(markedOutcome, {
    gameCompletionState: "time-ended",
  });
  assert.equal(result.lifecycle, "active");
  assert.equal(result.reason, "time-ended");
  assert.equal(result.session.status, "active");
  assert.equal(result.session.remainingSeconds, 0);
  assert.equal(result.session.canCollect, true);
});

test("startSession freezes timer after heartbeat grace window until activity resumes", async () => {
  const now = Date.now();
  const activeSession = {
    id: 180,
    playerId: 24,
    status: "active",
    remainingSeconds: 300,
    foundSneakerNumbers: [1, 2, 3],
    startedAt: new Date(now - 120_000),
    lastResumedAt: new Date(now - 60_000),
    lastHeartbeatAt: new Date(now - 30_000),
    finishedAt: null,
    completionReason: null,
  };

  const rewardAwareRepository = withRewardRepository({
    async findLatestOpenSessionByPlayerId() {
      return activeSession;
    },
    async updateSession(_sessionId, valuesToUpdate) {
      assert.equal(valuesToUpdate.remaining_seconds, 255);
      assert.ok(valuesToUpdate.last_resumed_at instanceof Date);
      assert.ok(valuesToUpdate.last_heartbeat_at instanceof Date);

      return {
        ...activeSession,
        remainingSeconds: valuesToUpdate.remaining_seconds,
        lastResumedAt: valuesToUpdate.last_resumed_at,
        lastHeartbeatAt: valuesToUpdate.last_heartbeat_at,
      };
    },
    async findPlayerRewardStateById() {
      return {
        gameCompletionState: null,
        promoCode: null,
      };
    },
  });

  const gameService = createGameServiceForTest(rewardAwareRepository.repository);
  const result = await gameService.startSession(24);

  assert.equal(result.lifecycle, "active");
  assert.equal(result.reason, "existing-session");
  assert.equal(result.session.status, "active");
  assert.equal(result.session.remainingSeconds, 255);
  assert.equal(result.session.canCollect, true);
});

test("startSession returns finished session with zero time and assigned promo code", async () => {
  const finishedSession = {
    id: 88,
    playerId: 15,
    status: "finished",
    remainingSeconds: 245,
    foundSneakerNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    startedAt: new Date("2026-05-14T11:00:00.000Z"),
    lastResumedAt: null,
    lastHeartbeatAt: new Date("2026-05-14T11:10:00.000Z"),
    finishedAt: new Date("2026-05-14T11:10:00.000Z"),
    completionReason: "completed",
  };

  const rewardAwareRepository = withRewardRepository({
    async findLatestOpenSessionByPlayerId() {
      return null;
    },
    async findLatestSessionByPlayerId() {
      return finishedSession;
    },
    async findPlayerRewardStateById() {
      return {
        gameCompletionState: "completed",
        promoCode: "AUTH-PROMO",
      };
    },
  });

  const gameService = createGameServiceForTest(rewardAwareRepository.repository);
  const result = await gameService.startSession(15);

  assert.equal(result.lifecycle, "finished");
  assert.equal(result.reason, "completed");
  assert.equal(result.session.status, "finished");
  assert.equal(result.session.remainingSeconds, 0);
  assert.equal(result.session.promoCode, "AUTH-PROMO");
  assert.equal(result.session.canCollect, false);
});
