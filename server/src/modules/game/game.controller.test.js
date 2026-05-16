import test from "node:test";
import assert from "node:assert/strict";

import { createGameController } from "./game.controller.js";

test("logActivity response includes current player and service result", async () => {
  const gameController = createGameController({
    gameService: {
      async logActivity(playerId, payload) {
        assert.equal(playerId, 12);
        assert.deepEqual(payload, {
          source: "unity",
          action: "swipe",
        });

        return {
          logged: true,
          activityLog: {
            id: 50,
            playerId: 12,
            source: "unity",
            action: "swipe",
          },
          session: {
            id: 77,
            status: "active",
          },
          lifecycle: "active",
        };
      },
    },
  });

  let statusCode = null;
  let jsonPayload = null;
  const response = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      jsonPayload = payload;
    },
  };

  await gameController.logActivity({
    player: {
      id: 12,
      telegramUserId: 123456789,
      username: "lamoda_player",
    },
    body: {
      source: "unity",
      action: "swipe",
    },
  }, response);

  assert.equal(statusCode, 201);
  assert.equal(jsonPayload.data.logged, true);
  assert.equal(jsonPayload.data.session.id, 77);
  assert.equal(jsonPayload.data.player.id, 12);
  assert.equal(jsonPayload.data.player.telegramUserId, 123456789);
});
