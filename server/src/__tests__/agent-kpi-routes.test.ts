import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../middleware/index.js";
import { agentKpiRoutes } from "../routes/agent-kpis.js";

const mockPostRunService = vi.hoisted(() => ({
  getAgentKpis: vi.fn(),
  getAgentTrends: vi.fn(),
}));

const mockAnalyticsService = vi.hoisted(() => ({
  getCompanyAnalytics: vi.fn(),
  listTraces: vi.fn(),
  listObservations: vi.fn(),
  createObservation: vi.fn(),
  deleteObservation: vi.fn(),
}));

vi.mock("../services/agent-runtime/post-run-eval.js", () => ({
  postRunEvalService: () => mockPostRunService,
}));

vi.mock("../services/agent-runtime/kpi-analytics.js", () => ({
  kpiAnalyticsService: () => mockAnalyticsService,
}));

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = {
      type: "board",
      userId: "user-1",
      companyIds: ["company-1"],
      source: "session",
      isInstanceAdmin: false,
    };
    next();
  });
  app.use("/api", agentKpiRoutes({} as any));
  app.use(errorHandler);
  return app;
}

describe("agent KPI tracing routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns company traces with filters", async () => {
    mockAnalyticsService.listTraces.mockResolvedValue([{ runId: "run-1" }]);

    const res = await request(createApp()).get(
      "/api/companies/company-1/analytics/traces?agentId=agent-1&status=failed&issueId=AMXA-42&limit=25&since=2026-04-29T00:00:00.000Z",
    );

    expect(res.status).toBe(200);
    expect(mockAnalyticsService.listTraces).toHaveBeenCalledWith("company-1", {
      agentId: "agent-1",
      status: "failed",
      issueId: "AMXA-42",
      since: new Date("2026-04-29T00:00:00.000Z"),
      limit: 25,
    });
    expect(res.body).toEqual([{ runId: "run-1" }]);
  });
});
