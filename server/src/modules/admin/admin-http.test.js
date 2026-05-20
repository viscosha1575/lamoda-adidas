import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import express from "express";
import request from "supertest";

import { errorHandler } from "../../middlewares/error-handler.js";
import { createAdminController } from "./admin.controller.js";
import { createAdminRouter } from "./admin.routes.js";
import { createAdminAuthMiddleware } from "../../middlewares/admin-auth.js";

function createSignedInitData(botToken, overrides = {}) {
  const params = new URLSearchParams({
    query_id: "AAAdmin",
    user: JSON.stringify({
      id: 434092620,
      username: "mila_admin",
      first_name: "Mila",
      last_name: "Admin",
      ...overrides,
    }),
    auth_date: "1710000000",
  });
  const entries = Array.from(params.entries())
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = crypto
    .createHmac("sha256", secretKey)
    .update(entries)
    .digest("hex");

  params.set("hash", hash);
  return params.toString();
}

async function encryptAdminPayload(payload, secret) {
  const key = crypto.createHash("sha256").update(secret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    payload: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

test("POST /api/admin/auth/me returns admin info", async () => {
  const adminService = {
    async getAuthMe(admin) {
      return {
        admin: {
          id: String(admin.telegramUserId),
          telegramUserId: admin.telegramUserId,
          username: admin.username,
        },
      };
    },
  };
  const adminBotToken = "admin-bot-token";

  const app = express();
  app.use(express.json());
  app.use("/api/admin", createAdminRouter({
    adminController: createAdminController({ adminService }),
    adminAuthMiddleware: createAdminAuthMiddleware({
      adminTelegramBotToken: adminBotToken,
      allowedTelegramIds: ["434092620"],
    }),
    config: {
      requestBodySecret: "",
    },
  }));
  app.use(errorHandler);

  const response = await request(app)
    .post("/api/admin/auth/me")
    .set("X-Telegram-Init-Data", createSignedInitData(adminBotToken))
    .send({});

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.admin.telegramUserId, 434092620);
  assert.equal(response.body.admin.username, "mila_admin");
});

test("POST /api/admin/analytics/overview returns summary", async () => {
  const adminService = {
    async getAuthMe() {
      return {};
    },
    async getAnalyticsOverview(payload) {
      assert.equal(payload.range, "7d");

      return {
        meta: {
          range: "7d",
          cachedAt: "2026-05-14T10:00:00.000Z",
        },
        series: {
          newPlayers: [{ key: "a", label: "01.05", value: 2 }],
          totalPlayers: [{ key: "a", label: "01.05", value: 10 }],
          sessionsStarted: [{ key: "a", label: "01.05", value: 4 }],
          sessionsFinished: [{ key: "a", label: "01.05", value: 1 }],
        },
        summary: {
          totalPlayersCount: 10,
        },
        recentSessions: [],
      };
    },
  };
  const adminBotToken = "test-secret-bot";

  const app = express();
  app.use(express.json());
  app.use("/api/admin", createAdminRouter({
    adminController: createAdminController({ adminService }),
    adminAuthMiddleware: createAdminAuthMiddleware({
      adminTelegramBotToken: adminBotToken,
      allowedTelegramIds: ["434092620"],
    }),
    config: {
      requestBodySecret: "test-secret",
    },
  }));
  app.use(errorHandler);

  const encryptedBody = await encryptAdminPayload({
    range: "7d",
  }, "test-secret");

  const response = await request(app)
    .post("/api/admin/analytics/overview")
    .set("X-Telegram-Init-Data", createSignedInitData(adminBotToken))
    .send(encryptedBody);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.summary.totalPlayersCount, 10);
  assert.equal(response.body.series.newPlayers[0].value, 2);
  assert.equal(response.body.series.totalPlayers[0].value, 10);
});

test("POST /api/admin/raffle/reset resets raffle winners", async () => {
  const adminService = {
    async resetRaffleWinners() {
      return {
        updatedCount: 12,
      };
    },
  };
  const adminBotToken = "admin-bot-token";

  const app = express();
  app.use(express.json());
  app.use("/api/admin", createAdminRouter({
    adminController: createAdminController({ adminService }),
    adminAuthMiddleware: createAdminAuthMiddleware({
      adminTelegramBotToken: adminBotToken,
      allowedTelegramIds: ["434092620"],
    }),
    config: {
      requestBodySecret: "",
    },
  }));
  app.use(errorHandler);

  const response = await request(app)
    .post("/api/admin/raffle/reset")
    .set("X-Telegram-Init-Data", createSignedInitData(adminBotToken))
    .send({});

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.updatedCount, 12);
});

test("POST /api/admin/auth/me rejects non-admin Telegram user", async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/admin", createAdminRouter({
    adminController: createAdminController({
      adminService: {
        async getAuthMe() {
          return {};
        },
      },
    }),
    adminAuthMiddleware: createAdminAuthMiddleware({
      adminTelegramBotToken: "admin-bot-token",
      allowedTelegramIds: ["434092620"],
    }),
    config: {
      requestBodySecret: "",
    },
  }));
  app.use(errorHandler);

  const response = await request(app)
    .post("/api/admin/auth/me")
    .set("X-Telegram-Init-Data", createSignedInitData("admin-bot-token", {
      id: 999999999,
      username: "outsider",
    }))
    .send({});

  assert.equal(response.statusCode, 403);
  assert.equal(response.body.error.message, "Admin access denied");
});
