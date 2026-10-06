import OpenAI from "openai";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import {
  careerResultsTable,
  careerSubmissionsTable,
  db,
  institutionsTable,
  pool,
  studentsTable,
} from "@workspace/db";
import type { CareerSubmissionInput } from "@workspace/api-zod";
import { careerReportJsonSchema, careerReportSchema } from "./careerReportSchema";
import { logger } from "./logger";

const MODEL = "gpt-5-mini";
const MAX_ATTEMPTS = 3;
const POLL_INTERVAL_MS = 1_500;
const STALE_JOB_MS = 15 * 60 * 1_000;

let isRunning = false;
let workerStarted = false;

interface ClaimedSubmission {
  id: string;
  attemptCount: number;
  answers: CareerSubmissionInput["answers"];
  department: string;
  year: string;
  batch: string;
  institutionName: string;
}

function buildReportMessages(job: ClaimedSubmission) {
  return [
    {
      role: "system" as const,
      content: [
        "You are a candid, supportive career guide for undergraduate students in India.",
        "Use the student's 13 answers as the primary evidence. Do not invent personal facts or pretend to know the student's background beyond those answers.",
        "Be direct and practical without being cruel, fatalistic, or overly flattering. Do not reward answers that merely sound prestigious.",
        "Distinguish long-term potential from the first realistic job a fresher could obtain. Give a clear bridge between them.",
        "The institution has not provided a verified current salary or hiring dataset. Give broad, rounded INR LPA estimates as estimates, not live market facts or guarantees. Never invent precise placement rates, job-posting counts, or current market statistics.",
        "Make every recommendation specific, explain why it fits, and name concrete actions. When answers conflict, explain the conflict without treating it as a diagnosis.",
        "Return only the report object matching the required schema.",
      ].join("\n"),
    },
    {
      role: "user" as const,
      content: JSON.stringify(
        {
          institution: job.institutionName,
          academicContext: {
            department: job.department,
            year: job.year,
            batch: job.batch,
          },
          answerKey: {
            q1: "Preferred way of working and sources of motivation",
            q2: "Enjoyment of technical work and problem solving",
            q3: "Comfort with ambiguity, risk, and stability",
            q4: "People, communication, and collaboration preferences",
            q5: "Creative interests and preferred work outputs",
            q6: "Strengths and evidence from past work",
            q7: "Tasks the student avoids or finds draining",
            q8: "Learning habits and willingness to practice",
            q9: "Workplace and team preferences",
            q10: "Interest in business, entrepreneurship, or ownership",
            q11: "Career expectations and lifestyle priorities",
            q12: "Current skills, projects, or experience",
            q13: "Anything else the student wants considered",
          },
          answers: job.answers,
          reportRequirements: {
            sections: [
              "profile",
              "traits",
              "answerPatterns",
              "caliberVsEntry",
              "careerFits",
              "careersToAvoid",
              "recommendedTrack",
              "trackDetail",
              "roadmap",
              "brutalTruth",
            ],
            careerFitCount: "Return 4 to 6 varied, realistic career fits.",
            skillCount: "Return 4 to 8 specific skills to learn.",
            roadmap: "Use practical milestones covering the next 12 months.",
            salary: "Use broad rounded INR LPA ranges. They are estimates only, not verified current market data.",
            clarity: "Exploratory means the answers do not support one confident direction yet; include useful experiments.",
            traits: "Scores are integers from 1 through 5, with evidence-based reasons.",
            naturalFit: "Scores are integers from 1 through 10 and reflect evidence in the answers, not prestige.",
          },
        },
        null,
        2,
      ),
    },
  ];
}

async function recoverStaleJobs(): Promise<void> {
  const staleBefore = new Date(Date.now() - STALE_JOB_MS);

  await db
    .update(careerSubmissionsTable)
    .set({
      status: "pending",
      error: "Retrying report generation after an interrupted attempt.",
      nextAttemptAt: new Date(),
      processingStartedAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(careerSubmissionsTable.status, "processing"),
        lte(careerSubmissionsTable.attemptCount, MAX_ATTEMPTS - 1),
        lte(careerSubmissionsTable.processingStartedAt, staleBefore),
      ),
    );

  await db
    .update(careerSubmissionsTable)
    .set({
      status: "failed",
      error: "Report generation did not finish. Please retry your assessment.",
      processingStartedAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(careerSubmissionsTable.status, "processing"),
        gte(careerSubmissionsTable.attemptCount, MAX_ATTEMPTS),
        lte(careerSubmissionsTable.processingStartedAt, staleBefore),
      ),
    );
}

async function claimNextSubmission(): Promise<ClaimedSubmission | null> {
  return db.transaction(async (tx) => {
    const [candidate] = await tx
      .select({
        id: careerSubmissionsTable.id,
        studentId: careerSubmissionsTable.studentId,
        answers: careerSubmissionsTable.answers,
        attemptCount: careerSubmissionsTable.attemptCount,
      })
      .from(careerSubmissionsTable)
      .where(
        and(
          eq(careerSubmissionsTable.status, "pending"),
          lte(careerSubmissionsTable.nextAttemptAt, new Date()),
        ),
      )
      .orderBy(asc(careerSubmissionsTable.createdAt))
      .limit(1)
      .for("update", { skipLocked: true });

    if (!candidate) {
      return null;
    }

    const attemptCount = candidate.attemptCount + 1;
    await tx
      .update(careerSubmissionsTable)
      .set({
        status: "processing",
        attemptCount,
        processingStartedAt: new Date(),
        updatedAt: new Date(),
        error: null,
      })
      .where(eq(careerSubmissionsTable.id, candidate.id));

    const [student] = await tx
      .select({
        department: studentsTable.department,
        year: studentsTable.year,
        batch: studentsTable.batch,
        institutionName: institutionsTable.name,
      })
      .from(studentsTable)
      .innerJoin(
        institutionsTable,
        eq(studentsTable.institutionId, institutionsTable.id),
      )
      .where(eq(studentsTable.id, candidate.studentId))
      .limit(1);

    if (!student) {
      await tx
        .update(careerSubmissionsTable)
        .set({
          status: "failed",
          error: "The student record could not be found.",
          processingStartedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(careerSubmissionsTable.id, candidate.id));
      return null;
    }

    return {
      id: candidate.id,
      attemptCount,
      answers: candidate.answers as CareerSubmissionInput["answers"],
      ...student,
    };
  });
}

async function saveFailure(job: ClaimedSubmission, error: unknown): Promise<void> {
  const terminal = job.attemptCount >= MAX_ATTEMPTS;
  const retryDelayMs =
    job.attemptCount === 1 ? 30_000 : job.attemptCount === 2 ? 120_000 : 0;

  await db
    .update(careerSubmissionsTable)
    .set({
      status: terminal ? "failed" : "pending",
      error: terminal
        ? "Report generation failed after several attempts. Please retry."
        : "A temporary issue interrupted report generation. It will retry automatically.",
      nextAttemptAt: new Date(Date.now() + retryDelayMs),
      processingStartedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(careerSubmissionsTable.id, job.id));

  logger.error(
    {
      submissionId: job.id,
      attempt: job.attemptCount,
      errorType: error instanceof Error ? error.name : "UnknownError",
      terminal,
    },
    "Career report generation attempt failed",
  );
}

async function generateReport(job: ClaimedSubmission): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required to generate career reports.");
  }

  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model: MODEL,
    max_completion_tokens: 8192,
    messages: buildReportMessages(job),
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "career_discovery_report",
        strict: true,
        schema: careerReportJsonSchema,
      },
    },
  });

  const content = completion.choices[0]?.message.content;
  if (!content) {
    throw new Error("The report model returned no content.");
  }

  const report = careerReportSchema.parse(JSON.parse(content));
  const usage = completion.usage;

  await db.transaction(async (tx) => {
    await tx.insert(careerResultsTable).values({
      submissionId: job.id,
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
      model: MODEL,
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
    });

    await tx
      .update(careerSubmissionsTable)
      .set({
        status: "done",
        error: null,
        processingStartedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(careerSubmissionsTable.id, job.id));
  });
}

async function processNextSubmission(): Promise<boolean> {
  const job = await claimNextSubmission();
  if (!job) {
    return false;
  }

  try {
    await generateReport(job);
    logger.info(
      { submissionId: job.id, attempt: job.attemptCount },
      "Career report generated",
    );
  } catch (error) {
    await saveFailure(job, error);
  }

  return true;
}

async function drainQueue(): Promise<void> {
  if (isRunning) {
    return;
  }
  isRunning = true;

  try {
    await recoverStaleJobs();
    while (await processNextSubmission()) {
      // Keep the queue durable and process one row at a time per API instance.
    }
  } catch (error) {
    logger.error(
      { errorType: error instanceof Error ? error.name : "UnknownError" },
      "Career report queue poll failed",
    );
  } finally {
    isRunning = false;
  }
}

export function startCareerReportWorker(): void {
  if (workerStarted) {
    return;
  }
  workerStarted = true;

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required to start the career report worker.");
  }

  void drainQueue();
  const timer = setInterval(() => void drainQueue(), POLL_INTERVAL_MS);
  timer.unref();

  logger.info({ model: MODEL }, "Career report worker started");
}

export async function closeCareerReportWorker(): Promise<void> {
  await pool.end();
}
