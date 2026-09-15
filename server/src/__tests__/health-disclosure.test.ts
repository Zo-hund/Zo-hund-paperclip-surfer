import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { healthRoutes } from "../routes/health.js";
import { readPersistedDevServerStatus } from "../dev-server-status.js";

vi.mock("../dev-server-status.js", () => ({
  readPersistedDevServerStatus: vi.fn(() => null),
  toDevServerHealthStatus: vi.fn(),
}));

function appFor(actor: any, counts = [1]) {
  const where = vi.fn();
  for (const count of counts) where.mockResolvedValueOnce([{ count }]);
  const db = { select: () => ({ from: () => ({ where }) }) };
  const app = express();
  app.use((req, _res, next) => { req.actor = actor; next(); });
  app.use("/api/health", healthRoutes(db as any, {
    deploymentMode: "authenticated", deploymentExposure: "public",
    authReady: true, companyDeletionEnabled: false,
  }));
  return app;
}

describe("public health disclosure", () => {
  beforeEach(() => vi.clearAllMocks());

  it("only exposes the state needed to enter the sign-in UI", async () => {
    const res = await request(appFor({ type: "none" })).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", deploymentMode: "authenticated",
      bootstrapStatus: "ready", bootstrapInviteActive: false });
    expect(readPersistedDevServerStatus).not.toHaveBeenCalled();
  });

  it("preserves first-user bootstrap state without exposing server metadata", async () => {
    const res = await request(appFor({ type: "none" }, [0, 1])).get("/api/health");
    expect(res.body).toEqual({ status: "ok", deploymentMode: "authenticated",
      bootstrapStatus: "bootstrap_pending", bootstrapInviteActive: true });
    expect(readPersistedDevServerStatus).not.toHaveBeenCalled();
  });

  it("retains operational health details for authenticated board users", async () => {
    const res = await request(appFor({ type: "board", userId: "operator" })).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok", version: expect.any(String),
      authReady: true, features: { companyDeletionEnabled: false } });
  });
});
