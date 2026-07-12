import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { agents, authUsers, companies, lmsMemberProfiles } from "@paperclipai/db";
import { and, asc, count, eq, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { assertInstanceAdmin } from "./authz.js";

/**
 * Cross-company profile directory — agents + human members, public and
 * instance-admin variants. Mirrors the AMX Chain directory pair in amx.ts
 * (chainDirectoryQuerySchema / GET .../amx/chain/directory / GET
 * /instance/amx/chain/directory): a shared query schema, Math.min(limit,
 * 200) clamping, and Promise.all'd row + count queries.
 *
 * There is no single backing table here (agents and lms_member_profiles are
 * distinct tables with different shapes), so "UNION-shaped" means the two
 * result sets are queried independently and merged into one normalized
 * `DirectoryProfileRow[]` in application code, not a SQL UNION.
 */

const directoryProfileQuerySchema = z.object({
  type: z.enum(["agent", "human"]).optional(),
  companyId: z.string().uuid().optional(),
  // Substring match against an agent's skills tags. Humans have no skills
  // column yet, so this only narrows the agent side of the result set.
  skill: z.string().min(1).optional(),
  // Clamped (not rejected) below — an oversized limit is a client asking
  // for "everything", not an invalid request.
  limit: z.coerce.number().int().positive().optional(),
});

interface DirectoryProfileRow {
  id: string;
  type: "agent" | "human";
  name: string;
  title: string;
  companyId: string;
  companyName: string;
  companyPrefix: string;
  skills: string[];
  avatarUrl?: string;
  href: string;
  // Only populated on the instance-admin route — the public route only ever
  // returns rows where this would be true, so it's omitted there.
  isPublicProfile?: boolean;
}

interface AgentDirectoryRow {
  id: string;
  name: string;
  title: string | null;
  companyId: string;
  companyName: string;
  companyPrefix: string;
  skills: unknown;
  isPublicProfile: boolean;
}

interface MemberDirectoryRow {
  id: string;
  userId: string;
  companyId: string;
  companyName: string;
  companyPrefix: string;
  careerInterest: string | null;
  organization: string | null;
  isPublicProfile: boolean;
  userName: string | null;
  userImage: string | null;
}

/** No fully-public per-agent/per-member detail page exists yet, so both
 * hrefs point into the company-prefixed board app (agent's real resume
 * profile route; the company marketplace for humans, who don't have a
 * dedicated profile route yet). An unauthenticated visitor following either
 * link from the public directory will hit the sign-in gate — that's a known
 * limitation of this phase, not a bug. */
function agentHref(companyPrefix: string, agentId: string): string {
  return `/${companyPrefix}/marketplace/agent/${encodeURIComponent(agentId)}`;
}
function humanHref(companyPrefix: string): string {
  return `/${companyPrefix}/marketplace`;
}

export function directoryProfileRoutes(db: Db) {
  const router = Router();

  async function fetchDirectoryProfiles(params: {
    type?: "agent" | "human";
    companyId?: string;
    skill?: string;
    limit: number;
    requirePublicVisibility: boolean;
  }): Promise<{ profiles: DirectoryProfileRow[]; total: number }> {
    const { type, companyId, skill, limit, requirePublicVisibility } = params;
    const includeAgents = type !== "human";
    const includeHumans = type !== "agent";

    const agentFilters: SQL[] = [
      ...(requirePublicVisibility ? [eq(agents.isPublicProfile, true), eq(companies.isPublic, true)] : []),
      ...(companyId ? [eq(agents.companyId, companyId)] : []),
      ...(skill ? [sql`${agents.skills}::text ILIKE ${`%${skill}%`}`] : []),
    ];
    const agentWhere = agentFilters.length > 0 ? and(...agentFilters) : undefined;

    const memberFilters: SQL[] = [
      ...(requirePublicVisibility
        ? [eq(lmsMemberProfiles.isPublicProfile, true), eq(companies.isPublic, true)]
        : []),
      ...(companyId ? [eq(lmsMemberProfiles.companyId, companyId)] : []),
    ];
    const memberWhere = memberFilters.length > 0 ? and(...memberFilters) : undefined;

    const [agentRows, [agentTotalRow], memberRows, [memberTotalRow]] = await Promise.all([
      includeAgents
        ? db
            .select({
              id: agents.id,
              name: agents.name,
              title: agents.title,
              companyId: agents.companyId,
              companyName: companies.name,
              companyPrefix: companies.issuePrefix,
              skills: agents.skills,
              isPublicProfile: agents.isPublicProfile,
            })
            .from(agents)
            .innerJoin(companies, eq(agents.companyId, companies.id))
            .where(agentWhere)
            .orderBy(asc(agents.name))
            .limit(limit)
        : Promise.resolve([] as AgentDirectoryRow[]),
      includeAgents
        ? db.select({ total: count() }).from(agents).innerJoin(companies, eq(agents.companyId, companies.id)).where(agentWhere)
        : Promise.resolve([{ total: 0 }]),
      includeHumans
        ? db
            .select({
              id: lmsMemberProfiles.id,
              userId: lmsMemberProfiles.userId,
              companyId: lmsMemberProfiles.companyId,
              companyName: companies.name,
              companyPrefix: companies.issuePrefix,
              careerInterest: lmsMemberProfiles.careerInterest,
              organization: lmsMemberProfiles.organization,
              isPublicProfile: lmsMemberProfiles.isPublicProfile,
              userName: authUsers.name,
              userImage: authUsers.image,
            })
            .from(lmsMemberProfiles)
            .innerJoin(companies, eq(lmsMemberProfiles.companyId, companies.id))
            .leftJoin(authUsers, eq(lmsMemberProfiles.userId, authUsers.id))
            .where(memberWhere)
            .orderBy(asc(authUsers.name))
            .limit(limit)
        : Promise.resolve([] as MemberDirectoryRow[]),
      includeHumans
        ? db
            .select({ total: count() })
            .from(lmsMemberProfiles)
            .innerJoin(companies, eq(lmsMemberProfiles.companyId, companies.id))
            .where(memberWhere)
        : Promise.resolve([{ total: 0 }]),
    ]);

    const agentProfiles: DirectoryProfileRow[] = (agentRows as AgentDirectoryRow[]).map((a) => ({
      id: a.id,
      type: "agent",
      name: a.name,
      title: a.title ?? "AI Agent",
      companyId: a.companyId,
      companyName: a.companyName,
      companyPrefix: a.companyPrefix,
      skills: Array.isArray(a.skills) ? (a.skills as string[]) : [],
      href: agentHref(a.companyPrefix, a.id),
      ...(requirePublicVisibility ? {} : { isPublicProfile: a.isPublicProfile }),
    }));

    const humanProfiles: DirectoryProfileRow[] = (memberRows as MemberDirectoryRow[]).map((m) => ({
      id: m.id,
      type: "human",
      name: m.userName ?? m.userId,
      title: m.careerInterest || m.organization || "Community Member",
      companyId: m.companyId,
      companyName: m.companyName,
      companyPrefix: m.companyPrefix,
      skills: [],
      ...(m.userImage ? { avatarUrl: m.userImage } : {}),
      href: humanHref(m.companyPrefix),
      ...(requirePublicVisibility ? {} : { isPublicProfile: m.isPublicProfile }),
    }));

    const profiles = [...agentProfiles, ...humanProfiles]
      .sort((x, y) => x.name.localeCompare(y.name))
      .slice(0, limit);

    const total = (agentTotalRow?.total ?? 0) + (memberTotalRow?.total ?? 0);

    return { profiles, total };
  }

  /**
   * GET /public/directory/profiles
   * Fully public — no assertBoard/assertCompanyAccess/assertInstanceAdmin
   * anywhere in this route, matching the "fully public" convention
   * documented at the top of stripe-public.ts. Only returns agents/members
   * whose owner opted into isPublicProfile AND whose company opted into
   * companies.isPublic.
   */
  router.get("/public/directory/profiles", async (req, res) => {
    const parsed = directoryProfileQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query parameters", details: parsed.error.flatten() });
      return;
    }
    const { type, companyId, skill } = parsed.data;
    const limit = Math.min(parsed.data.limit ?? 50, 200);

    const result = await fetchDirectoryProfiles({ type, companyId, skill, limit, requirePublicVisibility: true });
    res.json(result);
  });

  /**
   * GET /instance/directory/profiles
   * assertInstanceAdmin-gated cross-company sibling of the public route
   * above — ignores isPublicProfile/companies.isPublic entirely (an
   * instance admin sees every agent/member profile, public or private) and
   * includes isPublicProfile on each row so the admin UI can show
   * visibility state.
   */
  router.get("/instance/directory/profiles", async (req, res) => {
    assertInstanceAdmin(req);

    const parsed = directoryProfileQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query parameters", details: parsed.error.flatten() });
      return;
    }
    const { type, companyId, skill } = parsed.data;
    const limit = Math.min(parsed.data.limit ?? 50, 200);

    const result = await fetchDirectoryProfiles({ type, companyId, skill, limit, requirePublicVisibility: false });
    res.json(result);
  });

  return router;
}
