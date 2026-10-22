/**
 * Groq implementation of the structured report boundary.
 * Uses JSON-object mode; the worker still validates the parsed result with
 * Zod before persisting anything, so a non-conforming reply fails safely
 * into the existing retry path.
 */
import Groq from "groq-sdk";
import type {
  AIReportProvider,
  StructuredReportRequest,
  StructuredReportResult,
} from "./aiProvider";

export interface GroqTransportResult {
  content: string | null;
  inputTokens: number;
  outputTokens: number;
}

export type GroqCompletionTransport = (args: {
  model: string;
  maxTokens: number;
  systemText: string;
  userJson: string;
  responseFormat: "json_object";
}) => Promise<GroqTransportResult>;

function defaultTransport(apiKey: string): GroqCompletionTransport {
  const client = new Groq({ apiKey });
  return async (args) => {
    const completion = await client.chat.completions.create({
      model: args.model,
      max_tokens: args.maxTokens,
      temperature: 0,
      messages: [
        { role: "system", content: args.systemText },
        { role: "user", content: args.userJson },
      ],
      response_format: { type: args.responseFormat },
    });
    return {
      content: completion.choices[0]?.message?.content ?? null,
      inputTokens: completion.usage?.prompt_tokens ?? 0,
      outputTokens: completion.usage?.completion_tokens ?? 0,
    };
  };
}

export function createGroqProvider(options: {
  apiKey: string;
  model: string;
  transport?: GroqCompletionTransport;
}): AIReportProvider {
  const apiKey = options.apiKey.trim();
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is required to generate career reports with the groq provider.");
  }
  const transport = options.transport ?? defaultTransport(apiKey);
  return {
    provider: "groq",
    model: options.model,
    async generateStructuredReport(
      request: StructuredReportRequest,
    ): Promise<StructuredReportResult> {
      const result = await transport({
        model: options.model,
        maxTokens: request.maxTokens,
        systemText: request.systemText,
        userJson: request.userJson,
        responseFormat: "json_object",
      });
      return { ...result, model: options.model };
    },
  };
}
