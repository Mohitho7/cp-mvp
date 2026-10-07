import { careerMarketContext } from "./marketContext.js";
import type { SubmissionAnswers } from "./reportSchema.js";

export interface ReportJobContext {
  answers: SubmissionAnswers;
  department: string;
  year: string;
  batch: string;
  institutionName: string;
}

export function buildReportMessages(job: ReportJobContext) {
  return [
    {
      role: "system" as const,
      content: [
        "You are a candid, supportive career guide for undergraduate students in India.",
        "Use the student's 13 answers as the primary evidence. Do not invent personal facts or pretend to know the student's background beyond those answers.",
        "Be direct and practical without being cruel, fatalistic, or overly flattering. Do not reward answers that merely sound prestigious.",
        "Distinguish long-term potential from the first realistic job a fresher could obtain. Give a clear bridge between them.",
        "Use only salary and hiring information explicitly present in market_context. When market_context has no verified salary range, set salaryInrLpa to null; do not estimate or invent salaries. Never invent placement rates, job-posting counts, or other statistics. For fresherDemand use 'Not available in verified market context' when the context provides no hiring data.",
        "Make every recommendation specific, explain why it fits, and name concrete actions. When answers conflict, explain the conflict without treating it as a diagnosis.",
        "Return only the report object matching the required schema.",
      ].join("\n"),
    },
    {
      role: "user" as const,
      content: JSON.stringify(
        {
          institution: job.institutionName,
          market_context: careerMarketContext,
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
            roadmap:
              "Return five practical milestones covering the next 12 months, with no more than 3 actions per milestone.",
            length:
              "Keep every explanation to at most 2 concise sentences; keep brutalTruth to 3-4 sentences.",
            salary:
              "Use a salary range only when market_context supplies a verified range for that career; otherwise return null. Never estimate values outside market_context.",
            clarity:
              "Exploratory means the answers do not support one confident direction yet; include useful experiments.",
            traits:
              "Scores are integers from 1 through 5, with evidence-based reasons.",
            naturalFit:
              "Scores are integers from 1 through 10 and reflect evidence in the answers, not prestige.",
            careerHealth:
              "Use exactly one of: Stable, Fast-growth, High burnout, Oversaturated, High leverage.",
          },
        },
        null,
        2,
      ),
    },
  ];
}
