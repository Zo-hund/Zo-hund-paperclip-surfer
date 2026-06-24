/**
 * Company member management routes.
 *
 * GET    /companies/:companyId/members          — list all members (admin+)
 * POST   /companies/:companyId/members          — add/upsert a user member (owner only)
 * PATCH  /companies/:companyId/members/:userId  — update member role (owner only)
 * DELETE /companies/:companyId/members/:userId  — remove a member (owner only)
 */
import { Router } from "express";
import { eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { authUsers } from "@paperclipai/db";
import { z } from "zod";
import { COMPANY_MEMBERSHIP_ROLES } from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { accessService, logActivity } from "../services/index.js";
import { assertBoard, assertCompanyAccess, assertCompanyRole, getActorInfo } from "./authz.js";

const addMemberSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(COMPANY_MEMBERSHIP_ROLES).default("member"),
});

const updateMemberRoleSchema = z.object({
  role: z.enum(COMPANY_MEMBERSHIP_ROLES),
});

export function companyMembersRoutes(db: Db) {
  const router = Router({ mergeParams: true });
  const access = accessService(db);

  /**
   * GET /companies/:companyId/members
   * List all company members. Requires at least `admin` role.
   */
  router.get("/", async (req, res) => {
    const { companyId } = req.params as { companyId: string };
    assertBoard(req);
    assertCompanyAccess(req, companyId);
    assertCompanyRole(req, companyId, "admin");

    const members = await access.listMembers(companyId);
    res.json(members);
  });

  /**
   * POST /companies/:companyId/members
   * Add or upsert a user membership. Requires `owner` role.
   */
  router.post("/", validate(addMemberSchema), async (req, res) => {
    const { companyId } = req.params as { companyId: string };
    assertBoard(req);
    assertCompanyAccess(req, companyId);
    assertCompanyRole(req, companyId, "owner");

    const { userId, role } = addMemberSchema.parse(req.body);
    const membership = await access.ensureMembership(companyId, "user", userId, role, "active");

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: "company.member_added",
      entityType: "company",
      entityId: companyId,
      details: { userId, role },
    });

    res.status(201).json(membership);
  });

  /**
   * PATCH /companies/:companyId/members/:userId
   * Update a member's role. Requires `owner` role.
   * Owners cannot demote themselves via this endpoint to prevent lockout.
   */
  router.patch("/:memberId", validate(updateMemberRoleSchema), async (req, res) => {
    const { companyId, memberId } = req.params as { companyId: string; memberId: string };
    assertBoard(req);
    assertCompanyAccess(req, companyId);
    assertCompanyRole(req, companyId, "owner");

    // Prevent self-demotion
    if (memberId === req.actor.userId) {
      res.status(422).json({ error: "Cannot change your own membership role" });
      return;
    }

    const { role } = updateMemberRoleSchema.parse(req.body);
    const updated = await access.updateMemberRole(companyId, "user", memberId, role);
    if (!updated) {
      res.status(404).json({ error: "Member not found" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: "company.member_role_updated",
      entityType: "company",
      entityId: companyId,
      details: { memberId, role },
    });

    res.json(updated);
  });

  /**
   * DELETE /companies/:companyId/members/:userId
   * Remove a member. Requires `owner` role.
   * Owners cannot remove themselves.
   */
  router.delete("/:memberId", async (req, res) => {
    const { companyId, memberId } = req.params as { companyId: string; memberId: string };
    assertBoard(req);
    assertCompanyAccess(req, companyId);
    assertCompanyRole(req, companyId, "owner");

    // Prevent self-removal
    if (memberId === req.actor.userId) {
      res.status(422).json({ error: "Cannot remove your own company membership" });
      return;
    }

    const removed = await access.removeMember(companyId, "user", memberId);
    if (!removed) {
      res.status(404).json({ error: "Member not found" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: "company.member_removed",
      entityType: "company",
      entityId: companyId,
      details: { memberId },
    });

    res.json({ ok: true });
  });

  router.get("/:userId/credential", async (req, res) => {
    const { companyId, userId } = req.params as { companyId: string; userId: string };
    assertBoard(req);
    assertCompanyAccess(req, companyId);

    const membership = await access.getMembership(companyId, "user", userId);
    if (!membership) { res.status(404).json({ error: "Membership not found" }); return; }

    const user = await db.select({ name: authUsers.name, email: authUsers.email })
      .from(authUsers).where(eq(authUsers.id, userId)).then((rows) => rows[0] ?? null);

    res.json({
      membershipId: membership.id,
      credentialId: membership.credentialId ?? null,
      credentialData: membership.credentialData ?? null,
      status: membership.status,
      role: membership.membershipRole,
      companyId: membership.companyId,
      userName: user?.name ?? null,
      userEmail: user?.email ?? null,
      createdAt: membership.createdAt,
    });
  });

  return router;
}
