import { CAREERS, CATALOG_VERSION } from "../../artifacts/api-server/src/lib/careerStrategy/catalog";
import { normalizeAnswers, totalFitSignal } from "../../artifacts/api-server/src/lib/careerStrategy/fitProfile";
import { buildEntryStrategy, hasDeepCodingAversion, isCompatibleEntry } from "../../artifacts/api-server/src/lib/careerStrategy/strategy";
import {
  buildMultiRoleRanking,
  rankLongTermOptions,
  rankEntryOptions,
  deriveRecommendedWorkLane,
  cosineSimilarity,
  getCareerMacroDomain,
} from "../../artifacts/api-server/src/lib/careerStrategy/ranking";
import { classifyArchetype } from "../../artifacts/api-server/src/lib/careerStrategy/archetype";
import { buildStrategyExplanation } from "../../artifacts/api-server/src/lib/careerStrategy/explanation";
import {
  attachDeterministicReportFields,
  mergeDeterministicReport,
  composeCareerDirection,
  deriveBarriers,
} from "../../artifacts/api-server/src/lib/careerStrategy/careerDirection";
import type { CareerSubmissionInput } from "@workspace/api-zod";
import type { StudentContext } from "../../artifacts/api-server/src/lib/studentContext";
import { normalizeDegreeFamily } from "../../artifacts/api-server/src/lib/careerStrategy/degreeAlignment";

type Answers = CareerSubmissionInput["answers"];

interface AuditProfile {
  id: string;
  name: string;
  description: string;
  context: StudentContext;
  answers: Answers;
}

export const PROFILES: AuditProfile[] = [
  {
    id: "profile-a-product",
    name: "Profile A: Product/Business-Oriented",
    description: "User needs, prioritizing features, coordinating work, low-code/moderate-code preference",
    context: {
      degree: "BBA",
      graduationYear: 2026,
      availableHoursPerWeek: 12,
    },
    answers: {
      q1: "Working with people",
      q2: ["The one managing everyone"],
      q3: ["Business or money content", "Helping friends solve problems"],
      q4: ["Talking to people or clients"],
      q5: "I prefer low-code or no-code tools",
      q6: ["Learning with a community or friends", "Following structured steps or courses"],
      q7: ["Startup chaos and fast growth", "Team collaboration and meetings"],
      q8: ["Too much deep coding all day"],
      q9: ["Building something of my own", "Earning a lot of money"],
      q10: ["Understanding business, money, or strategy", "Managing people or projects"],
      q11: ["Running my own business or venture", "Financial freedom — options and wealth"],
      q12: "I'm okay with it if it helps my career growth",
      q13: "I want to lead product strategy, understand user problems, and coordinate teams to ship valuable features.",
    },
  },
  {
    id: "profile-b-data",
    name: "Profile B: Data/Analytics-Oriented",
    description: "Metrics, SQL, evidence, patterns, structured analysis, explaining results",
    context: {
      degree: "B.Tech Computer Science",
      graduationYear: 2027,
      availableHoursPerWeek: 15,
    },
    answers: {
      q1: "Solving difficult problems",
      q2: ["The silent one doing their own focused work", "The one fixing problems last minute"],
      q3: ["Learning random stuff online", "Watching tech / coding videos"],
      q4: ["Organizing data or systems", "Researching and learning new things"],
      q5: "I can learn if it helps my career",
      q6: ["Following structured steps or courses", "Trying things directly and breaking stuff"],
      q7: ["Stable corporate structure", "Remote independent work"],
      q8: ["Too many meetings or people interactions"],
      q9: ["Being respected and highly skilled", "A stable and predictable life"],
      q10: ["Working with data or solving analytical problems", "Understanding business, money, or strategy"],
      q11: ["Financial freedom — options and wealth", "Stable family life with predictable income"],
      q12: "I genuinely enjoy constantly learning new things",
      q13: "I enjoy analyzing data, finding trends, querying databases with SQL, and using metrics to drive business decisions.",
    },
  },
  {
    id: "profile-c-tech",
    name: "Profile C: Technical Builder",
    description: "Programming, debugging, architecture, implementation, continuous technical learning",
    context: {
      degree: "B.Tech Computer Science",
      graduationYear: 2027,
      availableHoursPerWeek: 20,
    },
    answers: {
      q1: "Building something cool",
      q2: ["The person who builds/codes things", "The one fixing problems last minute"],
      q3: ["Watching tech / coding videos", "Exploring AI tools"],
      q4: ["Writing code or working with tools", "Finding shortcuts or automating tasks"],
      q5: "I actually enjoy it",
      q6: ["Trying things directly and breaking stuff", "Building real projects while learning"],
      q7: ["Remote independent work", "Startup chaos and fast growth"],
      q8: ["Too much theory with no practical work", "Too many meetings or people interactions"],
      q9: ["Being respected and highly skilled", "Building something of my own"],
      q10: ["Creating apps or websites", "Working with AI or automation tools"],
      q11: ["Flexible work — travel, remote, freedom", "Financial freedom — options and wealth"],
      q12: "I genuinely enjoy constantly learning new things",
      q13: "I love programming, building complex web applications, designing scalable backend architectures, and debugging code.",
    },
  },
  {
    id: "profile-d-automation",
    name: "Profile D: AI-Automation-Oriented",
    description: "Workflow automation, AI tools, APIs, no-code integrations, measurable business outcomes",
    context: {
      degree: "B.Tech Information Technology",
      graduationYear: 2026,
      availableHoursPerWeek: 12,
    },
    answers: {
      q1: "Building something cool",
      q2: ["The one fixing problems last minute", "The silent one doing their own focused work"],
      q3: ["Exploring AI tools", "Organizing and planning things"],
      q4: ["Finding shortcuts or automating tasks", "Writing code or working with tools"],
      q5: "I prefer low-code or no-code tools",
      q6: ["Building real projects while learning", "Trying things directly and breaking stuff"],
      q7: ["Startup chaos and fast growth", "Freelancing or running my own thing"],
      q8: ["Too much deep coding all day", "Doing the same repetitive thing daily"],
      q9: ["Building something of my own", "Working from anywhere in the world"],
      q10: ["Working with AI or automation tools", "Understanding business, money, or strategy"],
      q11: ["Running my own business or venture", "Flexible work — travel, remote, freedom"],
      q12: "I genuinely enjoy constantly learning new things",
      q13: "I want to automate repetitive workflows, integrate AI tools and APIs into business processes, and build solutions using low-code platforms.",
    },
  },
];

export function runFullAudit() {
  console.log(`================================================================`);
  console.log(`CAREER PATHFINDER — PHASE 5 RECOMMENDATION ENGINE QUALITY AUDIT`);
  console.log(`================================================================`);
  console.log(`Catalog Version: ${CATALOG_VERSION}`);
  console.log(`Catalog Careers Count: ${CAREERS.length}\n`);

  for (const p of PROFILES) {
    console.log(`----------------------------------------------------------------`);
    console.log(`PROFILE: ${p.name}`);
    console.log(`Context: ${p.context.degree}, Grad ${p.context.graduationYear}, ${p.context.availableHoursPerWeek} hrs/wk`);
    console.log(`Description: ${p.description}`);

    const profile = normalizeAnswers(p.answers);
    const signal = totalFitSignal(profile);
    const codeAversion = hasDeepCodingAversion(p.answers);
    const archetype = classifyArchetype(p.answers);

    console.log(`\n1. Derived Feature Vector:`);
    console.log(
      Object.entries(profile)
        .map(([k, v]) => `${k}: ${v.toFixed(3)}`)
        .join(" | "),
    );
    console.log(`Total Signal: ${signal.toFixed(3)} | Deep Coding Aversion: ${codeAversion}`);
    console.log(`Archetype: ${archetype ? `${archetype.archetype} (${archetype.strength})` : "None"}`);

    const strategy = buildEntryStrategy({
      answers: p.answers,
      context: p.context,
      catalog: CAREERS,
    });

    const explanation = buildStrategyExplanation({
      strategy,
      profile,
      context: p.context,
      catalog: CAREERS,
    });

    console.log(`\n2. Primary Recommendation:`);
    console.log(`- Target: ${strategy.targetCareer?.title} (${strategy.targetCareer?.id})`);
    console.log(`- Best Entry: ${strategy.bestEntryCareer?.title} (${strategy.bestEntryCareer?.id})`);
    console.log(`- Bridge: ${strategy.bridgeCareer?.title ?? "None"}`);
    console.log(`- Route Type: ${strategy.routeType}`);
    console.log(`- Alternative Route: ${strategy.alternativeRoute?.title ?? "None"}`);

    // Graph validation
    const targetDef = CAREERS.find((c) => c.id === strategy.targetCareer?.id);
    const entryDef = CAREERS.find((c) => c.id === strategy.bestEntryCareer?.id);
    const bridgeDef = strategy.bridgeCareer ? CAREERS.find((c) => c.id === strategy.bridgeCareer?.id) : null;

    let routeValid = false;
    let routeReason = "";
    if (strategy.routeType === "DIRECT") {
      routeValid = targetDef?.id === entryDef?.id;
      routeReason = routeValid
        ? "Valid DIRECT (entry === target)"
        : `DEFECT: DIRECT route assigned but entry (${entryDef?.id}) !== target (${targetDef?.id})!`;
    } else if (strategy.routeType === "ADJACENT") {
      routeValid = targetDef?.entryCandidates.includes(entryDef?.id ?? "") ?? false;
      routeReason = routeValid
        ? `Valid ADJACENT (${entryDef?.id} in target.entryCandidates [${targetDef?.entryCandidates.join(", ")}])`
        : `DEFECT: ADJACENT route assigned but ${entryDef?.id} NOT in target.entryCandidates [${targetDef?.entryCandidates.join(", ")}]!`;
    } else if (strategy.routeType === "BRIDGE") {
      routeValid = targetDef?.bridgeCandidates.includes(bridgeDef?.id ?? "") ?? false;
      routeReason = routeValid
        ? `Valid BRIDGE (${bridgeDef?.id} in target.bridgeCandidates [${targetDef?.bridgeCandidates.join(", ")}])`
        : `DEFECT: BRIDGE route assigned but bridge ${bridgeDef?.id} NOT in target.bridgeCandidates [${targetDef?.bridgeCandidates.join(", ")}]!`;
    }
    console.log(`- Graph Validation: ${routeReason}`);

    console.log(`\n3. Work Lane Recommendation:`);
    console.log(`- Recommended Lane: ${strategy.recommendedWorkLane?.lane}`);
    console.log(`- Primary Career: ${strategy.recommendedWorkLane?.primaryCareer.title}`);
    console.log(
      `- Supporting Careers: ${strategy.recommendedWorkLane?.supportingCareers.map((c) => c.title).join(", ")}`,
    );
    console.log(`- Why: ${strategy.recommendedWorkLane?.why}`);

    console.log(`\n4. All 5 Long-Term Destinations:`);
    for (const opt of strategy.longTermOptions ?? []) {
      console.log(
        `   [#${opt.career.id}] ${opt.career.title} | Category: ${opt.category} | Score: ${(opt.score * 100).toFixed(1)} | Fit: ${opt.fitScore.toFixed(3)} | ${opt.rationale}`,
      );
    }

    console.log(`\n5. All 5 Entry-Level Job Options:`);
    for (const opt of strategy.entryOptions ?? []) {
      console.log(
        `   [#${opt.career.id}] ${opt.career.title} | Cat: ${opt.category} | Score: ${(opt.score * 100).toFixed(1)} | Fit: ${opt.fitScore.toFixed(3)} | Access: ${opt.accessibility} | Align: ${opt.alignment} | Runway: ${opt.runwayWeeks} wks | ${opt.rationale}`,
      );
    }

    console.log(`\n6. Strategy Rationale & Explanation:`);
    console.log(`- Target: ${strategy.rationale.target}`);
    console.log(`- Entry: ${strategy.rationale.entry}`);
    console.log(`- Bridge: ${strategy.rationale.bridge ?? "N/A"}`);
    console.log(`- Academic: ${strategy.rationale.academic}`);
    console.log(`- Time: ${strategy.rationale.time}`);
    console.log(`- Explanation Target: ${explanation.target}`);
    console.log(`- Explanation Entry: ${explanation.entry}`);
    console.log(`- Explanation Route: ${explanation.route}`);
  }

  console.log(`\n================================================================`);
  console.log(`PHASE 5: EDGE CASES AUDIT`);
  console.log(`================================================================`);

  // Edge Case 1: Strong Coding Aversion
  console.log(`\n--- Edge Case 1: Strong Coding Aversion ---`);
  const profileWithAversion = { ...PROFILES[0].answers, q8: ["Too much deep coding all day"] };
  const profileWithoutAversion = { ...PROFILES[0].answers, q8: ["Too many meetings or people interactions"] };

  const stratWith = buildEntryStrategy({ answers: profileWithAversion, context: PROFILES[0].context, catalog: CAREERS });
  const stratWithout = buildEntryStrategy({ answers: profileWithoutAversion, context: PROFILES[0].context, catalog: CAREERS });
  console.log(`With aversion: Target=${stratWith.targetCareer?.title}, Entry=${stratWith.bestEntryCareer?.title}`);
  console.log(`Without aversion: Target=${stratWithout.targetCareer?.title}, Entry=${stratWithout.bestEntryCareer?.title}`);

  // Edge Case 2: Conflicting Technical and Business Preferences
  console.log(`\n--- Edge Case 2: Conflicting Technical and Business Preferences ---`);
  const conflictingAnswers: Answers = {
    q1: "Building something cool",
    q2: ["The person who builds/codes things", "The one managing everyone"],
    q3: ["Watching tech / coding videos", "Business or money content"],
    q4: ["Writing code or working with tools", "Talking to people or clients"],
    q5: "I can learn if it helps my career",
    q6: ["Building real projects while learning", "Learning with a community or friends"],
    q7: ["Startup chaos and fast growth"],
    q8: ["Doing the same repetitive thing daily"],
    q9: ["Building something of my own", "Earning a lot of money"],
    q10: ["Creating apps or websites", "Understanding business, money, or strategy"],
    q11: ["Running my own business or venture", "Financial freedom — options and wealth"],
    q12: "I genuinely enjoy constantly learning new things",
    q13: "I want to build software products and lead business growth",
  };
  const stratConflict = buildEntryStrategy({ answers: conflictingAnswers, context: { degree: "B.Tech Computer Science", graduationYear: 2026, availableHoursPerWeek: 15 }, catalog: CAREERS });
  console.log(`Conflicting Profile: Target=${stratConflict.targetCareer?.title}, Entry=${stratConflict.bestEntryCareer?.title}, Lane=${stratConflict.recommendedWorkLane?.lane}`);
  console.log(`Lane Why: ${stratConflict.recommendedWorkLane?.why}`);

  // Edge Case 3: Very Limited Weekly Preparation Time (2-4 hrs/wk)
  console.log(`\n--- Edge Case 3: Very Limited Weekly Preparation Time (4 hrs/wk & 2 hrs/wk) ---`);
  const strat4h = buildEntryStrategy({ answers: PROFILES[1].answers, context: { degree: "B.Tech Computer Science", graduationYear: 2026, availableHoursPerWeek: 4 }, catalog: CAREERS });
  const strat2h = buildEntryStrategy({ answers: PROFILES[1].answers, context: { degree: "B.Tech Computer Science", graduationYear: 2026, availableHoursPerWeek: 2 }, catalog: CAREERS });
  console.log(`At 4h/wk: Target=${strat4h.targetCareer?.title}, Entry=${strat4h.bestEntryCareer?.title}, Runway=${strat4h.entryOptions?.[0]?.runwayWeeks} wks, Route=${strat4h.routeType}`);
  console.log(`At 2h/wk: Target=${strat2h.targetCareer?.title}, Entry=${strat2h.bestEntryCareer?.title}, Runway=${strat2h.entryOptions?.[0]?.runwayWeeks} wks, Route=${strat2h.routeType}`);

  // Edge Case 4: Low Learning-Agility Score
  console.log(`\n--- Edge Case 4: Low Learning Agility ---`);
  const lowAgilityAnswers: Answers = {
    ...PROFILES[2].answers,
    q12: "I struggle staying consistent with learning",
    q6: ["I struggle to stay consistent honestly"],
  };
  const stratLowAgility = buildEntryStrategy({ answers: lowAgilityAnswers, context: PROFILES[2].context, catalog: CAREERS });
  console.log(`Low Agility Builder: Target=${stratLowAgility.targetCareer?.title}, Entry=${stratLowAgility.bestEntryCareer?.title}, Lane=${stratLowAgility.recommendedWorkLane?.lane}`);

  // Edge Case 5: Near-Ties across Multiple Career Families
  console.log(`\n--- Edge Case 5: Near-Ties in Long-Term Options ---`);
  const conflictLongTerms = stratConflict.longTermOptions ?? [];
  for (let i = 0; i < conflictLongTerms.length - 1; i++) {
    const o1 = conflictLongTerms[i];
    const o2 = conflictLongTerms[i + 1];
    const diff = Math.abs(o1.score - o2.score);
    console.log(`[Rank ${i + 1} vs ${i + 2}] ${o1.career.title} (${(o1.score * 100).toFixed(1)}) vs ${o2.career.title} (${(o2.score * 100).toFixed(1)}) -> Diff = ${(diff * 100).toFixed(2)} pts`);
  }

  // Edge Case 6: No Valid Transition Edge for a Candidate Entry Role
  console.log(`\n--- Edge Case 6: Fallback when candidate entry role has no transition edge in catalog ---`);
  // Catalog with an isolated apex target that has empty entryCandidates and bridgeCandidates, and cannot be direct entry
  const testIsolatedCatalog = [
    {
      id: "isolated-apex",
      title: "Isolated Apex",
      category: "Apex",
      accessibility: "LOW" as const,
      degreeStrong: [],
      degreeModerate: [],
      degreeWeak: [],
      runwayHours: 600,
      codeIntensity: 0,
      targetPotential: 5,
      fitWeights: { technical: 1 },
      entryCandidates: [],
      bridgeCandidates: [],
    },
    {
      id: "unconnected-entry",
      title: "Unconnected Entry",
      category: "Support",
      accessibility: "HIGH" as const,
      degreeStrong: [],
      degreeModerate: [],
      degreeWeak: [],
      runwayHours: 100,
      codeIntensity: 0,
      targetPotential: 2,
      fitWeights: { technical: 0.8 },
      entryCandidates: [],
      bridgeCandidates: [],
    },
  ];
  const stratIsolated = buildEntryStrategy({
    answers: PROFILES[2].answers,
    context: PROFILES[2].context,
    catalog: testIsolatedCatalog,
  });
  console.log(`Isolated Catalog Target: ${stratIsolated.targetCareer?.title}`);
  console.log(`Isolated Catalog Entry: ${stratIsolated.bestEntryCareer?.title}`);
  console.log(`Isolated Catalog RouteType: ${stratIsolated.routeType}`);
  console.log(`Is route valid? ${stratIsolated.routeType === "DIRECT" ? stratIsolated.targetCareer?.id === stratIsolated.bestEntryCareer?.id : false}`);
  if (stratIsolated.routeType === "DIRECT" && stratIsolated.targetCareer?.id !== stratIsolated.bestEntryCareer?.id) {
    console.log(`>>> DEFECT DETECTED: RouteType is labeled "DIRECT" even though target (${stratIsolated.targetCareer?.id}) !== entry (${stratIsolated.bestEntryCareer?.id}) and no edge exists!`);
  }

  // Edge Case 7: Missing Optional Report Explanation Fields
  console.log(`\n--- Edge Case 7: Missing Optional Report Explanation Fields ---`);
  const profileConflict = normalizeAnswers(conflictingAnswers);
  const contextConflict = { degree: "B.Tech Computer Science", graduationYear: 2026, availableHoursPerWeek: 15 };
  const explanationConflict = buildStrategyExplanation({
    strategy: stratConflict,
    profile: profileConflict,
    context: contextConflict,
    catalog: CAREERS,
  });
  const bareReport: any = mergeDeterministicReport(
    {} as any,
    stratConflict,
    explanationConflict,
    conflictingAnswers,
    contextConflict,
    CAREERS,
  );
  console.log(`Merged with empty parsed object:`);
  console.log(`- workArchetype present? ${bareReport.workArchetype !== null}`);
  console.log(`- careerDirection present? ${bareReport.careerDirection !== null}`);
  console.log(`- longTermOptions count: ${bareReport.longTermOptions?.length}`);
  console.log(`- entryOptions count: ${bareReport.entryOptions?.length}`);
  console.log(`- recommendedWorkLane present? ${bareReport.recommendedWorkLane !== null}`);
  console.log(`- roadmap milestones count: ${bareReport.roadmap?.length}`);
}

runFullAudit();
