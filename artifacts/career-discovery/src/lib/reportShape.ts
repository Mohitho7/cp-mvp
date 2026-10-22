/**
 * Report shape discriminator.
 *
 * New reports carry the canonical 5-section contract (longTermOptions,
 * entryOptions, recommendedWorkLane, mentorNote); legacy reports do not.
 * The UI branches on presence — legacy data is never rewritten or renamed.
 */
import type { CareerReport, LegacyCareerReport } from "@workspace/api-client-react";

export function isNewReport(
  report: CareerReport | LegacyCareerReport | null | undefined,
): report is CareerReport {
  if (!report || typeof report !== "object") return false;
  return (
    "longTermOptions" in report &&
    Array.isArray((report as CareerReport).longTermOptions) &&
    (report as CareerReport).longTermOptions.length === 5 &&
    "entryOptions" in report &&
    Array.isArray((report as CareerReport).entryOptions) &&
    (report as CareerReport).entryOptions.length === 5 &&
    "mentorNote" in report &&
    (report as CareerReport).mentorNote !== null &&
    typeof (report as CareerReport).mentorNote === "object"
  );
}
