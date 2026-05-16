import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { approvalService, heartbeatService, issueApprovalService, pitStopService } from "../services/index.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";

const updateWorkspaceSchema = z.object({
  coachingNotes: z.string().nullable().optional(),
  mentorNotes: z.string().nullable().optional(),
  sponsorNotes: z.string().nullable().optional(),
  generatedNotes: z.array(z.string()).optional(),
  draftAgentConfig: z.record(z.unknown()).optional(),
  draftAgentDiff: z.record(z.unknown()).optional(),
  targetAgentIds: z.array(z.string().uuid()).optional(),
  targetLiveSettings: z.record(z.unknown()).optional(),
  targetTrack: z.string().nullable().optional(),
  targetRail: z.string().nullable().optional(),
});

const ingestRunSchema = z.object({
  runId: z.string().uuid(),
});

const prepareOptimizationSchema = z.object({
  optimizationId: z.string().uuid(),
});

const launchOptimizationSchema = z.object({
  optimizationId: z.string().uuid(),
});

export function pitStopRoutes(db: Db) {
  const router = Router();
  const svc = pitStopService(db);
  const approvalsSvc = approvalService(db);
  const heartbeat = heartbeatService(db);
  const issueApprovalsSvc = issueApprovalService(db);

  router.get("/companies/:companyId/pit-stop/workspaces", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const actor = getActorInfo(req);
    const requestedMemberUserId =
      typeof req.query.memberUserId === "string" && req.query.memberUserId.trim()
        ? req.query.memberUserId
        : actor.actorType === "user"
          ? actor.actorId
          : undefined;
    const rows = await svc.listWorkspaces(companyId, requestedMemberUserId);
    res.json(rows);
  });

  router.get("/companies/:companyId/pit-stop/workspaces/:workspaceId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const workspaceId = req.params.workspaceId as string;
    assertCompanyAccess(req, companyId);
    const workspace = await svc.getWorkspace(companyId, workspaceId);
    res.json(workspace);
  });

  router.patch(
    "/companies/:companyId/pit-stop/workspaces/:workspaceId",
    validate(updateWorkspaceSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const workspaceId = req.params.workspaceId as string;
      assertCompanyAccess(req, companyId);
      const updated = await svc.updateWorkspace(companyId, workspaceId, req.body);
      res.json(updated);
    },
  );

  router.post("/companies/:companyId/pit-stop/ingest-run", validate(ingestRunSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const result = await svc.ingestSimRun(req.body.runId);
    if (!result || result.notebook.companyId !== companyId) {
      res.status(404).json({ error: "Simulation run not available for Pit Stop ingestion." });
      return;
    }
    res.status(201).json(result);
  });

  router.post("/companies/:companyId/pit-stop/workspaces/:workspaceId/package-promotion", async (req, res) => {
    const companyId = req.params.companyId as string;
    const workspaceId = req.params.workspaceId as string;
    assertCompanyAccess(req, companyId);
    const actor = getActorInfo(req);
    const packageRow = await svc.createPromotionPackage(companyId, workspaceId, actor.actorId);
    const workspace = await svc.getWorkspace(companyId, workspaceId);

    const approval = await approvalsSvc.create(companyId, {
      type: "sim_to_live_promotion",
      requestedByAgentId: actor.agentId,
      requestedByUserId: actor.actorType === "user" ? actor.actorId : null,
      status: "pending",
      decisionNote: null,
      decidedByUserId: null,
      decidedAt: null,
      updatedAt: new Date(),
      payload: {
        packageId: packageRow.id,
        workspaceId,
        notebookId: workspace.notebook.id,
        notebookWorkProductId: workspace.notebook.workProductId,
        memberUserId: workspace.memberUserId,
        scenarioKey: workspace.scenarioKey,
        scenarioLabel: workspace.notebook.scenarioLabel,
        sourceSimRunId: packageRow.sourceSimRunId,
        readinessScore: packageRow.readinessScore,
        thresholdPassed: packageRow.thresholdPassed,
        blockingIssues: packageRow.blockingIssues,
        targetAgentIds: packageRow.targetAgentIds,
        targetLiveSettings: packageRow.targetLiveSettings,
        targetTrack: packageRow.targetTrack,
        targetRail: packageRow.targetRail,
      },
    });

    if (workspace.notebook.issueId) {
      await issueApprovalsSvc.linkManyForApproval(approval.id, [workspace.notebook.issueId], {
        agentId: actor.agentId,
        userId: actor.actorType === "user" ? actor.actorId : null,
      });
    }

    const attached = await svc.attachApproval(packageRow.id, approval.id);
    res.status(201).json({ package: attached, approval });
  });

  router.get("/companies/:companyId/pit-stop/workspaces/:workspaceId/optimizations", async (req, res) => {
    const companyId = req.params.companyId as string;
    const workspaceId = req.params.workspaceId as string;
    assertCompanyAccess(req, companyId);
    const optimizations = await svc.listOptimizations(companyId, workspaceId);
    res.json(optimizations);
  });

  router.post(
    "/companies/:companyId/pit-stop/workspaces/:workspaceId/optimizations/prepare-rerun",
    validate(prepareOptimizationSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const workspaceId = req.params.workspaceId as string;
      assertCompanyAccess(req, companyId);
      const prepared = await svc.prepareOptimizedRerun(companyId, workspaceId, req.body.optimizationId);
      res.status(201).json(prepared);
    },
  );

  router.post(
    "/companies/:companyId/pit-stop/workspaces/:workspaceId/optimizations/launch-rerun",
    validate(launchOptimizationSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const workspaceId = req.params.workspaceId as string;
      assertCompanyAccess(req, companyId);
      const prepared = await svc.prepareOptimizedRerun(companyId, workspaceId, req.body.optimizationId);
      const optimization = prepared.optimization as { sourceAgentId?: string | null };
      if (!optimization.sourceAgentId) {
        res.status(422).json({ error: "Optimization is missing a source agent." });
        return;
      }
      const run = await heartbeat.wakeup(optimization.sourceAgentId, {
        source: "automation",
        triggerDetail: "system",
        reason: prepared.rerunPayload.reason,
        requestedByActorType: req.actor.type === "agent" ? "agent" : "user",
        requestedByActorId: req.actor.type === "agent" ? req.actor.agentId ?? null : req.actor.userId ?? null,
        runMode: "sim",
        contextSnapshot: prepared.rerunPayload.contextSnapshot,
      });
      if (!run) {
        res.status(202).json({ status: "skipped" });
        return;
      }

      await svc.markOptimizationLaunched(req.body.optimizationId, run.id);
      res.status(201).json({ run });
    },
  );

  return router;
}
