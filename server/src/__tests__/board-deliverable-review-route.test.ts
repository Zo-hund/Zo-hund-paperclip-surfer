import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { companyRoutes } from "../routes/companies.js";
import { errorHandler } from "../middleware/index.js";

const mockCompanyService = vi.hoisted(() => ({
  list: vi.fn(),
  stats: vi.fn(),
  getById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  archive: vi.fn(),
  remove: vi.fn(),
}));

const mockAgentService = vi.hoisted(() => ({
  getById: vi.fn(),
}));

const mockAccessService = vi.hoisted(() => ({
  ensureMembership: vi.fn(),
}));

const mockBudgetService = vi.hoisted(() => ({
  upsertPolicy: vi.fn(),
}));

const mockCompanyPortabilityService = vi.hoisted(() => ({
  exportBundle: vi.fn(),
  previewExport: vi.fn(),
  previewImport: vi.fn(),
  importBundle: vi.fn(),
}));

const mockWorkProductService = vi.hoisted(() => ({
  listForIssue: vi.fn(),
  getById: vi.fn(),
  update: vi.fn(),
}));

const mockLogActivity = vi.hoisted(() => vi.fn());

vi.mock("../services/index.js", () => ({
  accessService: () => mockAccessService,
  agentService: () => mockAgentService,
  budgetService: () => mockBudgetService,
  companyPortabilityService: () => mockCompanyPortabilityService,
  workProductService: () => mockWorkProductService,
  companyService: () => mockCompanyService,
  logActivity: mockLogActivity,
}));

// Mock fluent Drizzle DB interface
const mockDb = {
  select: vi.fn(() => mockDb),
  from: vi.fn(() => mockDb),
  where: vi.fn(() => mockDb),
  then: vi.fn((fn) => Promise.resolve(fn([{ assigneeAgentId: "agent-1", projectId: "project-1" }]))),
  insert: vi.fn(() => mockDb),
  values: vi.fn(() => Promise.resolve([{ id: "memory-1" }])),
} as any;

function createApp(actor: Record<string, unknown>) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = actor;
    next();
  });
  app.use("/api/companies", companyRoutes(mockDb));
  app.use(errorHandler);
  return app;
}

describe("PATCH /api/companies/board/deliverables/:id/review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects non-board actors", async () => {
    const app = createApp({
      type: "agent",
      agentId: "agent-1",
      companyId: "company-1",
      source: "agent_key",
    });

    const res = await request(app)
      .patch("/api/companies/board/deliverables/wp-1/review")
      .send({ reviewState: "approved" });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Board access required");
  });

  it("updates deliverable, records comment in metadata, logs activity, and adds agent feedback memory", async () => {
    mockWorkProductService.getById.mockResolvedValue({
      id: "wp-1",
      companyId: "company-1",
      issueId: "issue-1",
      projectId: "project-1",
      title: "Design Specs",
      type: "document",
      summary: "Draft architecture layout.",
      metadata: {},
    });

    mockWorkProductService.update.mockResolvedValue({
      id: "wp-1",
      reviewState: "changes_requested",
    });

    const app = createApp({
      type: "board",
      userId: "user-1",
      source: "local_implicit",
      companyIds: ["company-1"],
    });

    const res = await request(app)
      .patch("/api/companies/board/deliverables/wp-1/review")
      .send({
        reviewState: "changes_requested",
        comment: "Please refine section 2",
      });

    expect(res.status).toBe(200);
    expect(res.body.reviewState).toBe("changes_requested");

    // Enforced company boundary assertCompanyAccess
    // (with local_implicit, board passes membership check implicitly in authz)

    // Verify work product update includes comment in metadata
    expect(mockWorkProductService.update).toHaveBeenCalledWith("wp-1", {
      reviewState: "changes_requested",
      metadata: {
        lastReviewComment: "Please refine section 2",
      },
    });

    // Verify activity logging
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        companyId: "company-1",
        action: "deliverable.reviewed",
        entityType: "issue_work_products",
        entityId: "wp-1",
        details: {
          title: "Design Specs",
          reviewState: "changes_requested",
          healthStatus: undefined,
          comment: "Please refine section 2",
        },
      }),
    );

    // Verify agent memory insert
    expect(mockDb.insert).toHaveBeenCalled();
    expect(mockDb.values).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "agent-1",
        companyId: "company-1",
        scope: "project",
        projectId: "project-1",
        category: "feedback",
        title: "Board Review: Changes Requested - Design Specs",
        source: "board",
        confidence: 1.0,
      }),
    );
  });
});
