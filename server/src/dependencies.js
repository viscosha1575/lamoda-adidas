import { createAuthController } from "./modules/auth/auth.controller.js";
import { createAuthRepository } from "./modules/auth/auth.repository.js";
import { createAuthRouter } from "./modules/auth/auth.routes.js";
import { createAuthService } from "./modules/auth/auth.service.js";
import { createGameController } from "./modules/game/game.controller.js";
import { createGameRepository } from "./modules/game/game.repository.js";
import { createGameRouter } from "./modules/game/game.routes.js";
import { createGameService } from "./modules/game/game.service.js";
import { createAuthMiddleware } from "./middlewares/auth.js";

export function buildDependencies({ pool, config }) {
  const authRepository = createAuthRepository({ pool });
  const authService = createAuthService({
    authRepository,
    telegramBotToken: config.telegramBotToken,
    trustTelegramClientUser: config.trustTelegramClientUser,
    telegramAppUrl: config.telegramAppUrl,
    authTokenTtlDays: config.authTokenTtlDays,
    playerOnlineWindowSeconds: config.playerOnlineWindowSeconds,
  });

  const gameRepository = createGameRepository({ pool });
  const gameService = createGameService({
    gameRepository,
    gameDurationSeconds: config.gameDurationSeconds,
    heartbeatGraceSeconds: config.heartbeatGraceSeconds,
    playerOnlineWindowSeconds: config.playerOnlineWindowSeconds,
  });
  const gameController = createGameController({ gameService });
  const authController = createAuthController({ authService, gameService });
  const authMiddleware = createAuthMiddleware({ authService });

  return {
    pool,
    authController,
    authService,
    authMiddleware,
    authRouter: createAuthRouter({ authController, authMiddleware }),
    gameController,
    gameRouter: createGameRouter({ authMiddleware, gameController }),
  };
}
