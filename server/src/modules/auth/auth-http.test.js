import test from "node:test";
import assert from "node:assert/strict";

import express from "express";
import request from "supertest";

import { errorHandler } from "../../middlewares/error-handler.js";
import { createAuthMiddleware } from "../../middlewares/auth.js";
import { createAuthController } from "./auth.controller.js";
import { createAuthRouter } from "./auth.routes.js";

function createInitDataHeader() {
  return new URLSearchParams({
    query_id: "AAExample",
    user: JSON.stringify({
      id: 123456789,
      username: "lamoda_player",
      first_name: "Mila",
      last_name: "Test",
    }),
    auth_date: "1710000000",
  }).toString();
}

function createPlayerResponse(overrides = {}) {
  return {
    id: 1,
    telegramUserId: 123456789,
    username: "lamoda_player",
    displayName: "Mila Test",
    authProvider: "telegram_unverified",
    referralCode: "PLAYER42ABCD",
    referredByCode: null,
    utmSlug: null,
    referralLink: "https://t.me/lamoda_games_bot/search?startapp=PLAYER42ABCD",
    hasReferral: false,
    gameCompletionState: null,
    raffleWon: null,
    codeId: null,
    isOnline: true,
    authToken: "token-123",
    authTokenExpiresAt: "2026-05-12T10:00:00.000Z",
    lastSeenAt: "2026-05-12T09:50:00.000Z",
    isExisting: false,
    referredPlayerId: null,
    referralApplied: false,
    ...overrides,
  };
}

test("POST /api/auth/session reads Telegram initData only from headers", async () => {
  const authService = {
    async createSession(payload) {
      assert.equal(payload.initData, createInitDataHeader());
      assert.equal(payload.referralCode, "PLAYER42");
      return createPlayerResponse();
    },
    async deletePlayerById() {
      return { deleted: true };
    },
    async getPlayerByToken() {
      return null;
    },
    async getPlayerByInitData() {
      return null;
    },
  };
  const gameService = {};

  const app = express();
  app.use(express.json());
  app.use("/api/auth", createAuthRouter({
    authController: createAuthController({ authService, gameService }),
    authMiddleware: createAuthMiddleware({ authService }),
  }));
  app.use(errorHandler);

  const response = await request(app)
    .post("/api/auth/session")
    .set("X-Telegram-Init-Data", createInitDataHeader())
    .send({
      referralCode: "PLAYER42",
    });

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.data.token, "token-123");
  assert.equal(response.body.data.player.telegramUserId, 123456789);
  assert.equal(response.body.data.player.gameCompletionState, null);
  assert.equal(response.body.data.player.raffleWon, null);
  assert.equal(response.body.data.player.codeId, null);
  assert.equal(response.body.data.player.utmSlug, null);
  assert.equal(response.body.data.lifecycle, "idle");
  assert.equal(response.body.data.session, null);
});

test("POST /api/auth/session restarts inviter session after applying referral", async () => {
  const authService = {
    async createSession(payload) {
      assert.equal(payload.referralCode, "PLAYER42");
      return createPlayerResponse({
        hasReferral: true,
        referredByCode: "PLAYER42",
        referredPlayerId: 42,
        referralApplied: true,
      });
    },
    async deletePlayerById() {
      return { deleted: true };
    },
    async getPlayerByToken() {
      return null;
    },
    async getPlayerByInitData() {
      return null;
    },
  };
  const gameService = {
    async restartSessionForReferral(playerId) {
      assert.equal(playerId, 42);
      return null;
    },
  };

  const app = express();
  app.use(express.json());
  app.use("/api/auth", createAuthRouter({
    authController: createAuthController({ authService, gameService }),
    authMiddleware: createAuthMiddleware({ authService }),
  }));
  app.use(errorHandler);

  const response = await request(app)
    .post("/api/auth/session")
    .set("X-Telegram-Init-Data", createInitDataHeader())
    .send({
      referralCode: "PLAYER42",
    });

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.data.player.referredByCode, "PLAYER42");
  assert.equal(response.body.data.lifecycle, "idle");
});

test("POST /api/auth/session rejects initData in body", async () => {
  const authService = {
    async createSession() {
      throw new Error("should not be called");
    },
    async deletePlayerById() {
      return { deleted: true };
    },
    async getPlayerByToken() {
      return null;
    },
    async getPlayerByInitData() {
      return null;
    },
  };
  const gameService = {};

  const app = express();
  app.use(express.json());
  app.use("/api/auth", createAuthRouter({
    authController: createAuthController({ authService, gameService }),
    authMiddleware: createAuthMiddleware({ authService }),
  }));
  app.use(errorHandler);

  const response = await request(app)
    .post("/api/auth/session")
    .send({
      initData: createInitDataHeader(),
    });

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.error.message, "Telegram initData must be sent only in headers");
});

test("auth middleware rejects initData in query string", async () => {
  const authService = {
    async getPlayerByToken() {
      return null;
    },
    async getPlayerByInitData() {
      throw new Error("should not be called");
    },
  };

  const app = express();
  app.use(express.json());
  app.get(
    "/protected",
    createAuthMiddleware({ authService }),
    (_request, response) => response.json({ ok: true }),
  );
  app.use(errorHandler);

  const response = await request(app)
    .get(`/protected?initData=${encodeURIComponent(createInitDataHeader())}`);

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.error.message, "Telegram initData must be sent only in headers");
});

test("auth middleware rejects bearer-only requests without Telegram initData", async () => {
  const authService = {
    async getPlayerByInitData() {
      throw new Error("should not be called");
    },
  };

  const app = express();
  app.use(express.json());
  app.get(
    "/protected",
    createAuthMiddleware({ authService }),
    (_request, response) => response.json({ ok: true }),
  );
  app.use(errorHandler);

  const response = await request(app)
    .get("/protected")
    .set("Authorization", "Bearer token-123");

  assert.equal(response.statusCode, 401);
  assert.equal(response.body.error.message, "Telegram initData header is required");
});

test("PATCH /api/auth/current/referral updates current player referral status using Telegram initData", async () => {
  const authService = {
    async createSession() {
      throw new Error("should not be called");
    },
    async deletePlayerById() {
      return { deleted: true };
    },
    async markPlayerHasReferral(playerId) {
      assert.equal(playerId, 55);

      return createPlayerResponse({
        id: 55,
        hasReferral: true,
        referredByCode: null,
      });
    },
    async getPlayerByToken() {
      return null;
    },
    async getPlayerByInitData() {
      return {
        id: 55,
        telegramUserId: 123456789,
      };
    },
  };
  const gameService = {};

  const app = express();
  app.use(express.json());
  app.use("/api/auth", createAuthRouter({
    authController: createAuthController({ authService, gameService }),
    authMiddleware: createAuthMiddleware({ authService }),
  }));
  app.use(errorHandler);

  const response = await request(app)
    .patch("/api/auth/current/referral")
    .set("X-Telegram-Init-Data", createInitDataHeader())
    .send();

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.player.id, 55);
  assert.equal(response.body.data.player.hasReferral, true);
  assert.equal(response.body.data.player.referredByCode, null);
});
