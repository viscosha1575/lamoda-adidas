import test from "node:test";
import assert from "node:assert/strict";

import { createAuthService } from "./auth.service.js";

function createAuthServiceForTest(authRepository) {
  return createAuthService({
    authRepository,
    telegramBotToken: null,
    trustTelegramClientUser: true,
    telegramAppUrl: "https://t.me/lamoda_games_bot/search",
    authTokenTtlDays: 30,
    playerOnlineWindowSeconds: 15,
  });
}

test("createSession marks anonymous player with referredByCode when referralCode is provided", async () => {
  const authRepository = {
    async findPlayerByAnonymousId() {
      return null;
    },
    async upsertAnonymousPlayer(player) {
      assert.equal(player.referredByCode, "PLAYER42");
      assert.equal(player.hasReferral, true);
      assert.match(player.referralCode, /^[A-Z0-9]{12}$/);

      return {
        id: 7,
        anonymous_id: player.anonymousId,
        telegram_user_id: null,
        username: player.username,
        first_name: player.firstName,
        last_name: player.lastName,
        auth_provider: player.authProvider,
        referral_code: player.referralCode,
        referred_by_code: player.referredByCode,
        has_referral: player.hasReferral,
        auth_token: player.authToken,
        auth_token_expires_at: player.authTokenExpiresAt,
        last_seen_at: player.lastSeenAt,
      };
    },
  };

  const authService = createAuthServiceForTest(authRepository);

  const result = await authService.createSession({
    anonymousId: "anon-user-001",
    referralCode: "https://t.me/lamoda_games_bot/search?startapp=player42",
  });

  assert.equal(result.hasReferral, true);
  assert.equal(result.referredByCode, "PLAYER42");
  assert.match(result.referralCode, /^[A-Z0-9]{12}$/);
  assert.equal(result.referralLink, `https://t.me/lamoda_games_bot/search?startapp=${result.referralCode}`);
  assert.equal(result.isExisting, false);
});

test("createSession keeps hasReferral false when referralCode is missing", async () => {
  const authRepository = {
    async findPlayerByAnonymousId() {
      return null;
    },
    async upsertAnonymousPlayer(player) {
      assert.equal(player.referredByCode, null);
      assert.equal(player.hasReferral, false);
      assert.match(player.referralCode, /^[A-Z0-9]{12}$/);

      return {
        id: 8,
        anonymous_id: player.anonymousId,
        telegram_user_id: null,
        username: player.username,
        first_name: player.firstName,
        last_name: player.lastName,
        auth_provider: player.authProvider,
        referral_code: player.referralCode,
        referred_by_code: player.referredByCode,
        has_referral: player.hasReferral,
        auth_token: player.authToken,
        auth_token_expires_at: player.authTokenExpiresAt,
        last_seen_at: player.lastSeenAt,
      };
    },
  };

  const authService = createAuthServiceForTest(authRepository);

  const result = await authService.createSession({
    anonymousId: "anon-user-002",
  });

  assert.equal(result.hasReferral, false);
  assert.equal(result.referredByCode, null);
  assert.match(result.referralCode, /^[A-Z0-9]{12}$/);
  assert.equal(result.isExisting, false);
});
