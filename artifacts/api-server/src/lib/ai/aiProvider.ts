/**
 * AI provider boundary for structured career-report generation.
 *
 * The deterministic career strategy stays authoritative: providers only turn
 * an already-decided prompt (system text + JSON payload + JSON schema) into
 * raw JSON text. Zod validation, retries, token accounting, and persistence
 * all live in the worker, unchanged, for every provider.
 *
 * Selection is configuration-driven via AI_PROVIDER (openai | gemini | groq,
 * default openai). There is deliberately NO automatic failover: a provider
 * failure follows the existing worker retry path for the selected provider.
 */

export type AIProviderName = "openai" | "gemini" | "groq";

export const AI_PROVIDER_DEFAULT: AIProviderName = "openai";

export const DEFAULT_OPENAI_MODEL = "gpt-5-mini";
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
export const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";

export interface StructuredReportRequest {
  systemText: string;
  /** Pre-serialized JSON payload for the user message. */
  userJson: string;
  schemaName: string;
  /** JSON Schema describing the expected report object (provider hint). */
  jsonSchema: Record<string, unknown>;
  maxTokens: number;
}

export interface StructuredReportResult {
  /** Raw JSON text, or null when the model returned no content. */
  content: string | null;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export interface AIReportProvider {
  readonly provider: AIProviderName;
  readonly model: string;
  generateStructuredReport(
    request: StructuredReportRequest,
  ): Promise<StructuredReportResult>;
}

export interface ProviderEnv {
  AI_PROVIDER?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  GROQ_API_KEY?: string;
  GROQ_MODEL?: string;
}

/** Resolves and validates the configured provider name. */
export function resolveProviderName(raw: string | undefined): AIProviderName {
  const normalized = (raw ?? "").trim().toLowerCase();
  if (normalized === "") return AI_PROVIDER_DEFAULT;
  if (normalized === "openai" || normalized === "gemini" || normalized === "groq") {
    return normalized;
  }
  throw new Error(
    `AI_PROVIDER "${raw}" is not supported. Use one of: openai, gemini, groq.`,
  );
}

function requiredKey(env: ProviderEnv, name: "OPENAI_API_KEY" | "GEMINI_API_KEY" | "GROQ_API_KEY", provider: AIProviderName): string {
  const value = env[name]?.trim() ?? "";
  if (!value) {
    throw new Error(`${name} is required to generate career reports with the ${provider} provider.`);
  }
  return value;
}

function modelOr(envValue: string | undefined, fallback: string): string {
  const value = envValue?.trim() ?? "";
  return value === "" ? fallback : value;
}

// Provider constructors are imported by the factory below. Each accepts an
// optional transport so tests exercise real mapping code without API keys.
import { createOpenAIProvider } from "./openaiProvider";
import { createGeminiProvider } from "./geminiProvider";
import { createGroqProvider } from "./groqProvider";

/** Creates the configured provider. Throws a clear error when misconfigured. */
export function createReportProvider(env: ProviderEnv = process.env): AIReportProvider {
  const provider = resolveProviderName(env.AI_PROVIDER);
  if (provider === "gemini") {
    return createGeminiProvider({
      apiKey: requiredKey(env, "GEMINI_API_KEY", provider),
      model: modelOr(env.GEMINI_MODEL, DEFAULT_GEMINI_MODEL),
    });
  }
  if (provider === "groq") {
    return createGroqProvider({
      apiKey: requiredKey(env, "GROQ_API_KEY", provider),
      model: modelOr(env.GROQ_MODEL, DEFAULT_GROQ_MODEL),
    });
  }
  return createOpenAIProvider({
    apiKey: requiredKey(env, "OPENAI_API_KEY", provider),
    model: modelOr(env.OPENAI_MODEL, DEFAULT_OPENAI_MODEL),
  });
}
