import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";

let pool: Pool | null = null;
let database: NodePgDatabase<typeof schema> | null = null;

/**
 * Module-level singleton so warm serverless instances reuse connections.
 * Use a pooled DATABASE_URL (e.g. Neon `-pooler`) in production.
 */
export function getDb(): NodePgDatabase<typeof schema> {
  if (database) return database;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is required.");
  }
  pool = new Pool({ connectionString, max: 3 });
  database = drizzle(pool, { schema });
  return database;
}

export async function closeDb(): Promise<void> {
  database = null;
  if (pool) {
    const current = pool;
    pool = null;
    await current.end();
  }
}
