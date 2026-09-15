import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../middleware/index.js";
import { activityRoutes } from "../routes/activity.js";

const mockActivityService = vi.hoisted(() => ({
  list: vi.fn(),
  forIssue: vi.fn(),
  runsForIssue: vi.fn(),
  issuesForRun: vi.fn(),
  create: vi.fn(),
  getRunScope: vi.fn(),
}));

const mockIssueService = vi.hoisted(() => ({
  getById: vi.fn(),
  getByIdentifier: vi.fn(),
}));

vi.mock("../services/activity.js", () => ({
  activityService: () => mockActivityService,
}));

vi.mock("../services/index.js", () => ({
  issueService: () => mockIssueService,
}));

function createApp(actor: Record<string, unknown> = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = {
      type: "board",
      userId: "user-1",
      companyIds: ["company-1"],
      source: "session",
      isInstanceAdmin: false,
      ...actor,
    };
    next();
  });
  app.use("/api", activityRoutes({} as any));
  app.use(errorHandler);
  return app;
}

describe("activity routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActivityService.getRunScope.mockResolvedValue({ companyId: "company-1" });
    mockActivityService.issuesForRun.mockResolvedValue([]);
  });

  it("rejects anonymous run issue access before loading data", async () => {
    const res = await request(createApp({ type: "none" })).get("/api/heartbeat-runs/run-1/issues");
    expect(res.status).toBe(401);
    expect(mockActivityService.getRunScope).not.toHaveBeenCalled();
    expect(mockActivityService.issuesForRun).not.toHaveBeenCalled();
  });

  it("rejects cross-company run issue access", async () => {
    mockActivityService.getRunScope.mockResolvedValue({ companyId: "company-2" });
    const res = await request(createApp()).get("/api/heartbeat-runs/run-1/issues");
    expect(res.status).toBe(403);
    expect(mockActivityService.issuesForRun).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing run and allows an authorized existing run", async () => {
    mockActivityService.getRunScope.mockResolvedValueOnce(null);
    expect((await request(createApp()).get("/api/heartbeat-runs/missing/issues")).status).toBe(404);
    expect((await request(createApp()).get("/api/heartbeat-runs/run-1/issues")).status).toBe(200);
    expect(mockActivityService.issuesForRun).toHaveBeenCalledWith("run-1");
  });

  it("rejects creating activity in another company", async () => {
    const res = await request(createApp()).post("/api/companies/company-2/activity")
      .send({ actorId: "user-1", action: "test", entityType: "test", entityId: "test" });
    expect(res.status).toBe(403);
    expect(mockActivityService.create).not.toHaveBeenCalled();
  });

  it("resolves issue identifiers before loading runs", async () => {
    mockIssueService.getByIdentifier.mockResolvedValue({
      id: "issue-uuid-1",
      companyId: "company-1",
    });
    mockActivityService.runsForIssue.mockResolvedValue([
      {
        runId: "run-1",
      },
    ]);

    const res = await request(createApp()).get("/api/issues/PAP-475/runs");

    expect(res.status).toBe(200);
    expect(mockIssueService.getByIdentifier).toHaveBeenCalledWith("PAP-475");
    expect(mockIssueService.getById).not.toHaveBeenCalled();
    expect(mockActivityService.runsForIssue).toHaveBeenCalledWith("company-1", "issue-uuid-1");
    expect(res.body).toEqual([{ runId: "run-1" }]);
  });
});
