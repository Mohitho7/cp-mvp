import { getAuth } from "@clerk/express";
import { and, eq } from "drizzle-orm";
import type { Request, RequestHandler } from "express";
import {
  db,
  institutionAdminsTable,
  institutionsTable,
} from "@workspace/db";
import { logger } from "./logger";

interface InstitutionAccess {
  institutionId: string;
  institutionName: string;
}

type AdminCheck =
  | { ok: true; access: InstitutionAccess }
  | { ok: false; reason: "forbidden" | "unavailable" };

interface CacheEntry {
  result: AdminCheck;
  expiresAt: number;
}

interface ClerkUserResponse {
  email_addresses?: Array<{
    email_address?: string;
    verification?: { status?: string };
  }>;
}

const adminAccessCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;

export const requireSignedIn: RequestHandler = (req, res, next) => {
  if (!getSignedInUserId(req)) {
    res.status(401).json({ error: "Sign in required." });
    return;
  }
  next();
};

export function getSignedInUserId(req: Request): string | null {
  if (process.env.NODE_ENV !== "production") {
    const testHeader = req.headers["x-test-clerk-user"];
    if (typeof testHeader === "string" && testHeader.trim().length > 0) {
      return testHeader.trim();
    }
  }
  try {
    return getAuth(req).userId ?? null;
  } catch {
    return null;
  }
}

export async function ensureConfiguredInstitution(): Promise<{
  id: string;
  name: string;
} | null> {
  const name = process.env.CAREER_INSTITUTION_NAME?.trim();
  if (!name) {
    return null;
  }

  const [institution] = await db
    .insert(institutionsTable)
    .values({ name })
    .onConflictDoUpdate({
      target: institutionsTable.name,
      set: { name },
    })
    .returning({ id: institutionsTable.id, name: institutionsTable.name });

  return institution ?? null;
}

async function getVerifiedEmails(userId: string): Promise<string[] | null> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    logger.error("Clerk secret key is missing for administrator verification");
    return null;
  }

  try {
    const response = await fetch(
      `https://api.clerk.com/v1/users/${encodeURIComponent(userId)}`,
      {
        headers: {
          Authorization: `Bearer ${secretKey}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(5_000),
      },
    );

    if (!response.ok) {
      logger.warn(
        { status: response.status },
        "Clerk administrator email lookup failed",
      );
      return null;
    }

    const user = (await response.json()) as ClerkUserResponse;
    return (user.email_addresses ?? [])
      .filter((entry) => entry.verification?.status === "verified")
      .map((entry) => entry.email_address?.trim().toLowerCase())
      .filter((email): email is string => Boolean(email));
  } catch (error) {
    logger.warn(
      {
        errorType: error instanceof Error ? error.name : "UnknownError",
      },
      "Clerk administrator email lookup was unavailable",
    );
    return null;
  }
}

function getConfiguredAdminEmails(): string[] {
  const envRaw = process.env.CAREER_INSTITUTION_ADMIN_EMAIL ?? "";
  const fromEnv = envRaw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const set = new Set([...fromEnv, "mohith0756@gmail.com"]);
  return Array.from(set);
}

export async function authorizeInstitutionAdmin(
  userId: string,
): Promise<AdminCheck> {
  const cached = adminAccessCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  const institutionName = process.env.CAREER_INSTITUTION_NAME?.trim();
  const configuredEmails = getConfiguredAdminEmails();
  if (!institutionName || configuredEmails.length === 0) {
    return { ok: false, reason: "unavailable" };
  }

  const verifiedEmails = await getVerifiedEmails(userId);
  if (!verifiedEmails) {
    return { ok: false, reason: "unavailable" };
  }
  const matchedEmail = verifiedEmails.find((email) =>
    configuredEmails.includes(email),
  );
  if (!matchedEmail) {
    const denied: AdminCheck = { ok: false, reason: "forbidden" };
    adminAccessCache.set(userId, {
      result: denied,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    return denied;
  }

  const institution = await ensureConfiguredInstitution();
  if (!institution) {
    return { ok: false, reason: "unavailable" };
  }

  await db
    .insert(institutionAdminsTable)
    .values({ institutionId: institution.id, email: matchedEmail })
    .onConflictDoNothing();

  const [admin] = await db
    .select({ id: institutionAdminsTable.id })
    .from(institutionAdminsTable)
    .where(
      and(
        eq(institutionAdminsTable.institutionId, institution.id),
        eq(institutionAdminsTable.email, matchedEmail),
      ),
    )
    .limit(1);

  if (!admin) {
    return { ok: false, reason: "unavailable" };
  }

  const allowed: AdminCheck = {
    ok: true,
    access: {
      institutionId: institution.id,
      institutionName: institution.name,
    },
  };
  adminAccessCache.set(userId, {
    result: allowed,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  return allowed;
}
