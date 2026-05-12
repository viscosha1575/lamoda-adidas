import express from "express";

import { createHealthRouter } from "./modules/health/health.routes.js";
import { createProductsRouter } from "./modules/products/products.routes.js";
import { createCorsMiddleware } from "./middlewares/cors.js";
import { errorHandler } from "./middlewares/error-handler.js";
import { notFoundHandler } from "./middlewares/not-found.js";

export function createApp(dependencies) {
  const app = express();

  app.use(
    createCorsMiddleware({
      allowedOrigins: dependencies.config.corsOrigins,
    }),
  );
  app.use(express.json());

  app.get("/", (_request, response) => {
    response.json({
      service: "lamoda-adidas-server",
      status: "ok",
    });
  });

  app.use("/api/health", createHealthRouter(dependencies));
  app.use("/api/auth", dependencies.authRouter);
  app.use("/api/game", dependencies.gameRouter);
  app.use("/api/products", createProductsRouter(dependencies));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
