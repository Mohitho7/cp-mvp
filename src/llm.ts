import OpenAI from "openai";
import { buildReportMessages, type ReportJobContext } from "./prompt.js";
import {
  careerReportJsonSchema,
  careerReportSchema,
} from "./reportSchema.js";
import type { CompletedReport } from "./worker.js";

export interface LlmConfig {
  apiKey: string;
  model: string;
}

export function llmConfigFromEnv(): LlmConfig {
  const apiKey = process.env.OPENAI_API_KEY?.trim() ?? "";
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is required.");
  }
  return {
    apiKey,
    model: process.env.OPENAI_MODEL?.trim() || "gpt-5-mini",
  };
}

/** Calls the LLM with a strict JSON schema and validates the result. */
export async function generateCareerReport(
  job: ReportJobContext,
  config: LlmConfig,
): Promise<CompletedReport> {
  const client = new OpenAI({ apiKey: config.apiKey });
  const completion = await client.chat.completions.create({
    model: config.model,
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

  const inputTokens = completion.usage?.prompt_tokens ?? 0;
  const outputTokens = completion.usage?.completion_tokens ?? 0;

  const content = completion.choices[0]?.message.content;
  if (!content) {
    throw new LlmError("The report model returned no content.", {
      model: config.model,
      inputTokens,
      outputTokens,
    });
  }

  try {
    const report = careerReportSchema.parse(JSON.parse(content));
    return { report, model: config.model, inputTokens, outputTokens };
  } catch (error) {
    throw new LlmError(
      error instanceof Error ? error.message : "Invalid report output.",
      { model: config.model, inputTokens, outputTokens },
    );
  }
}

/** LLM failure that still carries token usage for cost logging. */
export class LlmError extends Error {
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;

  constructor(
    message: string,
    usage: { model: string; inputTokens: number; outputTokens: number },
  ) {
    super(message);
    this.name = "LlmError";
    this.model = usage.model;
    this.inputTokens = usage.inputTokens;
    this.outputTokens = usage.outputTokens;
  }
}
