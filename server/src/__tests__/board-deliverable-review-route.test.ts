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

  describe("GET /api/companies/board/deliverables/:id/asset", () => {
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
        .get("/api/companies/board/deliverables/wp-1/asset");

      expect(res.status).toBe(403);
      expect(res.body.error).toContain("Board access required");
    });

    it("renders a Work Order HTML page by default (no ?open=1)", async () => {
      mockWorkProductService.getById.mockResolvedValue({
        id: "wp-1",
        companyId: "company-1",
        issueId: "issue-1",
        projectId: "project-1",
        title: "Design Specs",
        type: "document",
        url: "https://example.com/asset-view",
        summary: "Draft architecture layout.",
        metadata: {},
      });

      const app = createApp({
        type: "board",
        userId: "user-1",
        source: "local_implicit",
        companyIds: ["company-1"],
      });

      const res = await request(app)
        .get("/api/companies/board/deliverables/wp-1/asset");

      // Must return HTML work order page, NOT an immediate redirect
      expect(res.status).toBe(200);
      expect(res.header["content-type"]).toContain("text/html");
      expect(res.text).toContain("AMX · AIR HUBS");
      expect(res.text).toContain("Work Order");
      expect(res.text).toContain("Design Specs");
      expect(res.text).toContain("?open=1");

      // Activity must still be logged
      expect(mockLogActivity).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          companyId: "company-1",
          action: "work_product.asset_accessed",
          entityType: "issue_work_products",
          entityId: "wp-1",
          details: {
            title: "Design Specs",
            type: "document",
            url: "https://example.com/asset-view",
            issueId: "issue-1",
          },
        }),
      );
    });

    it("redirects to URL and logs activity when ?open=1 and URL is defined", async () => {
      mockWorkProductService.getById.mockResolvedValue({
        id: "wp-1",
        companyId: "company-1",
        issueId: "issue-1",
        projectId: "project-1",
        title: "Design Specs",
        type: "document",
        url: "https://example.com/asset-view",
        summary: "Draft architecture layout.",
        metadata: {},
      });

      const app = createApp({
        type: "board",
        userId: "user-1",
        source: "local_implicit",
        companyIds: ["company-1"],
      });

      const res = await request(app)
        .get("/api/companies/board/deliverables/wp-1/asset?open=1");

      expect(res.status).toBe(302);
      expect(res.header.location).toBe("https://example.com/asset-view");

      expect(mockLogActivity).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          companyId: "company-1",
          action: "work_product.asset_accessed",
          entityType: "issue_work_products",
          entityId: "wp-1",
          details: {
            title: "Design Specs",
            type: "document",
            url: "https://example.com/asset-view",
            issueId: "issue-1",
          },
        }),
      );
    });

    it("redirects to category folder on Google Drive via ?open=1 when URL is missing", async () => {
      mockWorkProductService.getById.mockResolvedValue({
        id: "wp-2",
        companyId: "company-1",
        issueId: "issue-1",
        projectId: "project-1",
        title: "chiropractor_ad_image",
        type: "image",
        url: null,
        summary: "Image ad creative.",
        metadata: {},
      });

      const app = createApp({
        type: "board",
        userId: "user-1",
        source: "local_implicit",
        companyIds: ["company-1"],
      });

      const res = await request(app)
        .get("/api/companies/board/deliverables/wp-2/asset?open=1");

      expect(res.status).toBe(302);
      // 02_PROGRAMS folder ID: 1Lq7sUNGdmZWu8XL0wB4h6yOQIgJbLhIP
      expect(res.header.location).toBe("https://drive.google.com/drive/folders/1Lq7sUNGdmZWu8XL0wB4h6yOQIgJbLhIP");

      expect(mockLogActivity).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          companyId: "company-1",
          action: "work_product.asset_accessed",
          entityType: "issue_work_products",
          entityId: "wp-2",
          details: {
            title: "chiropractor_ad_image",
            type: "image",
            url: null,
            issueId: "issue-1",
          },
        }),
      );
    });

    it("routes external (client-visible) deliverables to the CLIENTS-EXTERNAL folder map via ?open=1", async () => {
      mockWorkProductService.getById.mockResolvedValue({
        id: "wp-3",
        companyId: "company-1",
        issueId: "issue-1",
        projectId: "project-1",
        title: "Client Report Q2",
        type: "document",
        url: null,
        summary: "Quarterly client summary.",
        // clientVisible marks this as EXTERNAL → clientsExternalFolders
        metadata: { clientVisible: true },
      });

      const app = createApp({
        type: "board",
        userId: "user-1",
        source: "local_implicit",
        companyIds: ["company-1"],
      });

      const res = await request(app)
        .get("/api/companies/board/deliverables/wp-3/asset?open=1");

      expect(res.status).toBe(302);
      // type=document → 05_reports; external map 05_reports = 1I7LrWC-dLKoCIYK1HNt9_Ek1iRjOA2UD
      expect(res.header.location).toBe("https://drive.google.com/drive/folders/1I7LrWC-dLKoCIYK1HNt9_Ek1iRjOA2UD");
    });

    it("routes board-internal document deliverables to 05_REPORTS folder via ?open=1", async () => {
      mockWorkProductService.getById.mockResolvedValue({
        id: "wp-4",
        companyId: "company-1",
        issueId: "issue-2",
        projectId: "project-2",
        title: "Arch Spec v1",
        type: "document",
        url: null,
        summary: "Architecture specification.",
        metadata: {},
      });

      const app = createApp({
        type: "board",
        userId: "user-1",
        source: "local_implicit",
        companyIds: ["company-1"],
      });

      const res = await request(app)
        .get("/api/companies/board/deliverables/wp-4/asset?open=1");

      expect(res.status).toBe(302);
      // type=document → 05_reports; internal map 05_reports = 1ZzE45t0ws8sKn1HimIR7Ty_c7hw4VHFQ
      expect(res.header.location).toBe("https://drive.google.com/drive/folders/1ZzE45t0ws8sKn1HimIR7Ty_c7hw4VHFQ");
    });

    it("returns JSON metadata when ?export=metadata is provided", async () => {
      const mockDeliverable = {
        id: "wp-5",
        companyId: "company-1",
        issueId: "issue-1",
        projectId: "project-1",
        title: "Test Metadata Deliverable",
        type: "document",
        url: "https://example.com/some-url",
        summary: "Detailed metadata test",
        metadata: { customField: "value" },
      };
      mockWorkProductService.getById.mockResolvedValue(mockDeliverable);

      const app = createApp({
        type: "board",
        userId: "user-1",
        source: "local_implicit",
        companyIds: ["company-1"],
      });

      const res = await request(app)
        .get("/api/companies/board/deliverables/wp-5/asset?export=metadata");

      expect(res.status).toBe(200);
      expect(res.header["content-type"]).toContain("application/json");
      expect(res.header["content-disposition"]).toContain("attachment");
      expect(res.header["content-disposition"]).toContain("test-metadata-deliverable-metadata.json");
      expect(res.body).toEqual(mockDeliverable);
    });

    it("renders the main HTML work order page when no query parameter is provided", async () => {
      mockWorkProductService.getById.mockResolvedValue({
        id: "wp-6",
        companyId: "company-1",
        issueId: "issue-1",
        projectId: "project-1",
        title: "Work Order HTML Render Page",
        type: "document",
        url: "https://example.com/raw-doc",
        summary: "Testing the HTML template layout and options.",
        metadata: {},
      });

      const app = createApp({
        type: "board",
        userId: "user-1",
        source: "local_implicit",
        companyIds: ["company-1"],
      });

      const res = await request(app)
        .get("/api/companies/board/deliverables/wp-6/asset");

      expect(res.status).toBe(200);
      expect(res.header["content-type"]).toContain("text/html");
      expect(res.text).toContain("Work Order · Work Order HTML Render Page");
      expect(res.text).toContain("Export &amp; Download Options");
      expect(res.text).toContain("Download Raw File");
      expect(res.text).toContain("Export Metadata JSON");
      expect(res.text).toContain("Print / Save as PDF");
    });
  });
});
