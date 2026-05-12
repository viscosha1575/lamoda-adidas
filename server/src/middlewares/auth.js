import { HttpError } from "../lib/http-error.js";

export function createAuthMiddleware({ authService }) {
  return async function authMiddleware(request, _response, next) {
    const authorizationHeader = request.headers.authorization ?? "";
    const [scheme, token] = authorizationHeader.split(" ");
    const initDataFromRequest = request.headers["x-telegram-init-data"]
      ?? request.headers["x-init-data"]
      ?? request.body?.initData
      ?? request.query?.initData
      ?? null;

    try {
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
