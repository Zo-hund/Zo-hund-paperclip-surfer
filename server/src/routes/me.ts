/**
 * Self-service routes for the current signed-in user.
 *
 * GET /me/credential — the current user's digital membership credential.
 *   Accessible to any signed-in board user; returns their own primary
 *   membership credential regardless of company role (no company access
 *   assertion). Used by the MemberProfile pass card.
 */
import { Router } from "express";
import { eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { authUsers } from "@paperclipai/db";
import { accessService } from "../services/index.js";

export function meRoutes(db: Db) {
  const router = Router();
  const access = accessService(db);

  router.get("/me/credential", async (req, res) => {
    const userId = req.actor.userId;
    if (!userId) {
      res.status(401).json({ error: "Sign in required" });
      return;
    }

    const user = await db
      .select({ name: authUsers.name, email: authUsers.email })
      .from(authUsers)
      .where(eq(authUsers.id, userId))
      .then((rows) => rows[0] ?? null);

    const memberships = await access.listUserCompanyAccess(userId);
    // Prefer the most recent membership that has a credential.
    const primary = memberships.find((m) => m.credentialId) ?? memberships[0] ?? null;

    res.json({
      userName: user?.name ?? null,
      userEmail: user?.email ?? null,
      credentialId: primary?.credentialId ?? null,
      credentialData: primary?.credentialData ?? null,
      role: primary?.membershipRole ?? null,
      status: primary?.status ?? null,
      companyId: primary?.companyId ?? null,
      createdAt: primary?.createdAt ?? null,
    });
  });

  return router;
}
