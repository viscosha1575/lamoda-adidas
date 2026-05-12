import { getTelegramInitDataFromHeadersOnly } from "./init-data.js";

export function createAuthController({ authService }) {
  return {
    async createSession(request, response) {
      const initData = getTelegramInitDataFromHeadersOnly(request);
      const payload = initData
        ? { ...request.body, initData }
        : request.body;
      const player = await authService.createSession(payload);

      response.status(201).json({
        data: {
          token: player.authToken,
          expiresAt: player.authTokenExpiresAt,
          player: {
            id: player.id,
            telegramUserId: player.telegramUserId,
            username: player.username,
            displayName: player.displayName,
            authProvider: player.authProvider,
            referralCode: player.referralCode,
            referredByCode: player.referredByCode,
            referralLink: player.referralLink,
            hasReferral: player.hasReferral,
            isOnline: player.isOnline,
            lastSeenAt: player.lastSeenAt,
            isExisting: player.isExisting,
          },
        },
      });
    },

    async deleteCurrentPlayer(request, response) {
      const result = await authService.deletePlayerById(request.player.id);

      response.json({
        data: result,
      });
    },
  };
}
