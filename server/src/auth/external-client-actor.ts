// =====================================================================
// Step 6.8B — actorMiddleware gains one new source: 'external_client'.
//
// After verifying the AMX external token, memberships/roles are RELOADED
// FROM THE DB — never trusted from token claims. So a revoked member is
// denied on the very next request. This resolver is what actorMiddleware
// calls for a Bearer <amx-external-token>; it returns the same actor shape
// the existing sources produce, tagged source:'external_client'.
// =====================================================================
import type { Request } from "express";
import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { companyMemberships, instanceUserRoles } from "@paperclipai/db";
import type { CompanyMembershipRole } from "@paperclipai/shared";
import { verifyExternalToken, type Verifier, type VerifyOptions } from "./external-client-token.js";

export interface MembershipSnapshot {
  companyIds: string[];
  companyRoles: Record<string, CompanyMembershipRole>;
  isInstanceAdmin: boolean;
}

/** DB reload seam — production queries the memberships table for this user NOW. */
export type ReloadMemberships = (userId: string) => Promise<MembershipSnapshot>;

export type ExternalActor = Request["actor"];

export class ActorResolveError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "ActorResolveError";
  }
}

/**
 * Live membership loader. Mirrors exactly what the BetterAuth session branch of
 * actorMiddleware loads, so an external client and a first-party session for the
 * same user resolve to identical authority.
 */
export function createDbMembershipLoader(db: Db): ReloadMemberships {
  return async (userId: string): Promise<MembershipSnapshot> => {
    const [roleRow, memberships] = await Promise.all([
      db
        .select({ id: instanceUserRoles.id })
        .from(instanceUserRoles)
        .where(and(eq(instanceUserRoles.userId, userId), eq(instanceUserRoles.role, "instance_admin")))
        .then((rows) => rows[0] ?? null),
      db
        .select({ companyId: companyMemberships.companyId, membershipRole: companyMemberships.membershipRole })
        .from(companyMemberships)
        .where(
          and(
            eq(companyMemberships.principalType, "user"),
            eq(companyMemberships.principalId, userId),
            eq(companyMemberships.status, "active"),
          ),
        ),
    ]);

    const companyRoles: Record<string, CompanyMembershipRole> = {};
    for (const m of memberships) {
      if (m.membershipRole) companyRoles[m.companyId] = m.membershipRole as CompanyMembershipRole;
    }

    return {
      companyIds: memberships.filter((row) => row.membershipRole !== "client").map((row) => row.companyId),
      companyRoles,
      isInstanceAdmin: Boolean(roleRow),
    };
  };
}

export interface ResolveExternalActorDeps {
  verify: Verifier;
  reloadMemberships: ReloadMemberships;
  verifyOptions?: VerifyOptions;
}

/**
 * Resolve an actor from a Bearer external token. Identity = token.sub;
 * authority = fresh DB reload. Any role/company claim in the token is IGNORED.
 */
export async function resolveExternalClientActor(
  token: string,
  deps: ResolveExternalActorDeps,
): Promise<ExternalActor> {
  const claims = verifyExternalToken(deps.verify, token, deps.verifyOptions); // throws TokenError on tamper/expiry/aud
  const snap = await deps.reloadMemberships(claims.sub); // authority from DB, live
  return {
    type: "board",
    userId: claims.sub,
    companyIds: snap.companyIds,
    companyRoles: snap.companyRoles,
    isInstanceAdmin: snap.isInstanceAdmin,
    scope: claims.scope ?? [],
    source: "external_client",
  };
}
