import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  careerReportSchema,
  CAREER_HEALTH_VALUES,
  RECOMMENDED_TRACKS,
  WORKER_TYPES,
  CLARITY_LEVELS,
} from "../src/reportSchema.js";
import { createDemoReport, DEMO_STUDENT_COUNT } from "../src/seed.js";

describe("career report schema", () => {
  it("accepts all demo seed reports (taxonomy + counts + ranges)", () => {
    assert.equal(DEMO_STUDENT_COUNT, 10);
    for (let i = 0; i < DEMO_STUDENT_COUNT; i += 1) {
      const parsed = careerReportSchema.safeParse(createDemoReport(i));
      assert.equal(parsed.success, true, `demo report ${i} must validate`);
    }
  });

  it("uses the five-value career health taxonomy", () => {
    assert.deepEqual([...CAREER_HEALTH_VALUES], [
      "Stable",
      "Fast-growth",
      "High burnout",
      "Oversaturated",
      "High leverage",
    ]);
  });

  it("rejects an unknown careerHealth value", () => {
    const report = createDemoReport(0);
    const bad = {
      ...report,
      careerFits: [{ ...report.careerFits[0], careerHealth: "Growing" }],
    };
    assert.equal(careerReportSchema.safeParse(bad).success, false);
  });

  it("rejects an unknown workerType / clarityLevel / track", () => {
    const base = createDemoReport(0);
    assert.equal(
      careerReportSchema.safeParse({
        ...base,
        profile: { ...base.profile, workerType: "Operator2" },
      }).success,
      false,
    );
    assert.equal(
      careerReportSchema.safeParse({
        ...base,
        profile: { ...base.profile, clarityLevel: "Confused" },
      }).success,
      false,
    );
    assert.equal(
      careerReportSchema.safeParse({ ...base, recommendedTrack: "Wizard" })
        .success,
      false,
    );
    assert.ok(WORKER_TYPES.length === 7 && CLARITY_LEVELS.length === 3);
    assert.ok(RECOMMENDED_TRACKS.length === 7);
  });

  it("enforces careerFits 4–6", () => {
    const base = createDemoReport(0);
    const fits = base.careerFits;
    assert.equal(
      careerReportSchema.safeParse({ ...base, careerFits: fits.slice(0, 3) })
        .success,
      false,
    );
    assert.equal(
      careerReportSchema.safeParse({
        ...base,
        careerFits: [...fits, ...fits].slice(0, 7),
      }).success,
      false,
    );
    assert.equal(
      careerReportSchema.safeParse({ ...base, careerFits: fits.slice(0, 4) })
        .success,
      true,
    );
  });

  it("enforces skillsToLearn 4–8", () => {
    const base = createDemoReport(0);
    assert.equal(
      careerReportSchema.safeParse({
        ...base,
        trackDetail: { ...base.trackDetail, skillsToLearn: ["SQL", "Git", "Excel"] },
      }).success,
      false,
    );
    assert.equal(
      careerReportSchema.safeParse({
        ...base,
        trackDetail: {
          ...base.trackDetail,
          skillsToLearn: Array.from({ length: 9 }, (_, i) => `Skill ${i}`),
        },
      }).success,
      false,
    );
  });

  it("enforces exactly 5 roadmap stages with at most 3 actions each", () => {
    const base = createDemoReport(0);
    assert.equal(
      careerReportSchema.safeParse({ ...base, roadmap: base.roadmap.slice(0, 4) })
        .success,
      false,
    );
    assert.equal(
      careerReportSchema.safeParse({
        ...base,
        roadmap: base.roadmap.map((step) => ({
          ...step,
          actions: ["a", "b", "c", "d"],
        })),
      }).success,
      false,
    );
  });

  it("enforces trait scores 1–5", () => {
    const base = createDemoReport(0);
    assert.equal(
      careerReportSchema.safeParse({
        ...base,
        traits: { ...base.traits, technical: { ...base.traits.technical, score: 6 } },
      }).success,
      false,
    );
    assert.equal(
      careerReportSchema.safeParse({
        ...base,
        traits: { ...base.traits, technical: { ...base.traits.technical, score: 0 } },
      }).success,
      false,
    );
  });

  it("allows null salary (honest market-data behavior)", () => {
    const base = createDemoReport(0);
    const withNullSalary = {
      ...base,
      careerFits: base.careerFits.map((fit) => ({ ...fit, salaryInrLpa: null })),
    };
    assert.equal(careerReportSchema.safeParse(withNullSalary).success, true);
  });
});
