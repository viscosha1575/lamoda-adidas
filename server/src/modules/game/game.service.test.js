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

test("startSession always starts with sneaker 1 opened by default", async () => {
  const gameRepository = {
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
      };
    },
  };

  const gameService = createGameServiceForTest(gameRepository);
  const result = await gameService.startSession(3, {
    foundSneakerNumbers: [4, 7, 7],
  });

  assert.equal(result.lifecycle, "active");
  assert.deepEqual(result.session.foundSneakerNumbers, [1]);
  assert.equal(result.session.remainingSeconds, 600);
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
  };

  const gameRepository = {
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
  };

  const gameService = createGameServiceForTest(gameRepository);
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
