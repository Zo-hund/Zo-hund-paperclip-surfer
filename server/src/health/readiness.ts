// =====================================================================
// AMX 6.7 Step 3 — liveness / readiness / version probes.
//
// ADDITIVE. /api/health keeps its existing anonymous contract (it drives
// bootstrap + sign-in); these are separate endpoints for the deploy gate
// and for container orchestration:
//
//   GET /healthz   liveness  — is the process up at all
//   GET /readyz    readiness — may it receive traffic right now
//   GET /version   build identity
//
// Readiness rule: a component marked `required` must be healthy. LiveKit
// ships OBSERVED (required:false) so a LiveKit outage can never take the
// control plane out of rotation — and it cannot be promoted to required
// without LIVEKIT_PITSTOP_APPROVED, which is the Pit Stop gate in code.
// =====================================================================
import { Router } from "express";
import { promises as fs } from "node:fs";
import type { Db } from "@paperclipai/db";
import { instanceUserRoles } from "@paperclipai/db";
import { logger } from "../middleware/logger.js";
import { serverVersion } from "../version.js";
import { getOpprrcRoot } from "../services/opprrc-storage.js";

export type ComponentStatus = "healthy" | "degraded" | "unhealthy";

export interface ComponentHealth {
  status: ComponentStatus;
  required: boolean;
  detail?: string;
  latencyMs?: number;
}

export interface ReadinessReport {
  status: "ok" | "unavailable";
  draining: boolean;
  version: string;
  uptimeSeconds: number;
  components: Record<string, ComponentHealth>;
}

// ---- draining flag (set by the signal handler in index.ts) ----
let draining = false;

/**
 * Flip the instance out of rotation. /readyz starts answering 503 immediately
 * so the load balancer stops sending new work while in-flight requests drain.
 */
export function markDraining(): void {
  draining = true;
}
export function isDraining(): boolean {
  return draining;
}
/** Tests only. */
export function resetDraining(): void {
  draining = false;
}

function envFlag(name: string): boolean {
  return process.env[name] === "true";
}

async function timed<T>(fn: () => Promise<T>): Promise<{ ms: number; ok: true } | { ms: number; ok: false; error: unknown }> {
  const started = Date.now();
  try {
    await fn();
    return { ms: Date.now() - started, ok: true };
  } catch (error) {
    return { ms: Date.now() - started, ok: false, error };
  }
}

/** Real round trip to Postgres — not just "is the pool object present". */
async function checkDatabase(db: Db): Promise<ComponentHealth> {
  const result = await timed(() => db.select({ id: instanceUserRoles.id }).from(instanceUserRoles).limit(1));
  if (result.ok) {
    return { status: "healthy", required: true, latencyMs: result.ms };
  }
  logger.error({ err: result.error }, "readiness: database probe failed");
  return {
    status: "unhealthy",
    required: true,
    latencyMs: result.ms,
    detail: result.error instanceof Error ? result.error.message : "database unreachable",
  };
}

/**
 * OPPRRC evidence root must be mounted and writable — a delivery that silently
 * lands nowhere is worse than a failed one.
 */
async function checkOpprrc(): Promise<ComponentHealth> {
  const root = getOpprrcRoot();
  const result = await timed(() => fs.access(root));
  if (result.ok) {
    return { status: "healthy", required: true, latencyMs: result.ms, detail: root };
  }
  return {
    status: "unhealthy",
    required: true,
    latencyMs: result.ms,
    detail: `OPPRRC root unreachable: ${root}`,
  };
}

/**
 * LiveKit is OBSERVED until the Pit Stop suite passes. `required` is the AND of
 * LIVEKIT_REQUIRED and LIVEKIT_PITSTOP_APPROVED, so flipping REQUIRED alone
 * cannot gate readiness — the approval has to be recorded too.
 */
function checkLiveKit(): ComponentHealth {
  const enabled = envFlag("LIVEKIT_ENABLED");
  const required = envFlag("LIVEKIT_REQUIRED") && envFlag("LIVEKIT_PITSTOP_APPROVED");
  const configured = Boolean(
    process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET,
  );

  if (!enabled) return { status: "degraded", required, detail: "LIVEKIT_ENABLED is not true" };
  if (!configured) return { status: "degraded", required, detail: "LiveKit credentials not configured" };
  return { status: "healthy", required };
}

export async function buildReadinessReport(db: Db): Promise<ReadinessReport> {
  const [database, opprrc] = await Promise.all([checkDatabase(db), checkOpprrc()]);
  const components: Record<string, ComponentHealth> = {
    database,
    opprrc,
    livekit: checkLiveKit(),
  };

  const requiredUnhealthy = Object.values(components).some(
    (c) => c.required && c.status !== "healthy",
  );

  return {
    status: draining || requiredUnhealthy ? "unavailable" : "ok",
    draining,
    version: serverVersion,
    uptimeSeconds: Math.round(process.uptime()),
    components,
  };
}

/**
 * Mounted at the app root (not under /api) so orchestrators and the deploy
 * runbook hit stable, unauthenticated paths.
 */
export function healthProbeRoutes(db: Db) {
  const router = Router();

  // Liveness: the process is running. Never reflects dependency state —
  // an unhealthy dependency must not get the container killed and restarted.
  router.get("/healthz", (_req, res) => {
    res.json({ status: "ok", version: serverVersion, uptimeSeconds: Math.round(process.uptime()) });
  });

  // Readiness: may this instance receive traffic right now.
  router.get("/readyz", async (_req, res) => {
    const report = await buildReadinessReport(db);
    res.status(report.status === "ok" ? 200 : 503).json(report);
  });

  router.get("/version", (_req, res) => {
    res.json({
      version: serverVersion,
      commit: process.env.GIT_COMMIT_SHA ?? process.env.SOURCE_COMMIT ?? null,
      builtAt: process.env.BUILD_TIMESTAMP ?? null,
      node: process.version,
    });
  });

  return router;
}
