/**
 * Load Test A: API Burst Simulation (200 Students within 60 Seconds)
 *
 * Verifies:
 * 1. 200 valid synthetic submissions are accepted with 201 Created within 60 seconds.
 * 2. Express server, connection pool, and PostgreSQL transactions remain stable under load.
 * 3. Duplicate submissions are rejected with 409 Conflict without duplicate records.
 * 4. Zero crashes, zero lost submissions, zero 5xx responses.
 */
import http from "node:http";
import { and, eq, inArray } from "drizzle-orm";
import app from "../../../artifacts/api-server/src/app";
import {
  careerSubmissionsTable,
  db,
  institutionsTable,
  pool,
  studentsTable,
} from "@workspace/db";
import { generateSyntheticSubmission } from "./syntheticData";

const BURST_COUNT = 200;
const TIMEOUT_MS = 60_000;

export interface TestAResult {
  totalSent: number;
  accepted201: number;
  conflict409: number;
  errors5xx: number;
  otherErrors: number;
  durationsMs: number[];
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  totalTimeSeconds: number;
  dbSubmissionsFound: number;
  passed: boolean;
}

export async function runTestA(): Promise<TestAResult> {
  console.log(`\n======================================================`);
  console.log(`Starting Test A: API Burst (${BURST_COUNT} students within 60s)`);
  console.log(`======================================================\n`);

  // Ensure institution exists
  const instName = process.env.CAREER_INSTITUTION_NAME || "Hyderabad Institute of Technology and Management (HITAM)";
  let [inst] = await db
    .select({ id: institutionsTable.id })
    .from(institutionsTable)
    .where(eq(institutionsTable.name, instName))
    .limit(1);

  if (!inst) {
    [inst] = await db
      .insert(institutionsTable)
      .values({ name: instName })
      .returning({ id: institutionsTable.id });
  }

  // Start temporary test server
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}/api`;

  console.log(`Test API listening at ${baseUrl}`);

  const startOverall = Date.now();
  const createdUserIds: string[] = [];
  const latencies: number[] = [];
  let accepted201 = 0;
  let conflict409 = 0;
  let errors5xx = 0;
  let otherErrors = 0;

  // Generate 200 synthetic student payloads
  const syntheticItems = Array.from({ length: BURST_COUNT }, (_, i) => generateSyntheticSubmission(i));

  // Dispatch requests in concurrent batches (e.g. 20 concurrent connections)
  const CONCURRENT_CLIENTS = 20;
  let cursor = 0;

  async function clientWorker(): Promise<void> {
    while (true) {
      const idx = cursor++;
      if (idx >= syntheticItems.length) break;

      const item = syntheticItems[idx];
      createdUserIds.push(item.clerkUserId);

      const reqStart = Date.now();
      try {
        const response = await fetch(`${baseUrl}/submissions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // Pass synthetic clerk user ID via test header
            "x-test-clerk-user": item.clerkUserId,
          },
          body: JSON.stringify(item.payload),
        });

        const reqDuration = Date.now() - reqStart;
        latencies.push(reqDuration);

        if (response.status === 201) {
          accepted201++;
        } else if (response.status === 409) {
          conflict409++;
        } else if (response.status >= 500) {
          errors5xx++;
          const body = await response.text();
          console.error(`5xx Error on item ${idx}: Status ${response.status}`, body);
        } else {
          otherErrors++;
          const body = await response.text();
          console.warn(`Unexpected status ${response.status} on item ${idx}:`, body);
        }
      } catch (fetchErr) {
        errors5xx++;
        console.error(`Network fetch error on item ${idx}:`, fetchErr);
      }
    }
  }

  // Run all concurrent client workers
  await Promise.all(Array.from({ length: CONCURRENT_CLIENTS }, () => clientWorker()));

  const totalTimeSeconds = Number(((Date.now() - startOverall) / 1000).toFixed(2));

  // Test duplicate submission idempotency (test 5 duplicates)
  console.log("Testing duplicate submission handling (expecting 409 Conflict)...");
  let duplicateConflicts = 0;
  for (let i = 0; i < 5; i++) {
    const item = syntheticItems[i];
    const res = await fetch(`${baseUrl}/submissions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-clerk-user": item.clerkUserId,
      },
      body: JSON.stringify(item.payload),
    });
    if (res.status === 409) {
      duplicateConflicts++;
    }
  }

  // Verify database count of created submissions
  const foundInDb = await db
    .select({ id: careerSubmissionsTable.id })
    .from(careerSubmissionsTable)
    .innerJoin(studentsTable, eq(careerSubmissionsTable.studentId, studentsTable.id))
    .where(inArray(studentsTable.clerkUserId, createdUserIds));

  // Compute latency percentiles
  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)] ?? 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? 0;
  const max = latencies[latencies.length - 1] ?? 0;

  // Cleanup test server
  await new Promise<void>((resolve) => server.close(() => resolve()));

  const passed =
    accepted201 === BURST_COUNT &&
    errors5xx === 0 &&
    foundInDb.length === BURST_COUNT &&
    duplicateConflicts === 5 &&
    totalTimeSeconds <= 60;

  console.log(`\n------------------------------------------------------`);
  console.log(`Test A Results:`);
  console.log(`- Submissions Sent: ${BURST_COUNT}`);
  console.log(`- 201 Created: ${accepted201}`);
  console.log(`- 5xx Server Errors: ${errors5xx}`);
  console.log(`- Other Errors: ${otherErrors}`);
  console.log(`- Total Time: ${totalTimeSeconds}s (Limit: 60s)`);
  console.log(`- Latency p50: ${p50}ms | p95: ${p95}ms | max: ${max}ms`);
  console.log(`- Database Submissions Verified: ${foundInDb.length}/${BURST_COUNT}`);
  console.log(`- Duplicate 409 Conflicts Handled: ${duplicateConflicts}/5`);
  console.log(`- Overall Status: ${passed ? "PASSED" : "FAILED"}`);
  console.log(`------------------------------------------------------\n`);

  // Cleanup test records after successful verification so queue is clean for worker tests
  if (foundInDb.length > 0) {
    const subIds = foundInDb.map((s) => s.id);
    await db.delete(careerSubmissionsTable).where(inArray(careerSubmissionsTable.id, subIds));
    const students = await db
      .select({ id: studentsTable.id })
      .from(studentsTable)
      .where(inArray(studentsTable.clerkUserId, createdUserIds));
    if (students.length > 0) {
      await db.delete(studentsTable).where(inArray(studentsTable.id, students.map((s) => s.id)));
    }
  }

  return {
    totalSent: BURST_COUNT,
    accepted201,
    conflict409,
    errors5xx,
    otherErrors,
    durationsMs: latencies,
    p50Ms: p50,
    p95Ms: p95,
    maxMs: max,
    totalTimeSeconds,
    dbSubmissionsFound: foundInDb.length,
    passed,
  };
}

if (process.argv[1]?.includes("testA_apiBurst")) {
  runTestA()
    .then(async (result) => {
      await pool.end();
      process.exit(result.passed ? 0 : 1);
    })
    .catch(async (err) => {
      console.error("Test A fatal failure:", err);
      await pool.end();
      process.exit(1);
    });
}
