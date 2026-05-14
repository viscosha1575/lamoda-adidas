import test from "node:test";
import assert from "node:assert/strict";

import { createGameService } from "./game.service.js";

function createGameServiceForTest(gameRepository) {
  return createGameService({
    gameRepository,
    gameDurationSeconds: 600,
    heartbeatGraceSeconds: 15,
    playerOnlineWindowSeconds: 15,
  });
}

function createGameServiceWithSubscriptionChecker(gameRepository, telegramSubscriptionChecker) {
  return createGameService({
    gameRepository,
    gameDurationSeconds: 600,
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
          completedGame: false,
          timeExpired: false,
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
        pauseCount: session.pauseCount,
        startedAt: session.startedAt,
        lastResumedAt: session.lastResumedAt,
        lastPausedAt: null,
        lastHeartbeatAt: session.lastHeartbeatAt,
        finishedAt: null,
        expiredAt: null,
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
  assert.equal(result.session.remainingSeconds, 600);
  assert.equal(result.session.promoCode, null);
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
  const session = {
    id: 25,
    playerId: 5,
    status: "active",
    remainingSeconds: 540,
    foundSneakerNumbers: [1, 2],
    pauseCount: 0,
    startedAt: new Date("2026-05-12T10:00:00.000Z"),
    lastResumedAt: new Date("2026-05-12T10:00:00.000Z"),
    lastPausedAt: null,
    lastHeartbeatAt: new Date("2026-05-12T10:00:05.000Z"),
    finishedAt: null,
    expiredAt: null,
    completionReason: null,
  };

  const rewardAwareRepository = withRewardRepository({
    async findLatestOpenSessionByPlayerId() {
      return session;
    },
    async updateSession(_sessionId, valuesToUpdate) {
      return {
        ...session,
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
  assert.equal(result.session.isOnline, true);
});

test("logActivity resumes paused session back to active", async () => {
  const session = {
    id: 31,
    playerId: 5,
    status: "paused",
    remainingSeconds: 553,
    foundSneakerNumbers: [1],
    pauseCount: 2,
    startedAt: new Date("2026-05-12T10:00:00.000Z"),
    lastResumedAt: null,
    lastPausedAt: new Date("2026-05-14T09:22:57.436Z"),
    lastHeartbeatAt: new Date("2026-05-14T09:36:34.267Z"),
    finishedAt: null,
    expiredAt: null,
    completionReason: null,
  };

  const rewardAwareRepository = withRewardRepository({
    async findLatestOpenSessionByPlayerId() {
      return session;
    },
    async updateSession(_sessionId, valuesToUpdate) {
      assert.equal(valuesToUpdate.status, "active");
      assert.ok(valuesToUpdate.last_resumed_at instanceof Date);
      assert.ok(valuesToUpdate.last_heartbeat_at instanceof Date);

      return {
        ...session,
        status: "active",
        lastResumedAt: valuesToUpdate.last_resumed_at,
        lastHeartbeatAt: valuesToUpdate.last_heartbeat_at,
      };
    },
    async createActivityLog(activityLog) {
      assert.equal(activityLog.gameSessionId, 31);

      return {
        id: 100,
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
  assert.equal(result.session.status, "active");
  assert.equal(result.session.canCollect, true);
});

test("collectSneaker auto-finishes session when the tenth sneaker is found", async () => {
  const now = new Date();
  const openSession = {
    id: 41,
    playerId: 7,
    status: "active",
    remainingSeconds: 540,
    foundSneakerNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    pauseCount: 0,
    startedAt: new Date(now.getTime() - 60_000),
    lastResumedAt: new Date(now.getTime() - 5_000),
    lastPausedAt: null,
    lastHeartbeatAt: new Date(now.getTime() - 1_000),
    finishedAt: null,
    expiredAt: null,
    completionReason: null,
  };

  let updateCallCount = 0;
  let markedOutcome = null;
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
        lastPausedAt: valuesToUpdate.last_paused_at,
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
    async findPlayerRewardStateById() {
      return {
        completedGame: true,
        timeExpired: false,
        promoCode: rewardAwareRepository.assignedPromoCode,
      };
    },
  });

  const gameService = createGameServiceForTest(rewardAwareRepository.repository);
  const result = await gameService.collectSneaker(7, { sneakerNumber: 10 });

  assert.deepEqual(markedOutcome, {
    completedGame: true,
    timeExpired: false,
  });
  assert.equal(result.accepted, true);
  assert.equal(result.lifecycle, "finished");
  assert.equal(result.reason, "completed");
  assert.equal(result.session.status, "finished");
  assert.equal(result.session.remainingSeconds >= 0, true);
  assert.equal(result.session.promoCode, "PROMO-10");
  assert.equal(result.session.canCollect, false);
});

test("finishSession marks session as finished with zero remaining seconds", async () => {
  const openSession = {
    id: 52,
    playerId: 9,
    status: "paused",
    remainingSeconds: 553,
    foundSneakerNumbers: [1, 4],
    pauseCount: 2,
    startedAt: new Date("2026-05-12T10:00:00.000Z"),
    lastResumedAt: null,
    lastPausedAt: new Date("2026-05-14T09:22:57.436Z"),
    lastHeartbeatAt: new Date("2026-05-14T09:36:34.267Z"),
    finishedAt: null,
    expiredAt: null,
    completionReason: null,
  };

  let markedOutcome = null;
  const rewardAwareRepository = withRewardRepository({
    async findLatestOpenSessionByPlayerId() {
      return openSession;
    },
    async updateSession(_sessionId, valuesToUpdate) {
      assert.equal(valuesToUpdate.status, "finished");
      assert.equal(valuesToUpdate.remaining_seconds, 0);
      assert.equal(valuesToUpdate.completion_reason, "time-ended");

      return {
        ...openSession,
        status: "finished",
        remainingSeconds: 0,
        lastPausedAt: valuesToUpdate.last_paused_at,
        lastResumedAt: null,
        finishedAt: valuesToUpdate.finished_at,
        completionReason: "time-ended",
      };
    },
    async markPlayerOutcome(playerId, payload) {
      assert.equal(playerId, 9);
      markedOutcome = payload;
    },
    async upsertGameResult(resultPayload) {
      assert.equal(resultPayload.playerId, 9);
      assert.equal(resultPayload.remainingSeconds, 0);
      assert.equal(resultPayload.completedInSeconds, 600);
      assert.equal(resultPayload.eligibleForRaffle, false);
      assert.equal(resultPayload.completionReason, "time-ended");

      return { id: 202 };
    },
  });

  const gameService = createGameServiceForTest(rewardAwareRepository.repository);
  const result = await gameService.finishSession(9);

  assert.deepEqual(markedOutcome, {
    completedGame: false,
    timeExpired: true,
  });
  assert.equal(result.lifecycle, "finished");
  assert.equal(result.reason, "time-ended");
  assert.equal(result.session.status, "finished");
  assert.equal(result.session.remainingSeconds, 0);
  assert.equal(result.session.canCollect, true);
});

test("collectSneaker keeps counting on finished session and returns promo code after 10 of 10", async () => {
  const finishedSession = {
    id: 77,
    playerId: 12,
    status: "finished",
    remainingSeconds: 0,
    foundSneakerNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    pauseCount: 1,
    startedAt: new Date("2026-05-14T10:00:00.000Z"),
    lastResumedAt: null,
    lastPausedAt: new Date("2026-05-14T10:10:00.000Z"),
    lastHeartbeatAt: new Date("2026-05-14T10:10:00.000Z"),
    finishedAt: new Date("2026-05-14T10:10:00.000Z"),
    expiredAt: null,
    completionReason: "time-ended",
  };

  let markedOutcome = null;
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
      });

      return {
        ...finishedSession,
        foundSneakerNumbers: valuesToUpdate.found_sneaker_numbers,
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
      assert.equal(resultPayload.completionReason, "time-ended");

      return { id: 303 };
    },
    async assignPromoCodeToPlayer(playerId) {
      assert.equal(playerId, 12);
      rewardAwareRepository.repository.setAssignedPromoCode("AFTER-TIME");
      return "AFTER-TIME";
    },
    async findPlayerRewardStateById() {
      return {
        completedGame: false,
        timeExpired: true,
        promoCode: rewardAwareRepository.assignedPromoCode,
      };
    },
  });

  const gameService = createGameServiceForTest(rewardAwareRepository.repository);
  const result = await gameService.collectSneaker(12, { sneakerNumber: 10 });

  assert.deepEqual(markedOutcome, {
    completedGame: false,
    timeExpired: true,
  });
  assert.equal(result.accepted, true);
  assert.equal(result.lifecycle, "finished");
  assert.equal(result.reason, "time-ended");
  assert.equal(result.session.status, "finished");
  assert.equal(result.session.remainingSeconds, 0);
  assert.equal(result.session.promoCode, "AFTER-TIME");
  assert.equal(result.session.canCollect, false);
});

test("getState auto-finishes active session when time reaches zero", async () => {
  const now = Date.now();
  const activeSession = {
    id: 79,
    playerId: 14,
    status: "active",
    remainingSeconds: 5,
    foundSneakerNumbers: [1, 2],
    pauseCount: 0,
    startedAt: new Date(now - 20_000),
    lastResumedAt: new Date(now - 10_000),
    lastPausedAt: null,
    lastHeartbeatAt: new Date(now - 1_000),
    finishedAt: null,
    expiredAt: null,
    completionReason: null,
  };

  let markedOutcome = null;
  const rewardAwareRepository = withRewardRepository({
    async findLatestOpenSessionByPlayerId() {
      return activeSession;
    },
    async updateSession(_sessionId, valuesToUpdate) {
      assert.equal(valuesToUpdate.status, "finished");
      assert.equal(valuesToUpdate.remaining_seconds, 0);
      assert.equal(valuesToUpdate.completion_reason, "time-ended");
      assert.ok(valuesToUpdate.finished_at instanceof Date);

      return {
        ...activeSession,
        status: "finished",
        remainingSeconds: 0,
        lastPausedAt: valuesToUpdate.last_paused_at,
        lastResumedAt: null,
        finishedAt: valuesToUpdate.finished_at,
        completionReason: "time-ended",
      };
    },
    async markPlayerOutcome(playerId, payload) {
      assert.equal(playerId, 14);
      markedOutcome = payload;
    },
    async upsertGameResult(resultPayload) {
      assert.equal(resultPayload.remainingSeconds, 0);
      assert.equal(resultPayload.completionReason, "time-ended");

      return { id: 404 };
    },
    async findPlayerRewardStateById() {
      return {
        completedGame: false,
        timeExpired: true,
        promoCode: null,
      };
    },
  });

  const gameService = createGameServiceForTest(rewardAwareRepository.repository);
  const result = await gameService.getState(14);

  assert.deepEqual(markedOutcome, {
    completedGame: false,
    timeExpired: true,
  });
  assert.equal(result.lifecycle, "finished");
  assert.equal(result.reason, "time-ended");
  assert.equal(result.session.status, "finished");
  assert.equal(result.session.remainingSeconds, 0);
  assert.equal(result.session.canCollect, true);
});

test("getState returns finished session with zero time and assigned promo code", async () => {
  const finishedSession = {
    id: 88,
    playerId: 15,
    status: "finished",
    remainingSeconds: 245,
    foundSneakerNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    pauseCount: 1,
    startedAt: new Date("2026-05-14T11:00:00.000Z"),
    lastResumedAt: null,
    lastPausedAt: new Date("2026-05-14T11:10:00.000Z"),
    lastHeartbeatAt: new Date("2026-05-14T11:10:00.000Z"),
    finishedAt: new Date("2026-05-14T11:10:00.000Z"),
    expiredAt: null,
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
        completedGame: true,
        timeExpired: false,
        promoCode: "AUTH-PROMO",
      };
    },
  });

  const gameService = createGameServiceForTest(rewardAwareRepository.repository);
  const result = await gameService.getState(15);

  assert.equal(result.lifecycle, "finished");
  assert.equal(result.reason, "completed");
  assert.equal(result.session.status, "finished");
  assert.equal(result.session.remainingSeconds, 0);
  assert.equal(result.session.promoCode, "AUTH-PROMO");
  assert.equal(result.session.canCollect, false);
});
