import { HttpError } from "../lib/http-error.js";
import { getTelegramInitDataFromHeadersOnly } from "../modules/auth/init-data.js";

export function createAuthMiddleware({ authService }) {
  return async function authMiddleware(request, _response, next) {
    const authorizationHeader = request.headers.authorization ?? "";
    const [scheme, token] = authorizationHeader.split(" ");

    try {
      const initDataFromRequest = getTelegramInitDataFromHeadersOnly(request);
      let player = null;

      if (scheme === "Bearer" && token) {
        player = await authService.getPlayerByToken(token);
      } else if (initDataFromRequest) {
        player = await authService.getPlayerByInitData(String(initDataFromRequest));
      }

      if (!player) {
        next(new HttpError(401, "Authorization token or initData is required"));
        return;
      }

      request.player = player;
      next();
    } catch (error) {
      next(error);
    }
  };
}
