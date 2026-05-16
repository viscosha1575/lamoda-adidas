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

function sanitizeStartParam(value) {
  const normalizedValue = String(value ?? "")
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, "");

  return normalizedValue || null;
}

function sanitizeUtmSlug(value) {
  const normalizedValue = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");

  return normalizedValue || null;
}

function extractStartParam(value) {
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
      const normalizedParamValue = sanitizeStartParam(queryParams.get(key));

      if (normalizedParamValue) {
        return normalizedParamValue;
      }
    }

    return null;
  } catch {
    return sanitizeStartParam(rawValue);
  }
}

function normalizeReferredByCode(value) {
  return sanitizeReferralCode(extractStartParam(value));
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
    utmSlug: player.utm_slug ?? null,
    referralLink: buildReferralLink(telegramAppUrl, player.referral_code ?? null),
    hasReferral: Boolean(player.has_referral),
    subscribedToChannel: Boolean(player.subscribed_to_channel),
    gameCompletionState: player.game_completion_state ?? null,
    raffleWon: typeof player.raffle_won === "boolean" ? player.raffle_won : null,
    codeId: player.code_id ?? null,
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
      const startParam = extractStartParam(input.startParam ?? input.referralCode);
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
      const referralCodeCandidate = sanitizeReferralCode(startParam);
      const referralOwner = referralCodeCandidate
        ? await authRepository.findPlayerByReferralCode(referralCodeCandidate)
        : null;
      const referredByCode = referralOwner ? referralCodeCandidate : null;
      const utmSlug = referredByCode ? null : sanitizeUtmSlug(startParam);
      const hasReferral = Boolean(referredByCode);
      const isNewReferral = Boolean(referredByCode) && !existingPlayer?.referred_by_code;

      const player = await authRepository.upsertTelegramPlayer({
        telegramUserId: telegramUser.id,
        username: telegramUser.username,
        firstName: telegramUser.first_name,
        lastName: telegramUser.last_name,
        authProvider: "telegram_unverified",
        referralCode: existingPlayer?.referral_code ?? createPersonalReferralCode(),
        referredByCode,
        hasReferral,
        utmSlug,
        authToken,
        authTokenExpiresAt,
        lastSeenAt,
      });

      if (utmSlug) {
        await authRepository.trackPlayerUtmVisit(
          player.id,
          utmSlug,
          Boolean(existingPlayer),
        );
      }

      return {
        ...withPlayerStatus(player, {
          isExisting: Boolean(existingPlayer),
          onlineWindowSeconds: playerOnlineWindowSeconds,
          telegramAppUrl,
        }),
        referredPlayerId: referralOwner?.id ? Number(referralOwner.id) : null,
        referralApplied: isNewReferral && Boolean(referralOwner?.id),
      };
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
          isExisting: Boolean(existingPlayer),
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

    async simulateReferralForPlayer(playerId) {
      const currentPlayer = await authRepository.findPlayerById(playerId);

      if (!currentPlayer) {
        throw new HttpError(404, "Player not found");
      }

      if (currentPlayer.referred_by_code) {
        return {
          ...normalizePlayer(currentPlayer, {
            onlineWindowSeconds: playerOnlineWindowSeconds,
            telegramAppUrl,
          }),
          referredPlayerId: null,
          referralApplied: false,
        };
      }

      const referralOwner = await authRepository.findReferralOwnerForSimulation(playerId);

      if (!referralOwner?.referral_code) {
        throw new HttpError(409, "No referral owner available for simulation");
      }

      const player = await authRepository.applyReferralById(playerId, referralOwner.referral_code);

      if (!player) {
        throw new HttpError(404, "Player not found");
      }

      return {
        ...normalizePlayer(player, {
          onlineWindowSeconds: playerOnlineWindowSeconds,
          telegramAppUrl,
        }),
        referredPlayerId: Number(referralOwner.id),
        referralApplied: true,
      };
    },
  };
}
