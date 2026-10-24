import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const poolMax = Math.max(
  1,
  parseInt(process.env.DB_POOL_MAX || "10", 10) || 10,
);
const poolMin = Math.max(
  0,
  parseInt(process.env.DB_POOL_MIN || "0", 10) || 0,
);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: poolMax,
  min: poolMin,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 30_000,
});

export function getPoolStats() {
  return {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
    max: poolMax,
    min: poolMin,
  };
}

// Idle pooled clients can die at any time (server-side idle timeout, e.g. the
// Neon pooler reaping idle connections, or transient network drops). pg
// purges the dead client and re-emits 'error' on the pool, so without this
// listener the event is uncaught and crashes the process. Log message/code
// only: never credentials or connection strings.
pool.on("error", (err) => {
  const message = err instanceof Error ? err.message : String(err);
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? String((err as { code: unknown }).code)
      : undefined;
  console.error(
    `[db] idle PostgreSQL client error${code ? ` (${code})` : ""}: ${message}`,
  );
});

export const db = drizzle(pool, { schema });

export * from "./schema";
