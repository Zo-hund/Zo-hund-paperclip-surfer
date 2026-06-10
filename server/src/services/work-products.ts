import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { alias } from "drizzle-orm/pg-core";
import { issueWorkProducts, issues, projects, agents, amxCertificates, auditVerifications } from "@paperclipai/db";
import type { IssueWorkProduct } from "@paperclipai/shared";

type IssueWorkProductRow = typeof issueWorkProducts.$inferSelect;

function toIssueWorkProduct(row: IssueWorkProductRow): IssueWorkProduct {
  return {
    id: row.id,
    companyId: row.companyId,
    projectId: row.projectId ?? null,
    issueId: row.issueId,
    executionWorkspaceId: row.executionWorkspaceId ?? null,
    runtimeServiceId: row.runtimeServiceId ?? null,
    type: row.type as IssueWorkProduct["type"],
    provider: row.provider,
    externalId: row.externalId ?? null,
    title: row.title,
    url: row.url ?? null,
    status: row.status,
    reviewState: row.reviewState as IssueWorkProduct["reviewState"],
    isPrimary: row.isPrimary,
    healthStatus: row.healthStatus as IssueWorkProduct["healthStatus"],
    summary: row.summary ?? null,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    createdByRunId: row.createdByRunId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export type BriefcaseDeliverable = IssueWorkProduct & {
  issueTitle: string;
  issueIdentifier: string;
  issueStatus: string;
  projectName: string;
  agentId: string | null;
  agentName: string | null;
  agentRole: string | null;
  certificateFootprint: string | null;
  auditStatus: string | null;
  auditVerdict?: string | null;
  auditorAgentId?: string | null;
  auditorAgentName?: string | null;
};

export function workProductService(db: Db) {
  /**
   * Full JOIN query used by both global and company deliverable feeds.
   */
  async function queryDeliverables(companyId?: string, search?: string, type?: string): Promise<BriefcaseDeliverable[]> {
    const rows = await db
      .select({
        wp: issueWorkProducts,
        issueTitle: issues.title,
        issueIdentifier: issues.identifier,
        issueStatus: issues.status,
        projectName: projects.name,
        agentId: agents.id,
        agentName: agents.name,
        agentRole: agents.role,
        certFootprint: amxCertificates.certificateFootprint,
        auditStatus: auditVerifications.status,
      })
      .from(issueWorkProducts)
      .innerJoin(issues, eq(issueWorkProducts.issueId, issues.id))
      .leftJoin(projects, eq(issueWorkProducts.projectId, projects.id))
      .leftJoin(agents, eq(issues.assigneeAgentId, agents.id))
      .leftJoin(amxCertificates, eq(amxCertificates.issueId, issueWorkProducts.issueId))
      .leftJoin(auditVerifications, eq(auditVerifications.targetId, sql`${issueWorkProducts.issueId}::text`))
      .where(
        and(
          companyId ? eq(issueWorkProducts.companyId, companyId) : undefined,
          type ? eq(issueWorkProducts.type, type) : undefined,
          search
            ? or(
                ilike(issueWorkProducts.title, `%${search}%`),
                ilike(issues.title, `%${search}%`),
                ilike(agents.name, `%${search}%`),
              )
            : undefined,
        ),
      )
      .orderBy(desc(issueWorkProducts.updatedAt))
      .limit(200);

    return rows.map(({ wp, issueTitle, issueIdentifier, issueStatus, projectName, agentId, agentName, agentRole, certFootprint, auditStatus }) => ({
      ...toIssueWorkProduct(wp),
      issueTitle: issueTitle ?? "",
      issueIdentifier: issueIdentifier ?? "",
      issueStatus: issueStatus ?? "",
      projectName: projectName ?? "No Project",
      agentId: agentId ?? null,
      agentName: agentName ?? null,
      agentRole: agentRole ?? null,
      certificateFootprint: certFootprint ?? null,
      auditStatus: auditStatus ?? null,
    }));
  }

  return {
    listForIssue: async (issueId: string) => {
      const rows = await db
        .select()
        .from(issueWorkProducts)
        .where(eq(issueWorkProducts.issueId, issueId))
        .orderBy(desc(issueWorkProducts.isPrimary), desc(issueWorkProducts.updatedAt));
      return rows.map(toIssueWorkProduct);
    },

    getById: async (id: string) => {
      const row = await db
        .select()
        .from(issueWorkProducts)
        .where(eq(issueWorkProducts.id, id))
        .then((rows) => rows[0] ?? null);
      return row ? toIssueWorkProduct(row) : null;
    },

    getDetailById: async (id: string): Promise<BriefcaseDeliverable | null> => {
      const auditorAgents = alias(agents, "auditor_agents");
      const rows = await db
        .select({
          wp: issueWorkProducts,
          issueTitle: issues.title,
          issueIdentifier: issues.identifier,
          issueStatus: issues.status,
          projectName: projects.name,
          agentId: agents.id,
          agentName: agents.name,
          agentRole: agents.role,
          certFootprint: amxCertificates.certificateFootprint,
          auditStatus: auditVerifications.status,
          auditVerdict: auditVerifications.verdict,
          auditorAgentId: auditorAgents.id,
          auditorAgentName: auditorAgents.name,
        })
        .from(issueWorkProducts)
        .innerJoin(issues, eq(issueWorkProducts.issueId, issues.id))
        .leftJoin(projects, eq(issueWorkProducts.projectId, projects.id))
        .leftJoin(agents, eq(issues.assigneeAgentId, agents.id))
        .leftJoin(amxCertificates, eq(amxCertificates.issueId, issueWorkProducts.issueId))
        .leftJoin(auditVerifications, eq(auditVerifications.targetId, sql`${issueWorkProducts.issueId}::text`))
        .leftJoin(auditorAgents, eq(auditVerifications.auditorAgentId, auditorAgents.id))
        .where(eq(issueWorkProducts.id, id))
        .limit(1);

      const r = rows[0];
      if (!r) return null;
      return {
        ...toIssueWorkProduct(r.wp),
        issueTitle: r.issueTitle ?? "",
        issueIdentifier: r.issueIdentifier ?? "",
        issueStatus: r.issueStatus ?? "",
        projectName: r.projectName ?? "No Project",
        agentId: r.agentId ?? null,
        agentName: r.agentName ?? null,
        agentRole: r.agentRole ?? null,
        certificateFootprint: r.certFootprint ?? null,
        auditStatus: r.auditStatus ?? null,
        auditVerdict: r.auditVerdict ?? null,
        auditorAgentId: r.auditorAgentId ?? null,
        auditorAgentName: r.auditorAgentName ?? null,
      };
    },

    createForIssue: async (issueId: string, companyId: string, data: Omit<typeof issueWorkProducts.$inferInsert, "issueId" | "companyId">) => {
      const row = await db.transaction(async (tx) => {
        if (data.isPrimary) {
          await tx
            .update(issueWorkProducts)
            .set({ isPrimary: false, updatedAt: new Date() })
            .where(
              and(
                eq(issueWorkProducts.companyId, companyId),
                eq(issueWorkProducts.issueId, issueId),
                eq(issueWorkProducts.type, data.type),
              ),
            );
        }
        return await tx
          .insert(issueWorkProducts)
          .values({ ...data, companyId, issueId })
          .returning()
          .then((rows) => rows[0] ?? null);
      });
      return row ? toIssueWorkProduct(row) : null;
    },

    update: async (id: string, patch: Partial<typeof issueWorkProducts.$inferInsert>) => {
      const row = await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(issueWorkProducts)
          .where(eq(issueWorkProducts.id, id))
          .then((rows) => rows[0] ?? null);
        if (!existing) return null;

        if (patch.isPrimary === true) {
          await tx
            .update(issueWorkProducts)
            .set({ isPrimary: false, updatedAt: new Date() })
            .where(
              and(
                eq(issueWorkProducts.companyId, existing.companyId),
                eq(issueWorkProducts.issueId, existing.issueId),
                eq(issueWorkProducts.type, existing.type),
              ),
            );
        }

        return await tx
          .update(issueWorkProducts)
          .set({ ...patch, updatedAt: new Date() })
          .where(eq(issueWorkProducts.id, id))
          .returning()
          .then((rows) => rows[0] ?? null);
      });
      return row ? toIssueWorkProduct(row) : null;
    },

    remove: async (id: string) => {
      const row = await db
        .delete(issueWorkProducts)
        .where(eq(issueWorkProducts.id, id))
        .returning()
        .then((rows) => rows[0] ?? null);
      return row ? toIssueWorkProduct(row) : null;
    },

    listGlobalDeliverables: (search?: string, type?: string) =>
      queryDeliverables(undefined, search, type),

    listCompanyDeliverables: (companyId: string, search?: string, type?: string) =>
      queryDeliverables(companyId, search, type),

    getCompanyMetrics: async (companyId: string) => {
      const rows = await db
        .select()
        .from(issueWorkProducts)
        .where(eq(issueWorkProducts.companyId, companyId));

      const total = rows.length;
      return {
        total,
        statusCounts: rows.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {} as Record<string, number>),
        throughput: Math.round(total / 30),
        avgHealth: rows.filter((r) => r.healthStatus === "healthy").length / (total || 1),
      };
    },
  };
}

export { toIssueWorkProduct };
