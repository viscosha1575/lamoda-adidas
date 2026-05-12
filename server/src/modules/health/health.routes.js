import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler.js";

export function createHealthRouter({ pool }) {
  const router = Router();

  router.get(
    "/",
    asyncHandler(async (_request, response) => {
      await pool.query("SELECT 1");

      response.json({
        status: "ok",
        database: "connected",
      });
    }),
  );

  return router;
}
