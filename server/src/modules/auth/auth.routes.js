import { Router } from "express";
import { ZodError } from "zod";

import { asyncHandler } from "../../lib/async-handler.js";
import { HttpError } from "../../lib/http-error.js";

export function createAuthRouter({ authController, authMiddleware }) {
  const router = Router();

  router.post("/session", asyncHandler(authController.createSession));
  router.patch("/current/referral", authMiddleware, asyncHandler(authController.updateCurrentPlayerReferralStatus));
  router.delete("/current", authMiddleware, asyncHandler(authController.deleteCurrentPlayer));

  router.use((error, _request, _response, next) => {
    if (error instanceof ZodError) {
      next(new HttpError(400, "Validation error", error.flatten()));
      return;
    }

    next(error);
  });

  return router;
}
