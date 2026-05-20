import { createAdminController } from "./modules/admin/admin.controller.js";
import { createAdminRepository } from "./modules/admin/admin.repository.js";
import { createAdminRouter } from "./modules/admin/admin.routes.js";
import { createAdminService } from "./modules/admin/admin.service.js";
import { createAuthController } from "./modules/auth/auth.controller.js";
import { createAuthRepository } from "./modules/auth/auth.repository.js";
import { createAuthRouter } from "./modules/auth/auth.routes.js";
import { createAuthService } from "./modules/auth/auth.service.js";
import { createGameController } from "./modules/game/game.controller.js";
import { createGameRepository } from "./modules/game/game.repository.js";
import { createGameRouter } from "./modules/game/game.routes.js";
import { createGameService } from "./modules/game/game.service.js";
import { createTelegramSubscriptionChecker } from "./modules/game/telegram-subscription.js";
import { createAuthMiddleware } from "./middlewares/auth.js";
import { createAdminAuthMiddleware } from "./middlewares/admin-auth.js";

export function buildDependencies({ pool, config }) {
  const adminRepository = createAdminRepository({ pool });
  const adminService = createAdminService({
    adminRepository,
    config,
  });
  const adminController = createAdminController({ adminService });

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
  const telegramSubscriptionChecker = createTelegramSubscriptionChecker({
    botToken: config.telegramGameBotToken,
    chatId: config.telegramSubscriptionChatId,
    channelUrl: config.telegramSubscriptionUrl,
  });
  const gameService = createGameService({
    gameRepository,
    gameDurationSeconds: config.gameDurationSeconds,
    heartbeatGraceSeconds: config.heartbeatGraceSeconds,
    playerOnlineWindowSeconds: config.playerOnlineWindowSeconds,
    telegramSubscriptionChecker,
  });
  const gameController = createGameController({ gameService });
  const authController = createAuthController({ authService, gameService });
  const authMiddleware = createAuthMiddleware({ authService });
  const adminAuthMiddleware = createAdminAuthMiddleware({
    adminTelegramBotToken: config.adminTelegramBotToken,
    allowedTelegramIds: config.adminTelegramIds,
  });

  return {
    pool,
    adminController,
    adminRouter: createAdminRouter({ adminController, config, adminAuthMiddleware }),
    adminService,
    adminAuthMiddleware,
    authController,
    authService,
    authMiddleware,
    authRouter: createAuthRouter({ authController, authMiddleware }),
    gameController,
    gameRouter: createGameRouter({ authMiddleware, gameController }),
  };
}
