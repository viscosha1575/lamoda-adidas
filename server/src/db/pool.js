import pg from "pg";

const { Pool } = pg;

export function createPool(databaseConfig) {
  if (databaseConfig?.connectionString) {
    return new Pool({
      connectionString: databaseConfig.connectionString,
    });
  }

  return new Pool({
    host: databaseConfig.host,
    port: databaseConfig.port,
    database: databaseConfig.database,
    user: databaseConfig.user,
    password: databaseConfig.password,
  });
}

export async function closePool(pool) {
  if (!pool) {
    return;
  }

  await pool.end();
}
