import { createClerkClient, verifyToken } from "@clerk/backend";
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";
import { optionalEnv, requiredEnv } from "./env.js";

type Db = NodePgDatabase<typeof schema>;

export interface InstitutionAccess {
  institutionId: string;
  institutionName: string;
}

function getBearerOrSessionToken(
  authorization: string | undefined,
  cookieHeader: string | undefined,
): string | null {
  if (authorization) {
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (match) return match[1].trim();
  }
  if (cookieHeader) {
    for (const part of cookieHeader.split(";")) {
      const [name, ...rest] = part.split("=");
      if (name.trim() === "__session") {
        const value = rest.join("=").trim();
        if (value) return decodeURIComponent(value);
      }
    }
  }
  return null;
}

/** Verifies the Clerk session (cookie or Bearer) and returns the user ID. */
export async function getSessionUserId(
  authorization: string | undefined,
  cookieHeader: string | undefined,
): Promise<string | null> {
  const token = getBearerOrSessionToken(authorization, cookieHeader);
  if (!token) return null;
  try {
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) return null;
    const session = await verifyToken(token, { secretKey: secretKey });
    return session.sub;
  } catch {
    return null;
  }
}

/** Creates (or fetches) the single configured institution. */
export async function ensureConfiguredInstitution(
  db: Db,
): Promise<{ id: string; name: string } | null> {
  const name = optionalEnv("CAREER_INSTITUTION_NAME").trim();
  if (!name) return null;
  const [institution] = await db
    .insert(schema.institutionsTable)
    .values({ name })
    .onConflictDoUpdate({
      target: schema.institutionsTable.name,
      set: { name, updatedAt: new Date() },
    })
    .returning({ id: schema.institutionsTable.id, name: schema.institutionsTable.name });
  return institution ?? null;
}

async function getVerifiedEmails(userId: string): Promise<string[] | null> {
  try {
    const clerk = createClerkClient({ secretKey: requiredEnv("CLERK_SECRET_KEY") });
    const user = await clerk.users.getUser(userId);
    return user.emailAddresses
      .filter((entry) => entry.verification?.status === "verified")
      .map((entry) => entry.emailAddress.trim().toLowerCase())
      .filter((email) => email.length > 0);
  } catch {
    return null;
  }
}

export type AdminCheck =
  | { ok: true; access: InstitutionAccess }
  | { ok: false; reason: "forbidden" | "unavailable" };

/**
 * Institution admins are resolved by Clerk user ID (stable, serverless-safe:
 * no in-memory cache). The first admin is bootstrapped when the verified
 * session email matches CAREER_INSTITUTION_ADMIN_EMAIL.
 */
export async function authorizeInstitutionAdmin(
  db: Db,
  userId: string,
): Promise<AdminCheck> {
  const institutionName = optionalEnv("CAREER_INSTITUTION_NAME").trim();
  const configuredEmail = optionalEnv("CAREER_INSTITUTION_ADMIN_EMAIL")
    .trim()
    .toLowerCase();
  if (!institutionName || !configuredEmail) {
    return { ok: false, reason: "unavailable" };
  }

  const institution = await ensureConfiguredInstitution(db);
  if (!institution) {
    return { ok: false, reason: "unavailable" };
  }

  const [existing] = await db
    .select({ id: schema.institutionAdminsTable.id })
    .from(schema.institutionAdminsTable)
    .where(
      and(
        eq(schema.institutionAdminsTable.institutionId, institution.id),
        eq(schema.institutionAdminsTable.clerkUserId, userId),
      ),
    )
    .limit(1);
  if (existing) {
    return {
      ok: true,
      access: {
        institutionId: institution.id,
        institutionName: institution.name,
      },
    };
  }

  const verifiedEmails = await getVerifiedEmails(userId);
  if (!verifiedEmails) {
    return { ok: false, reason: "unavailable" };
  }
  if (!verifiedEmails.includes(configuredEmail)) {
    return { ok: false, reason: "forbidden" };
  }

  await db
    .insert(schema.institutionAdminsTable)
    .values({ institutionId: institution.id, clerkUserId: userId })
    .onConflictDoNothing();

  return {
    ok: true,
    access: {
      institutionId: institution.id,
      institutionName: institution.name,
    },
  };
}
