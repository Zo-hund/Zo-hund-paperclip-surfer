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

// A freshly-created account: authenticated, but NO company memberships yet and
// NOT an instance admin. This is the exact state of a brand-new signup before
// they create or are invited to any workspace.
const freshSignupActor = {
  type: "board",
  userId: "brand-new-user",
  source: "session",
  isInstanceAdmin: false,
  companyIds: [],
  companyRoles: {},
};

// Data belonging to OTHER tenants — the fresh user must never see any of it.
const otherTenantsCompanies = [
  { id: "company-A", name: "Someone Else Co" },
  { id: "company-B", name: "Another Tenant" },
];
const otherTenantsStats = {
  "company-A": { agentCount: 5, issueCount: 12 },
  "company-B": { agentCount: 2, issueCount: 3 },
};

describe("New-signup isolation — a zero-membership account sees nothing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCompanyService.list.mockResolvedValue(otherTenantsCompanies);
    mockCompanyService.stats.mockResolvedValue(otherTenantsStats);
    // The route passes companyIds straight through; service returns [] for an
    // empty list (see work-products.queryDeliverables empty-guard).
    mockWorkProductService.listDeliverablesForCompanies.mockResolvedValue([]);
  });

  it("GET /companies returns an empty list (never other tenants' companies)", async () => {
    const res = await request(createApp(freshSignupActor)).get("/api/companies");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("GET /companies/stats returns an empty object (never other tenants' stats)", async () => {
    const res = await request(createApp(freshSignupActor)).get("/api/companies/stats");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
  });

  it("GET /board/deliverables returns empty and never touches the global feed", async () => {
    const res = await request(createApp(freshSignupActor)).get("/api/companies/board/deliverables");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(mockWorkProductService.listGlobalDeliverables).not.toHaveBeenCalled();
    expect(mockWorkProductService.listDeliverablesForCompanies).toHaveBeenCalledWith([], undefined, undefined);
  });

  it("GET /board/deliverables?companyId=<someone else> is forbidden", async () => {
    const res = await request(createApp(freshSignupActor))
      .get("/api/companies/board/deliverables?companyId=company-A");
    expect(res.status).toBe(403);
    expect(mockWorkProductService.listCompanyDeliverables).not.toHaveBeenCalled();
  });

  it("GET /board/deliverables/:id for another tenant's item is forbidden", async () => {
    mockWorkProductService.getDetailById.mockResolvedValue({ id: "wp-A", companyId: "company-A" });
    const res = await request(createApp(freshSignupActor))
      .get("/api/companies/board/deliverables/wp-A");
    expect(res.status).toBe(403);
  });
});
