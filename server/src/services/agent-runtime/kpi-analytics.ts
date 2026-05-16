import { and, desc, eq, gte, inArray } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  agentKpis,
  agentKpiObservations,
  agentExperiments,
  agents,
  heartbeatRunEvents,
  heartbeatRuns,
} from "@paperclipai/db";
import { buildHeartbeatTraceSummary } from "./trace-summaries.js";

export function kpiAnalyticsService(db: Db) {
  return {
    async getCompanyAnalytics(companyId: string) {
      // Get all agents in the company
      const companyAgents = await db
        .select({ id: agents.id, name: agents.name })
        .from(agents)
        .where(eq(agents.companyId, companyId));

      const agentSummaries = [];

      for (const agent of companyAgents) {
        const kpis = await db
          .select()
          .from(agentKpis)
          .where(eq(agentKpis.agentId, agent.id))
          .orderBy(desc(agentKpis.createdAt))
          .limit(20);

        if (kpis.length === 0) {
          agentSummaries.push({
            agentId: agent.id,
            agentName: agent.name,
            totalRuns: 0,
            completionRate: null,
            avgSelfAssessment: null,
            avgCostCents: null,
            totalCostCents: 0,
            avgDurationSeconds: null,
            avgErrors: null,
          });
          continue;
        }

        const withCompletion = kpis.filter((k) => k.taskCompleted != null);
        const completionRate =
          withCompletion.length > 0
            ? withCompletion.filter((k) => k.taskCompleted).length / withCompletion.length
            : null;

        const avgOf = (getter: (k: (typeof kpis)[0]) => number | null | undefined) => {
          const vals = kpis.map(getter).filter((v): v is number => v != null);
          return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
        };

        const totalCost = kpis.reduce((sum, k) => sum + (k.costCents ?? 0), 0);

        agentSummaries.push({
          agentId: agent.id,
          agentName: agent.name,
          totalRuns: kpis.length,
          completionRate,
          avgSelfAssessment: avgOf((k) => k.selfAssessmentScore),
          avgCostCents: avgOf((k) => k.costCents),
          totalCostCents: totalCost,
          avgDurationSeconds: avgOf((k) => k.durationSeconds),
          avgErrors: avgOf((k) => k.errorsEncountered),
        });
      }

      return {
        companyId,
        agentCount: companyAgents.length,
        agents: agentSummaries,
      };
    },

    async createObservation(data: {
      companyId: string;
      observerType: "ceo_agent" | "board_human";
      observerAgentId?: string | null;
      observerUserId?: string | null;
      observation: string;
      agentIds?: string[];
      actionTaken?: boolean;
      actionNotes?: string | null;
    }) {
      const [obs] = await db
        .insert(agentKpiObservations)
        .values({
          companyId: data.companyId,
          observerType: data.observerType,
          observerAgentId: data.observerAgentId ?? null,
          observerUserId: data.observerUserId ?? null,
          observation: data.observation,
          agentIds: data.agentIds ?? [],
          actionTaken: data.actionTaken ?? false,
          actionNotes: data.actionNotes ?? null,
        })
        .returning();

      return obs;
    },

    async listObservations(companyId: string) {
      return db
        .select()
        .from(agentKpiObservations)
        .where(eq(agentKpiObservations.companyId, companyId))
        .orderBy(desc(agentKpiObservations.createdAt));
    },

    async listTraces(
      companyId: string,
      filters: {
        agentId?: string;
        status?: string;
        issueId?: string;
        since?: Date;
        limit?: number;
      } = {},
    ) {
      const limit = Math.max(1, Math.min(filters.limit ?? 50, 200));
      const queryLimit = Math.min(filters.issueId ? Math.max(limit * 5, 100) : limit, 500);
      const conditions = [eq(heartbeatRuns.companyId, companyId)];
      if (filters.agentId) conditions.push(eq(heartbeatRuns.agentId, filters.agentId));
      if (filters.status) conditions.push(eq(heartbeatRuns.status, filters.status));
      if (filters.since) conditions.push(gte(heartbeatRuns.createdAt, filters.since));

      const runs = await db
        .select({
          id: heartbeatRuns.id,
          companyId: heartbeatRuns.companyId,
          agentId: heartbeatRuns.agentId,
          agentName: agents.name,
          adapterType: agents.adapterType,
          invocationSource: heartbeatRuns.invocationSource,
          triggerDetail: heartbeatRuns.triggerDetail,
          status: heartbeatRuns.status,
          startedAt: heartbeatRuns.startedAt,
          finishedAt: heartbeatRuns.finishedAt,
          error: heartbeatRuns.error,
          errorCode: heartbeatRuns.errorCode,
          exitCode: heartbeatRuns.exitCode,
          usageJson: heartbeatRuns.usageJson,
          resultJson: heartbeatRuns.resultJson,
          sessionIdBefore: heartbeatRuns.sessionIdBefore,
          sessionIdAfter: heartbeatRuns.sessionIdAfter,
          logBytes: heartbeatRuns.logBytes,
          contextSnapshot: heartbeatRuns.contextSnapshot,
        })
        .from(heartbeatRuns)
        .innerJoin(agents, eq(agents.id, heartbeatRuns.agentId))
        .where(and(...conditions))
        .orderBy(desc(heartbeatRuns.createdAt))
        .limit(queryLimit);

      if (runs.length === 0) return [];

      const events = await db
        .select({
          runId: heartbeatRunEvents.runId,
          seq: heartbeatRunEvents.seq,
          eventType: heartbeatRunEvents.eventType,
          message: heartbeatRunEvents.message,
          payload: heartbeatRunEvents.payload,
        })
        .from(heartbeatRunEvents)
        .where(inArray(heartbeatRunEvents.runId, runs.map((run) => run.id)))
        .orderBy(desc(heartbeatRunEvents.createdAt));

      const eventsByRun = new Map<string, typeof events>();
      for (const event of events) {
        const bucket = eventsByRun.get(event.runId) ?? [];
        bucket.push(event);
        eventsByRun.set(event.runId, bucket);
      }

      return runs
        .map((run) => buildHeartbeatTraceSummary(run, (eventsByRun.get(run.id) ?? []).sort((a, b) => a.seq - b.seq)))
        .filter((trace) => !filters.issueId || trace.issueId === filters.issueId)
        .slice(0, limit);
    },

    async deleteObservation(id: string) {
      const [deleted] = await db
        .delete(agentKpiObservations)
        .where(eq(agentKpiObservations.id, id))
        .returning();

      return deleted;
    },

    async listExperiments(agentId: string) {
      return db
        .select()
        .from(agentExperiments)
        .where(eq(agentExperiments.agentId, agentId))
        .orderBy(desc(agentExperiments.createdAt));
    },

    async createExperiment(data: {
      agentId: string;
      companyId: string;
      hypothesis: string;
      approachA: string;
      approachB: string;
      taskType?: string | null;
    }) {
      const [experiment] = await db
        .insert(agentExperiments)
        .values({
          agentId: data.agentId,
          companyId: data.companyId,
          hypothesis: data.hypothesis,
          approachA: data.approachA,
          approachB: data.approachB,
          taskType: data.taskType ?? null,
          status: "running",
        })
        .returning();

      return experiment;
    },

    async updateExperiment(
      experimentId: string,
      data: {
        status?: "running" | "concluded";
        winningApproach?: string | null;
        runsA?: number;
        runsB?: number;
        kpiResultsA?: Record<string, unknown>;
        kpiResultsB?: Record<string, unknown>;
        changeNotes?: string | null;
        concludedAt?: Date | null;
      },
    ) {
      const [updated] = await db
        .update(agentExperiments)
        .set(data)
        .where(eq(agentExperiments.id, experimentId))
        .returning();

      return updated;
    },

    async deleteExperiment(experimentId: string) {
      const [deleted] = await db
        .delete(agentExperiments)
        .where(eq(agentExperiments.id, experimentId))
        .returning();

      return deleted;
    },
  };
}
