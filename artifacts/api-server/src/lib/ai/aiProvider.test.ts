/**
 * Provider-independence tests: AI provider selection and boundary mapping.
 *
 * Run: pnpm --filter @workspace/scripts run test:providers
 * (node:test + tsx; no database, no network, no API keys — transports are
 * injected fakes so the real request/response mapping code is exercised.)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ZodError } from "zod";
import {
  AI_PROVIDER_DEFAULT,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GROQ_MODEL,
  DEFAULT_OPENAI_MODEL,
  createReportProvider,
  resolveProviderName,
} from "./aiProvider";
import { createOpenAIProvider } from "./openaiProvider";
import {
  buildGeminiPrompt,
  cleanJsonContent,
  createGeminiProvider,
} from "./geminiProvider";
import { createGroqProvider } from "./groqProvider";
import {
  buildReportMessages,
  buildReportParts,
  explanationForSubmission,
  parseReportContent,
} from "../careerReportWorker";
import { fixtureProductOriented } from "../careerStrategy/fixtures";
import { strategyForSubmission } from "../careerReportWorker";

const REQUEST = {
  systemText: "system",
  userJson: '{"a":1}',
  schemaName: "career_discovery_report",
  jsonSchema: { type: "object" },
  maxTokens: 8192,
};

describe("provider selection", () => {
  it("defaults to OpenAI when AI_PROVIDER is unset or blank", () => {
    assert.equal(resolveProviderName(undefined), "openai");
    assert.equal(resolveProviderName(""), "openai");
    assert.equal(resolveProviderName("   "), "openai");
    assert.equal(AI_PROVIDER_DEFAULT, "openai");
  });

  it("accepts configured names case-insensitively", () => {
    assert.equal(resolveProviderName("GEMINI"), "gemini");
    assert.equal(resolveProviderName(" groq "), "groq");
    assert.equal(resolveProviderName("OpenAI"), "openai");
  });

  it("rejects unknown providers with a clear error", () => {
    assert.throws(() => resolveProviderName("azure"), /not supported.*openai, gemini, groq/);
  });

  it("creates the OpenAI provider by default with its key and model", () => {
    const provider = createReportProvider({ OPENAI_API_KEY: "k", OPENAI_MODEL: "m" });
    assert.equal(provider.provider, "openai");
    assert.equal(provider.model, "m");
  });

  it("falls back to default models when overrides are blank", () => {
    assert.equal(createReportProvider({ OPENAI_API_KEY: "k" }).model, DEFAULT_OPENAI_MODEL);
    assert.equal(
      createReportProvider({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "k" }).model,
      DEFAULT_GEMINI_MODEL,
    );
    assert.equal(
      createReportProvider({ AI_PROVIDER: "groq", GROQ_API_KEY: "k" }).model,
      DEFAULT_GROQ_MODEL,
    );
  });

  it("requires only the selected provider key and names it", () => {
    assert.throws(() => createReportProvider({}), /OPENAI_API_KEY/);
    assert.throws(() => createReportProvider({ AI_PROVIDER: "gemini" }), /GEMINI_API_KEY/);
    assert.throws(() => createReportProvider({ AI_PROVIDER: "groq" }), /GROQ_API_KEY/);
    // A sibling provider key must NOT satisfy selection.
    assert.throws(() => createReportProvider({ AI_PROVIDER: "groq", OPENAI_API_KEY: "k" }), /GROQ_API_KEY/);
  });
});

describe("OpenAI provider boundary", () => {
  it("maps a completion through with usage and model", async () => {
    const provider = createOpenAIProvider({
      apiKey: "k",
      model: "gpt-5-mini",
      transport: async () => ({ content: '{"ok":true}', inputTokens: 10, outputTokens: 5 }),
    });
    const result = await provider.generateStructuredReport(REQUEST);
    assert.deepEqual(result, { content: '{"ok":true}', inputTokens: 10, outputTokens: 5, model: "gpt-5-mini" });
  });

  it("passes null content through for the worker no-content path", async () => {
    const provider = createOpenAIProvider({
      apiKey: "k",
      model: "m",
      transport: async () => ({ content: null, inputTokens: 1, outputTokens: 0 }),
    });
    const result = await provider.generateStructuredReport(REQUEST);
    assert.equal(result.content, null);
  });

  it("propagates transport errors into the worker retry path", async () => {
    const provider = createOpenAIProvider({
      apiKey: "k",
      model: "m",
      transport: async () => {
        throw new Error("boom");
      },
    });
    await assert.rejects(() => provider.generateStructuredReport(REQUEST), /boom/);
  });

  it("rejects a blank key without touching the network", async () => {
    let called = false;
    assert.throws(
      () =>
        createOpenAIProvider({
          apiKey: "  ",
          model: "m",
          transport: async () => {
            called = true;
            return { content: null, inputTokens: 0, outputTokens: 0 };
          },
        }),
      /OPENAI_API_KEY/,
    );
    assert.equal(called, false);
  });
});

describe("Groq provider boundary", () => {
  it("sends JSON-object mode with system+user messages and maps usage", async () => {
    let seen: unknown = null;
    const provider = createGroqProvider({
      apiKey: "k",
      model: "llama-3.3-70b-versatile",
      transport: async (args) => {
        seen = args;
        return { content: '{"ok":true}', inputTokens: 7, outputTokens: 3 };
      },
    });
    const result = await provider.generateStructuredReport(REQUEST);
    assert.deepEqual(result, {
      content: '{"ok":true}',
      inputTokens: 7,
      outputTokens: 3,
      model: "llama-3.3-70b-versatile",
    });
    assert.match(JSON.stringify(seen), /json_object/);
    assert.match(JSON.stringify(seen), /system/);
  });

  it("rejects a blank key and propagates failures", async () => {
    assert.throws(() => createGroqProvider({ apiKey: "", model: "m" }), /GROQ_API_KEY/);
    const provider = createGroqProvider({
      apiKey: "k",
      model: "m",
      transport: async () => {
        throw new Error("rate limited");
      },
    });
    await assert.rejects(() => provider.generateStructuredReport(REQUEST), /rate limited/);
  });
});

describe("Gemini provider boundary", () => {
  it("sends JSON MIME mode with combined text and maps usage metadata", async () => {
    let seen: unknown = null;
    const provider = createGeminiProvider({
      apiKey: "k",
      model: "gemini-2.5-flash",
      transport: async (args) => {
        seen = args;
        return { content: '{"ok":true}', inputTokens: 9, outputTokens: 4 };
      },
    });
    const result = await provider.generateStructuredReport(REQUEST);
    assert.deepEqual(result, {
      content: '{"ok":true}',
      inputTokens: 9,
      outputTokens: 4,
      model: "gemini-2.5-flash",
    });
    assert.match(JSON.stringify(seen), /application\/json/);
  });

  it("uses JSON MIME mode and never sends a provider-side schema", async () => {
    // Provider-side schemas for Gemini (responseSchema or responseJsonSchema)
    // trigger HTTP 400 INVALID_ARGUMENT due to unsupported keywords, nullable
    // object shapes, and schema complexity. JSON MIME mode is used instead;
    // the worker's Zod parse remains the authoritative validation gate.
    let seen: Record<string, unknown> | null = null;
    const provider = createGeminiProvider({
      apiKey: "k",
      model: "gemini-2.5-flash",
      transport: async (args) => {
        seen = args as unknown as Record<string, unknown>;
        return { content: '{"ok":true}', inputTokens: 1, outputTokens: 1 };
      },
    });
    await provider.generateStructuredReport(REQUEST);
    assert.ok(seen !== null);
    const transportArgs = seen as Record<string, unknown>;
    assert.equal(transportArgs.responseMimeType, "application/json");
    assert.equal(transportArgs.responseSchema, undefined);
    assert.ok(!("responseJsonSchema" in transportArgs));
  });

  it("constructs a valid @google/genai payload via default transport without schema fields", async () => {
    let capturedBody: Record<string, unknown> | null = null;
    let capturedUrl: string | null = null;

    const mockFetch = (async (url: unknown, init?: { body?: string }) => {
      capturedUrl = String(url);
      capturedBody = init?.body ? JSON.parse(init.body) : null;
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
          usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 8 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const provider = createGeminiProvider({
      apiKey: "dummy-key-for-local-verification",
      model: "gemini-3.1-flash-lite",
      httpOptions: { fetch: mockFetch },
    });

    const result = await provider.generateStructuredReport(REQUEST);
    assert.equal(result.content, '{"ok":true}');
    assert.equal(result.inputTokens, 12);
    assert.equal(result.outputTokens, 8);
    assert.equal(result.model, "gemini-3.1-flash-lite");

    assert.ok(capturedUrl !== null && (capturedUrl as string).includes("gemini-3.1-flash-lite:generateContent"));
    assert.ok(capturedBody !== null);
    const bodyObj = capturedBody as Record<string, unknown>;
    const genConfig = bodyObj.generationConfig as Record<string, unknown>;
    assert.ok(genConfig);
    assert.equal(genConfig.responseMimeType, "application/json");
    assert.equal(genConfig.maxOutputTokens, 8192);
    // Explicitly verify no schema field is serialized to Gemini
    assert.equal(genConfig.responseSchema, undefined);
    assert.equal(genConfig.responseJsonSchema, undefined);
  });

  it("maps missing text to null and rejects a blank key", async () => {
    const provider = createGeminiProvider({
      apiKey: "k",
      model: "m",
      transport: async () => ({ content: null, inputTokens: 0, outputTokens: 0 }),
    });
    assert.equal((await provider.generateStructuredReport(REQUEST)).content, null);
    assert.throws(() => createGeminiProvider({ apiKey: " ", model: "m" }), /GEMINI_API_KEY/);
  });

  it("buildGeminiPrompt embeds JSON Schema instructions and canonical keys", () => {
    const prompt = buildGeminiPrompt("system directive", '{"answers":{}}', {
      type: "object",
      properties: { profile: { type: "object" } },
    });
    assert.match(prompt, /CRITICAL OUTPUT SCHEMA INSTRUCTIONS/);
    assert.match(prompt, /"profile", "traits", "answerPatterns"/);
    assert.match(prompt, /reportRequirements\.sections/);
    assert.match(prompt, /EXPECTED JSON SCHEMA/);
    assert.match(prompt, /system directive/);
    assert.match(prompt, /{"answers":{}}/);
  });

  it("buildGeminiPrompt returns simple prompt when no schema provided", () => {
    const prompt = buildGeminiPrompt("system directive", '{"answers":{}}');
    assert.equal(prompt, 'system directive\n\n{"answers":{}}');
  });

  it("cleanJsonContent strips markdown code fences", () => {
    assert.equal(cleanJsonContent('```json\n{"ok":true}\n```'), '{"ok":true}');
    assert.equal(cleanJsonContent('```\n{"ok":true}\n```'), '{"ok":true}');
    assert.equal(cleanJsonContent('  {"ok":true}  '), '{"ok":true}');
    assert.equal(cleanJsonContent(null), null);
  });

  it("default transport rejects with descriptive error when finishReason is MAX_TOKENS", async () => {
    const mockFetch = (async () => {
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: { parts: [{ text: '{"partially_cut":true' }] },
              finishReason: "MAX_TOKENS",
            },
          ],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 8192 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const provider = createGeminiProvider({
      apiKey: "dummy-key",
      model: "gemini-3.1-flash-lite",
      httpOptions: { fetch: mockFetch },
    });

    await assert.rejects(
      () => provider.generateStructuredReport(REQUEST),
      /maxOutputTokens was reached/,
    );
  });

  it("default transport rejects with descriptive error when finishReason is SAFETY", async () => {
    const mockFetch = (async () => {
      return new Response(
        JSON.stringify({
          candidates: [{ finishReason: "SAFETY" }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 0 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const provider = createGeminiProvider({
      apiKey: "dummy-key",
      model: "gemini-3.1-flash-lite",
      httpOptions: { fetch: mockFetch },
    });

    await assert.rejects(
      () => provider.generateStructuredReport(REQUEST),
      /blocked by safety filters/,
    );
  });

  it("default transport rejects when promptFeedback blockReason is present", async () => {
    const mockFetch = (async () => {
      return new Response(
        JSON.stringify({
          promptFeedback: { blockReason: "SAFETY", blockReasonMessage: "Harmful content" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const provider = createGeminiProvider({
      apiKey: "dummy-key",
      model: "gemini-3.1-flash-lite",
      httpOptions: { fetch: mockFetch },
    });

    await assert.rejects(
      () => provider.generateStructuredReport(REQUEST),
      /Gemini blocked prompt due to SAFETY: Harmful content/,
    );
  });

  it("default transport strips markdown code fences from candidate text", async () => {
    const mockFetch = (async () => {
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: { parts: [{ text: '```json\n{"ok":true}\n```' }] },
              finishReason: "STOP",
            },
          ],
          usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 5 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const provider = createGeminiProvider({
      apiKey: "dummy-key",
      model: "gemini-3.1-flash-lite",
      httpOptions: { fetch: mockFetch },
    });

    const result = await provider.generateStructuredReport(REQUEST);
    assert.equal(result.content, '{"ok":true}');
  });
});

function makeTestReport(): Record<string, unknown> {
  const trait = { score: 3, reason: "evidence", label: "Medium" as const };
  return {
    profile: {
      archetype: "The Practical Builder",
      workerType: "Builder",
      clarityLevel: "Clear",
      summary: "Summary.",
      strengths: ["Strength 1", "Strength 2"],
      risks: ["Risk 1", "Risk 2"],
      survivalEnvironment: "Environment.",
    },
    traits: {
      technical: trait,
      creative: trait,
      people: trait,
      risk: trait,
      learning: trait,
    },
    answerPatterns: { clear: ["Pattern."], conflicts: [], worthExploring: [] },
    caliberVsEntry: {
      longTermCaliber: "Caliber.",
      marketBarrier: "Barrier.",
      marketBarrierLevel: "Low",
      firstEntryRoles: ["Role 1"],
      bridgePath: "Bridge.",
    },
    workArchetype: {
      name: "The Practical Builder",
      definition: "Definition.",
      strength: "Strong",
      evidence: ["Evidence."],
    },
    careerDirection: {
      target: { title: "Software Engineer", why: "Why." },
      entry: { title: "QA Engineer", why: "Why." },
      route: "ADJACENT",
      routeWhy: "Why.",
      barriers: [],
      alternativesNote: null,
    },
    longTermOptions: [1, 2, 3, 4, 5].map((i) => ({
      id: `career-${i}`,
      title: `Career ${i}`,
      category: "Software & Infrastructure",
      rank: i,
      score: 0.85,
      fitScore: 0.8,
      rationale: `Rationale ${i}.`,
    })),
    entryOptions: [1, 2, 3, 4, 5].map((i) => ({
      id: `entry-${i}`,
      title: `Entry Role ${i}`,
      category: "Software & Infrastructure",
      rank: i,
      score: 0.75,
      fitScore: 0.7,
      accessibility: "HIGH",
      alignment: "STRONG",
      runwayWeeks: 12,
      rationale: `Rationale ${i}.`,
    })),
    careerComparison: {
      longTerm: [1, 2, 3].map((i) => ({
        id: `career-${i}`,
        title: `Career ${i}`,
        roleInvolves: "Role involves...",
        whyFit: "Why it fits...",
        tradeOff: "Trade-off...",
        differentiation: "Differentiation...",
      })),
      entryLevel: [1, 2, 3].map((i) => ({
        id: `entry-${i}`,
        title: `Entry Role ${i}`,
        roleInvolves: "Role involves...",
        whyFit: "Why it fits...",
        tradeOff: "Trade-off...",
        differentiation: "Differentiation...",
      })),
    },
    recommendedWorkLane: {
      lane: "Engineering",
      why: "Why this lane fits.",
      primaryCareer: { id: "software-engineer", title: "Software Engineer" },
      supportingCareers: [{ id: "qa-engineer", title: "QA Engineer" }],
      entryRoute: {
        routeType: "DIRECT",
        entryCareer: { id: "software-engineer", title: "Software Engineer" },
        bridgeCareer: null,
        rationale: "Rationale.",
      },
      explanation: "Explanation.",
    },
    recommendedTrack: "Engineering",
    roadmap: [1, 2, 3, 4, 5].map((i) => ({
      order: i,
      monthRange: `Months ${i * 2 - 1}-${i * 2}`,
      focus: `Focus ${i}`,
      actions: ["Action"],
      measurableOutputs: ["Output"],
    })),
    mentorNote: {
      observedPattern: "Pattern.",
      realisticRisk: "Risk.",
      actionableExperiment: "Experiment.",
    },
  };
}

describe("worker report content parsing and unwrapping", () => {
  it("parses direct conforming JSON without alteration", () => {
    const raw = JSON.stringify(makeTestReport());
    const parsed = parseReportContent(raw);
    assert.equal(parsed.profile.archetype, "The Practical Builder");
    assert.equal(parsed.recommendedTrack, "Engineering");
  });

  it("unwraps reports nested under 'report'", () => {
    const raw = JSON.stringify({ report: makeTestReport() });
    const parsed = parseReportContent(raw);
    assert.equal(parsed.profile.archetype, "The Practical Builder");
  });

  it("unwraps reports nested under 'career_discovery_report'", () => {
    const raw = JSON.stringify({ career_discovery_report: makeTestReport() });
    const parsed = parseReportContent(raw);
    assert.equal(parsed.profile.archetype, "The Practical Builder");
  });

  it("unwraps reports nested under 'data'", () => {
    const raw = JSON.stringify({ data: makeTestReport() });
    const parsed = parseReportContent(raw);
    assert.equal(parsed.profile.archetype, "The Practical Builder");
  });

  it("reproduces validation failure when output contains only presentation sections and lacks canonical keys", () => {
    // Exact reproduction of Gemini failure where model returned reportRequirements.sections
    // instead of canonical CareerReport schema keys (profile, traits, answerPatterns, etc.)
    const presentationOnly = JSON.stringify({
      workArchetype: "Builder",
      answerInsights: "Insights from answers",
      strengthsFriction: "Identified strengths and frictions",
      careerDirection: "Recommended direction",
      careerComparison: [],
      workLane: "Engineering",
      skillsGaps: [],
      roadmap: [],
      mentorNote: "Note",
    });

    assert.throws(
      () => parseReportContent(presentationOnly),
      (err: unknown) => {
        assert.ok(err instanceof ZodError);
        const missingPaths = err.issues.map((issue) => issue.path[0]);
        // Confirms the exact reported failure: profile, traits, and answerPatterns are missing
        assert.ok(missingPaths.includes("profile"));
        assert.ok(missingPaths.includes("traits"));
        assert.ok(missingPaths.includes("answerPatterns"));
        return true;
      },
    );
  });

  it("rejects invalid JSON syntax with SyntaxError", () => {
    assert.throws(() => parseReportContent("not-json"), (err: unknown) => err instanceof SyntaxError);
  });
});

describe("prompt parts stay provider-neutral", () => {
  it("buildReportMessages renders exactly the shared parts", () => {
    const job = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      attemptCount: 1, attemptNumber: 1,
      answers: fixtureProductOriented.answers,
      department: "Computer Science & Engineering",
      year: "3rd Year",
      batch: "2023–2027",
      studentContext: fixtureProductOriented.context,
      institutionName: "Test Institution",
    };
    const strategy = strategyForSubmission(job);
    const full = { ...job, strategy, explanation: explanationForSubmission(job, strategy) };
    const parts = buildReportParts(full);
    const messages = buildReportMessages(full);
    assert.equal(messages[0].content, parts.systemText);
    assert.equal(messages[1].content, JSON.stringify(parts.userPayload, null, 2));
    assert.match(parts.systemText, /authoritative/);
    assert.ok((parts.userPayload as { entryStrategy: unknown }).entryStrategy);
  });
});
