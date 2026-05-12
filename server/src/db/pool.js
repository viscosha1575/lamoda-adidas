import pg from "pg";

const { Pool } = pg;

export function createPool(connectionString) {
  return new Pool({
    connectionString,
  });
}

export async function closePool(pool) {
  if (!pool) {
    return;
  }

  await pool.end();
}
