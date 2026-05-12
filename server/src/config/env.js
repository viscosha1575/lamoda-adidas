import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const booleanFromEnv = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().min(1),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173"),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_TRUST_CLIENT_USER: booleanFromEnv.default("true"),
  TELEGRAM_APP_URL: z.string().url().default("https://t.me/lamoda_games_bot/search"),
  AUTH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  GAME_DURATION_SECONDS: z.coerce.number().int().positive().default(600),
  HEARTBEAT_GRACE_SECONDS: z.coerce.number().int().positive().default(15),
  PLAYER_ONLINE_WINDOW_SECONDS: z.coerce.number().int().positive().default(15),
});

export function loadConfig() {
  const env = envSchema.parse(process.env);

  return {
    environment: env.NODE_ENV,
    port: env.PORT,
    databaseUrl: env.DATABASE_URL,
    corsOrigins: env.CORS_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean),
    telegramBotToken: env.TELEGRAM_BOT_TOKEN ?? null,
    trustTelegramClientUser: env.TELEGRAM_TRUST_CLIENT_USER,
    telegramAppUrl: env.TELEGRAM_APP_URL,
    authTokenTtlDays: env.AUTH_TOKEN_TTL_DAYS,
    gameDurationSeconds: env.GAME_DURATION_SECONDS,
    heartbeatGraceSeconds: env.HEARTBEAT_GRACE_SECONDS,
    playerOnlineWindowSeconds: env.PLAYER_ONLINE_WINDOW_SECONDS,
  };
}
