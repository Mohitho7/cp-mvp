import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

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
