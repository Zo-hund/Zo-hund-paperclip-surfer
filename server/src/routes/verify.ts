/**
 * Public membership pass verification.
 *
 * GET /verify/pass/:passId — anyone (no auth) can verify a membership pass by
 *   its credential id (the value encoded in the pass QR code). Returns only
 *   sanitized public status; never exposes private data.
 */
import { Router } from "express";
import { eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { companyMemberships, companies, authUsers } from "@paperclipai/db";

const TIER_BY_ROLE: Record<string, string> = {
  owner: "Expert",
  admin: "Collective",
  member: "Community Partner",
  client: "Community Partner",
};

export function verifyRoutes(db: Db) {
  const router = Router();

  router.get("/verify/pass/:passId", async (req, res) => {
    const passId = String(req.params.passId ?? "").trim();
    if (!passId) {
      res.status(400).json({ valid: false, error: "Missing pass id" });
      return;
    }

    const row = await db
      .select({
        credentialId: companyMemberships.credentialId,
        status: companyMemberships.status,
        role: companyMemberships.membershipRole,
        credentialData: companyMemberships.credentialData,
        createdAt: companyMemberships.createdAt,
        principalId: companyMemberships.principalId,
        principalType: companyMemberships.principalType,
        companyName: companies.name,
      })
      .from(companyMemberships)
      .leftJoin(companies, eq(companies.id, companyMemberships.companyId))
      .where(eq(companyMemberships.credentialId, passId))
      .then((rows) => rows[0] ?? null);

    if (!row) {
      res.status(404).json({ valid: false, error: "Pass not found" });
      return;
    }

    let memberName: string | null = null;
    if (row.principalType === "user") {
      const user = await db
        .select({ name: authUsers.name })
        .from(authUsers)
        .where(eq(authUsers.id, row.principalId))
        .then((rows) => rows[0] ?? null);
      memberName = user?.name ?? null;
    }

    const cd = (row.credentialData ?? {}) as Record<string, unknown>;
    res.json({
      valid: row.status === "active",
      passId: row.credentialId,
      memberName,
      tier: TIER_BY_ROLE[row.role ?? "member"] ?? "Community Partner",
      role: row.role,
      status: row.status,
      company: row.companyName ?? null,
      issuedAt: (cd.issuedAt as string) ?? row.createdAt,
    });
  });

  return router;
}
