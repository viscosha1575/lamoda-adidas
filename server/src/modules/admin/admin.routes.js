import { Router } from "express";

import { asyncHandler } from "../../lib/async-handler.js";
import { decryptAdminRequestBody } from "./admin-crypto.js";

export function createAdminRouter({ adminController, config }) {
  const router = Router();

  router.use((request, _response, next) => {
    try {
      request.body = decryptAdminRequestBody(request.body, config.requestBodySecret);
      next();
    } catch (error) {
      next(error);
    }
  });

  router.post("/auth/me", asyncHandler(adminController.authMe));
  router.post("/analytics/overview", asyncHandler(adminController.analyticsOverview));
  router.post("/analytics/players", asyncHandler(adminController.analyticsPlayers));
  router.post("/analytics/player", asyncHandler(adminController.analyticsPlayer));
  router.post("/analytics/utm", asyncHandler(adminController.analyticsUtm));
  router.post("/promo-codes/list", asyncHandler(adminController.promoCodes));
  router.post("/promo-codes/create", asyncHandler(adminController.createPromoCode));
  router.post("/promo-codes/delete-all", asyncHandler(adminController.deleteAllPromoCodes));
  router.post("/raffle/players", asyncHandler(adminController.rafflePlayers));
  router.post("/raffle/winner", asyncHandler(adminController.raffleWinner));
  router.post("/raffle/finish", asyncHandler(adminController.finishRaffle));
  router.post("/raffle/reset", asyncHandler(adminController.resetRaffleWinners));
  router.post("/logs/user", asyncHandler(adminController.playerLogs));
  router.post("/users/delete", asyncHandler(adminController.deletePlayer));

  return router;
}
