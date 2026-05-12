import crypto from "node:crypto";

import { HttpError } from "../../lib/http-error.js";
import { authSessionSchema } from "./auth.schema.js";
import { extractTelegramUserFromInitData } from "./telegram.js";

function buildTokenExpiry(ttlDays) {
  return new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
}

function buildDisplayName(player) {
  return [player.first_name, player.last_name].filter(Boolean).join(" ").trim();
}

function sanitizeReferralCode(value) {
  const normalizedValue = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "");

  return normalizedValue || null;
}

function normalizeReferredByCode(value) {
  if (!value) {
    return null;
  }

  const rawValue = String(value).trim();

  if (!rawValue) {
    return null;
  }

  try {
    const url = new URL(rawValue);
    const queryParams = new URLSearchParams(url.search);

    for (const key of ["startapp", "start_param", "ref"]) {
      const normalizedParamValue = sanitizeReferralCode(queryParams.get(key));

      if (normalizedParamValue) {
        return normalizedParamValue;
      }
    }

    return null;
  } catch {
    return sanitizeReferralCode(rawValue);
  }
}

function buildReferralLink(telegramAppUrl, referralCode) {
  if (!referralCode) {
    return null;
  }

  const referralUrl = new URL(telegramAppUrl);
  referralUrl.searchParams.set("startapp", referralCode);
  return referralUrl.toString();
}

function createPersonalReferralCode() {
  return crypto.randomBytes(6).toString("hex").toUpperCase();
}

function isPlayerOnline(player, onlineWindowSeconds) {
  if (!player?.last_seen_at) {
    return false;
  }

  return Date.now() - new Date(player.last_seen_at).getTime() <= onlineWindowSeconds * 1000;
}

function normalizePlayer(player, { onlineWindowSeconds, telegramAppUrl }) {
  return {
    id: Number(player.id),
    telegramUserId: player.telegram_user_id ? Number(player.telegram_user_id) : null,
    username: player.username ?? null,
    firstName: player.first_name ?? null,
    lastName: player.last_name ?? null,
    displayName: buildDisplayName(player) || player.username || "Игрок",
    authProvider: player.auth_provider,
    referralCode: player.referral_code ?? null,
    referredByCode: player.referred_by_code ?? null,
    referralLink: buildReferralLink(telegramAppUrl, player.referral_code ?? null),
    hasReferral: Boolean(player.has_referral),
    isOnline: isPlayerOnline(player, onlineWindowSeconds),
    authToken: player.auth_token,
    authTokenExpiresAt: player.auth_token_expires_at,
    lastSeenAt: player.last_seen_at ?? null,
  };
}

function withPlayerStatus(player, { isExisting, onlineWindowSeconds, telegramAppUrl }) {
  return {
    ...normalizePlayer(player, { onlineWindowSeconds, telegramAppUrl }),
    isExisting,
  };
}

function verifyAndExtractTelegramUser({
  initData,
  telegramBotToken: _telegramBotToken,
  trustTelegramClientUser: _trustTelegramClientUser,
}) {
  const telegramUser = extractTelegramUserFromInitData(initData);

  if (!telegramUser?.id) {
    throw new HttpError(400, "Telegram initData does not contain user information");
  }

  return telegramUser;
}

export function createAuthService({
  authRepository,
  telegramBotToken,
  trustTelegramClientUser,
  telegramAppUrl,
  authTokenTtlDays,
  playerOnlineWindowSeconds,
}) {
  return {
    async createSession(payload) {
      const input = authSessionSchema.parse(payload);
      const authToken = crypto.randomUUID();
      const authTokenExpiresAt = buildTokenExpiry(authTokenTtlDays);
      const referredByCode = normalizeReferredByCode(input.referralCode);
      const hasReferral = Boolean(referredByCode);
      const lastSeenAt = new Date();

      if (!input.initData) {
        throw new HttpError(400, "Telegram initData is required");
      }

      const telegramUser = verifyAndExtractTelegramUser({
        initData: input.initData,
        telegramBotToken,
        trustTelegramClientUser,
      });

      const existingPlayer = await authRepository.findPlayerByTelegramUserId(
        telegramUser.id,
      );

      const player = await authRepository.upsertTelegramPlayer({
        telegramUserId: telegramUser.id,
        username: telegramUser.username,
        firstName: telegramUser.first_name,
        lastName: telegramUser.last_name,
        authProvider: "telegram_unverified",
        referralCode: existingPlayer?.referral_code ?? createPersonalReferralCode(),
        referredByCode,
        hasReferral,
        authToken,
        authTokenExpiresAt,
        lastSeenAt,
      });

      return withPlayerStatus(player, {
        isExisting: Boolean(existingPlayer),
        onlineWindowSeconds: playerOnlineWindowSeconds,
        telegramAppUrl,
      });
    },

    async getPlayerByToken(authToken) {
      const player = await authRepository.findPlayerByAuthToken(authToken);

      if (!player) {
        throw new HttpError(401, "Invalid authorization token");
      }

      if (new Date(player.auth_token_expires_at).getTime() <= Date.now()) {
        throw new HttpError(401, "Authorization token has expired");
      }

      const touchedPlayer = await authRepository.touchPlayerLastSeen(player.id);
      return normalizePlayer(touchedPlayer ?? player, {
        onlineWindowSeconds: playerOnlineWindowSeconds,
        telegramAppUrl,
      });
    },

    async getPlayerByInitData(initData) {
      const telegramUser = verifyAndExtractTelegramUser({
        initData,
        telegramBotToken,
        trustTelegramClientUser,
      });

      const existingPlayer = await authRepository.findPlayerByTelegramUserId(telegramUser.id);

      if (existingPlayer) {
        const touchedPlayer = await authRepository.touchPlayerLastSeen(existingPlayer.id);
        return normalizePlayer(touchedPlayer ?? existingPlayer, {
          onlineWindowSeconds: playerOnlineWindowSeconds,
          telegramAppUrl,
        });
      }

      const authToken = crypto.randomUUID();
      const authTokenExpiresAt = buildTokenExpiry(authTokenTtlDays);
      const createdPlayer = await authRepository.upsertTelegramPlayer({
        telegramUserId: telegramUser.id,
        username: telegramUser.username,
        firstName: telegramUser.first_name,
        lastName: telegramUser.last_name,
        authProvider: "telegram_unverified",
        referralCode: createPersonalReferralCode(),
        referredByCode: null,
        hasReferral: false,
        authToken,
        authTokenExpiresAt,
        lastSeenAt: new Date(),
      });

      return normalizePlayer(createdPlayer, {
        onlineWindowSeconds: playerOnlineWindowSeconds,
        telegramAppUrl,
      });
    },

    async deletePlayerById(playerId) {
      const deleted = await authRepository.deletePlayerById(playerId);

      if (!deleted) {
        throw new HttpError(404, "Player not found");
      }

      return {
        deleted: true,
      };
    },
  };
}
