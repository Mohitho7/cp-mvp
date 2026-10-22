/**
 * OpenAI implementation of the structured report boundary.
 * Uses strict JSON-Schema structured output; the worker still validates
 * the parsed result with Zod before persisting anything.
 */
import OpenAI from "openai";
import type {
  AIReportProvider,
  StructuredReportRequest,
  StructuredReportResult,
} from "./aiProvider";

export interface OpenAITransportResult {
  content: string | null;
  inputTokens: number;
  outputTokens: number;
}

export type OpenAICompletionTransport = (args: {
  model: string;
  maxTokens: number;
  systemText: string;
  userJson: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  responseFormat: "json_schema";
}) => Promise<OpenAITransportResult>;

function defaultTransport(apiKey: string): OpenAICompletionTransport {
  const client = new OpenAI({ apiKey });
  return async (args) => {
    const completion = await client.chat.completions.create({
      model: args.model,
      max_completion_tokens: args.maxTokens,
      messages: [
        { role: "system", content: args.systemText },
        { role: "user", content: args.userJson },
      ],
      response_format: {
        type: args.responseFormat,
        json_schema: {
          name: args.schemaName,
          strict: true,
          schema: args.jsonSchema,
        },
      },
    });
    return {
      content: completion.choices[0]?.message.content ?? null,
      inputTokens: completion.usage?.prompt_tokens ?? 0,
      outputTokens: completion.usage?.completion_tokens ?? 0,
    };
  };
}

export function createOpenAIProvider(options: {
  apiKey: string;
  model: string;
  transport?: OpenAICompletionTransport;
}): AIReportProvider {
  const apiKey = options.apiKey.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required to generate career reports.");
  }
  const transport = options.transport ?? defaultTransport(apiKey);
  return {
    provider: "openai",
    model: options.model,
    async generateStructuredReport(
      request: StructuredReportRequest,
    ): Promise<StructuredReportResult> {
      const result = await transport({
        model: options.model,
        maxTokens: request.maxTokens,
        systemText: request.systemText,
        userJson: request.userJson,
        schemaName: request.schemaName,
        jsonSchema: request.jsonSchema,
        responseFormat: "json_schema",
      });
      return { ...result, model: options.model };
    },
  };
}
