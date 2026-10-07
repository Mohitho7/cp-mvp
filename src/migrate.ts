import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { loadEnvFile, requiredEnv } from "./env.js";
import { closeDb } from "./db.js";

loadEnvFile();
loadEnvFile(".env.local");

/**
 * Applies plain-SQL migrations from ./drizzle in filename order.
 * Each file may contain multiple statements separated by
 * `--> statement-breakpoint` (drizzle-kit convention).
 */
async function migrate(): Promise<void> {
  const connectionString = requiredEnv("DATABASE_URL");
  const dir = path.resolve(process.cwd(), "drizzle");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  if (files.length === 0) {
    throw new Error("No migration files found in ./drizzle.");
  }
  const pool = new Pool({ connectionString, max: 1 });
  try {
    for (const file of files) {
      const raw = fs.readFileSync(path.join(dir, file), "utf8");
      const statements = raw
        .split(/-->\s*statement-breakpoint/g)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      console.info(`Applying ${file} (${statements.length} statements)...`);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (const statement of statements) {
          await client.query(statement);
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }
    console.info(`Migrations complete (${files.length} files).`);
  } finally {
    await pool.end();
    await closeDb();
  }
}

migrate().catch((error: unknown) => {
  console.error("Migration failed.", error);
  process.exitCode = 1;
});
