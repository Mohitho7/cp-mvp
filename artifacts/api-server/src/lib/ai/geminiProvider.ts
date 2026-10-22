/**
 * Gemini implementation of the structured report boundary.
 *
 * Uses JSON MIME mode (no provider-side schema enforcement, since the
 * OpenAI-oriented strict schema is not portable and triggers HTTP 400
 * INVALID_ARGUMENT on the Gemini API due to unsupported keywords, nullable
 * object shapes, and complexity limits). The worker still validates the
 * parsed result with Zod before persisting anything, so a non-conforming
 * reply fails safely into the existing retry path.
 */
import { GoogleGenAI } from "@google/genai";
import type {
  AIReportProvider,
  StructuredReportRequest,
  StructuredReportResult,
} from "./aiProvider";

export interface GeminiTransportResult {
  content: string | null;
  inputTokens: number;
  outputTokens: number;
}

export type GeminiCompletionTransport = (args: {
  model: string;
  maxTokens: number;
  systemText: string;
  userJson: string;
  responseMimeType: "application/json";
  responseSchema?: unknown;
  jsonSchema?: Record<string, unknown>;
  schemaName?: string;
}) => Promise<GeminiTransportResult>;

/**
 * Strips markdown code fences (e.g. ```json ... ```) from model output.
 */
export function cleanJsonContent(raw: string | null): string | null {
  if (raw === null) return null;
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "").trim();
  }
  return text;
}

/**
 * Builds the complete prompt for Gemini, appending the JSON Schema and
 * canonical key instructions when a schema is provided.
 */
export function buildGeminiPrompt(
  systemText: string,
  userJson: string,
  jsonSchema?: Record<string, unknown>,
): string {
  if (!jsonSchema) {
    return `${systemText}\n\n${userJson}`;
  }

  const schemaDirective = [
    "CRITICAL OUTPUT SCHEMA INSTRUCTIONS:",
    "You must return ONLY a single, valid, raw JSON object strictly adhering to the JSON Schema provided below.",
    "- Do NOT wrap the output in markdown code fences (do not use ```json or ```).",
    "- Do NOT nest the output under a wrapper key such as \"report\", \"career_discovery_report\", or \"data\".",
    "- The root JSON object MUST contain the exact top-level property keys defined in the schema:",
    "  \"profile\", \"traits\", \"answerPatterns\", \"caliberVsEntry\", \"careerFits\", \"careersToAvoid\", \"recommendedTrack\", \"trackDetail\", \"roadmap\", \"brutalTruth\".",
    "- NOTE: While \"reportRequirements.sections\" in the user payload lists the display sections for presentation, your JSON response MUST use the exact schema property keys listed above, NOT the presentation section names.",
    "",
    "EXPECTED JSON SCHEMA:",
    JSON.stringify(jsonSchema, null, 2),
  ].join("\n");

  return `${systemText}\n\n${userJson}\n\n${schemaDirective}`;
}

function defaultTransport(
  apiKey: string,
  httpOptions?: { fetch?: typeof fetch },
): GeminiCompletionTransport {
  const client = new GoogleGenAI({ apiKey, ...(httpOptions ? { httpOptions } : {}) });
  return async (args) => {
    const config: {
      responseMimeType: "application/json";
      maxOutputTokens: number;
      responseSchema?: unknown;
    } = {
      responseMimeType: args.responseMimeType,
      maxOutputTokens: args.maxTokens,
    };
    if (args.responseSchema !== undefined) {
      config.responseSchema = args.responseSchema;
    }

    const promptText = buildGeminiPrompt(
      args.systemText,
      args.userJson,
      args.jsonSchema,
    );

    const response = await client.models.generateContent({
      model: args.model,
      contents: [
        {
          role: "user",
          parts: [{ text: promptText }],
        },
      ],
      config,
    });

    if (response.promptFeedback?.blockReason) {
      const reason = response.promptFeedback.blockReason;
      const msg = response.promptFeedback.blockReasonMessage
        ? `: ${response.promptFeedback.blockReasonMessage}`
        : "";
      throw new Error(`Gemini blocked prompt due to ${reason}${msg}`);
    }

    const candidate = response.candidates?.[0];
    if (candidate?.finishReason) {
      if (candidate.finishReason === "SAFETY") {
        throw new Error("Gemini generation was blocked by safety filters.");
      }
      if (candidate.finishReason === "MAX_TOKENS") {
        throw new Error(
          "Gemini generation was cut off because maxOutputTokens was reached.",
        );
      }
      if (
        candidate.finishReason === "RECITATION" ||
        candidate.finishReason === "BLOCKLIST" ||
        candidate.finishReason === "PROHIBITED_CONTENT" ||
        candidate.finishReason === "SPII"
      ) {
        throw new Error(`Gemini generation was blocked: ${candidate.finishReason}.`);
      }
    }

    return {
      content: cleanJsonContent(response.text ?? null),
      inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
    };
  };
}

export function createGeminiProvider(options: {
  apiKey: string;
  model: string;
  transport?: GeminiCompletionTransport;
  httpOptions?: { fetch?: typeof fetch };
}): AIReportProvider {
  const apiKey = options.apiKey.trim();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is required to generate career reports with the gemini provider.");
  }
  const transport = options.transport ?? defaultTransport(apiKey, options.httpOptions);
  return {
    provider: "gemini",
    model: options.model,
    async generateStructuredReport(
      request: StructuredReportRequest,
    ): Promise<StructuredReportResult> {
      const result = await transport({
        model: options.model,
        maxTokens: request.maxTokens,
        systemText: request.systemText,
        userJson: request.userJson,
        responseMimeType: "application/json",
        jsonSchema: request.jsonSchema,
        schemaName: request.schemaName,
      });
      return { ...result, model: options.model };
    },
  };
}
