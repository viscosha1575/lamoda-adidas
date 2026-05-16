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

function createInitData(overrides = {}) {
  return new URLSearchParams({
    query_id: "AAExample",
    user: JSON.stringify({
      id: 123456789,
      username: "lamoda_player",
      first_name: "Mila",
      last_name: "Test",
      ...overrides,
    }),
    auth_date: "1710000000",
  }).toString();
}

test("createSession marks Telegram player with referredByCode when referralCode is provided", async () => {
  const authRepository = {
    async findPlayerByTelegramUserId(telegramUserId) {
      assert.equal(telegramUserId, 123456789);
      return null;
    },
    async findPlayerByReferralCode(referralCode) {
      assert.equal(referralCode, "PLAYER42");
      return {
        id: 42,
      };
    },
    async upsertTelegramPlayer(player) {
      assert.equal(player.telegramUserId, 123456789);
      assert.equal(player.referredByCode, "PLAYER42");
      assert.equal(player.hasReferral, true);
      assert.equal(player.authProvider, "telegram_unverified");
      assert.match(player.referralCode, /^[A-Z0-9]{12}$/);

      return {
        id: 7,
        telegram_user_id: player.telegramUserId,
        username: player.username,
        first_name: player.firstName,
        last_name: player.lastName,
        auth_provider: player.authProvider,
        referral_code: player.referralCode,
        referred_by_code: player.referredByCode,
        has_referral: player.hasReferral,
        utm_slug: null,
        raffle_won: null,
        code_id: null,
        auth_token: player.authToken,
        auth_token_expires_at: player.authTokenExpiresAt,
        last_seen_at: player.lastSeenAt,
      };
    },
  };

  const authService = createAuthServiceForTest(authRepository);

  const result = await authService.createSession({
    initData: createInitData(),
    referralCode: "https://t.me/lamoda_games_bot/search?startapp=player42",
  });

  assert.equal(result.hasReferral, true);
  assert.equal(result.referredByCode, "PLAYER42");
  assert.match(result.referralCode, /^[A-Z0-9]{12}$/);
  assert.equal(result.referralLink, `https://t.me/lamoda_games_bot/search?startapp=${result.referralCode}`);
  assert.equal(result.isExisting, false);
  assert.equal(result.telegramUserId, 123456789);
  assert.equal(result.subscribedToChannel, false);
  assert.equal(result.gameCompletionState, null);
  assert.equal(result.raffleWon, null);
  assert.equal(result.codeId, null);
  assert.equal(result.referralApplied, true);
  assert.equal(result.referredPlayerId, 42);
});

test("createSession keeps hasReferral false when referralCode is missing", async () => {
  const authRepository = {
    async findPlayerByTelegramUserId() {
      return null;
    },
    async findPlayerByReferralCode() {
      throw new Error("should not load referral owner without inbound referral");
    },
    async upsertTelegramPlayer(player) {
      assert.equal(player.referredByCode, null);
      assert.equal(player.hasReferral, false);
      assert.equal(player.authProvider, "telegram_unverified");
      assert.match(player.referralCode, /^[A-Z0-9]{12}$/);

      return {
        id: 8,
        telegram_user_id: player.telegramUserId,
        username: player.username,
        first_name: player.firstName,
        last_name: player.lastName,
        auth_provider: player.authProvider,
        referral_code: player.referralCode,
        referred_by_code: player.referredByCode,
        has_referral: player.hasReferral,
        utm_slug: null,
        raffle_won: null,
        code_id: null,
        auth_token: player.authToken,
        auth_token_expires_at: player.authTokenExpiresAt,
        last_seen_at: player.lastSeenAt,
      };
    },
  };

  const authService = createAuthServiceForTest(authRepository);

  const result = await authService.createSession({
    initData: createInitData(),
  });

  assert.equal(result.hasReferral, false);
  assert.equal(result.referredByCode, null);
  assert.match(result.referralCode, /^[A-Z0-9]{12}$/);
  assert.equal(result.isExisting, false);
  assert.equal(result.subscribedToChannel, false);
  assert.equal(result.gameCompletionState, null);
  assert.equal(result.raffleWon, null);
  assert.equal(result.codeId, null);
  assert.equal(result.referralApplied, false);
  assert.equal(result.referredPlayerId, null);
});

test("createSession accepts raw Telegram initData without hash validation", async () => {
  const authRepository = {
    async findPlayerByTelegramUserId(telegramUserId) {
      assert.equal(telegramUserId, 123456789);
      return null;
    },
    async findPlayerByReferralCode() {
      throw new Error("should not load referral owner without inbound referral");
    },
    async upsertTelegramPlayer(player) {
      assert.equal(player.telegramUserId, 123456789);
      assert.equal(player.username, "lamoda_player");
      assert.equal(player.firstName, "Mila");
      assert.equal(player.lastName, "Test");
      assert.equal(player.authProvider, "telegram_unverified");
      assert.equal(player.hasReferral, false);
      assert.match(player.referralCode, /^[A-Z0-9]{12}$/);

      return {
        id: 9,
        telegram_user_id: player.telegramUserId,
        username: player.username,
        first_name: player.firstName,
        last_name: player.lastName,
        auth_provider: player.authProvider,
        referral_code: player.referralCode,
        referred_by_code: player.referredByCode,
        has_referral: player.hasReferral,
        utm_slug: null,
        raffle_won: null,
        code_id: null,
        auth_token: player.authToken,
        auth_token_expires_at: player.authTokenExpiresAt,
        last_seen_at: player.lastSeenAt,
      };
    },
  };

  const authService = createAuthServiceForTest(authRepository);
  const result = await authService.createSession({ initData: createInitData() });

  assert.equal(result.telegramUserId, 123456789);
  assert.equal(result.username, "lamoda_player");
  assert.equal(result.firstName, "Mila");
  assert.equal(result.lastName, "Test");
  assert.equal(result.hasReferral, false);
  assert.equal(result.isExisting, false);
  assert.equal(result.subscribedToChannel, false);
  assert.equal(result.gameCompletionState, null);
  assert.equal(result.raffleWon, null);
  assert.equal(result.codeId, null);
});

test("createSession rejects requests without Telegram initData", async () => {
  const authService = createAuthServiceForTest({});

  await assert.rejects(
    () => authService.createSession({ referralCode: "PLAYER42" }),
    {
      message: "Telegram initData is required",
    },
  );
});

test("createSession stores lowercase startapp as utm slug and tracks visit", async () => {
  let trackedVisit = null;
  const authRepository = {
    async findPlayerByTelegramUserId() {
      return {
        id: 77,
        referral_code: "ABCDEF123456",
      };
    },
    async findPlayerByReferralCode(referralCode) {
      assert.equal(referralCode, "TEST");
      return null;
    },
    async upsertTelegramPlayer(player) {
      assert.equal(player.referredByCode, null);
      assert.equal(player.hasReferral, false);
      assert.equal(player.utmSlug, "test");

      return {
        id: 77,
        telegram_user_id: player.telegramUserId,
        username: player.username,
        first_name: player.firstName,
        last_name: player.lastName,
        auth_provider: player.authProvider,
        referral_code: player.referralCode,
        referred_by_code: null,
        has_referral: false,
        utm_slug: "test",
        raffle_won: null,
        code_id: null,
        auth_token: player.authToken,
        auth_token_expires_at: player.authTokenExpiresAt,
        last_seen_at: player.lastSeenAt,
      };
    },
    async trackPlayerUtmVisit(playerId, utmSlug, wasExistingPlayer) {
      trackedVisit = { playerId, utmSlug, wasExistingPlayer };
    },
  };

  const authService = createAuthServiceForTest(authRepository);
  const result = await authService.createSession({
    initData: createInitData(),
    startParam: "test",
  });

  assert.equal(result.utmSlug, "test");
  assert.equal(result.referredByCode, null);
  assert.deepEqual(trackedVisit, {
    playerId: 77,
    utmSlug: "test",
    wasExistingPlayer: true,
  });
});

test("markPlayerHasReferral sets hasReferral true and clears referredByCode", async () => {
  let updatedPlayerId = null;
  const authRepository = {
    async markPlayerHasReferralById(playerId) {
      updatedPlayerId = playerId;
      return {
        id: playerId,
        telegram_user_id: 123456789,
        username: "lamoda_player",
        first_name: "Mila",
        last_name: "Test",
        auth_provider: "telegram_unverified",
        referral_code: "ABCDEF123456",
        referred_by_code: null,
        has_referral: true,
        utm_slug: null,
        subscribed_to_channel: false,
        raffle_won: null,
        code_id: null,
        auth_token: "token-123",
        auth_token_expires_at: "2026-06-15T10:00:00.000Z",
        last_seen_at: "2026-05-15T10:00:00.000Z",
      };
    },
  };

  const authService = createAuthServiceForTest(authRepository);
  const player = await authService.markPlayerHasReferral(7);

  assert.equal(updatedPlayerId, 7);
  assert.equal(player.hasReferral, true);
  assert.equal(player.referredByCode, null);
});
