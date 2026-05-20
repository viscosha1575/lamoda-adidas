import { HttpError } from "../lib/http-error.js";
import { getTelegramInitDataFromHeadersOnly } from "../modules/auth/init-data.js";
import {
  extractTelegramUserFromInitData,
  validateTelegramInitData,
} from "../modules/auth/telegram.js";

function normalizeAllowedTelegramIds(allowedTelegramIds = []) {
  return new Set(
    (Array.isArray(allowedTelegramIds) ? allowedTelegramIds : [])
      .map((value) => String(value ?? "").trim())
      .filter(Boolean),
  );
}

export function createAdminAuthMiddleware({
  adminTelegramBotToken,
  allowedTelegramIds,
}) {
  const allowedIds = normalizeAllowedTelegramIds(allowedTelegramIds);

  return async function adminAuthMiddleware(request, _response, next) {
    try {
      const initDataFromRequest = getTelegramInitDataFromHeadersOnly(request);

      if (!initDataFromRequest) {
        next(new HttpError(401, "Telegram initData header is required"));
        return;
      }

      if (!adminTelegramBotToken) {
        next(new HttpError(500, "ADMIN_TELEGRAM_BOT_TOKEN is required for admin authentication"));
        return;
      }

      if (allowedIds.size === 0) {
        next(new HttpError(500, "ADMIN_TELEGRAM_IDS is required for admin authentication"));
        return;
      }

      if (!validateTelegramInitData(String(initDataFromRequest), adminTelegramBotToken)) {
        next(new HttpError(401, "Invalid Telegram initData signature"));
        return;
      }

      const telegramUser = extractTelegramUserFromInitData(String(initDataFromRequest));

      if (!telegramUser?.id) {
        next(new HttpError(400, "Telegram initData does not contain user information"));
        return;
      }

      if (!allowedIds.has(String(telegramUser.id))) {
        next(new HttpError(403, "Admin access denied"));
        return;
      }

      request.admin = {
        telegramUserId: Number(telegramUser.id),
        username: telegramUser.username ?? null,
        firstName: telegramUser.first_name ?? null,
        lastName: telegramUser.last_name ?? null,
      };
      next();
    } catch (error) {
      next(error);
    }
  };
}
