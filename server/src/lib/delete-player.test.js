import test from "node:test";
import assert from "node:assert/strict";

import { deletePlayerWithRelations } from "./delete-player.js";

test("deletePlayerWithRelations resets related promo and referral data before deleting player", async () => {
  const calls = [];
  const client = {
    async query(sql, params = []) {
      calls.push({
        sql: sql.replace(/\s+/g, " ").trim(),
        params,
      });

      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
        return { rows: [], rowCount: 0 };
      }

      if (sql.includes("SELECT id, referral_code")) {
        return {
          rows: [{ id: 42, referral_code: "REF42" }],
          rowCount: 1,
        };
      }

      if (sql.includes("DELETE FROM players")) {
        return {
          rows: [{ id: 42 }],
          rowCount: 1,
        };
      }

      return { rows: [], rowCount: 1 };
    },
    releaseCalled: false,
    release() {
      this.releaseCalled = true;
    },
  };

  const pool = {
    async connect() {
      return client;
    },
  };

  const deleted = await deletePlayerWithRelations(pool, 42);

  assert.equal(deleted, true);
  assert.equal(client.releaseCalled, true);
  assert.deepEqual(
    calls.map((call) => call.sql),
    [
      "BEGIN",
      "SELECT id, referral_code FROM players WHERE id = $1 LIMIT 1 FOR UPDATE",
      "UPDATE players SET referred_by_code = NULL, has_referral = FALSE, updated_at = NOW() WHERE referred_by_code = $1",
      "UPDATE promo_codes SET assigned_player_id = NULL, assigned_at = NULL, updated_at = NOW() WHERE assigned_player_id = $1",
      "DELETE FROM players WHERE id = $1 RETURNING id",
      "COMMIT",
    ],
  );
  assert.deepEqual(calls[2].params, ["REF42"]);
  assert.deepEqual(calls[3].params, [42]);
});

test("deletePlayerWithRelations rolls back and returns false when player does not exist", async () => {
  const calls = [];
  const client = {
    async query(sql, params = []) {
      calls.push({
        sql: sql.replace(/\s+/g, " ").trim(),
        params,
      });

      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
        return { rows: [], rowCount: 0 };
      }

      if (sql.includes("SELECT id, referral_code")) {
        return {
          rows: [],
          rowCount: 0,
        };
      }

      throw new Error("unexpected query");
    },
    releaseCalled: false,
    release() {
      this.releaseCalled = true;
    },
  };

  const pool = {
    async connect() {
      return client;
    },
  };

  const deleted = await deletePlayerWithRelations(pool, 99);

  assert.equal(deleted, false);
  assert.equal(client.releaseCalled, true);
  assert.deepEqual(
    calls.map((call) => call.sql),
    [
      "BEGIN",
      "SELECT id, referral_code FROM players WHERE id = $1 LIMIT 1 FOR UPDATE",
      "ROLLBACK",
    ],
  );
});
