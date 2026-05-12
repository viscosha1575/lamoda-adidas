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
