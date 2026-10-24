/**
 * Unified Load Test Runner: Executes Tests A, B, and C in Sequence.
 */
import { runTestA } from "./testA_apiBurst";
import { runTestB } from "./testB_workerStress";
import { runTestC } from "./testC_realCalibration";
import { pool } from "@workspace/db";

async function main() {
  console.log("================================================================================");
  console.log("CAREER PATHFINDER: 200 SIMULTANEOUS STUDENT REPORT CAPACITY & LOAD VERIFICATION");
  console.log("================================================================================\n");

  const results: Record<string, boolean> = {};

  try {
    // 1. Run Test A: 200 API Burst
    const resA = await runTestA();
    results["Test A (API Burst 200 Submissions)"] = resA.passed;

    // 2. Run Test B: 200 Queue & Worker Stress with Mock AI
    const resB = await runTestB();
    results["Test B (Queue & Worker Stress 200 Jobs)"] = resB.passed;

    // 3. Run Test C: Real-Provider Calibration
    const resC = await runTestC();
    results["Test C (Real Provider Calibration)"] = resC.passed;

    console.log("\n================================================================================");
    console.log("FINAL LOAD TEST HARNESS SUMMARY:");
    let allPassed = true;
    for (const [name, passed] of Object.entries(results)) {
      console.log(`- ${name}: ${passed ? "PASSED ✓" : "FAILED ✗"}`);
      if (!passed) allPassed = false;
    }
    console.log(`Overall Load Verification: ${allPassed ? "ALL TESTS PASSED ✓" : "FAILURES ENCOUNTERED ✗"}`);
    console.log("================================================================================\n");

    await pool.end();
    process.exit(allPassed ? 0 : 1);
  } catch (err) {
    console.error("Load test runner fatal error:", err);
    await pool.end();
    process.exit(1);
  }
}

void main();
