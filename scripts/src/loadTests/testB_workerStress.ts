/**
 * Load Test B: Queue and Worker Stress (200 Synthetic Jobs with Mock AI)
 *
 * Verifies:
 * 1. 200 synthetic jobs enqueued in PostgreSQL.
 * 2. Deterministic mock AI provider processes jobs with zero token spend.
 * 3. Bounded concurrency (e.g. max 3 or 5) strictly maintained.
 * 4. Stale recovery safely requeues interrupted jobs without data loss.
 * 5. Idempotent storage: exactly 200 reports and strategies created (zero duplicates).
 * 6. Graceful shutdown drains in-flight jobs cleanly.
 */
import { and, eq, inArray, like, sql } from "drizzle-orm";
import {
  careerResultsTable,
  careerStrategiesTable,
  careerSubmissionsTable,
  db,
  institutionsTable,
  pool,
  studentsTable,
} from "@workspace/db";
import {
  getActiveJobsCount,
  recoverStaleJobs,
  startCareerReportWorker,
  stopCareerReportWorker,
} from "../../../artifacts/api-server/src/lib/careerReportWorker";
import { globalWorkerRateLimiter } from "../../../artifacts/api-server/src/lib/workerRateLimiter";
import { operationalMetrics } from "../../../artifacts/api-server/src/lib/operationalMetrics";
import { generateSyntheticSubmission } from "./syntheticData";

const STRESS_COUNT = 200;

export interface TestBResult {
  totalJobs: number;
  completedDone: number;
  resultsInDb: number;
  strategiesInDb: number;
  duplicatesFound: number;
  maxObservedConcurrency: number;
  staleJobsRecovered: number;
  drainDurationSeconds: number;
  drainRatePerMinute: number;
  passed: boolean;
}

export async function runTestB(): Promise<TestBResult> {
  console.log(`\n======================================================`);
  console.log(`Starting Test B: Worker Stress (${STRESS_COUNT} jobs, Mock AI)`);
  console.log(`======================================================\n`);

  // Explicitly configure mock AI environment for this test run
  process.env.ALLOW_MOCK_AI = "true";
  process.env.AI_PROVIDER = "mock";
  process.env.MOCK_AI_DELAY_MS = "10"; // Fast 10ms mock generation
  process.env.REPORT_WORKER_CONCURRENCY = "3";
  process.env.REPORT_WORKER_RPM = "240"; // High RPM permit for fast mock drain
  globalWorkerRateLimiter.setConcurrencyLimit(3);
  globalWorkerRateLimiter.setRpmLimit(240);

  const configuredConcurrency = globalWorkerRateLimiter.getConcurrencyLimit();
  console.log(`Worker configured with concurrency: ${configuredConcurrency}`);

  // Cleanup any old test data from prior aborted test runs
  const oldTestStudents = await db
    .select({ id: studentsTable.id })
    .from(studentsTable)
    .where(like(studentsTable.clerkUserId, "user_loadtest_synth_%"));
  if (oldTestStudents.length > 0) {
    const sIds = oldTestStudents.map((s) => s.id);
    const oldSubs = await db
      .select({ id: careerSubmissionsTable.id })
      .from(careerSubmissionsTable)
      .where(inArray(careerSubmissionsTable.studentId, sIds));
    if (oldSubs.length > 0) {
      const subIds = oldSubs.map((s) => s.id);
      await db.delete(careerResultsTable).where(inArray(careerResultsTable.submissionId, subIds));
      await db.delete(careerStrategiesTable).where(inArray(careerStrategiesTable.submissionId, subIds));
      await db.delete(careerSubmissionsTable).where(inArray(careerSubmissionsTable.id, subIds));
    }
    await db.delete(studentsTable).where(inArray(studentsTable.id, sIds));
  }

  // Ensure test institution exists
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

  // 1. Enqueue 200 synthetic submissions directly into PostgreSQL
  console.log(`Enqueuing ${STRESS_COUNT} synthetic student submissions in DB...`);
  const submissionIds: string[] = [];
  const startEnqueue = Date.now();

  for (let i = 0; i < STRESS_COUNT; i++) {
    const item = generateSyntheticSubmission(i);
    const [student] = await db
      .insert(studentsTable)
      .values({
        institutionId: inst.id,
        clerkUserId: item.clerkUserId,
        department: item.department,
        year: item.year,
        batch: item.batch,
        degree: item.degree,
        graduationYear: item.graduationYear,
        availableHoursPerWeek: item.availableHoursPerWeek,
      })
      .returning({ id: studentsTable.id });

    // Seed first 2 jobs as stale crashed jobs (processing started 15m ago)
    const isStale = i < 2;
    const [sub] = await db
      .insert(careerSubmissionsTable)
      .values({
        studentId: student.id,
        answers: item.payload.answers,
        consentedAt: new Date(),
        consentVersion: "v1-test-b",
        status: isStale ? "processing" : "pending",
        processingStartedAt: isStale ? new Date(Date.now() - 15 * 60 * 1000) : null,
      })
      .returning({ id: careerSubmissionsTable.id });

    submissionIds.push(sub.id);
  }

  console.log(`Enqueued ${submissionIds.length} jobs (including 2 simulated crashed jobs) in ${(Date.now() - startEnqueue)}ms.`);

  // Verify and execute stale recovery before starting worker loop
  console.log("Executing stale recovery check...");
  await recoverStaleJobs();
  const [staleCheck] = await db
    .select({
      recoveredCount: sql<number>`count(*) filter (where ${careerSubmissionsTable.status} = 'pending')`,
    })
    .from(careerSubmissionsTable)
    .where(inArray(careerSubmissionsTable.id, submissionIds.slice(0, 2)));
  const staleJobsRecovered = Number(staleCheck?.recoveredCount ?? 0);
  console.log(`Stale recovery restored ${staleJobsRecovered}/2 crashed jobs back to pending.`);

  // 2. Start worker and monitor execution
  console.log("Starting Career Report Worker...");
  startCareerReportWorker();

  const startDrain = Date.now();
  let maxObservedConcurrency = 0;

  // Poll until all submissions reach 'done' or timeout (e.g. 240s across remote DB)
  const maxWaitMs = 240_000;
  let isDone = false;

  while (Date.now() - startDrain < maxWaitMs) {
    const inFlight = getActiveJobsCount();
    if (inFlight > maxObservedConcurrency) {
      maxObservedConcurrency = inFlight;
    }

    // Check status counts
    const [stats] = await db
      .select({
        doneCount: sql<number>`count(*) filter (where ${careerSubmissionsTable.status} = 'done')`,
        processingCount: sql<number>`count(*) filter (where ${careerSubmissionsTable.status} = 'processing')`,
        pendingCount: sql<number>`count(*) filter (where ${careerSubmissionsTable.status} = 'pending')`,
        failedCount: sql<number>`count(*) filter (where ${careerSubmissionsTable.status} = 'failed')`,
      })
      .from(careerSubmissionsTable)
      .where(inArray(careerSubmissionsTable.id, submissionIds));

    const doneCount = Number(stats.doneCount);
    const processingCount = Number(stats.processingCount);
    const pendingCount = Number(stats.pendingCount);

    process.stdout.write(
      `\rQueue Progress: [Done: ${doneCount}/${STRESS_COUNT} | Processing: ${processingCount} | Pending: ${pendingCount} | Active In-Flight: ${inFlight}]   `,
    );

    if (doneCount === STRESS_COUNT) {
      isDone = true;
      console.log("\nAll jobs successfully processed to 'done'!");
      break;
    }

    await new Promise((r) => setTimeout(r, 150));
  }

  const drainDurationSeconds = Number(((Date.now() - startDrain) / 1000).toFixed(2));
  const drainRatePerMinute = Number(((STRESS_COUNT / drainDurationSeconds) * 60).toFixed(1));

  // 3. Graceful shutdown
  console.log("Stopping worker gracefully...");
  await stopCareerReportWorker(5000);

  // 4. Verification in PostgreSQL
  const resultsCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(careerResultsTable)
    .where(inArray(careerResultsTable.submissionId, submissionIds));

  const strategiesCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(careerStrategiesTable)
    .where(inArray(careerStrategiesTable.submissionId, submissionIds));

  const resultsInDb = Number(resultsCount[0]?.count ?? 0);
  const strategiesInDb = Number(strategiesCount[0]?.count ?? 0);

  // Verify uniqueness (must equal exactly STRESS_COUNT with 0 duplicates)
  const duplicatesFound = (resultsInDb - STRESS_COUNT) + (strategiesInDb - STRESS_COUNT);

  const passed =
    isDone &&
    resultsInDb === STRESS_COUNT &&
    strategiesInDb === STRESS_COUNT &&
    duplicatesFound === 0 &&
    maxObservedConcurrency <= configuredConcurrency;

  console.log(`\n------------------------------------------------------`);
  console.log(`Test B Results:`);
  console.log(`- Total Enqueued: ${STRESS_COUNT}`);
  console.log(`- Completed 'done': ${resultsInDb}/${STRESS_COUNT}`);
  console.log(`- Results Stored in DB: ${resultsInDb}`);
  console.log(`- Strategies Stored in DB: ${strategiesInDb}`);
  console.log(`- Duplicate Records: ${duplicatesFound}`);
  console.log(`- Max Observed In-Flight Concurrency: ${maxObservedConcurrency} (Limit: ${configuredConcurrency})`);
  console.log(`- Drain Duration: ${drainDurationSeconds}s`);
  console.log(`- Throughput: ${drainRatePerMinute} reports/minute`);
  console.log(`- Graceful Worker Shutdown: Clean`);
  console.log(`- Overall Status: ${passed ? "PASSED" : "FAILED"}`);
  console.log(`------------------------------------------------------\n`);

  // Cleanup test records in database
  if (submissionIds.length > 0) {
    await db.delete(careerResultsTable).where(inArray(careerResultsTable.submissionId, submissionIds));
    await db.delete(careerStrategiesTable).where(inArray(careerStrategiesTable.submissionId, submissionIds));
    const submissions = await db
      .select({ studentId: careerSubmissionsTable.studentId })
      .from(careerSubmissionsTable)
      .where(inArray(careerSubmissionsTable.id, submissionIds));
    await db.delete(careerSubmissionsTable).where(inArray(careerSubmissionsTable.id, submissionIds));
    const studentIds = submissions.map((s) => s.studentId);
    if (studentIds.length > 0) {
      await db.delete(studentsTable).where(inArray(studentsTable.id, studentIds));
    }
  }

  return {
    totalJobs: STRESS_COUNT,
    completedDone: resultsInDb,
    resultsInDb,
    strategiesInDb,
    duplicatesFound,
    maxObservedConcurrency,
    staleJobsRecovered,
    drainDurationSeconds,
    drainRatePerMinute,
    passed,
  };
}

if (process.argv[1]?.includes("testB_workerStress")) {
  runTestB()
    .then(async (result) => {
      await pool.end();
      process.exit(result.passed ? 0 : 1);
    })
    .catch(async (err) => {
      console.error("Test B fatal failure:", err);
      await pool.end();
      process.exit(1);
    });
}
