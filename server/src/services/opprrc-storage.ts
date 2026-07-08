import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { eq, and, count } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { opprrcDeliveries, opprrcBackupJobs } from "@paperclipai/db";
import { OPPRRC_CATEGORY_SLUGS, OPPRRC_AUDIENCES, type OpprcCategorySlug, type OpprcAudience } from "@paperclipai/shared";
import { loadConfig } from "../config.js";
import { conflict, unprocessable } from "../errors.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RunControlHistory {
  runNumber: number;
  issueId: string;
  assetFilename: string;
  sha256: string;
  vpsPath: string;
  driveBackupStatus: "pending" | "synced" | "failed" | "skipped_no_rclone";
  timestamp: string;
  costEstimateTokens: number;
}

export interface RunControl {
  version: number;
  totalRuns: number;
  hardStopAt: number;
  driveBackupStatus: string;
  resetLog: Array<{ resetAt: string; resetBy: string; previousTotal: number; reason: string }>;
  history: RunControlHistory[];
}

export interface DeliverInput {
  companyId: string;
  issueId: string;
  assetId?: string;
  category: OpprcCategorySlug;
  audience?: OpprcAudience;
  locationSlug?: string;
  filename: string;
  fileContent: Buffer;
  costEstimateTokens?: number;
  agentId?: string;
}

export interface DeliverResult {
  deliveryId: string;
  vpsFilePath: string;
  vpsFileUrl: string;
  runNumber: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getOpprrcRoot(): string {
  return process.env.PAPERCLIP_OPPRRC_ROOT ?? "/paperclip/opprrc";
}

/**
 * Guards the OPPRRC delivery route: an asset can only be delivered into the
 * OPPRRC system once its issue has actually reached the "opprrc" lifecycle
 * stage (see ISSUE_LIFECYCLE_STAGES). Reuses the same forward-only lifecycle
 * concept as `assertLifecycleTransition` in services/issues.ts.
 */
export function assertIssueReadyForOpprcDelivery(issue: { lifecycleStage: string | null }): void {
  if (issue.lifecycleStage !== "opprrc") {
    throw conflict(
      `Issue must be in the "opprrc" lifecycle stage to receive a delivery (currently: ${issue.lifecycleStage ?? "none"})`,
    );
  }
}

let opprrcRootStructureEnsured = false;

/**
 * Proactively creates the full category x audience directory grid under the
 * OPPRRC root so deliveries only ever land in one of the known folders. Safe
 * to call repeatedly (idempotent, tolerant of an unmounted/missing root).
 */
export async function ensureOpprcRootStructure(): Promise<void> {
  if (opprrcRootStructureEnsured) return;
  const root = getOpprrcRoot();
  try {
    for (const category of OPPRRC_CATEGORY_SLUGS) {
      for (const audience of OPPRRC_AUDIENCES) {
        await fs.mkdir(path.join(root, category, audience), { recursive: true });
      }
    }
    opprrcRootStructureEnsured = true;
  } catch {
    // Tolerate a not-yet-mounted disk; deliver() will retry mkdir per-call.
  }
}

function buildVpsPath(
  category: OpprcCategorySlug,
  audience: OpprcAudience,
  locationSlug: string | undefined,
  filename: string,
): string {
  const root = getOpprrcRoot();
  if (locationSlug) {
    return path.join(root, category, audience, locationSlug, filename);
  }
  return path.join(root, category, audience, filename);
}

async function readRunControl(): Promise<RunControl> {
  const runControlPath = path.join(getOpprrcRoot(), "RUN-CONTROL.json");
  try {
    const raw = await fs.readFile(runControlPath, "utf8");
    return JSON.parse(raw) as RunControl;
  } catch {
    return {
      version: 1,
      totalRuns: 0,
      hardStopAt: 100,
      driveBackupStatus: "pending",
      resetLog: [],
      history: [],
    };
  }
}

async function writeRunControl(ctrl: RunControl): Promise<void> {
  const runControlPath = path.join(getOpprrcRoot(), "RUN-CONTROL.json");
  await fs.writeFile(runControlPath, JSON.stringify(ctrl, null, 2), "utf8");
}

// ── Service ───────────────────────────────────────────────────────────────────

export function opprrcStorageService(db: Db) {
  async function checkRunGuardrail(): Promise<void> {
    const ctrl = await readRunControl();
    if (ctrl.totalRuns >= ctrl.hardStopAt) {
      throw conflict(
        `OPPRRC hard stop: ${ctrl.totalRuns}/${ctrl.hardStopAt} runs completed. ` +
          `Manual review and reset required before continuing.`,
      );
    }
  }

  async function checkDedupGuardrail(sha256: string): Promise<string | null> {
    const ctrl = await readRunControl();
    const match = ctrl.history.find((h) => h.sha256 === sha256);
    return match?.vpsPath ?? null;
  }

  async function deliver(input: DeliverInput): Promise<DeliverResult> {
    const audience = input.audience ?? "CLIENTS-EXTERNAL";

    // Guardrail: hard stop
    await checkRunGuardrail();

    // Guardrail: SHA-256 dedup
    const sha256 = crypto.createHash("sha256").update(input.fileContent).digest("hex");
    const existingPath = await checkDedupGuardrail(sha256);
    if (existingPath) {
      throw unprocessable(
        `OPPRRC dedup: asset already delivered at ${existingPath} (sha256=${sha256}). Skipping.`,
      );
    }

    // Write file to VPS OPPRRC path
    const vpsFilePath = buildVpsPath(input.category, audience, input.locationSlug, input.filename);
    await fs.mkdir(path.dirname(vpsFilePath), { recursive: true });
    await fs.writeFile(vpsFilePath, input.fileContent);

    // Stat-verify the file exists
    try {
      await fs.stat(vpsFilePath);
    } catch {
      // One retry
      await fs.writeFile(vpsFilePath, input.fileContent);
      await fs.stat(vpsFilePath);
    }

    const config = loadConfig();
    const vpsFileUrl = input.assetId
      ? `${config.authPublicBaseUrl ?? ""}/api/assets/${input.assetId}/content`
      : "";

    // Read current run control to assign run number
    const ctrl = await readRunControl();
    const runNumber = ctrl.totalRuns + 1;
    const runBatchId = `batch-${ctrl.hardStopAt}-${Math.floor((runNumber - 1) / ctrl.hardStopAt)}`;

    // Insert DB record
    const [delivery] = await db
      .insert(opprrcDeliveries)
      .values({
        companyId: input.companyId,
        issueId: input.issueId,
        assetId: input.assetId ?? null,
        category: input.category,
        audience,
        locationSlug: input.locationSlug ?? null,
        vpsFilePath,
        vpsFileUrl,
        vpsVerifiedAt: new Date(),
        runNumber,
        runBatchId,
        deliveredByAgentId: input.agentId ?? null,
      })
      .returning({ id: opprrcDeliveries.id });

    // Queue backup job
    await db.insert(opprrcBackupJobs).values({
      deliveryId: delivery.id,
      companyId: input.companyId,
    });

    // Update RUN-CONTROL.json
    ctrl.history.push({
      runNumber,
      issueId: input.issueId,
      assetFilename: input.filename,
      sha256,
      vpsPath: vpsFilePath,
      driveBackupStatus: "pending",
      timestamp: new Date().toISOString(),
      costEstimateTokens: input.costEstimateTokens ?? 0,
    });
    ctrl.totalRuns = runNumber;
    await writeRunControl(ctrl);

    return { deliveryId: delivery.id, vpsFilePath, vpsFileUrl, runNumber };
  }

  async function getRunControl(): Promise<RunControl> {
    return readRunControl();
  }

  async function resetRunControl(operatorId: string, reason: string): Promise<void> {
    const ctrl = await readRunControl();
    ctrl.resetLog.push({
      resetAt: new Date().toISOString(),
      resetBy: operatorId,
      previousTotal: ctrl.totalRuns,
      reason,
    });
    ctrl.totalRuns = 0;
    await writeRunControl(ctrl);
  }

  async function markBackupSynced(
    deliveryId: string,
    driveFileId: string,
    driveFileUrl: string,
    driveFolderId?: string,
  ): Promise<void> {
    await db
      .update(opprrcDeliveries)
      .set({
        googleDriveFileId: driveFileId,
        googleDriveFileUrl: driveFileUrl,
        googleDriveFolderId: driveFolderId ?? null,
        backupStatus: "synced",
        lastBackupAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(opprrcDeliveries.id, deliveryId));

    // Update RUN-CONTROL.json history entry
    const ctrl = await readRunControl();
    const delivery = await db.query.opprrcDeliveries.findFirst({
      where: eq(opprrcDeliveries.id, deliveryId),
    });
    if (delivery) {
      const entry = ctrl.history.find((h) => h.vpsPath === delivery.vpsFilePath);
      if (entry) {
        entry.driveBackupStatus = "synced";
        await writeRunControl(ctrl);
      }
    }
  }

  async function getDelivery(deliveryId: string) {
    return db.query.opprrcDeliveries.findFirst({
      where: eq(opprrcDeliveries.id, deliveryId),
    });
  }

  async function listDeliveries(companyId: string, issueId?: string) {
    return db.query.opprrcDeliveries.findMany({
      where: issueId
        ? and(eq(opprrcDeliveries.companyId, companyId), eq(opprrcDeliveries.issueId, issueId))
        : eq(opprrcDeliveries.companyId, companyId),
      orderBy: (t, { desc }) => [desc(t.deliveredAt)],
      limit: 100,
    });
  }

  async function getBackupStatus(companyId: string) {
    const [pending] = await db
      .select({ count: count() })
      .from(opprrcBackupJobs)
      .where(and(eq(opprrcBackupJobs.companyId, companyId), eq(opprrcBackupJobs.status, "pending")));
    const [failed] = await db
      .select({ count: count() })
      .from(opprrcBackupJobs)
      .where(and(eq(opprrcBackupJobs.companyId, companyId), eq(opprrcBackupJobs.status, "failed")));
    const ctrl = await readRunControl();
    return {
      totalRuns: ctrl.totalRuns,
      hardStopAt: ctrl.hardStopAt,
      remainingRuns: Math.max(0, ctrl.hardStopAt - ctrl.totalRuns),
      pendingBackupJobs: Number(pending.count),
      failedBackupJobs: Number(failed.count),
    };
  }

  return {
    deliver,
    checkRunGuardrail,
    checkDedupGuardrail,
    getRunControl,
    resetRunControl,
    markBackupSynced,
    getDelivery,
    listDeliveries,
    getBackupStatus,
  };
}
