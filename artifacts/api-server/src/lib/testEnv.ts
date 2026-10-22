// Test-only setup: allow importing server modules without a live database.
// No connection is opened at import time; tests never execute queries.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://localhost:5432/career_pathfinder_test";
}
