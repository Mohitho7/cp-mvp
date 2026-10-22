/**
 * Converts the canonical OpenAI-oriented JSON Schema
 * (careerReportJsonSchema) into the JSON Schema subset the Gemini
 * `responseJsonSchema` configuration supports.
 *
 * Pure and total: never throws, never weakens the contract. Per the
 * installed SDK's documented subset, kept as-is: `type` (lowercase JSON
 * Schema names), `format`, `title`, `description`, string-or-number `enum`,
 * `items`, `minItems`/`maxItems`, `minimum`/`maximum`, `anyOf`,
 * `properties`, `additionalProperties`, `required`, and `propertyOrdering`.
 * Nullable unions (`anyOf: [X, { type: "null" }]`) are rewritten as
 * `{ ...X, nullable: true }`, mirroring the SDK's own converter, because
 * the backend has no null type. Dropped as unsupported: `$schema`, length
 * bounds (`minLength`/`maxLength`), `const`, `default`, `example`, and
 * `pattern`. Length and shape enforcement stays with the worker's Zod
 * validation, which remains the final gate.
 *
 * NOTE: live calls show the backend rejecting `responseJsonSchema` payloads
 * carrying `nullable` (it is outside that field's documented subset), so the
 * provider sends the OpenAPI-style `responseSchema` representation instead
 * (see `toGeminiSchema` below, where `nullable` is a first-class field).
 * This converter is kept unchanged for reference and its tests still lock
 * its behavior.
 */
type JsonObject = Record<string, unknown>;

const KEPT_KEYS = new Set([
  "type",
  "format",
  "title",
  "description",
  "enum",
  "items",
  "minItems",
  "maxItems",
  "minimum",
  "maximum",
  "anyOf",
  "oneOf",
  "nullable",
  "properties",
  "additionalProperties",
  "required",
  "propertyOrdering",
]);

/** OpenAPI `Schema` fields accepted for `responseSchema` (uppercase types). */
const OPENAPI_KEPT_KEYS = new Set([
  "type",
  "format",
  "title",
  "description",
  "enum",
  "items",
  "minItems",
  "maxItems",
  "minimum",
  "maximum",
  "nullable",
  "properties",
  "required",
  "propertyOrdering",
]);

const OPENAPI_TYPE_NAMES: Record<string, string> = {
  string: "STRING",
  number: "NUMBER",
  integer: "INTEGER",
  boolean: "BOOLEAN",
  array: "ARRAY",
  object: "OBJECT",
};

interface ConvertOptions {
  /** Uppercase `type` names for the OpenAPI `Schema` representation. */
  uppercaseTypes: boolean;
  /** Emit `minItems`/`maxItems` as strings, per the `Schema` contract. */
  stringifyItemBounds: boolean;
  keptKeys: Set<string>;
}

const JSON_SCHEMA_OPTIONS: ConvertOptions = {
  uppercaseTypes: false,
  stringifyItemBounds: false,
  keptKeys: KEPT_KEYS,
};

const OPENAPI_SCHEMA_OPTIONS: ConvertOptions = {
  uppercaseTypes: true,
  stringifyItemBounds: true,
  keptKeys: OPENAPI_KEPT_KEYS,
};

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNullType(value: unknown): boolean {
  return isObject(value) && value.type === "null";
}

function convertNode(node: unknown, options: ConvertOptions): unknown {
  if (Array.isArray(node)) {
    return node.map((item) => convertNode(item, options));
  }
  if (!isObject(node)) {
    return node;
  }

  // Nullable union rewrite (mirrors the SDK's own converter): the backend
  // has no null type, so `anyOf: [X, { type: "null" }]` becomes
  // `{ ...X, nullable: true }`, preserving X and all sibling metadata.
  // Unions without exactly one non-null branch pass through untouched.
  if (Array.isArray(node.anyOf)) {
    const convertedOptions = (node.anyOf as unknown[]).map((option) =>
      convertNode(option, options),
    );
    const nonNull = convertedOptions.filter((option) => !isNullType(option));
    if (
      convertedOptions.length > nonNull.length &&
      nonNull.length === 1 &&
      isObject(nonNull[0])
    ) {
      const merged: JsonObject = { ...(nonNull[0] as JsonObject), nullable: true };
      for (const [key, value] of Object.entries(node)) {
        if (key === "anyOf" || !options.keptKeys.has(key)) continue;
        merged[key] = convertNode(value, options);
      }
      return merged;
    }
  }

  const result: JsonObject = {};
  for (const [key, value] of Object.entries(node)) {
    if (!options.keptKeys.has(key)) continue;
    // `properties` maps field names (not schema keywords) to schemas:
    // preserve every key, convert every value.
    if (key === "properties" && isObject(value)) {
      const props: JsonObject = {};
      for (const [name, sub] of Object.entries(value)) {
        props[name] = convertNode(sub, options);
      }
      result[key] = props;
      continue;
    }
    if (
      options.uppercaseTypes &&
      key === "type" &&
      typeof value === "string" &&
      value in OPENAPI_TYPE_NAMES
    ) {
      result[key] = OPENAPI_TYPE_NAMES[value];
      continue;
    }
    if (
      options.stringifyItemBounds &&
      (key === "minItems" || key === "maxItems") &&
      typeof value === "number"
    ) {
      result[key] = String(value);
      continue;
    }
    result[key] = convertNode(value, options);
  }

  if (
    isObject(result.properties) &&
    Array.isArray(result.required) &&
    result.propertyOrdering === undefined
  ) {
    result.propertyOrdering = Object.keys(result.properties);
  }
  return result;
}

/** Converts a canonical report JSON Schema for Gemini responseJsonSchema. */
export function toGeminiJsonSchema(schema: Record<string, unknown>): unknown {
  return convertNode(schema, JSON_SCHEMA_OPTIONS);
}

/**
 * Converts a canonical report JSON Schema into the OpenAPI-style `Schema`
 * representation sent via the SDK's `responseSchema` config field.
 *
 * This is the representation the installed SDK documents as backend-compatible
 * (`nullable` is a first-class `Schema` field, types are uppercase), and the
 * SDK additionally normalizes it client-side (`processJsonSchema`: uppercase
 * check, null-union rewrite, `additionalProperties` removal). The worker's
 * Zod validation remains the final gate; nothing about the report contract
 * is weakened. Never sent alongside `responseJsonSchema`.
 */
export function toGeminiSchema(schema: Record<string, unknown>): unknown {
  return convertNode(schema, OPENAPI_SCHEMA_OPTIONS);
}
