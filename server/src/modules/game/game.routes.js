import { Router } from "express";
import { ZodError } from "zod";

import { asyncHandler } from "../../lib/async-handler.js";
import { HttpError } from "../../lib/http-error.js";

export function createGameRouter({ authMiddleware, gameController }) {
  const router = Router();

  router.use(authMiddleware);
  router.get("/subscription-status", asyncHandler(gameController.checkSubscription));
  router.post("/start-session", asyncHandler(gameController.startSession));
  router.post("/found-sneaker", asyncHandler(gameController.collectSneaker));
  router.post("/finish", asyncHandler(gameController.finish));
  router.post("/activity-log", asyncHandler(gameController.logActivity));

  router.use((error, _request, _response, next) => {
    if (error instanceof ZodError) {
      next(new HttpError(400, "Validation error", error.flatten()));
      return;
    }

    next(error);
  });

  return router;
}
