import test from "node:test";
import assert from "node:assert/strict";

import { createGameRepository } from "./game.repository.js";

function createDeferred() {
  let resolve;

  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

function createPoolForPromoAssignmentTest() {
  const state = {
    promoCodes: [
      { id: 1, code: "PROMO-001", assignedPlayerId: null },
      { id: 2, code: "PROMO-002", assignedPlayerId: null },
    ],
    playerLocks: new Map(),
  };

  async function acquirePlayerLock(playerId) {
    // Serialize promo assignment per player to simulate SELECT ... FOR UPDATE behavior.
    const currentLock = state.playerLocks.get(playerId);
    const nextLock = createDeferred();

    state.playerLocks.set(playerId, nextLock);

    if (currentLock) {
      await currentLock.promise;
    }

    return () => {
      if (state.playerLocks.get(playerId) === nextLock) {
        state.playerLocks.delete(playerId);
      }

      nextLock.resolve();
    };
  }

  return {
    async connect() {
      const transactionState = {
        releaseLock: null,
      };

      return {
        async query(text, values = []) {
          if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") {
            if ((text === "COMMIT" || text === "ROLLBACK") && transactionState.releaseLock) {
              transactionState.releaseLock();
              transactionState.releaseLock = null;
            }

            return { rows: [] };
          }

          if (text.includes("FROM players") && text.includes("FOR UPDATE")) {
            transactionState.releaseLock = await acquirePlayerLock(Number(values[0]));
            return { rows: [{ id: Number(values[0]) }] };
          }

          if (text.includes("WITH next_code AS")) {
            const existingCode = state.promoCodes.find(
              (promoCode) => promoCode.assignedPlayerId === Number(values[0]),
            );

            if (existingCode) {
              throw new Error("should not try to assign a second promo code to the same player");
            }

            const availableCode = state.promoCodes.find(
              (promoCode) => promoCode.assignedPlayerId === null,
            );

            if (!availableCode) {
              return { rows: [] };
            }

            availableCode.assignedPlayerId = Number(values[0]);

            return {
              rows: [{ code: availableCode.code }],
            };
          }

          if (text.includes("FROM promo_codes") && text.includes("assigned_player_id = $1")) {
            const assignedCode = state.promoCodes.find(
              (promoCode) => promoCode.assignedPlayerId === Number(values[0]),
            );

            return {
              rows: assignedCode ? [{ code: assignedCode.code }] : [],
            };
          }

          throw new Error(`Unexpected query in promo assignment test: ${text}`);
        },
        release() {},
      };
    },
  };
}

test("assignPromoCodeToPlayer returns the same code for concurrent requests of one player", async () => {
  const pool = createPoolForPromoAssignmentTest();
  const repository = createGameRepository({ pool });

  const [firstResult, secondResult] = await Promise.all([
    repository.assignPromoCodeToPlayer(77),
    repository.assignPromoCodeToPlayer(77),
  ]);

  assert.equal(firstResult, "PROMO-001");
  assert.equal(secondResult, "PROMO-001");
});
