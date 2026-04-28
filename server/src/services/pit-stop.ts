import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  agents,
  authUsers,
  heartbeatRuns,
  issueWorkProducts,
  pitStopPackages,
  pitStopWorkspaces,
  simNotebooks,
} from "@paperclipai/db";
import { badRequest, notFound, unprocessable } from "../errors.js";
import { issueService } from "./issues.js";
import { workProductService } from "./work-products.js";

type RunRecord = typeof heartbeatRuns.$inferSelect;
type NotebookRecord = typeof simNotebooks.$inferSelect;
type WorkspaceRecord = typeof pitStopWorkspaces.$inferSelect;
type PackageRecord = typeof pitStopPackages.$inferSelect;

const READY_THRESHOLD = 75;

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "simulation";
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function serializeJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function appendMarkdownSection(existing: string, section: string) {
  const trimmedExisting = existing.trim();
  const trimmedSection = section.trim();
  if (!trimmedExisting) return `${trimmedSection}\n`;
  return `${trimmedExisting}\n\n---\n\n${trimmedSection}\n`;
}

function getSummaryText(resultJson: Record<string, unknown> | null | undefined) {
  if (!resultJson) return null;
  return (
    readString(resultJson.summary) ??
    readString(resultJson.result) ??
    readString(resultJson.message) ??
    readString(resultJson.error)
  );
}

function deriveScenarioContext(run: RunRecord, issueAssigneeUserId: string | null) {
  const context = (run.contextSnapshot ?? {}) as Record<string, unknown>;
  const memberUserId =
    readString(context.memberUserId) ??
    readString(context.userId) ??
    (readString(context.requestedByActorType) === "user" ? readString(context.requestedByActorId) : null) ??
    issueAssigneeUserId ??
    "unknown-member";
  const scenarioLabel =
    readString(context.scenarioLabel) ??
    readString(context.scenario) ??
    readString(context.simulationName) ??
    readString(context.simulationScenario) ??
    "Simulation Scenario";
  const scenarioKey =
    readString(context.scenarioKey) ??
    readString(context.simulationId) ??
    slugify(scenarioLabel);
  return { memberUserId, scenarioLabel, scenarioKey, context };
}

function normalizeRunSummary(input: {
  run: RunRecord;
  agentName: string | null;
  memberUserName: string | null;
}) {
  const context = (input.run.contextSnapshot ?? {}) as Record<string, unknown>;
  const resultJson = (input.run.resultJson ?? {}) as Record<string, unknown>;
  const failures = readStringArray(resultJson.failures);
  const bottlenecks = readStringArray(resultJson.bottlenecks);
  const recommendedAdjustments = readStringArray(resultJson.recommendedAdjustments);
  const objectives = readStringArray(resultJson.objectives).length
    ? readStringArray(resultJson.objectives)
    : readStringArray(context.objectives);
  const participatingAgents = Array.from(
    new Set(
      [
        input.run.agentId,
        ...readStringArray(context.participatingAgentIds),
      ].filter(Boolean),
    ),
  );
  const metrics =
    typeof resultJson.metrics === "object" && resultJson.metrics !== null && !Array.isArray(resultJson.metrics)
      ? (resultJson.metrics as Record<string, unknown>)
      : {
          durationSeconds:
            input.run.startedAt && input.run.finishedAt
              ? Math.max(0, Math.round((input.run.finishedAt.getTime() - input.run.startedAt.getTime()) / 1000))
              : null,
          exitCode: input.run.exitCode,
        };

  const blockingIssues = Array.from(
    new Set(
      [
        ...readStringArray(resultJson.blockingIssues),
        ...(input.run.status === "failed" || input.run.status === "timed_out" || input.run.status === "cancelled"
          ? [`Run finished with status "${input.run.status}"`]
          : []),
        ...(input.run.error ? [input.run.error] : []),
      ].filter(Boolean),
    ),
  );

  const explicitEvals =
    typeof resultJson.evals === "object" && resultJson.evals !== null && !Array.isArray(resultJson.evals)
      ? (resultJson.evals as Record<string, unknown>)
      : {};
  const evals = {
    completion: clampScore(readNumber(explicitEvals.completion) ?? (input.run.status === "succeeded" ? 100 : 45)),
    reliability: clampScore(readNumber(explicitEvals.reliability) ?? (blockingIssues.length > 0 ? 45 : 86)),
    efficiency: clampScore(readNumber(explicitEvals.efficiency) ?? (input.run.status === "succeeded" ? 82 : 58)),
    safety: clampScore(readNumber(explicitEvals.safety) ?? (blockingIssues.length > 0 ? 55 : 92)),
  };
  const readinessScore =
    clampScore(
      readNumber(resultJson.readinessScore) ??
        Math.round((evals.completion + evals.reliability + evals.efficiency + evals.safety) / 4),
    );
  const thresholdPassed = readinessScore >= READY_THRESHOLD && blockingIssues.length === 0;
  const liveRecommendation = thresholdPassed
    ? "Ready for board/agency review and live-track promotion."
    : "Keep in Pit Stop. Address blocking issues and re-run simulation before live promotion.";

  return {
    memberUserName: input.memberUserName,
    agentName: input.agentName,
    summary: {
      runId: input.run.id,
      agentId: input.run.agentId,
      agentName: input.agentName,
      memberUserName: input.memberUserName,
      invocationSource: input.run.invocationSource,
      triggerDetail: input.run.triggerDetail,
      status: input.run.status,
      runMode: input.run.runMode,
      startedAt: input.run.startedAt?.toISOString() ?? null,
      finishedAt: input.run.finishedAt?.toISOString() ?? null,
      objectives,
      participatingAgents,
      metrics,
      failures,
      bottlenecks,
      recommendedAdjustments,
      resultSummary: getSummaryText(resultJson),
      evals,
      readinessScore,
      thresholdPassed,
      blockingIssues,
      liveRecommendation,
      context,
    },
  };
}

function renderNotebookSection(params: {
  scenarioLabel: string;
  memberUserId: string;
  memberUserName: string | null;
  sectionKey: string;
  normalized: ReturnType<typeof normalizeRunSummary>;
}) {
  const { normalized } = params;
  const runSummary = normalized.summary;
  const lines = [
    `## ${params.sectionKey} · ${params.scenarioLabel}`,
    "",
    "### Run Context",
    `- Member: ${params.memberUserName ?? params.memberUserId}`,
    `- Agent: ${normalized.agentName ?? runSummary.agentId}`,
    `- Run ID: ${runSummary.runId}`,
    `- Status: ${runSummary.status}`,
    `- Started: ${runSummary.startedAt ?? "n/a"}`,
    `- Finished: ${runSummary.finishedAt ?? "n/a"}`,
    "",
    "### Outcome Summary",
    runSummary.resultSummary ?? "No structured summary was emitted by the simulation run.",
    "",
    "### Eval Scores",
    `- Completion: ${runSummary.evals.completion}`,
    `- Reliability: ${runSummary.evals.reliability}`,
    `- Efficiency: ${runSummary.evals.efficiency}`,
    `- Safety: ${runSummary.evals.safety}`,
    `- Readiness: ${runSummary.readinessScore}`,
    "",
    "### What Changed",
    ...(runSummary.recommendedAdjustments.length > 0
      ? runSummary.recommendedAdjustments.map((item) => `- ${item}`)
      : ["- No recommended adjustments were emitted by the run."]),
    "",
    "### Coaching Notes",
    "_Pending trainer notes._",
    "",
    "### Sponsor Notes",
    "_Pending sponsor notes._",
    "",
    "### Recommended Next Run",
    runSummary.liveRecommendation,
    "",
    "### Approval Status",
    runSummary.thresholdPassed
      ? "Threshold passed. Board/agency approval still required for live promotion."
      : "Blocked in Pit Stop pending readiness improvements.",
    "",
    "### Appendix",
    "```json",
    serializeJson({
      objectives: runSummary.objectives,
      metrics: runSummary.metrics,
      failures: runSummary.failures,
      bottlenecks: runSummary.bottlenecks,
      blockingIssues: runSummary.blockingIssues,
      context: runSummary.context,
    }),
    "```",
  ];
  return lines.join("\n");
}

export function pitStopService(db: Db) {
  const issuesSvc = issueService(db);
  const workProducts = workProductService(db);

  async function getUserName(userId: string) {
    return db
      .select({ name: authUsers.name, email: authUsers.email })
      .from(authUsers)
      .where(eq(authUsers.id, userId))
      .then((rows) => rows[0]?.name ?? rows[0]?.email ?? null);
  }

  async function getRunContext(runId: string) {
    const run = await db
      .select()
      .from(heartbeatRuns)
      .where(eq(heartbeatRuns.id, runId))
      .then((rows) => rows[0] ?? null);
    if (!run) throw notFound("Simulation run not found.");
    return run;
  }

  async function ensureNotebookIssue(
    companyId: string,
    memberUserId: string,
    scenarioLabel: string,
    scenarioKey: string,
  ) {
    const existing = await db
      .select({ id: simNotebooks.id, issueId: simNotebooks.issueId })
      .from(simNotebooks)
      .where(
        and(
          eq(simNotebooks.companyId, companyId),
          eq(simNotebooks.memberUserId, memberUserId),
          eq(simNotebooks.scenarioKey, scenarioKey),
        ),
      )
      .then((rows) => rows[0] ?? null);
    if (existing?.issueId) return existing.issueId;

    const issue = await issuesSvc.create(companyId, {
      title: `TECH AT NITE Notebook · ${scenarioLabel}`,
      description: `Rolling simulation notebook for ${memberUserId} in ${scenarioLabel}.`,
      status: "done",
      priority: "medium",
      assigneeUserId: memberUserId,
      createdByUserId: memberUserId,
      originKind: "manual",
      originId: `sim_notebook:${memberUserId}:${scenarioKey}`,
    });
    return issue.id;
  }

  async function ensureNotebookArtifact(
    notebook: NotebookRecord,
    markdown: string,
    sectionKey: string,
    summaryText: string | null,
  ) {
    const metadata = {
      artifactKind: "sim_notebook",
      memberUserId: notebook.memberUserId,
      scenarioKey: notebook.scenarioKey,
      scenarioLabel: notebook.scenarioLabel,
      latestSectionKey: sectionKey,
    };
    if (notebook.workProductId) {
      const updated = await workProducts.update(notebook.workProductId, {
        title: `${notebook.scenarioLabel} Notebook.md`,
        summary: markdown,
        status: "done",
        reviewState: "pending",
        healthStatus: "healthy",
        metadata,
      });
      if (updated) return updated.id;
    }

    const created = await workProducts.createForIssue(notebook.issueId!, notebook.companyId, {
      type: "document",
      provider: "drive",
      externalId: `sim-notebook:${notebook.memberUserId}:${notebook.scenarioKey}`,
      title: `${notebook.scenarioLabel} Notebook.md`,
      url: null,
      status: "done",
      reviewState: "pending",
      isPrimary: true,
      healthStatus: "healthy",
      summary: markdown,
      metadata: {
        ...metadata,
        synopsis: summaryText,
      },
      createdByRunId: notebook.lastSourceRunId,
      projectId: null,
      executionWorkspaceId: null,
      runtimeServiceId: null,
    });
    if (!created) throw badRequest("Failed to create notebook artifact.");
    return created.id;
  }

  async function buildAgentDraft(targetAgentIds: string[]) {
    if (targetAgentIds.length === 0) return {};
    const rows = await db
      .select({
        id: agents.id,
        name: agents.name,
        role: agents.role,
        title: agents.title,
        adapterType: agents.adapterType,
        adapterConfig: agents.adapterConfig,
        runtimeConfig: agents.runtimeConfig,
        capabilities: agents.capabilities,
      })
      .from(agents)
      .where(inArray(agents.id, targetAgentIds));

    return Object.fromEntries(
      rows.map((row) => [
        row.id,
        {
          agentId: row.id,
          name: row.name,
          role: row.role,
          title: row.title,
          adapterType: row.adapterType,
          adapterConfig: row.adapterConfig ?? {},
          runtimeConfig: row.runtimeConfig ?? {},
          capabilities: row.capabilities,
        },
      ]),
    );
  }

  async function ingestSimRun(runId: string) {
    const run = await getRunContext(runId);
    if (run.runMode !== "sim") return null;
    if (!["succeeded", "failed", "timed_out", "cancelled"].includes(run.status)) return null;

    const issueAssigneeUserId = readString((run.contextSnapshot ?? {})["assigneeUserId"]);
    const { memberUserId, scenarioKey, scenarioLabel } = deriveScenarioContext(run, issueAssigneeUserId);
    const agentRow = await db
      .select({ name: agents.name })
      .from(agents)
      .where(eq(agents.id, run.agentId))
      .then((rows) => rows[0] ?? null);
    const memberUserName = memberUserId === "unknown-member" ? null : await getUserName(memberUserId);
    const normalized = normalizeRunSummary({
      run,
      agentName: agentRow?.name ?? null,
      memberUserName,
    });
    const finishedAt = run.finishedAt ?? run.updatedAt ?? run.createdAt;
    const sectionKey = `${finishedAt.toISOString().slice(0, 10)} · ${run.id.slice(0, 8)}`;
    const notebookSection = renderNotebookSection({
      scenarioLabel,
      memberUserId,
      memberUserName,
      sectionKey,
      normalized,
    });

    let notebook = await db
      .select()
      .from(simNotebooks)
      .where(
        and(
          eq(simNotebooks.companyId, run.companyId),
          eq(simNotebooks.memberUserId, memberUserId),
          eq(simNotebooks.scenarioKey, scenarioKey),
        ),
      )
      .then((rows) => rows[0] ?? null);
    if (notebook?.lastSourceRunId === run.id) {
      const workspace = await db
        .select()
        .from(pitStopWorkspaces)
        .where(eq(pitStopWorkspaces.notebookId, notebook.id))
        .then((rows) => rows[0] ?? null);
      return workspace ? { notebook, workspace } : null;
    }

    const notebookIssueId = notebook?.issueId ?? (await ensureNotebookIssue(run.companyId, memberUserId, scenarioLabel, scenarioKey));
    const nextMarkdown = appendMarkdownSection(notebook?.currentMarkdown ?? "", notebookSection);

    if (!notebook) {
      notebook = await db
        .insert(simNotebooks)
        .values({
          companyId: run.companyId,
          memberUserId,
          scenarioKey,
          scenarioLabel,
          issueId: notebookIssueId,
          lastSourceRunId: run.id,
          latestSectionKey: sectionKey,
          currentMarkdown: nextMarkdown,
        })
        .returning()
        .then((rows) => rows[0]);
    } else {
      notebook = await db
        .update(simNotebooks)
        .set({
          scenarioLabel,
          issueId: notebook.issueId ?? notebookIssueId,
          lastSourceRunId: run.id,
          latestSectionKey: sectionKey,
          currentMarkdown: nextMarkdown,
          updatedAt: new Date(),
        })
        .where(eq(simNotebooks.id, notebook.id))
        .returning()
        .then((rows) => rows[0]);
    }

    const artifactId = await ensureNotebookArtifact(
      notebook,
      nextMarkdown,
      sectionKey,
      normalized.summary.resultSummary,
    );
    notebook = await db
      .update(simNotebooks)
      .set({ workProductId: artifactId, updatedAt: new Date() })
      .where(eq(simNotebooks.id, notebook.id))
      .returning()
      .then((rows) => rows[0]);

    const targetAgentIds = Array.from(new Set([run.agentId, ...readStringArray(normalized.summary.context.participatingAgentIds)]));
    const draftAgentConfig = await buildAgentDraft(targetAgentIds);

    const existingWorkspace = await db
      .select()
      .from(pitStopWorkspaces)
      .where(eq(pitStopWorkspaces.notebookId, notebook.id))
      .then((rows) => rows[0] ?? null);

    const workspacePatch = {
      companyId: run.companyId,
      notebookId: notebook.id,
      memberUserId,
      scenarioKey,
      latestSimRunId: run.id,
      latestNotebookSectionKey: sectionKey,
      latestRunSummary: normalized.summary,
      latestEvalSummary: {
        evals: normalized.summary.evals,
        readinessScore: normalized.summary.readinessScore,
        thresholdPassed: normalized.summary.thresholdPassed,
        blockingIssues: normalized.summary.blockingIssues,
        liveRecommendation: normalized.summary.liveRecommendation,
      },
      targetAgentIds,
      readinessScore: normalized.summary.readinessScore,
      thresholdPassed: normalized.summary.thresholdPassed,
      blockingIssues: normalized.summary.blockingIssues,
      liveRecommendation: normalized.summary.liveRecommendation,
      updatedAt: new Date(),
    } satisfies Partial<typeof pitStopWorkspaces.$inferInsert>;

    const workspace = existingWorkspace
      ? await db
          .update(pitStopWorkspaces)
          .set({
            ...workspacePatch,
            draftAgentConfig:
              Object.keys((existingWorkspace.draftAgentConfig as Record<string, unknown> | null) ?? {}).length > 0
                ? existingWorkspace.draftAgentConfig
                : draftAgentConfig,
          })
          .where(eq(pitStopWorkspaces.id, existingWorkspace.id))
          .returning()
          .then((rows) => rows[0])
      : await db
          .insert(pitStopWorkspaces)
          .values({
            ...workspacePatch,
            coachingNotes: null,
            mentorNotes: null,
            sponsorNotes: null,
            generatedNotes: [],
            draftAgentConfig,
            draftAgentDiff: {},
            targetLiveSettings: {},
            targetTrack: null,
            targetRail: null,
          })
          .returning()
          .then((rows) => rows[0]);

    return { notebook, workspace };
  }

  async function listWorkspaces(companyId: string, memberUserId?: string | null) {
    const rows = await db
      .select({
        workspace: pitStopWorkspaces,
        notebook: simNotebooks,
        workProduct: issueWorkProducts,
      })
      .from(pitStopWorkspaces)
      .innerJoin(simNotebooks, eq(pitStopWorkspaces.notebookId, simNotebooks.id))
      .leftJoin(issueWorkProducts, eq(simNotebooks.workProductId, issueWorkProducts.id))
      .where(
        and(
          eq(pitStopWorkspaces.companyId, companyId),
          memberUserId ? eq(pitStopWorkspaces.memberUserId, memberUserId) : undefined,
        ),
      )
      .orderBy(desc(pitStopWorkspaces.updatedAt));

    return rows.map((row) => ({
      ...row.workspace,
      notebook: row.notebook,
      notebookArtifact: row.workProduct,
    }));
  }

  async function getWorkspace(companyId: string, workspaceId: string) {
    const row = await db
      .select({
        workspace: pitStopWorkspaces,
        notebook: simNotebooks,
        workProduct: issueWorkProducts,
      })
      .from(pitStopWorkspaces)
      .innerJoin(simNotebooks, eq(pitStopWorkspaces.notebookId, simNotebooks.id))
      .leftJoin(issueWorkProducts, eq(simNotebooks.workProductId, issueWorkProducts.id))
      .where(and(eq(pitStopWorkspaces.companyId, companyId), eq(pitStopWorkspaces.id, workspaceId)))
      .then((rows) => rows[0] ?? null);
    if (!row) throw notFound("Pit Stop workspace not found.");

    const packages = await db
      .select()
      .from(pitStopPackages)
      .where(eq(pitStopPackages.notebookId, row.notebook.id))
      .orderBy(desc(pitStopPackages.version), desc(pitStopPackages.createdAt));

    return {
      ...row.workspace,
      notebook: row.notebook,
      notebookArtifact: row.workProduct,
      packages,
    };
  }

  async function updateWorkspace(
    companyId: string,
    workspaceId: string,
    patch: Partial<{
      coachingNotes: string | null;
      mentorNotes: string | null;
      sponsorNotes: string | null;
      generatedNotes: string[];
      draftAgentConfig: Record<string, unknown>;
      draftAgentDiff: Record<string, unknown>;
      targetAgentIds: string[];
      targetLiveSettings: Record<string, unknown>;
      targetTrack: string | null;
      targetRail: string | null;
    }>,
  ) {
    const existing = await getWorkspace(companyId, workspaceId);
    const updated = await db
      .update(pitStopWorkspaces)
      .set({
        coachingNotes: patch.coachingNotes ?? undefined,
        mentorNotes: patch.mentorNotes ?? undefined,
        sponsorNotes: patch.sponsorNotes ?? undefined,
        generatedNotes: patch.generatedNotes ?? undefined,
        draftAgentConfig: patch.draftAgentConfig ?? undefined,
        draftAgentDiff: patch.draftAgentDiff ?? undefined,
        targetAgentIds: patch.targetAgentIds ?? undefined,
        targetLiveSettings: patch.targetLiveSettings ?? undefined,
        targetTrack: patch.targetTrack ?? undefined,
        targetRail: patch.targetRail ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(pitStopWorkspaces.id, existing.id))
      .returning()
      .then((rows) => rows[0]);
    return getWorkspace(companyId, updated.id);
  }

  async function createPromotionPackage(companyId: string, workspaceId: string, actorUserId: string) {
    const workspace = await getWorkspace(companyId, workspaceId);
    const latestEval = (workspace.latestEvalSummary ?? {}) as Record<string, unknown>;
    const readinessScore = readNumber(latestEval.readinessScore) ?? workspace.readinessScore ?? 0;
    const thresholdPassed = latestEval.thresholdPassed === true || workspace.thresholdPassed === true;
    const blockingIssues = readStringArray(latestEval.blockingIssues).length
      ? readStringArray(latestEval.blockingIssues)
      : readStringArray(workspace.blockingIssues);
    if (!thresholdPassed || readinessScore < READY_THRESHOLD || blockingIssues.length > 0) {
      throw unprocessable("Pit Stop package is blocked. Clear blocking issues and pass the readiness threshold before promotion.");
    }

    const nextVersion = await db
      .select({ value: sql<number>`coalesce(max(${pitStopPackages.version}), 0)` })
      .from(pitStopPackages)
      .where(eq(pitStopPackages.notebookId, workspace.notebook.id))
      .then((rows) => (rows[0]?.value ?? 0) + 1);

    const created = await db
      .insert(pitStopPackages)
      .values({
        companyId,
        workspaceId: workspace.id,
        notebookId: workspace.notebook.id,
        memberUserId: workspace.memberUserId,
        scenarioKey: workspace.scenarioKey,
        version: nextVersion,
        status: "pending_review",
        sourceSimRunId: workspace.latestSimRunId,
        notebookSectionKey: workspace.latestNotebookSectionKey,
        notebookSnapshotMarkdown: workspace.notebook.currentMarkdown,
        runSummary: (workspace.latestRunSummary as Record<string, unknown>) ?? {},
        evalSummary: (workspace.latestEvalSummary as Record<string, unknown>) ?? {},
        coachingNotes: workspace.coachingNotes,
        mentorNotes: workspace.mentorNotes,
        sponsorNotes: workspace.sponsorNotes,
        generatedNotes: (workspace.generatedNotes as string[] | null) ?? [],
        draftAgentConfig: (workspace.draftAgentConfig as Record<string, unknown>) ?? {},
        draftAgentDiff: (workspace.draftAgentDiff as Record<string, unknown>) ?? {},
        targetAgentIds: (workspace.targetAgentIds as string[] | null) ?? [],
        targetLiveSettings: (workspace.targetLiveSettings as Record<string, unknown>) ?? {},
        targetTrack: workspace.targetTrack,
        targetRail: workspace.targetRail,
        readinessScore,
        thresholdPassed: true,
        blockingIssues,
        liveRecommendation:
          readString(latestEval.liveRecommendation) ??
          workspace.liveRecommendation ??
          "Ready for board/agency review and live promotion.",
        createdByUserId: actorUserId,
      })
      .returning()
      .then((rows) => rows[0]);

    await db
      .update(pitStopWorkspaces)
      .set({ lastPackagedAt: new Date(), updatedAt: new Date() })
      .where(eq(pitStopWorkspaces.id, workspace.id));

    return created;
  }

  async function attachApproval(packageId: string, approvalId: string) {
    const row = await db
      .update(pitStopPackages)
      .set({ approvalId, status: "pending_review", updatedAt: new Date() })
      .where(eq(pitStopPackages.id, packageId))
      .returning()
      .then((rows) => rows[0] ?? null);
    if (!row) throw notFound("Promotion package not found.");
    await db
      .update(pitStopWorkspaces)
      .set({ lastApprovalId: approvalId, updatedAt: new Date() })
      .where(eq(pitStopWorkspaces.id, row.workspaceId!));
    return row;
  }

  async function getPackageByApprovalId(approvalId: string) {
    return db
      .select()
      .from(pitStopPackages)
      .where(eq(pitStopPackages.approvalId, approvalId))
      .then((rows) => rows[0] ?? null);
  }

  async function getPackageById(packageId: string) {
    const row = await db
      .select()
      .from(pitStopPackages)
      .where(eq(pitStopPackages.id, packageId))
      .then((rows) => rows[0] ?? null);
    if (!row) throw notFound("Promotion package not found.");
    return row;
  }

  async function recordApprovalOutcome(
    packageId: string,
    outcome: "approved" | "revision_requested" | "rejected" | "pending_review",
    note: string | null | undefined,
    promotedLiveRunIds?: string[],
  ) {
    const pkg = await getPackageById(packageId);
    const statusMap = {
      approved: "approved",
      revision_requested: "revision_requested",
      rejected: "rejected",
      pending_review: "pending_review",
    } as const;
    const updated = await db
      .update(pitStopPackages)
      .set({
        status: statusMap[outcome],
        approvalOutcome: outcome,
        approvalNotes: note ?? null,
        approvalReviewedAt: outcome === "pending_review" ? null : new Date(),
        promotedLiveRunIds: promotedLiveRunIds ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(pitStopPackages.id, pkg.id))
      .returning()
      .then((rows) => rows[0]);
    return updated;
  }

  return {
    ingestSimRun,
    listWorkspaces,
    getWorkspace,
    updateWorkspace,
    createPromotionPackage,
    attachApproval,
    getPackageByApprovalId,
    getPackageById,
    recordApprovalOutcome,
  };
}
