import { GetCareerSubmissionResponse } from "@workspace/api-zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { z } from "zod";

const reportUnion = GetCareerSubmissionResponse.shape.report;
export const careerReportSchema = reportUnion.options[0];
export type CareerReport = z.infer<typeof careerReportSchema>;

type JsonSchema = Record<string, unknown>;

function makeStrictSchema(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(makeStrictSchema);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }

  const schema = value as JsonSchema;
  const result: JsonSchema = {};
  for (const [key, child] of Object.entries(schema)) {
    result[key] = makeStrictSchema(child);
  }

  if (
    result.type === "object" &&
    result.properties !== null &&
    typeof result.properties === "object" &&
    !Array.isArray(result.properties)
  ) {
    result.required = Object.keys(result.properties as JsonSchema);
    result.additionalProperties = false;
  }
  return result;
}

export const careerReportJsonSchema = makeStrictSchema(
  zodToJsonSchema(careerReportSchema, { $refStrategy: "none" }),
) as JsonSchema;
