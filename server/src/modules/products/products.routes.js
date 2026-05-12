import { Router } from "express";
import { ZodError } from "zod";

import { asyncHandler } from "../../lib/async-handler.js";
import { HttpError } from "../../lib/http-error.js";

export function createProductsRouter({ productsController }) {
  const router = Router();

  router.get("/", asyncHandler(productsController.getAll));
  router.get("/:id", asyncHandler(productsController.getById));
  router.post("/", asyncHandler(productsController.create));

  router.use((error, _request, _response, next) => {
    if (error instanceof ZodError) {
      return next(new HttpError(400, "Validation error", error.flatten()));
    }

    return next(error);
  });

  return router;
}
