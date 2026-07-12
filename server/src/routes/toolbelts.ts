import { Router } from "express";
import { and, eq, isNull, or } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  toolbelts,
  harnesses,
  agents,
  companies,
  companySkills,
  lmsMarketplaceListings,
} from "@paperclipai/db";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { assertCompanyAccess, assertCompanyRole, assertInstanceAdmin, getActorInfo } from "./authz.js";
import { logActivity } from "../services/index.js";

/**
 * Toolbelts + Harnesses — the Skills/Toolbelts/Harnesses directory taxonomy.
 *
 * A toolbelt is a named, reusable bundle of tool permissions. A harness is a
 * full agent execution profile (adapter/model + optional toolbelt reference +
 * guardrails) that an agent can optionally point at via `agents.harnessId`.
 * Both tables use a nullable `companyId`: null rows are instance-wide presets
 * (e.g. a stock "DevSecOps" toolbelt/harness every company can reference),
 * non-null rows are a company's own custom bundles. See
 * packages/db/src/schema/toolbelts.ts for the full column documentation.
 *
 * Route shape closely follows company-skills.ts (the closest existing
 * analog: a company-scoped catalog-of-named-things table).
 */

const toolbeltCreateSchema = z.object({
  key: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string().optional().nullable(),
  category: z.string().trim().min(1).optional().default("general"),
  toolPermissions: z.array(z.string()).optional().default([]),
});
const toolbeltUpdateSchema = toolbeltCreateSchema.partial();
const instanceToolbeltCreateSchema = toolbeltCreateSchema.extend({
  isPublic: z.boolean().optional().default(false),
});
const instanceToolbeltUpdateSchema = instanceToolbeltCreateSchema.partial();

const harnessCreateSchema = z.object({
  key: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string().optional().nullable(),
  category: z.string().trim().min(1).optional().default("general"),
  adapterType: z.string().trim().min(1).optional().default("openrouter"),
  model: z.string().trim().min(1).optional().default("openrouter/auto"),
  toolbeltId: z.string().uuid().optional().nullable(),
  guardrails: z.record(z.unknown()).optional().default({}),
});
const harnessUpdateSchema = harnessCreateSchema.partial();
const instanceHarnessCreateSchema = harnessCreateSchema.extend({
  isPublic: z.boolean().optional().default(false),
});
const instanceHarnessUpdateSchema = instanceHarnessCreateSchema.partial();

export function toolbeltRoutes(db: Db) {
  const router = Router();

  // ──────────────────────────────────────────────
  // COMPANY-SCOPED TOOLBELTS
  // ──────────────────────────────────────────────

  router.get("/companies/:companyId/toolbelts", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const rows = await db
      .select()
      .from(toolbelts)
      .where(
        or(
          eq(toolbelts.companyId, companyId),
          and(isNull(toolbelts.companyId), eq(toolbelts.isPublic, true)),
        ),
      );
    res.json(rows);
  });

  router.post(
    "/companies/:companyId/toolbelts",
    validate(toolbeltCreateSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      assertCompanyRole(req, companyId, "admin");
      const [row] = await db
        .insert(toolbelts)
        .values({ companyId, ...req.body })
        .returning();

      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "toolbelt.created",
        entityType: "toolbelt",
        entityId: row!.id,
        details: { key: row!.key, name: row!.name },
      });

      res.status(201).json(row);
    },
  );

  router.patch(
    "/companies/:companyId/toolbelts/:toolbeltId",
    validate(toolbeltUpdateSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const toolbeltId = req.params.toolbeltId as string;
      assertCompanyAccess(req, companyId);
      assertCompanyRole(req, companyId, "admin");

      const [row] = await db
        .update(toolbelts)
        .set({ ...req.body, updatedAt: new Date() })
        .where(and(eq(toolbelts.id, toolbeltId), eq(toolbelts.companyId, companyId)))
        .returning();

      if (!row) {
        res.status(404).json({ error: "Toolbelt not found" });
        return;
      }

      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "toolbelt.updated",
        entityType: "toolbelt",
        entityId: row.id,
        details: { changedKeys: Object.keys(req.body).sort() },
      });

      res.json(row);
    },
  );

  // ──────────────────────────────────────────────
  // COMPANY-SCOPED HARNESSES
  // ──────────────────────────────────────────────

  router.get("/companies/:companyId/harnesses", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const rows = await db
      .select()
      .from(harnesses)
      .where(
        or(
          eq(harnesses.companyId, companyId),
          and(isNull(harnesses.companyId), eq(harnesses.isPublic, true)),
        ),
      );
    res.json(rows);
  });

  router.post(
    "/companies/:companyId/harnesses",
    validate(harnessCreateSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      assertCompanyRole(req, companyId, "admin");
      const [row] = await db
        .insert(harnesses)
        .values({ companyId, ...req.body })
        .returning();

      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "harness.created",
        entityType: "harness",
        entityId: row!.id,
        details: { key: row!.key, name: row!.name, adapterType: row!.adapterType, model: row!.model },
      });

      res.status(201).json(row);
    },
  );

  router.patch(
    "/companies/:companyId/harnesses/:harnessId",
    validate(harnessUpdateSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const harnessId = req.params.harnessId as string;
      assertCompanyAccess(req, companyId);
      assertCompanyRole(req, companyId, "admin");

      const [row] = await db
        .update(harnesses)
        .set({ ...req.body, updatedAt: new Date() })
        .where(and(eq(harnesses.id, harnessId), eq(harnesses.companyId, companyId)))
        .returning();

      if (!row) {
        res.status(404).json({ error: "Harness not found" });
        return;
      }

      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "harness.updated",
        entityType: "harness",
        entityId: row.id,
        details: { changedKeys: Object.keys(req.body).sort() },
      });

      res.json(row);
    },
  );

  // ──────────────────────────────────────────────
  // INSTANCE-WIDE PRESET MANAGEMENT (instance admins only)
  // ──────────────────────────────────────────────

  router.get("/instance/toolbelts", async (req, res) => {
    assertInstanceAdmin(req);
    const rows = await db.select().from(toolbelts);
    res.json(rows);
  });

  router.post(
    "/instance/toolbelts",
    validate(instanceToolbeltCreateSchema),
    async (req, res) => {
      assertInstanceAdmin(req);
      const [row] = await db
        .insert(toolbelts)
        .values({ ...req.body, companyId: null })
        .returning();
      res.status(201).json(row);
    },
  );

  router.patch(
    "/instance/toolbelts/:toolbeltId",
    validate(instanceToolbeltUpdateSchema),
    async (req, res) => {
      assertInstanceAdmin(req);
      const toolbeltId = req.params.toolbeltId as string;
      const [row] = await db
        .update(toolbelts)
        .set({ ...req.body, updatedAt: new Date() })
        .where(and(eq(toolbelts.id, toolbeltId), isNull(toolbelts.companyId)))
        .returning();
      if (!row) {
        res.status(404).json({ error: "Instance toolbelt preset not found" });
        return;
      }
      res.json(row);
    },
  );

  router.get("/instance/harnesses", async (req, res) => {
    assertInstanceAdmin(req);
    const rows = await db.select().from(harnesses);
    res.json(rows);
  });

  router.post(
    "/instance/harnesses",
    validate(instanceHarnessCreateSchema),
    async (req, res) => {
      assertInstanceAdmin(req);
      const [row] = await db
        .insert(harnesses)
        .values({ ...req.body, companyId: null })
        .returning();
      res.status(201).json(row);
    },
  );

  router.patch(
    "/instance/harnesses/:harnessId",
    validate(instanceHarnessUpdateSchema),
    async (req, res) => {
      assertInstanceAdmin(req);
      const harnessId = req.params.harnessId as string;
      const [row] = await db
        .update(harnesses)
        .set({ ...req.body, updatedAt: new Date() })
        .where(and(eq(harnesses.id, harnessId), isNull(harnesses.companyId)))
        .returning();
      if (!row) {
        res.status(404).json({ error: "Instance harness preset not found" });
        return;
      }
      res.json(row);
    },
  );

  // ──────────────────────────────────────────────
  // PUBLIC SKILLS DIRECTORY (fully unauthenticated)
  //
  // No assertBoard/assertCompanyAccess/getActorInfo calls anywhere below,
  // matching the convention documented in stripe-public.ts / meeting-guests.ts.
  // Aggregates a skill index from three sources, each gated on the owning
  // company being publicly listed (companies.isPublic = true):
  //   (a) agents.skills          — any agent belonging to a public company
  //   (b) lmsMarketplaceListings.skills — public listings on public companies
  //   (c) companySkills.name    — the skill catalog of a public company
  // Grouped/deduped by skill name in application code (these tables are
  // small, so a UNION query isn't worth the complexity).
  // ──────────────────────────────────────────────

  router.get("/public/directory/skills", async (_req, res) => {
    const [agentRows, listingRows, companySkillRows] = await Promise.all([
      db
        .select({ skills: agents.skills })
        .from(agents)
        .innerJoin(companies, eq(agents.companyId, companies.id))
        .where(eq(companies.isPublic, true)),
      db
        .select({ skills: lmsMarketplaceListings.skills })
        .from(lmsMarketplaceListings)
        .innerJoin(companies, eq(lmsMarketplaceListings.companyId, companies.id))
        .where(and(eq(lmsMarketplaceListings.isPublic, true), eq(companies.isPublic, true))),
      db
        .select({ name: companySkills.name })
        .from(companySkills)
        .innerJoin(companies, eq(companySkills.companyId, companies.id))
        .where(eq(companies.isPublic, true)),
    ]);

    const bySkill = new Map<string, Set<string>>();
    function addSkill(rawName: string | null | undefined, source: string) {
      const name = (rawName ?? "").trim();
      if (!name) return;
      const existing = bySkill.get(name) ?? new Set<string>();
      existing.add(source);
      bySkill.set(name, existing);
    }

    for (const row of agentRows) {
      for (const skill of row.skills ?? []) addSkill(skill, "agent_skills");
    }
    for (const row of listingRows) {
      for (const skill of row.skills ?? []) addSkill(skill, "marketplace_listings");
    }
    for (const row of companySkillRows) {
      addSkill(row.name, "company_skills");
    }

    const skills = Array.from(bySkill.entries())
      .map(([name, sources]) => ({
        name,
        sourceCount: sources.size,
        sources: Array.from(sources).sort(),
      }))
      .sort((a, b) => b.sourceCount - a.sourceCount || a.name.localeCompare(b.name));

    res.json({ skills });
  });

  return router;
}
