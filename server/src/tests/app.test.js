import test from "node:test";
import assert from "node:assert/strict";

import { Router } from "express";
import request from "supertest";

import { createApp } from "../app.js";

function createTestApp() {
  const app = createApp({
    config: {
      corsOrigins: ["http://localhost:5173"],
    },
    pool: {
      async query() {
        return { rows: [{ "?column?": 1 }] };
      },
    },
    adminRouter: Router(),
    authRouter: Router(),
    gameRouter: Router(),
  });

  return app;
}

test("GET /api/health returns service status", async () => {
  const app = createTestApp();
  const response = await request(app).get("/api/health");

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.status, "ok");
  assert.equal(response.body.database, "connected");
});

test("OPTIONS preflight allows telegram init data header", async () => {
  const app = createTestApp();
  const response = await request(app)
    .options("/api/auth/session")
    .set("Origin", "http://localhost:5173")
    .set("Access-Control-Request-Method", "POST")
    .set("Access-Control-Request-Headers", "x-telegram-init-data, content-type");

  assert.equal(response.statusCode, 204);
  assert.equal(response.headers["access-control-allow-origin"], "http://localhost:5173");
  assert.match(
    response.headers["access-control-allow-headers"] ?? "",
    /X-Telegram-Init-Data/i,
  );
});
