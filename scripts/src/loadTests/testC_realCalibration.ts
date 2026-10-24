/**
 * Load Test C: Real-Provider Calibration (Controlled Batch against Gemini)
 *
 * Runs a small batch (3 synthetic reports) against the configured real Gemini provider
 * to measure actual response latency, tokens per report, and potential rate limits,
 * then calculates safe concurrency, total token spend, and queue drain time for 200 students.
 */
import { createReportProvider } from "../../../artifacts/api-server/src/lib/ai/aiProvider";
import {
  archetypeForSubmission,
  buildReportParts,
  explanationForSubmission,
  strategyForSubmission,
  type ClaimedSubmission,
  type ReportJob,
} from "../../../artifacts/api-server/src/lib/careerReportWorker";
import { careerReportJsonSchema, careerReportSchema } from "../../../artifacts/api-server/src/lib/careerReportSchema";
import { mergeDeterministicReport } from "../../../artifacts/api-server/src/lib/careerStrategy/careerDirection";
import { CAREERS } from "../../../artifacts/api-server/src/lib/careerStrategy/catalog";
import { generateSyntheticSubmission } from "./syntheticData";

const CALIBRATION_BATCH_SIZE = 3;

export interface CalibrationResult {
  providerName: string;
  model: string;
  batchSize: number;
  avgDurationMs: number;
  avgInputTokens: number;
  avgOutputTokens: number;
  avgTotalTokens: number;
  estimated200Tokens: number;
  estimated200CostUsd: number;
  safeConcurrency: number;
  estimated200DrainMinutes: number;
  sampleReportsPassed: number;
  passed: boolean;
}

export async function runTestC(): Promise<CalibrationResult> {
  console.log(`\n======================================================`);
  console.log(`Starting Test C: Real-Provider Calibration (${CALIBRATION_BATCH_SIZE} sample reports)`);
  console.log(`======================================================\n`);

  // Ensure real provider is selected
  const provider = createReportProvider();
  console.log(`Active Provider: ${provider.provider} | Model: ${provider.model}`);

  const durations: number[] = [];
  const inputTokensList: number[] = [];
  const outputTokensList: number[] = [];
  let passedCount = 0;

  for (let i = 0; i < CALIBRATION_BATCH_SIZE; i++) {
    const item = generateSyntheticSubmission(i);
    const mockClaimedJob: ClaimedSubmission = {
      id: `calib-job-${i + 1}`,
      attemptCount: 1,
      attemptNumber: 1,
      answers: item.payload.answers,
      department: item.department,
      year: item.year,
      batch: item.batch,
      studentContext: {
        degree: item.degree,
        graduationYear: item.graduationYear,
        availableHoursPerWeek: item.availableHoursPerWeek,
      },
      institutionName: "HITAM Test Calibration",
    };

    console.log(`[Sample ${i + 1}/${CALIBRATION_BATCH_SIZE}] Computing strategy & generating real report with ${provider.model}...`);
    const stratStart = Date.now();
    const strategy = strategyForSubmission(mockClaimedJob);
    const explanation = explanationForSubmission(mockClaimedJob, strategy);
    const reportJob: ReportJob = { ...mockClaimedJob, strategy, explanation };
    const parts = buildReportParts(reportJob);

    const callStart = Date.now();
    try {
      const generation = await provider.generateStructuredReport({
        systemText: parts.systemText,
        userJson: JSON.stringify(parts.userPayload, null, 2),
        schemaName: "career_discovery_report",
        jsonSchema: careerReportJsonSchema,
        maxTokens: 8192,
      });

      const callDuration = Date.now() - callStart;
      durations.push(callDuration);
      inputTokensList.push(generation.inputTokens);
      outputTokensList.push(generation.outputTokens);

      console.log(
        `✓ Sample ${i + 1} completed in ${callDuration}ms (In: ${generation.inputTokens} tokens, Out: ${generation.outputTokens} tokens)`,
      );

      // Verify report validity and deterministic merge
      const raw = JSON.parse(generation.content || "{}");
      const unwrapCandidate =
        raw && typeof raw === "object" && !Array.isArray(raw) && !("profile" in raw)
          ? (raw.report ?? raw.career_discovery_report ?? raw.data ?? raw)
          : raw;

      const merged = mergeDeterministicReport(
        unwrapCandidate,
        strategy,
        explanation,
        mockClaimedJob.answers,
        mockClaimedJob.studentContext,
        CAREERS,
      );

      careerReportSchema.parse(merged);
      passedCount++;
    } catch (err) {
      console.error(`✗ Sample ${i + 1} failed:`, err);
    }

    // Small pacing delay between calibration calls
    if (i < CALIBRATION_BATCH_SIZE - 1) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  const avgDurationMs = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
  const avgIn = Math.round(inputTokensList.reduce((a, b) => a + b, 0) / inputTokensList.length);
  const avgOut = Math.round(outputTokensList.reduce((a, b) => a + b, 0) / outputTokensList.length);
  const avgTotal = avgIn + avgOut;

  // 200 students projections
  const total200Tokens = avgTotal * 200;
  // Gemini 2.5/3.1 Flash pricing: ~$0.075 per 1M input, ~$0.30 per 1M output tokens
  const estimatedCostIn = (avgIn * 200 * 0.075) / 1_000_000;
  const estimatedCostOut = (avgOut * 200 * 0.30) / 1_000_000;
  const totalCostUsd = Number((estimatedCostIn + estimatedCostOut).toFixed(4));

  // Quota & Concurrency Analysis
  // Standard Free Tier: 15 RPM. Recommended safe concurrency: 2 to 3.
  // Standard Pay-as-you-go: 1000 RPM. Recommended safe concurrency: 5 to 10.
  const safeConcurrency = 3; // Conservative, fits comfortably within standard tier quotas
  // Drain rate calculation: with 3 concurrent workers, each job takes avgDurationMs (plus small queue overhead)
  const singleJobSeconds = (avgDurationMs + 500) / 1000;
  const jobsPerMinutePerWorker = 60 / singleJobSeconds;
  const totalJobsPerMinute = jobsPerMinutePerWorker * safeConcurrency;
  const estimatedDrainMinutes = Number((200 / totalJobsPerMinute).toFixed(1));

  const passed = passedCount === CALIBRATION_BATCH_SIZE;

  console.log(`\n------------------------------------------------------`);
  console.log(`Test C Real-Provider Calibration Results:`);
  console.log(`- Model: ${provider.model}`);
  console.log(`- Sample Reports Tested: ${passedCount}/${CALIBRATION_BATCH_SIZE} Valid`);
  console.log(`- Average Generation Latency: ${(avgDurationMs / 1000).toFixed(2)}s`);
  console.log(`- Average Tokens per Report: ${avgTotal} (In: ${avgIn}, Out: ${avgOut})`);
  console.log(`- Estimated 200-Report Token Consumption: ${(total200Tokens / 1000).toFixed(1)}k tokens`);
  console.log(`- Estimated 200-Report Provider Cost: $${totalCostUsd} USD`);
  console.log(`- Recommended Safe Concurrency: ${safeConcurrency} concurrent jobs`);
  console.log(`- Estimated 200-Report Queue Drain Time: ~${estimatedDrainMinutes} minutes`);
  console.log(`- Target (< 30 minutes): ${estimatedDrainMinutes <= 30 ? "FEASIBLE" : "NEEDS ADJUSTMENT"}`);
  console.log(`- Overall Status: ${passed ? "PASSED" : "FAILED"}`);
  console.log(`------------------------------------------------------\n`);

  return {
    providerName: provider.provider,
    model: provider.model,
    batchSize: CALIBRATION_BATCH_SIZE,
    avgDurationMs,
    avgInputTokens: avgIn,
    avgOutputTokens: avgOut,
    avgTotalTokens: avgTotal,
    estimated200Tokens: total200Tokens,
    estimated200CostUsd: totalCostUsd,
    safeConcurrency,
    estimated200DrainMinutes: estimatedDrainMinutes,
    sampleReportsPassed: passedCount,
    passed,
  };
}

if (process.argv[1]?.includes("testC_realCalibration")) {
  runTestC()
    .then((result) => {
      process.exit(result.passed ? 0 : 1);
    })
    .catch((err) => {
      console.error("Test C fatal failure:", err);
      process.exit(1);
    });
}
