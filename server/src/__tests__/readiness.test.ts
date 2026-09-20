/**
 * Readiness gate behavior. The property that matters for this deploy pass:
 * a LiveKit outage must NOT take the control plane out of rotation, and
 * LiveKit cannot be promoted to required without the Pit Stop approval flag.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@paperclipai/db";
import { buildReadinessReport, markDraining, resetDraining } from "../health/readiness.js";

/** Minimal stand-in for the one probe query readiness runs. */
function stubDb(opts: { fails?: boolean } = {}): Db {
  return {
    select: () => ({
      from: () => ({
        limit: async () => {
          if (opts.fails) throw new Error("connection refused");
          return [];
        },
      }),
    }),
  } as unknown as Db;
}

const LIVEKIT_ENV = [
  "LIVEKIT_ENABLED",
  "LIVEKIT_REQUIRED",
  "LIVEKIT_PITSTOP_APPROVED",
  "LIVEKIT_URL",
  "LIVEKIT_API_KEY",
  "LIVEKIT_API_SECRET",
] as const;

let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  resetDraining();
  savedEnv = {};
  for (const key of [...LIVEKIT_ENV, "PAPERCLIP_OPPRRC_ROOT"]) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  // A directory that definitely exists, so the OPPRRC probe is healthy by default.
  process.env.PAPERCLIP_OPPRRC_ROOT = mkdtempSync(path.join(tmpdir(), "opprrc-health-"));
});

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetDraining();
});

describe("readiness", () => {
  it("is ok when the required components are healthy", async () => {
    const report = await buildReadinessReport(stubDb());
    expect(report.status).toBe("ok");
    expect(report.components.database).toMatchObject({ status: "healthy", required: true });
    expect(report.components.opprrc).toMatchObject({ status: "healthy", required: true });
  });

  it("stays ok when LiveKit is unconfigured — LiveKit is OBSERVED", async () => {
    const report = await buildReadinessReport(stubDb());
    expect(report.components.livekit).toMatchObject({ status: "degraded", required: false });
    expect(report.status).toBe("ok");
  });

  it("does not become required on LIVEKIT_REQUIRED alone", async () => {
    process.env.LIVEKIT_REQUIRED = "true";
    const report = await buildReadinessReport(stubDb());
    expect(report.components.livekit.required).toBe(false);
    expect(report.status).toBe("ok");
  });

  it("becomes required only once the Pit Stop approval is also recorded", async () => {
    process.env.LIVEKIT_REQUIRED = "true";
    process.env.LIVEKIT_PITSTOP_APPROVED = "true";
    const report = await buildReadinessReport(stubDb());
    expect(report.components.livekit.required).toBe(true);
    // Degraded + required -> out of rotation, which is the point of the gate.
    expect(report.status).toBe("unavailable");
  });

  it("is healthy when LiveKit is enabled and fully configured", async () => {
    process.env.LIVEKIT_ENABLED = "true";
    process.env.LIVEKIT_URL = "wss://livekit.test";
    process.env.LIVEKIT_API_KEY = "key";
    process.env.LIVEKIT_API_SECRET = "secret";
    const report = await buildReadinessReport(stubDb());
    expect(report.components.livekit.status).toBe("healthy");
    expect(report.status).toBe("ok");
  });

  it("is unavailable when the database probe fails", async () => {
    const report = await buildReadinessReport(stubDb({ fails: true }));
    expect(report.components.database.status).toBe("unhealthy");
    expect(report.status).toBe("unavailable");
  });

  it("is unavailable when the OPPRRC root is not mounted", async () => {
    process.env.PAPERCLIP_OPPRRC_ROOT = path.join(tmpdir(), "definitely-not-mounted-opprrc-root");
    const report = await buildReadinessReport(stubDb());
    expect(report.components.opprrc.status).toBe("unhealthy");
    expect(report.status).toBe("unavailable");
  });

  it("reports unavailable once draining, even with everything healthy", async () => {
    markDraining();
    const report = await buildReadinessReport(stubDb());
    expect(report.draining).toBe(true);
    expect(report.status).toBe("unavailable");
  });
});
