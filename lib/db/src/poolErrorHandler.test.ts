/**
 * Pool idle-error regression test.
 *
 * Run: pnpm --filter @workspace/scripts run test:poolerror
 * (node:test + tsx; no database connection, no network.)
 *
 * pg purges a dead idle client and re-emits 'error' on the pool. Without a
 * pool-level listener that emit is uncaught and crashes the API process
 * (observed: an idle connection reaped server-side produced "Connection
 * terminated unexpectedly" followed by a process exit). These tests assert
 * the guard listener is attached and that a synthetic idle-client error is
 * logged, not thrown. Importing ./index opens no connection: pg Pool
 * connects lazily and tests never execute queries.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pool } from "./index";

describe("db pool idle error handler", () => {
  it("attaches an error listener to the pool", () => {
    assert.ok(
      pool.listenerCount("error") >= 1,
      "pool must have an 'error' listener so idle-client failures cannot crash the process",
    );
  });

  it("handles a synthetic idle-client error without throwing", () => {
    const err = Object.assign(
      new Error("Connection terminated unexpectedly"),
      { code: "ECONNRESET" },
    );
    assert.doesNotThrow(() => {
      pool.emit("error", err);
    });
  });
});
