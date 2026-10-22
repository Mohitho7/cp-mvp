/**
 * Batch 4 tests — Career Path display logic (pure model, no DOM needed).
 *
 * Run: pnpm --filter @workspace/scripts run test:batch4
 * Covers: DIRECT / ADJACENT / BRIDGE / insufficient / unavailable rendering
 * decisions, step ordering, route labels, and the no-fake-strategy rule.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { CareerSubmissionResult } from "@workspace/api-client-react";
import {
  getCareerPathState,
  getPathSteps,
  getRouteLabel,
} from "./careerPathModel";

type Strategy = NonNullable<CareerSubmissionResult["strategy"]>;

function strategy(overrides: Partial<Strategy> = {}): Strategy {
  return {
    strategyVersion: "batch2-v1",
    explanationVersion: "batch3-v1",
    targetCareer: { id: "product-manager", title: "Product Manager" },
    bestEntryCareer: { id: "business-analyst", title: "Business Analyst" },
    bridgeCareer: null,
    alternativeRoute: { id: "operations-associate", title: "Operations Associate" },
    routeType: "ADJACENT",
    rationale: {
      target: "r-target",
      entry: "r-entry",
      bridge: null,
      academic: "r-academic",
      time: "r-time",
    },
    explanation: {
      target: "e-target",
      entry: "e-entry",
      route: "e-route",
      academic: "e-academic",
      time: "e-time",
      bridge: null,
      alternative: "e-alternative",
    },
    insufficientContext: false,
    ...overrides,
  };
}

describe("career path state classification", () => {
  it("reports unavailable without a strategy (legacy / not ready)", () => {
    assert.equal(getCareerPathState(null), "unavailable");
    assert.equal(getCareerPathState(undefined), "unavailable");
  });

  it("reports insufficient without fabricating steps", () => {
    const insufficient = strategy({
      targetCareer: null,
      bestEntryCareer: null,
      bridgeCareer: null,
      alternativeRoute: null,
      routeType: null,
      insufficientContext: true,
    });
    assert.equal(getCareerPathState(insufficient), "insufficient");
  });

  it("reports unavailable when careers are missing despite no flag", () => {
    assert.equal(
      getCareerPathState(strategy({ targetCareer: null })),
      "unavailable",
    );
    assert.equal(
      getCareerPathState(strategy({ bestEntryCareer: null })),
      "unavailable",
    );
  });

  it("classifies DIRECT / ADJACENT / BRIDGE routes", () => {
    assert.equal(getCareerPathState(strategy({ routeType: "DIRECT" })), "direct");
    assert.equal(getCareerPathState(strategy({ routeType: "ADJACENT" })), "adjacent");
    assert.equal(
      getCareerPathState(
        strategy({
          routeType: "BRIDGE",
          bridgeCareer: { id: "mid", title: "Mid Role" },
        }),
      ),
      "bridge",
    );
  });

  it("falls back to adjacent when BRIDGE lacks a bridge career", () => {
    assert.equal(
      getCareerPathState(strategy({ routeType: "BRIDGE", bridgeCareer: null })),
      "adjacent",
    );
  });
});

describe("career path steps", () => {
  it("merges target+entry into one step for DIRECT (never renders X ↓ X)", () => {
    const { steps, mergedTargetEntry } = getPathSteps(
      strategy({
        routeType: "DIRECT",
        targetCareer: { id: "ux", title: "UX/UI Designer" },
        bestEntryCareer: { id: "ux", title: "UX/UI Designer" },
      }),
    );
    assert.equal(mergedTargetEntry, true);
    assert.equal(steps.length, 1);
    assert.equal(steps[0].title, "UX/UI Designer");
  });

  it("orders ADJACENT steps target-first", () => {
    const { steps, mergedTargetEntry } = getPathSteps(strategy({ routeType: "ADJACENT" }));
    assert.equal(mergedTargetEntry, false);
    assert.deepEqual(
      steps.map((step) => step.kind),
      ["target", "entry"],
    );
    assert.equal(steps[0].title, "Product Manager");
    assert.equal(steps[1].title, "Business Analyst");
  });

  it("orders BRIDGE steps target, bridge, entry", () => {
    const { steps } = getPathSteps(
      strategy({
        routeType: "BRIDGE",
        bridgeCareer: { id: "mid", title: "Mid Role" },
      }),
    );
    assert.deepEqual(
      steps.map((step) => step.kind),
      ["target", "bridge", "entry"],
    );
  });
});

describe("route labels", () => {
  it("labels known routes and degrades safely", () => {
    assert.equal(getRouteLabel("DIRECT"), "DIRECT");
    assert.equal(getRouteLabel("ADJACENT"), "ADJACENT");
    assert.equal(getRouteLabel("BRIDGE"), "BRIDGE");
    assert.equal(getRouteLabel(null), "ROUTE UNAVAILABLE");
    assert.equal(getRouteLabel("EXPRESS"), "ROUTE UNAVAILABLE");
  });
});
