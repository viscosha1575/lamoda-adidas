import { createApp } from "./app.js";
import { loadConfig } from "./config/env.js";
import { createPool, closePool } from "./db/pool.js";
import { runMigrations } from "./db/run-migrations.js";
import { buildDependencies } from "./dependencies.js";

const config = loadConfig();
const pool = createPool(config.database);

async function bootstrap() {
  await runMigrations(pool);

  const dependencies = buildDependencies({ pool, config });
  dependencies.config = config;
  const app = createApp(dependencies);

  const server = app.listen(config.port, () => {
    console.log(`Server is running on http://localhost:${config.port}`);
  });

  const shutdown = async (signal) => {
    console.log(`Received ${signal}, shutting down gracefully`);

    server.close(async () => {
      await closePool(pool);
      process.exit(0);
    });
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

bootstrap().catch(async (error) => {
  console.error("Failed to start server", error);
  await closePool(pool);
  process.exit(1);
});
