import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { opprrcBackupJobs, opprrcDeliveries } from "@paperclipai/db";
import { opprrcStorageService } from "./opprrc-storage.js";
import { logger } from "../middleware/logger.js";

const execFileAsync = promisify(execFile);

const WORKER_INTERVAL_MS = 15 * 60 * 1_000; // 15 minutes
const BATCH_SIZE = 10;

function isEnabled(): boolean {
  return process.env.OPPRRC_BACKUP_WORKER_ENABLED !== "false";
}

function getRcloneRemote(): string {
  return process.env.RCLONE_REMOTE ?? "gdrive";
}

function getOpprrcRoot(): string {
  return process.env.PAPERCLIP_OPPRRC_ROOT ?? "/paperclip/opprrc";
}

function getDrivePath(): string {
  return `${getRcloneRemote()}:AMX-AIR-HUBS-HQ-ROOT/AMX-AIR-HUB-FOLDER-OPPRRC/`;
}

async function runRcloneSync(): Promise<void> {
  const src = getOpprrcRoot() + "/";
  const dst = getDrivePath();
  await execFileAsync("rclone", [
    "sync",
    src,
    dst,
    "--exclude",
    "RUN-CONTROL.json",
    "--log-level",
    "INFO",
  ]);
}

async function processPendingJobs(db: Db): Promise<void> {
  const svc = opprrcStorageService(db);

  const pending = await db.query.opprrcBackupJobs.findMany({
    where: eq(opprrcBackupJobs.status, "pending"),
    limit: BATCH_SIZE,
  });

  if (pending.length === 0) return;

  for (const job of pending) {
    await db
      .update(opprrcBackupJobs)
      .set({ status: "running", startedAt: new Date() })
      .where(eq(opprrcBackupJobs.id, job.id));

    try {
      // Attempt rclone sync for the specific file
      const delivery = await svc.getDelivery(job.deliveryId!);
      if (!delivery?.vpsFilePath) {
        throw new Error(`Delivery ${job.deliveryId} has no vpsFilePath`);
      }

      await runRcloneSync();

      const driveFolder = getDrivePath() + delivery.category + "/" + delivery.audience + "/";
      const driveFileUrl = driveFolder + delivery.vpsFilePath.split("/").pop();

      await db
        .update(opprrcBackupJobs)
        .set({ status: "completed", completedAt: new Date() })
        .where(eq(opprrcBackupJobs.id, job.id));

      await svc.markBackupSynced(delivery.id, "", driveFileUrl, "");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn({ jobId: job.id, error: message }, "OPPRRC backup job failed");

      await db
        .update(opprrcBackupJobs)
        .set({ status: "failed", errorMessage: message, completedAt: new Date() })
        .where(eq(opprrcBackupJobs.id, job.id));

      await db
        .update(opprrcDeliveries)
        .set({ backupStatus: "failed", updatedAt: new Date() })
        .where(eq(opprrcDeliveries.id, job.deliveryId!));
    }
  }
}

export function startOpprrcBackupWorker(db: Db): () => void {
  if (!isEnabled()) {
    logger.info("OPPRRC backup worker disabled (OPPRRC_BACKUP_WORKER_ENABLED=false)");
    return () => {};
  }

  logger.info(`OPPRRC backup worker started (interval: ${WORKER_INTERVAL_MS / 1_000}s)`);

  const handle = setInterval(() => {
    processPendingJobs(db).catch((err) => {
      logger.error({ err }, "OPPRRC backup worker error");
    });
  }, WORKER_INTERVAL_MS);

  // Run once immediately on startup
  processPendingJobs(db).catch((err) => {
    logger.error({ err }, "OPPRRC backup worker initial run error");
  });

  return () => clearInterval(handle);
}
