import { and, asc, eq, inArray } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { approvalComments, approvals, heartbeatRuns, lmsMarketplaceBookings, opprrcDeliveries, rqSubmissions } from "@paperclipai/db";
import { conflict, notFound, unprocessable } from "../errors.js";
import { redactCurrentUserText } from "../log-redaction.js";
import { agentService } from "./agents.js";
import { budgetService } from "./budgets.js";
import { notifyHireApproved } from "./hire-hook.js";
import { instanceSettingsService } from "./instance-settings.js";
import { webhookDeliveryService } from "./webhook-delivery.js";

export function approvalService(db: Db) {
  const agentsSvc = agentService(db);
  const budgets = budgetService(db);
  const instanceSettings = instanceSettingsService(db);
  const canResolveStatuses = new Set(["pending", "revision_requested", "escalated"]);
  const resolvableStatuses = Array.from(canResolveStatuses);
  const canEscalateStatuses = new Set(["pending", "revision_requested"]);
  type ApprovalRecord = typeof approvals.$inferSelect;
  type ResolutionResult = { approval: ApprovalRecord; applied: boolean };

  function redactApprovalComment<T extends { body: string }>(comment: T, censorUsernameInLogs: boolean): T {
    return {
      ...comment,
      body: redactCurrentUserText(comment.body, { enabled: censorUsernameInLogs }),
    };
  }

  async function getExistingApproval(id: string) {
    const existing = await db
      .select()
      .from(approvals)
      .where(eq(approvals.id, id))
      .then((rows) => rows[0] ?? null);
    if (!existing) throw notFound("Approval not found");
    return existing;
  }

  async function validateReferenceOwnership(approval: {
    companyId: string; type: string; payload: unknown; requestedByAgentId?: string | null;
  }, requirePendingHire = false, requireEligiblePromotion = false) {
    const payload = (approval.payload ?? {}) as Record<string, unknown>;
    const requireAgent = async (id: string, pending = false) => {
      const agent = await agentsSvc.getById(id);
      if (!agent || agent.companyId !== approval.companyId) {
        throw unprocessable("Approval agent reference must belong to its company");
      }
      if (pending && agent.status !== "pending_approval") {
        throw unprocessable("Hire approval target is not pending approval");
      }
    };
    if (approval.requestedByAgentId) await requireAgent(approval.requestedByAgentId);
    if (approval.type === "hire_agent") {
      if (typeof payload.agentId === "string") await requireAgent(payload.agentId, requirePendingHire);
      if (typeof payload.reportsTo === "string") await requireAgent(payload.reportsTo);
    }
    if (approval.type === "pit_stop_review" && typeof payload.simRunId === "string") {
      const run = await db.select({ id: heartbeatRuns.id }).from(heartbeatRuns)
        .where(and(eq(heartbeatRuns.id, payload.simRunId), eq(heartbeatRuns.companyId, approval.companyId)))
        .then(rows => rows[0] ?? null);
      if (!run) throw unprocessable("Approval run reference must belong to its company");
    }
    if (approval.type === "opprrc_delivery_review") {
      if (typeof payload.deliveryId !== "string") throw unprocessable("Approval delivery reference is required");
      const delivery = await db.select({ id: opprrcDeliveries.id }).from(opprrcDeliveries)
        .where(and(eq(opprrcDeliveries.id, payload.deliveryId), eq(opprrcDeliveries.companyId, approval.companyId)))
        .then(rows => rows[0] ?? null);
      if (!delivery) throw unprocessable("Approval delivery reference must belong to its company");
    }
    if (approval.type === "promote_to_live") {
      if (typeof payload.entityId !== "string") throw unprocessable("Approval promotion reference is required");
      if (payload.entityType === "rq_submission") {
        const target = await db.select({ id: rqSubmissions.id, isSimulation: rqSubmissions.isSimulation, simulationStatus: rqSubmissions.simulationStatus }).from(rqSubmissions)
          .where(and(eq(rqSubmissions.id, payload.entityId), eq(rqSubmissions.companyId, approval.companyId)))
          .then(rows => rows[0] ?? null);
        if (!target) throw unprocessable("Approval promotion reference must belong to its company");
        if (requireEligiblePromotion && !(target.isSimulation && target.simulationStatus === "completed")) {
          throw unprocessable("RQ submission is not in a completed simulation state");
        }
      } else if (payload.entityType === "marketplace_booking") {
        const target = await db.select({ id: lmsMarketplaceBookings.id, phase: lmsMarketplaceBookings.phase, status: lmsMarketplaceBookings.status }).from(lmsMarketplaceBookings)
          .where(and(eq(lmsMarketplaceBookings.id, payload.entityId), eq(lmsMarketplaceBookings.companyId, approval.companyId)))
          .then(rows => rows[0] ?? null);
        if (!target) throw unprocessable("Approval promotion reference must belong to its company");
        if (requireEligiblePromotion && !(target.phase === "simulation" && target.status === "completed")) {
          throw unprocessable("Marketplace booking is not in a completed simulation state");
        }
      } else {
        throw unprocessable("Invalid approval promotion entity type");
      }
    }
  }

  async function resolveApproval(
    id: string,
    targetStatus: "approved" | "rejected",
    decidedByUserId: string,
    decisionNote: string | null | undefined,
  ): Promise<ResolutionResult> {
    const existing = await getExistingApproval(id);
    if (!canResolveStatuses.has(existing.status)) {
      if (existing.status === targetStatus) {
        return { approval: existing, applied: false };
      }
      throw unprocessable(
        `Only pending or revision requested approvals can be ${targetStatus === "approved" ? "approved" : "rejected"}`,
      );
    }

    await validateReferenceOwnership(existing, true, targetStatus === "approved");

    const now = new Date();
    const updated = await db
      .update(approvals)
      .set({
        status: targetStatus,
        decidedByUserId,
        decisionNote: decisionNote ?? null,
        decidedAt: now,
        updatedAt: now,
      })
      .where(and(eq(approvals.id, id), eq(approvals.companyId, existing.companyId),
        eq(approvals.type, existing.type), eq(approvals.payload, existing.payload),
        inArray(approvals.status, resolvableStatuses)))
      .returning()
      .then((rows) => rows[0] ?? null);

    if (updated) {
      void webhookDeliveryService(db).deliver(updated.companyId, "approval.decided", {
        approvalId: updated.id,
        status: targetStatus,
        type: updated.type,
        decidedByUserId,
        decidedAt: now.toISOString(),
      }).catch(() => {});
      return { approval: updated, applied: true };
    }

    const latest = await getExistingApproval(id);
    if (latest.status === targetStatus) {
      return { approval: latest, applied: false };
    }

    throw unprocessable(
      `Only pending or revision requested approvals can be ${targetStatus === "approved" ? "approved" : "rejected"}`,
    );
  }

  return {
    list: (companyId: string, status?: string) => {
      const conditions = [eq(approvals.companyId, companyId)];
      if (status) conditions.push(eq(approvals.status, status));
      return db.select().from(approvals).where(and(...conditions));
    },

    getById: (id: string) =>
      db
        .select()
        .from(approvals)
        .where(eq(approvals.id, id))
        .then((rows) => rows[0] ?? null),

    create: async (companyId: string, data: Omit<typeof approvals.$inferInsert, "companyId">) => {
      await validateReferenceOwnership({ ...data, companyId }, false, true);
      return db
        .insert(approvals)
        .values({ ...data, companyId })
        .returning()
        .then((rows) => rows[0]);
    },

    approve: async (id: string, decidedByUserId: string, decisionNote?: string | null) => {
      const { approval: updated, applied } = await resolveApproval(
        id,
        "approved",
        decidedByUserId,
        decisionNote,
      );

      let hireApprovedAgentId: string | null = null;
      const now = new Date();
      if (applied && updated.type === "hire_agent") {
        await validateReferenceOwnership(updated, true);
        const payload = updated.payload as Record<string, unknown>;
        const payloadAgentId = typeof payload.agentId === "string" ? payload.agentId : null;
        if (payloadAgentId) {
          await agentsSvc.activatePendingApproval(payloadAgentId);
          hireApprovedAgentId = payloadAgentId;
        } else {
          const created = await agentsSvc.create(updated.companyId, {
            name: String(payload.name ?? "New Agent"),
            role: String(payload.role ?? "general"),
            title: typeof payload.title === "string" ? payload.title : null,
            reportsTo: typeof payload.reportsTo === "string" ? payload.reportsTo : null,
            capabilities: typeof payload.capabilities === "string" ? payload.capabilities : null,
            adapterType: String(payload.adapterType ?? "process"),
            adapterConfig:
              typeof payload.adapterConfig === "object" && payload.adapterConfig !== null
                ? (payload.adapterConfig as Record<string, unknown>)
                : {},
            budgetMonthlyCents:
              typeof payload.budgetMonthlyCents === "number" ? payload.budgetMonthlyCents : 0,
            metadata:
              typeof payload.metadata === "object" && payload.metadata !== null
                ? (payload.metadata as Record<string, unknown>)
                : null,
            status: "idle",
            spentMonthlyCents: 0,
            permissions: undefined,
            lastHeartbeatAt: null,
          });
          hireApprovedAgentId = created?.id ?? null;
        }
        if (hireApprovedAgentId) {
          const budgetMonthlyCents =
            typeof payload.budgetMonthlyCents === "number" ? payload.budgetMonthlyCents : 0;
          if (budgetMonthlyCents > 0) {
            await budgets.upsertPolicy(
              updated.companyId,
              {
                scopeType: "agent",
                scopeId: hireApprovedAgentId,
                amount: budgetMonthlyCents,
                windowKind: "calendar_month_utc",
              },
              decidedByUserId,
            );
          }
          void notifyHireApproved(db, {
            companyId: updated.companyId,
            agentId: hireApprovedAgentId,
            source: "approval",
            sourceId: id,
            approvedAt: now,
          }).catch(() => {});
        }
      }

      return { approval: updated, applied };
    },

    reject: async (id: string, decidedByUserId: string, decisionNote?: string | null) => {
      const { approval: updated, applied } = await resolveApproval(
        id,
        "rejected",
        decidedByUserId,
        decisionNote,
      );

      if (applied && updated.type === "hire_agent") {
        await validateReferenceOwnership(updated, true);
        const payload = updated.payload as Record<string, unknown>;
        const payloadAgentId = typeof payload.agentId === "string" ? payload.agentId : null;
        if (payloadAgentId) {
          await agentsSvc.terminate(payloadAgentId);
        }
      }

      return { approval: updated, applied };
    },

    requestRevision: async (id: string, decidedByUserId: string, decisionNote?: string | null) => {
      const existing = await getExistingApproval(id);
      if (existing.status !== "pending") {
        throw unprocessable("Only pending approvals can request revision");
      }

      await validateReferenceOwnership(existing);

      const now = new Date();
      const updated = await db
        .update(approvals)
        .set({
          status: "revision_requested",
          decidedByUserId,
          decisionNote: decisionNote ?? null,
          decidedAt: now,
          updatedAt: now,
        })
        .where(and(eq(approvals.id, id), eq(approvals.companyId, existing.companyId),
          eq(approvals.status, existing.status), eq(approvals.type, existing.type), eq(approvals.payload, existing.payload)))
        .returning()
        .then((rows) => rows[0]);
      if (!updated) throw conflict("Approval changed before revision request; reload the approval");
      return updated;
    },

    escalate: async (id: string, decidedByUserId: string, decisionNote?: string | null) => {
      const existing = await getExistingApproval(id);
      if (!canEscalateStatuses.has(existing.status)) {
        throw unprocessable("Only pending or revision requested approvals can be escalated");
      }

      await validateReferenceOwnership(existing);

      const now = new Date();
      const updated = await db
        .update(approvals)
        .set({
          status: "escalated",
          decidedByUserId,
          decisionNote: decisionNote ?? null,
          decidedAt: now,
          updatedAt: now,
        })
        .where(and(eq(approvals.id, id), eq(approvals.companyId, existing.companyId),
          eq(approvals.status, existing.status), eq(approvals.type, existing.type), eq(approvals.payload, existing.payload)))
        .returning()
        .then((rows) => rows[0]);
      if (!updated) throw conflict("Approval changed before escalation; reload the approval");
      return updated;
    },

    resubmit: async (id: string, payload?: Record<string, unknown>) => {
      const existing = await getExistingApproval(id);
      if (existing.status !== "revision_requested") {
        throw unprocessable("Only revision requested approvals can be resubmitted");
      }

      await validateReferenceOwnership({ ...existing, payload: payload ?? existing.payload }, false, true);

      const now = new Date();
      const updated = await db
        .update(approvals)
        .set({
          status: "pending",
          payload: payload ?? existing.payload,
          decisionNote: null,
          decidedByUserId: null,
          decidedAt: null,
          updatedAt: now,
        })
        .where(and(eq(approvals.id, id), eq(approvals.companyId, existing.companyId),
          eq(approvals.status, "revision_requested"), eq(approvals.type, existing.type), eq(approvals.payload, existing.payload)))
        .returning()
        .then((rows) => rows[0]);
      if (!updated) throw conflict("Approval changed before resubmission; reload the approval");
      return updated;
    },

    listComments: async (approvalId: string) => {
      const existing = await getExistingApproval(approvalId);
      const { censorUsernameInLogs } = await instanceSettings.getGeneral();
      return db
        .select()
        .from(approvalComments)
        .where(
          and(
            eq(approvalComments.approvalId, approvalId),
            eq(approvalComments.companyId, existing.companyId),
          ),
        )
        .orderBy(asc(approvalComments.createdAt))
        .then((comments) => comments.map((comment) => redactApprovalComment(comment, censorUsernameInLogs)));
    },

    addComment: async (
      approvalId: string,
      body: string,
      actor: { agentId?: string; userId?: string },
    ) => {
      const existing = await getExistingApproval(approvalId);
      const currentUserRedactionOptions = {
        enabled: (await instanceSettings.getGeneral()).censorUsernameInLogs,
      };
      const redactedBody = redactCurrentUserText(body, currentUserRedactionOptions);
      return db
        .insert(approvalComments)
        .values({
          companyId: existing.companyId,
          approvalId,
          authorAgentId: actor.agentId ?? null,
          authorUserId: actor.userId ?? null,
          body: redactedBody,
        })
        .returning()
        .then((rows) => redactApprovalComment(rows[0], currentUserRedactionOptions.enabled));
    },
  };
}
