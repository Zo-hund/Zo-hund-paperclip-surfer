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
  getByPrefix: vi.fn(),
}));

const mockAgentService = vi.hoisted(() => ({ getById: vi.fn() }));
const mockAccessService = vi.hoisted(() => ({ ensureMembership: vi.fn() }));
const mockBudgetService = vi.hoisted(() => ({ upsertPolicy: vi.fn() }));
const mockCompanyPortabilityService = vi.hoisted(() => ({
  exportBundle: vi.fn(),
  previewExport: vi.fn(),
  previewImport: vi.fn(),
  importBundle: vi.fn(),
}));

const mockWorkProductService = vi.hoisted(() => ({
  getById: vi.fn(),
  getDetailById: vi.fn(),
  update: vi.fn(),
  listCompanyDeliverables: vi.fn(),
  listGlobalDeliverables: vi.fn(),
  listDeliverablesForCompanies: vi.fn(),
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

const mockDb = {
  select: vi.fn(() => mockDb),
  from: vi.fn(() => mockDb),
  where: vi.fn(() => mockDb),
  then: vi.fn((fn) => Promise.resolve(fn([]))),
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

// A normal signed-in client: member of company-A only, NOT an instance admin.
const tenantActor = {
  type: "board",
  userId: "client-user",
  source: "session",
  isInstanceAdmin: false,
  companyIds: ["company-A"],
  companyRoles: { "company-A": "owner" },
};

describe("Tenant isolation — GET /board/deliverables", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWorkProductService.listCompanyDeliverables.mockResolvedValue([{ id: "wp-A" }]);
    mockWorkProductService.listGlobalDeliverables.mockResolvedValue([{ id: "wp-A" }, { id: "wp-B" }]);
    mockWorkProductService.listDeliverablesForCompanies.mockResolvedValue([{ id: "wp-A" }]);
  });

  it("blocks reading another tenant's deliverables via ?companyId=", async () => {
    const res = await request(createApp(tenantActor))
      .get("/api/companies/board/deliverables?companyId=company-B");

    expect(res.status).toBe(403);
    expect(mockWorkProductService.listCompanyDeliverables).not.toHaveBeenCalled();
  });

  it("allows reading own tenant's deliverables via ?companyId=", async () => {
    const res = await request(createApp(tenantActor))
      .get("/api/companies/board/deliverables?companyId=company-A");

    expect(res.status).toBe(200);
    expect(mockWorkProductService.listCompanyDeliverables).toHaveBeenCalledWith("company-A", undefined, undefined);
  });

  it("scopes the unfiltered board feed to the user's companies, NOT the global feed", async () => {
    const res = await request(createApp(tenantActor))
      .get("/api/companies/board/deliverables");

    expect(res.status).toBe(200);
    expect(mockWorkProductService.listGlobalDeliverables).not.toHaveBeenCalled();
    expect(mockWorkProductService.listDeliverablesForCompanies).toHaveBeenCalledWith(["company-A"], undefined, undefined);
    expect(res.body).toEqual([{ id: "wp-A" }]);
  });

  it("returns the global feed only for instance admins", async () => {
    const adminActor = { ...tenantActor, isInstanceAdmin: true };
    const res = await request(createApp(adminActor))
      .get("/api/companies/board/deliverables");

    expect(res.status).toBe(200);
    expect(mockWorkProductService.listGlobalDeliverables).toHaveBeenCalled();
    expect(mockWorkProductService.listDeliverablesForCompanies).not.toHaveBeenCalled();
  });
});

describe("Tenant isolation — GET /board/deliverables/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks reading another tenant's deliverable detail by id", async () => {
    mockWorkProductService.getDetailById.mockResolvedValue({ id: "wp-B", companyId: "company-B" });

    const res = await request(createApp(tenantActor))
      .get("/api/companies/board/deliverables/wp-B");

    expect(res.status).toBe(403);
  });

  it("allows reading own tenant's deliverable detail by id", async () => {
    mockWorkProductService.getDetailById.mockResolvedValue({ id: "wp-A", companyId: "company-A" });

    const res = await request(createApp(tenantActor))
      .get("/api/companies/board/deliverables/wp-A");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "wp-A", companyId: "company-A" });
  });
});
