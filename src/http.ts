/**
 * Minimal HTTP adapter shared by Vercel functions and unit tests.
 * Handlers speak only this interface, never the raw platform objects.
 */

export interface ApiRequest {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, string | string[] | undefined>;
  /** Pre-parsed body when the platform provides one. */
  body?: unknown;
  /** Raw stream reader fallback (platform request object). */
  stream?: AsyncIterable<Uint8Array> | null;
}

export interface ApiResponse {
  status(code: number): { json(payload: unknown): void };
  setHeader(name: string, value: string): void;
  json(payload: unknown): void;
}

export function sendJson(res: ApiResponse, status: number, payload: unknown): void {
  res.status(status).json(payload);
}

export function header(
  req: ApiRequest,
  name: string,
): string | undefined {
  const value = req.headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}

export function queryParam(
  req: ApiRequest,
  name: string,
): string | undefined {
  const value = req.query[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

export async function readJsonBody(req: ApiRequest): Promise<unknown> {
  if (req.body !== undefined) {
    if (typeof req.body === "string") {
      if (req.body.trim() === "") return undefined;
      return JSON.parse(req.body);
    }
    return req.body;
  }
  if (!req.stream) return undefined;
  const chunks: Uint8Array[] = [];
  for await (const chunk of req.stream) {
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (text.trim() === "") return undefined;
  return JSON.parse(text);
}

/** Builds an ApiRequest from a Vercel/Node (req) object. */
export function fromNodeRequest(nodeReq: {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
  url?: string;
  body?: unknown;
  [key: string]: unknown;
}): ApiRequest {
  let query: Record<string, string | string[] | undefined> = {};
  if (nodeReq.query && typeof nodeReq.query === "object") {
    query = nodeReq.query as Record<string, string | string[] | undefined>;
  } else if (typeof nodeReq.url === "string") {
    const queryStart = nodeReq.url.indexOf("?");
    if (queryStart >= 0) {
      const params = new URLSearchParams(nodeReq.url.slice(queryStart + 1));
      for (const key of params.keys()) {
        query[key] = params.getAll(key).length > 1 ? params.getAll(key) : params.get(key) ?? undefined;
      }
    }
  }
  const stream =
    typeof (nodeReq as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] ===
    "function"
      ? (nodeReq as unknown as AsyncIterable<Uint8Array>)
      : null;
  return {
    method: nodeReq.method,
    url: nodeReq.url,
    headers: nodeReq.headers,
    query,
    body: nodeReq.body,
    stream,
  };
}

/** Platform request/response shapes (Vercel Node functions compatible). */
export interface PlatformRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
  url?: string;
  body?: unknown;
  [key: string]: unknown;
}

export interface PlatformResponse {
  status(code: number): { json(payload: unknown): void };
  setHeader(name: string, value: string): void;
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Credentials": "true",
};

export interface HandlerResult {
  status: number;
  body: unknown;
  retryAfterSec?: number;
}

/**
 * Wraps a platform-agnostic handler: CORS, OPTIONS, error boundary,
 * Retry-After, JSON response.
 */
export function adapt(
  handler: (req: ApiRequest) => Promise<HandlerResult>,
): (vercelReq: PlatformRequest, vercelRes: PlatformResponse) => Promise<void> {
  return async (vercelReq, vercelRes) => {
    const toApiResponse = (): ApiResponse => ({
      status: (code: number) => ({
        json: (payload: unknown) => vercelRes.status(code).json(payload),
        setHeader: (name: string, value: string) =>
          vercelRes.setHeader(name, value),
      }),
      setHeader: (name: string, value: string) =>
        vercelRes.setHeader(name, value),
      json: (payload: unknown) => vercelRes.status(200).json(payload),
    });
    const res = toApiResponse();
    for (const [name, value] of Object.entries(CORS_HEADERS)) {
      res.setHeader(name, value);
    }
    const req = fromNodeRequest(vercelReq);
    if (req.method === "OPTIONS") {
      res.status(204).json({});
      return;
    }
    try {
      const result = await handler(req);
      if (result.retryAfterSec) {
        res.setHeader("Retry-After", String(result.retryAfterSec));
      }
      sendJson(res, result.status, result.body);
    } catch (error) {
      console.error("API handler failed.", error);
      sendJson(res, 500, { error: "The request could not be completed." });
    }
  };
}

/** Bearer token or Clerk session cookie. */
export function authHeaders(req: ApiRequest): {
  authorization: string | undefined;
  cookie: string | undefined;
} {
  return {
    authorization: header(req, "authorization"),
    cookie: header(req, "cookie"),
  };
}
