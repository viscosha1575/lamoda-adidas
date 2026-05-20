import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const optionalNonEmptyString = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmedValue = value.trim();
  return trimmedValue === "" ? undefined : trimmedValue;
}, z.string().min(1).optional());

const booleanFromEnv = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().min(1).optional(),
  PGHOST: z.string().min(1).optional(),
  PGPORT: z.coerce.number().int().positive().optional(),
  PGDATABASE: z.string().min(1).optional(),
  PGUSER: z.string().min(1).optional(),
  PGPASSWORD: z.string().optional(),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173"),
  TELEGRAM_BOT_TOKEN: optionalNonEmptyString,
  TELEGRAM_GAME_BOT_TOKEN: optionalNonEmptyString,
  ADMIN_TELEGRAM_BOT_TOKEN: optionalNonEmptyString,
  ADMIN_TELEGRAM_IDS: optionalNonEmptyString,
  TELEGRAM_TRUST_CLIENT_USER: booleanFromEnv.default("true"),
  TELEGRAM_APP_URL: z.string().url().default("https://t.me/lamoda_games_bot/search"),
  TELEGRAM_SUBSCRIPTION_CHAT_ID: optionalNonEmptyString,
  TELEGRAM_SUBSCRIPTION_URL: z.preprocess((value) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmedValue = value.trim();
    return trimmedValue === "" ? undefined : trimmedValue;
  }, z.string().url().optional()),
  REQUEST_BODY_SECRET: z.string().optional(),
  AUTH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  GAME_DURATION_SECONDS: z.coerce.number().int().positive().default(300),
  HEARTBEAT_GRACE_SECONDS: z.coerce.number().int().positive().default(15),
  PLAYER_ONLINE_WINDOW_SECONDS: z.coerce.number().int().positive().default(15),
});

export function loadConfig() {
  const env = envSchema.parse(process.env);
  const database = env.DATABASE_URL
    ? { connectionString: env.DATABASE_URL }
    : {
        host: env.PGHOST,
        port: env.PGPORT ?? 5432,
        database: env.PGDATABASE,
        user: env.PGUSER,
        password: env.PGPASSWORD ?? "",
      };

  if (
    !env.DATABASE_URL
    && (!database.host || !database.database || !database.user)
  ) {
    throw new Error(
      "Database configuration is required: set DATABASE_URL or PGHOST/PGDATABASE/PGUSER",
    );
  }

  return {
    environment: env.NODE_ENV,
    port: env.PORT,
    database,
    corsOrigins: env.CORS_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean),
    telegramBotToken: env.TELEGRAM_BOT_TOKEN ?? null,
    telegramGameBotToken: env.TELEGRAM_GAME_BOT_TOKEN ?? env.TELEGRAM_BOT_TOKEN ?? null,
    adminTelegramBotToken: env.ADMIN_TELEGRAM_BOT_TOKEN ?? null,
    adminTelegramIds: String(env.ADMIN_TELEGRAM_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    trustTelegramClientUser: env.TELEGRAM_TRUST_CLIENT_USER,
    telegramAppUrl: env.TELEGRAM_APP_URL,
    telegramSubscriptionChatId: env.TELEGRAM_SUBSCRIPTION_CHAT_ID ?? "@lamoda_na_svyazi",
    telegramSubscriptionUrl: env.TELEGRAM_SUBSCRIPTION_URL ?? "https://t.me/lamoda_na_svyazi",
    requestBodySecret: env.REQUEST_BODY_SECRET ?? "",
    authTokenTtlDays: env.AUTH_TOKEN_TTL_DAYS,
    gameDurationSeconds: env.GAME_DURATION_SECONDS,
    heartbeatGraceSeconds: env.HEARTBEAT_GRACE_SECONDS,
    playerOnlineWindowSeconds: env.PLAYER_ONLINE_WINDOW_SECONDS,
  };
}
