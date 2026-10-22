/**
 * Gemini JSON-Schema conversion tests (`responseJsonSchema`).
 *
 * Run: pnpm --filter @workspace/scripts run test:geminischema
 * (node:test + tsx; no database, no network, no API keys.)
 *
 * The Gemini API documents `responseJsonSchema` as standard JSON Schema
 * (lowercase types, `anyOf` nullable unions, numeric bounds, string enums,
 * `propertyOrdering`) — a different representation from the OpenAPI-style
 * `responseSchema`, and the two must never be mixed. These tests lock the
 * conversion of the canonical report schema without weakening validation:
 * the worker's Zod gate stays final.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { toGeminiJsonSchema, toGeminiSchema } from "./geminiJsonSchema";
import { careerReportJsonSchema, careerReportSchema } from "../careerReportSchema";

type JsonObject = Record<string, unknown>;

function converted(): JsonObject {
  return toGeminiJsonSchema(careerReportJsonSchema) as JsonObject;
}

function collect(node: unknown, visit: (node: JsonObject, path: string) => void, path = ""): void {
  if (Array.isArray(node)) {
    node.forEach((item, index) => collect(item, visit, `${path}[${index}]`));
    return;
  }
  if (node === null || typeof node !== "object") return;
  const record = node as JsonObject;
  visit(record, path);
  for (const [key, value] of Object.entries(record)) {
    collect(value, visit, path === "" ? key : `${path}.${key}`);
  }
}

function requiredPaths(node: unknown, prefix: string, out: string[]): string[] {
  if (node === null || typeof node !== "object" || Array.isArray(node)) return out;
  const record = node as JsonObject;
  const properties = record.properties as JsonObject | undefined;
  const required = record.required as string[] | undefined;
  if (properties && Array.isArray(required)) {
    for (const name of required) {
      const path = prefix === "" ? String(name) : `${prefix}.${String(name)}`;
      out.push(path);
      requiredPaths(properties[name], path, out);
    }
  }
  return out;
}

describe("gemini JSON-schema conversion", () => {
  it("uses valid lowercase JSON Schema type names only", () => {
    const types = new Set<unknown>();
    collect(converted(), (node) => {
      if (typeof node.type === "string") types.add(node.type);
    });
    assert.ok(types.size > 0);
    for (const type of types) {
      assert.ok(
        ["string", "number", "integer", "boolean", "array", "object"].includes(
          type as string,
        ),
        `unexpected type ${String(type)}`,
      );
    }
  });

  it("contains no null-type branches anywhere", () => {
    const nullTypes: string[] = [];
    const collectNulls = (node: unknown, path: string): void => {
      if (Array.isArray(node)) {
        node.forEach((item, index) => collectNulls(item, `${path}[${index}]`));
        return;
      }
      if (node === null || typeof node !== "object") return;
      const record = node as JsonObject;
      if (record.type === "null" || record.type === "Null") nullTypes.push(path);
      for (const [key, value] of Object.entries(record)) {
        collectNulls(value, path === "" ? key : `${path}.${key}`);
      }
    };
    collectNulls(converted(), "");
    assert.deepEqual(nullTypes, []);
  });

  it("drops keys outside the supported subset", () => {
    const seen = new Set<string>();
    collect(converted(), (node) => {
      for (const key of Object.keys(node)) seen.add(key);
    });
    for (const banned of ["$schema", "const", "default", "example", "pattern"]) {
      assert.ok(!seen.has(banned), `leaked ${banned}`);
    }
    // minLength/maxLength are not in the supported subset; Zod still enforces them.
    assert.ok(!seen.has("minLength"), "leaked minLength");
    assert.ok(!seen.has("maxLength"), "leaked maxLength");
  });

  it("preserves every required field path of the canonical contract", () => {
    const canonicalPaths = requiredPaths(careerReportJsonSchema, "", []);
    assert.ok(canonicalPaths.includes("profile.archetype"), "archetype coverage");
    assert.ok(canonicalPaths.includes("profile.workerType"), "workerType coverage");
    const convertedPaths = requiredPaths(converted(), "", []);
    for (const path of canonicalPaths) {
      assert.ok(convertedPaths.includes(path), `lost required path ${path}`);
    }
    assert.ok(convertedPaths.length >= canonicalPaths.length);
  });

  it("preserves all enums with string values and no format marker", () => {
    const enums: unknown[][] = [];
    collect(converted(), (node) => {
      if (Array.isArray(node.enum)) enums.push(node.enum as unknown[]);
      assert.equal(node.format, undefined, "no OpenAPI format markers");
    });
    assert.ok(enums.length >= 10);
    for (const values of enums) {
      assert.ok(values.length > 0);
      for (const value of values) {
        assert.equal(typeof value, "string");
      }
    }
    const profile = ((converted().properties as JsonObject).profile as JsonObject)
      .properties as JsonObject;
    assert.deepEqual((profile.workerType as JsonObject).enum, [
      "Specialist",
      "Operator",
      "Builder",
      "Analyst",
      "Communicator",
      "Entrepreneur",
      "Manager",
    ]);
  });

  it("rewrites nullable unions to nullable objects", () => {
    const out = converted() as JsonObject;
    const props = out.properties as JsonObject;
    const at = (path: string): JsonObject => {
      let node: unknown = out;
      for (const part of path.split(".")) {
        node = (node as JsonObject)[part];
      }
      return node as JsonObject;
    };
    // Top-level optional report blocks become nullable objects.
    for (const field of ["workArchetype", "careerDirection"]) {
      const node = (props[field] ?? {}) as JsonObject;
      assert.equal(node.nullable, true, field);
      assert.equal(node.anyOf, undefined, field);
      assert.equal(node.type, "object", field);
    }
    // Nested nullable strings and references keep their type.
    const bridge = at("properties.careerDirection.properties.alternativesNote");
    assert.equal(bridge.type, "string");
    assert.equal(bridge.nullable, true);
    const bridgeCareer = at("properties.recommendedWorkLane.properties.entryRoute.properties.bridgeCareer");
    assert.equal(bridgeCareer.type, "object");
    assert.equal(bridgeCareer.nullable, true);
  });

  it("preserves sibling metadata and leaves non-null unions untouched", () => {
    const converted = toGeminiJsonSchema({
      type: "object",
      description: "kept",
      properties: {
        choice: {
          description: "sibling survives",
          minItems: 1,
          anyOf: [{ type: "string" }, { type: "null" }],
        },
        either: {
          anyOf: [{ type: "string" }, { type: "integer" }],
        },
      },
      required: ["choice"],
    }) as JsonObject;
    const props = converted.properties as JsonObject;
    const choice = props.choice as JsonObject;
    assert.equal(choice.nullable, true);
    assert.equal(choice.description, "sibling survives");
    assert.equal(choice.minItems, 1);
    assert.equal(choice.type, "string");
    const either = props.either as JsonObject;
    assert.ok(Array.isArray(either.anyOf));
    assert.equal((either.anyOf as unknown[]).length, 2);
  });

  it("does not mutate its input", () => {
    const input = {
      type: "object",
      properties: { a: { anyOf: [{ type: "string" }, { type: "null" }] } },
      required: ["a"],
    };
    const before = JSON.stringify(input);
    toGeminiJsonSchema(input);
    assert.equal(JSON.stringify(input), before);
  });

  it("keeps numeric bounds, array constraints, and deterministic ordering", () => {
    const out = converted();
    const longTerm = (out.properties as JsonObject).longTermOptions as JsonObject;
    assert.equal(longTerm.minItems, 5);
    assert.equal(longTerm.maxItems, 5);
    assert.equal(typeof longTerm.minItems, "number");
    const traits = ((out.properties as JsonObject).traits as JsonObject).properties as JsonObject;
    assert.equal(((traits.technical as JsonObject).properties as JsonObject) !== undefined, true);
    assert.deepEqual(out.propertyOrdering, Object.keys(out.properties as JsonObject));
  });

  it("is deterministic and total on unexpected shapes", () => {
    const first = JSON.stringify(converted());
    assert.equal(JSON.stringify(converted()), first);
    assert.deepEqual(toGeminiJsonSchema({}), {});
    assert.deepEqual(toGeminiJsonSchema({ type: "weird", foo: 1 }), { type: "weird" });
  });
});

describe("canonical validation still rejects malformed Gemini-shaped output", () => {
  it("rejects reports missing profile fields", () => {
    assert.equal(careerReportSchema.safeParse({ profile: {}, traits: {} }).success, false);
    assert.equal(
      careerReportSchema.safeParse({
        profile: { archetype: "x", workerType: "Analyst" },
      }).success,
      false,
    );
  });
});

describe("gemini OpenAPI-schema conversion (responseSchema)", () => {
  function convertedSchema(): JsonObject {
    return toGeminiSchema(careerReportJsonSchema) as JsonObject;
  }

  function at(root: JsonObject, path: string): JsonObject {
    let node: unknown = root;
    for (const part of path.split(".")) {
      node = (node as JsonObject)[part];
    }
    return node as JsonObject;
  }

  it("uses uppercase OpenAPI type names only, with no null types", () => {
    const types = new Set<unknown>();
    collect(convertedSchema(), (node) => {
      if (node.type !== undefined) types.add(node.type);
    });
    assert.ok(types.size > 0);
    for (const type of types) {
      assert.ok(
        ["STRING", "NUMBER", "INTEGER", "BOOLEAN", "ARRAY", "OBJECT"].includes(
          type as string,
        ),
        `unexpected type ${String(type)}`,
      );
    }
    assert.equal(convertedSchema().type, "OBJECT");
  });

  it("keeps nullable as a first-class field on nullable paths", () => {
    const out = convertedSchema();
    for (const field of ["workArchetype", "careerDirection"]) {
      const node = ((out.properties as JsonObject)[field] ?? {}) as JsonObject;
      assert.equal(node.nullable, true, field);
      assert.equal(node.type, "OBJECT", field);
    }
    const bridge = at(out, "properties.careerDirection.properties.alternativesNote");
    assert.equal(bridge.type, "STRING");
    assert.equal(bridge.nullable, true);
    const bridgeCareer = at(out, "properties.recommendedWorkLane.properties.entryRoute.properties.bridgeCareer");
    assert.equal(bridgeCareer.type, "OBJECT");
    assert.equal(bridgeCareer.nullable, true);
  });

  it("contains no anyOf, oneOf, additionalProperties, or $schema", () => {
    const seen = new Set<string>();
    const nullTypes: string[] = [];
    const typeAndUnion: string[] = [];
    collect(convertedSchema(), (node, path) => {
      for (const key of Object.keys(node)) seen.add(key);
      if (node.type === "null" || node.type === "NULL") nullTypes.push(path);
      if (node.type !== undefined && node.anyOf !== undefined) typeAndUnion.push(path);
    });
    for (const banned of ["anyOf", "oneOf", "additionalProperties", "$schema"]) {
      assert.ok(!seen.has(banned), `leaked ${banned}`);
    }
    assert.deepEqual(nullTypes, []);
    assert.deepEqual(typeAndUnion, []);
  });

  it("emits item bounds as strings per the Schema contract", () => {
    const out = convertedSchema();
    const longTerm = (out.properties as JsonObject).longTermOptions as JsonObject;
    assert.equal(longTerm.minItems, "5");
    assert.equal(longTerm.maxItems, "5");
    const seen: unknown[] = [];
    collect(out, (node) => {
      if (node.minItems !== undefined) seen.push(node.minItems);
      if (node.maxItems !== undefined) seen.push(node.maxItems);
    });
    assert.ok(seen.length > 0);
    for (const bound of seen) {
      assert.equal(typeof bound, "string", `non-string bound ${String(bound)}`);
    }
  });

  it("keeps numeric minimum/maximum, string enums, required paths, and ordering", () => {
    const out = convertedSchema();
    const bounds: unknown[] = [];
    const enums: unknown[][] = [];
    collect(out, (node) => {
      if (node.minimum !== undefined) bounds.push(node.minimum);
      if (node.maximum !== undefined) bounds.push(node.maximum);
      if (Array.isArray(node.enum)) enums.push(node.enum as unknown[]);
    });
    assert.ok(bounds.length > 0);
    for (const bound of bounds) {
      assert.equal(typeof bound, "number");
    }
    assert.ok(enums.length >= 10);
    for (const values of enums) {
      assert.ok(values.length > 0);
      for (const value of values) {
        assert.equal(typeof value, "string");
      }
    }
    const canonicalPaths = requiredPaths(careerReportJsonSchema, "", []);
    const convertedPaths = requiredPaths(out, "", []);
    for (const path of canonicalPaths) {
      assert.ok(convertedPaths.includes(path), `lost required path ${path}`);
    }
    assert.deepEqual(out.propertyOrdering, Object.keys(out.properties as JsonObject));
  });

  it("does not mutate its input and drops unsupported keywords", () => {
    const input = {
      type: "object",
      additionalProperties: false,
      properties: { a: { anyOf: [{ type: "string" }, { type: "null" }] } },
      required: ["a"],
    };
    const before = JSON.stringify(input);
    const result = toGeminiSchema(input) as JsonObject;
    assert.equal(JSON.stringify(input), before);
    assert.equal(result.type, "OBJECT");
    assert.equal((result.properties as JsonObject).a !== undefined, true);
    assert.equal((result as JsonObject).additionalProperties, undefined);
    const a = ((result.properties as JsonObject).a ?? {}) as JsonObject;
    assert.equal(a.type, "STRING");
    assert.equal(a.nullable, true);
    assert.equal(a.anyOf, undefined);
  });
});
