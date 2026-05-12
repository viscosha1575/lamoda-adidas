import { HttpError } from "../lib/http-error.js";
import { getTelegramInitDataFromHeadersOnly } from "../modules/auth/init-data.js";

export function createAuthMiddleware({ authService }) {
  return async function authMiddleware(request, _response, next) {
    try {
      const initDataFromRequest = getTelegramInitDataFromHeadersOnly(request);

      if (!initDataFromRequest) {
        next(new HttpError(401, "Telegram initData header is required"));
        return;
      }

      const player = await authService.getPlayerByInitData(String(initDataFromRequest));
      request.player = player;
      next();
    } catch (error) {
      next(error);
    }
  };
}
