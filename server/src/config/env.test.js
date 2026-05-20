import test from "node:test";
import assert from "node:assert/strict";

import { loadConfig } from "./env.js";

function withEnv(overrides, callback) {
  const originalEnv = { ...process.env };

  process.env = {
    ...originalEnv,
    ...overrides,
  };

  try {
    callback();
  } finally {
    process.env = originalEnv;
  }
}

test("loadConfig falls back to default Telegram subscription target when env values are blank", () => {
  withEnv({
    NODE_ENV: "test",
    DATABASE_URL: "postgres://postgres:postgres@localhost:5432/lamoda_adidas",
    TELEGRAM_GAME_BOT_TOKEN: "test-game-token",
    TELEGRAM_SUBSCRIPTION_CHAT_ID: "   ",
    TELEGRAM_SUBSCRIPTION_URL: "",
  }, () => {
    const config = loadConfig();

    assert.equal(config.telegramGameBotToken, "test-game-token");
    assert.equal(config.telegramSubscriptionChatId, "@lamoda_na_svyazi");
    assert.equal(config.telegramSubscriptionUrl, "https://t.me/lamoda_na_svyazi");
  });
});

test("loadConfig parses admin Telegram auth configuration", () => {
  withEnv({
    NODE_ENV: "test",
    DATABASE_URL: "postgres://postgres:postgres@localhost:5432/lamoda_adidas",
    ADMIN_TELEGRAM_BOT_TOKEN: "admin-bot-token",
    ADMIN_TELEGRAM_IDS: "434092620, 612078835 ,",
  }, () => {
    const config = loadConfig();

    assert.equal(config.adminTelegramBotToken, "admin-bot-token");
    assert.deepEqual(config.adminTelegramIds, ["434092620", "612078835"]);
  });
});
