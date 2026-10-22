import type { LegacyCareerReport } from "@workspace/api-zod";
import {
  careerResultsTable,
  careerSubmissionsTable,
  db,
  institutionsTable,
  studentsTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";

if (process.env.NODE_ENV === "production") {
  throw new Error("Demo data seeding is disabled in production.");
}
if (process.env.CAREER_DEMO_SEED !== "true") {
  throw new Error("Set CAREER_DEMO_SEED=true to seed demo students.");
}

const institutionName = process.env.CAREER_INSTITUTION_NAME?.trim() ?? "";
if (!institutionName) {
  throw new Error("CAREER_INSTITUTION_NAME is required to seed demo students.");
}

const workerTypes: LegacyCareerReport["profile"]["workerType"][] = [
  "Analyst",
  "Operator",
  "Builder",
  "Communicator",
  "Specialist",
  "Entrepreneur",
  "Manager",
  "Analyst",
  "Operator",
  "Builder",
];
const tracks: LegacyCareerReport["recommendedTrack"][] = [
  "Technical Business",
  "Hybrid Tech-Generalist",
  "Automation",
  "Technical Business",
  "Engineering",
  "Startup Ops",
  "Product",
  "Product",
  "Automation",
  "Hybrid Tech-Generalist",
];
const departments = [
  "Computer Science & Engineering",
  "CSE (AI & ML)",
  "CSE (Data Science)",
  "Electronics & Communication Engineering",
  "Electrical & Electronics Engineering",
  "Mechanical Engineering",
  "Civil Engineering",
  "Computer Science & Engineering",
  "CSE (AI & ML)",
  "Mechanical Engineering",
];
const jobTitles = [
  "Business Analyst",
  "Operations Analyst",
  "Automation Associate",
  "Technical Support Engineer",
  "Junior Software Engineer",
  "Growth Operations Associate",
  "Product Operations Associate",
  "Data Analyst",
  "CRM Analyst",
  "Implementation Associate",
];
const skillSets = [
  ["SQL", "Excel", "Power BI", "Business writing"],
  ["Excel", "Power BI", "Process mapping", "SQL"],
  ["n8n", "APIs", "JavaScript", "Process design"],
  ["Linux", "Networking", "Ticketing systems", "Troubleshooting"],
  ["Git", "TypeScript", "React", "Testing"],
  ["Excel", "Google Analytics", "SQL", "CRM"],
  ["Jira", "SQL", "User research", "Documentation"],
  ["SQL", "Python", "Power BI", "Statistics"],
  ["Salesforce", "SQL", "Excel", "Data quality"],
  ["APIs", "SQL", "Communication", "Documentation"],
];
const traits = [
  [4, 2, 3, 2, 4],
  [2, 3, 4, 3, 3],
  [3, 4, 2, 4, 5],
  [4, 2, 4, 2, 3],
  [5, 2, 2, 3, 4],
  [2, 4, 5, 5, 3],
  [3, 4, 4, 3, 4],
  [5, 2, 3, 2, 5],
  [3, 2, 4, 3, 3],
  [3, 3, 4, 4, 4],
];

function traitScore(score: number, reason: string) {
  return {
    score,
    reason,
    label:
      score <= 2
        ? ("Low" as const)
        : score === 3
          ? ("Medium" as const)
          : ("High" as const),
  };
}

function createReport(index: number): LegacyCareerReport {
  const [technical, creative, people, risk, learning] = traits[index];
  const title = jobTitles[index];
  const track = tracks[index];
  const workerType = workerTypes[index];

  return {
    profile: {
      archetype: `Demo ${workerType}`,
      workerType,
      clarityLevel:
        index % 3 === 0 ? "Clear" : index % 3 === 1 ? "Mixed" : "Exploratory",
      summary:
        "Synthetic report for demonstrating cohort-level career patterns.",
      strengths: [
        "Demo strength: evidence-led problem solving.",
        "Demo strength: practical learning.",
      ],
      risks: [
        "Demo risk: limited project evidence.",
        "Demo risk: needs a focused first step.",
      ],
      survivalEnvironment:
        "A supportive team with practical work and clear expectations.",
    },
    traits: {
      technical: traitScore(technical, "Synthetic demo score."),
      creative: traitScore(creative, "Synthetic demo score."),
      people: traitScore(people, "Synthetic demo score."),
      risk: traitScore(risk, "Synthetic demo score."),
      learning: traitScore(learning, "Synthetic demo score."),
    },
    answerPatterns: {
      clear: ["Synthetic demo pattern: interest in practical work."],
      conflicts:
        index % 2 === 0
          ? [
              {
                tag: "growth_vs_stability",
                text: "Synthetic conflict for dashboard demonstrations.",
              },
            ]
          : [],
      worthExploring: [
        "Synthetic demo experiment: complete a small portfolio project.",
      ],
    },
    caliberVsEntry: {
      longTermCaliber: `Demo long-term direction: ${track}.`,
      marketBarrier:
        "Synthetic demo barrier: the first role requires evidence of practical skills.",
      marketBarrierLevel:
        index % 3 === 0 ? "Low" : index % 3 === 1 ? "Moderate" : "High",
      firstEntryRoles: [title, "Graduate Trainee"],
      bridgePath:
        "Build a portfolio project, get feedback, and use it to pursue an internship.",
    },
    careerFits: [0, 1, 2, 3].map((offset) => ({
      title: jobTitles[(index + offset) % jobTitles.length],
      roleType: offset === 0 ? "Long-term fit" : "Stepping-stone",
      salaryInrLpa: { min: 3 + offset, max: 5 + offset },
      entryDifficulty: offset === 0 ? "Moderately difficult" : "Easy to enter",
      careerHealth: (["Stable", "Fast-growth", "High leverage", "Oversaturated"] as const)[offset],
      aiThreat: offset === 0 ? "Medium" : "Low",
      naturalFitScore: 9 - offset,
      dailyWork: "Synthetic example of realistic day-to-day work.",
      whyFits: "Synthetic example linking a role to questionnaire responses.",
      fiveYearGrowth: "Synthetic example of a possible five-year progression.",
    })),
    careersToAvoid: [
      {
        title: "Demo mismatch role",
        why: "Synthetic example for dashboard demonstrations.",
      },
    ],
    recommendedTrack: track,
    trackDetail: {
      why: "Synthetic report used only to preview aggregate dashboard patterns.",
      fresherDemand: "Demo data—not a verified market claim.",
      skillsToLearn: skillSets[index],
    },
    roadmap: [
      {
        months: "1-2",
        focus: "Foundation",
        actions: ["Choose one skill to practice."],
      },
      {
        months: "3-4",
        focus: "First project",
        actions: ["Build a small project with a clear outcome."],
      },
      {
        months: "5-6",
        focus: "Experience",
        actions: ["Apply for internships and ask for feedback."],
      },
      {
        months: "7-9",
        focus: "Portfolio",
        actions: ["Document the project and share the result."],
      },
      {
        months: "10-12",
        focus: "Applications",
        actions: ["Prepare examples and apply to suitable roles."],
      },
    ],
    brutalTruth:
      "This is synthetic demo content, not an assessment of a real student.",
  };
}

async function seedDemoStudents() {
  const [institution] = await db
    .insert(institutionsTable)
    .values({ name: institutionName })
    .onConflictDoUpdate({
      target: institutionsTable.name,
      set: { name: institutionName },
    })
    .returning({ id: institutionsTable.id });

  if (!institution) {
    throw new Error("Could not create or retrieve the configured institution.");
  }

  let seededCount = 0;
  for (let index = 0; index < workerTypes.length; index += 1) {
    await db.transaction(async (tx) => {
      let [student] = await tx
        .insert(studentsTable)
        .values({
          institutionId: institution.id,
          clerkUserId: `demo-career-student-${index + 1}`,
          department: departments[index],
          year: `${(index % 4) + 1}${index % 4 === 0 ? "st" : index % 4 === 1 ? "nd" : index % 4 === 2 ? "rd" : "th"} Year`,
          batch: `Demo ${2022 + (index % 4)}–${2026 + (index % 4)}`,
          degree: `Demo B.Tech (Synthetic ${index + 1})`,
          graduationYear: new Date().getFullYear() + 2,
          availableHoursPerWeek: 10 + (index % 3) * 5,
        })
        .onConflictDoNothing({
          target: [studentsTable.institutionId, studentsTable.clerkUserId],
        })
        .returning({ id: studentsTable.id });

      if (!student) {
        [student] = await tx
          .select({ id: studentsTable.id })
          .from(studentsTable)
          .where(
            and(
              eq(studentsTable.institutionId, institution.id),
              eq(studentsTable.clerkUserId, `demo-career-student-${index + 1}`),
            ),
          )
          .limit(1);
      }
      if (!student) {
        throw new Error(`Could not create demo student ${index + 1}.`);
      }

      const [submission] = await tx
        .insert(careerSubmissionsTable)
        .values({
          studentId: student.id,
          answers: {
            q1: "Synthetic demo answer",
            q2: ["Synthetic demo answer"],
            q3: ["Synthetic demo answer"],
            q4: ["Synthetic demo answer"],
            q5: "Synthetic demo answer",
            q6: ["Synthetic demo answer"],
            q7: ["Synthetic demo answer"],
            q8: ["Synthetic demo answer"],
            q9: ["Synthetic demo answer"],
            q10: ["Synthetic demo answer"],
            q11: ["Synthetic demo answer"],
            q12: "Synthetic demo answer",
            q13: "",
          },
          consentedAt: new Date(),
          consentVersion: "demo-seed-v1",
          status: "done",
        })
        .onConflictDoNothing({
          target: careerSubmissionsTable.studentId,
        })
        .returning({ id: careerSubmissionsTable.id });

      const [existingSubmission] = submission
        ? [submission]
        : await tx
            .select({ id: careerSubmissionsTable.id })
            .from(careerSubmissionsTable)
            .where(eq(careerSubmissionsTable.studentId, student.id))
            .limit(1);

      if (!existingSubmission) {
        throw new Error(`Could not create demo submission ${index + 1}.`);
      }

      const report = createReport(index);
      await tx
        .insert(careerResultsTable)
        .values({
          submissionId: existingSubmission.id,
          report,
          archetype: report.profile.archetype,
          workerType: report.profile.workerType,
          clarityLevel: report.profile.clarityLevel,
          recommendedTrack: report.recommendedTrack,
          technicalScore: report.traits.technical.score,
          creativeScore: report.traits.creative.score,
          peopleScore: report.traits.people.score,
          riskScore: report.traits.risk.score,
          learningScore: report.traits.learning.score,
          model: "demo-seed",
          inputTokens: 0,
          outputTokens: 0,
        })
        .onConflictDoUpdate({
          target: careerResultsTable.submissionId,
          set: {
            report,
            archetype: report.profile.archetype,
            workerType: report.profile.workerType,
            clarityLevel: report.profile.clarityLevel,
            recommendedTrack: report.recommendedTrack,
            technicalScore: report.traits.technical.score,
            creativeScore: report.traits.creative.score,
            peopleScore: report.traits.people.score,
            riskScore: report.traits.risk.score,
            learningScore: report.traits.learning.score,
            model: "demo-seed",
            inputTokens: 0,
            outputTokens: 0,
          },
        });

      await tx
        .update(careerSubmissionsTable)
        .set({
          status: "done",
          error: null,
          updatedAt: new Date(),
        })
        .where(eq(careerSubmissionsTable.id, existingSubmission.id));
      seededCount += 1;
    });
  }

  return { institutionName, seededCount };
}

seedDemoStudents()
  .then(({ institutionName: seededInstitutionName, seededCount }) => {
    console.info(
      `Seeded ${seededCount} synthetic demo students for ${seededInstitutionName}.`,
    );
  })
  .catch((error: unknown) => {
    console.error("Demo student seeding failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { pool } = await import("@workspace/db");
    await pool.end();
  });
