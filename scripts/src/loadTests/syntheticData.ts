/**
 * Synthetic Student Assessment Data Generator for High-Volume Load Testing.
 *
 * Uses entirely synthetic academic profiles. Does NOT use or expose real student PII.
 */
import type { CareerSubmissionInput } from "@workspace/api-zod";

const DEPARTMENTS = [
  "Computer Science & Engineering",
  "CSE (Artificial Intelligence)",
  "Information Technology",
  "Electronics & Communication Engineering",
  "Electrical & Electronics Engineering",
];

const DEGREES = ["B.Tech", "B.E.", "BCA", "B.Sc"];
const YEARS = ["1st Year", "2nd Year", "3rd Year", "4th Year"];

export function generateSyntheticSubmission(index: number): {
  clerkUserId: string;
  department: string;
  year: string;
  batch: string;
  degree: string;
  graduationYear: number;
  availableHoursPerWeek: number;
  payload: CareerSubmissionInput;
} {
  const dept = DEPARTMENTS[index % DEPARTMENTS.length];
  const degree = DEGREES[index % DEGREES.length];
  const year = YEARS[index % YEARS.length];
  const graduationYear = 2026 + (index % 4);
  const availableHours = 10 + (index % 15);
  const clerkUserId = `user_loadtest_synth_${index}_${Date.now()}`;

  const payload: CareerSubmissionInput = {
    consent: true,
    department: dept,
    year,
    batch: `${graduationYear - 4}–${graduationYear}`,
    degree,
    graduationYear,
    availableHoursPerWeek: availableHours,
    answers: {
      q1: index % 2 === 0 ? "Working with code and technical systems" : "Analyzing business problems and data",
      q2: ["Writing and reviewing code", "Debugging complex logic"],
      q3: ["Stable roles with clear expectations", "Well-documented engineering processes"],
      q4: ["Collaborating with small technical teams", "Async documentation and written reviews"],
      q5: index % 2 === 0 ? "Building functional software tools" : "Creating visual charts and analytics dashboards",
      q6: ["Solving algorithmic puzzles", "Learning new programming languages quickly"],
      q7: ["Sales and cold outreach", "Vague requirements with shifting priorities"],
      q8: ["Self-paced coding projects", "Reading documentation and technical books"],
      q9: ["Supportive peer mentors", "Structured sprint planning"],
      q10: ["Technical architecture", "Product strategy"],
      q11: ["Work-life balance with competitive compensation", "Continuous technical mastery"],
      q12: "Intermediate Python, SQL, and Git fundamentals from academic coursework.",
      q13: "Looking for an entry-level pathway that leads toward strategic technical leadership.",
    },
  };

  return {
    clerkUserId,
    department: dept,
    year,
    batch: payload.batch,
    degree,
    graduationYear,
    availableHoursPerWeek: availableHours,
    payload,
  };
}
