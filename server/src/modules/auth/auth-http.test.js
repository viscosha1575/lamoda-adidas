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

function createPlayerResponse() {
  return {
    id: 1,
    telegramUserId: 123456789,
    username: "lamoda_player",
    displayName: "Mila Test",
    authProvider: "telegram_unverified",
    referralCode: "PLAYER42ABCD",
    referredByCode: null,
    referralLink: "https://t.me/lamoda_games_bot/search?startapp=PLAYER42ABCD",
    hasReferral: false,
    isOnline: true,
    authToken: "token-123",
    authTokenExpiresAt: "2026-05-12T10:00:00.000Z",
    lastSeenAt: "2026-05-12T09:50:00.000Z",
    isExisting: false,
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

  const app = express();
  app.use(express.json());
  app.use("/api/auth", createAuthRouter({
    authController: createAuthController({ authService }),
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

  const app = express();
  app.use(express.json());
  app.use("/api/auth", createAuthRouter({
    authController: createAuthController({ authService }),
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
