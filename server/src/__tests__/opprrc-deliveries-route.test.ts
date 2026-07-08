import { Readable } from "node:stream";
import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { opprrcRoutes } from "../routes/opprrc.js";
import { errorHandler } from "../middleware/index.js";
import type { StorageService } from "../storage/types.js";

const { getIssueByIdMock, getAssetByIdMock, logActivityMock, deliverMock } = vi.hoisted(() => ({
  getIssueByIdMock: vi.fn(),
  getAssetByIdMock: vi.fn(),
  logActivityMock: vi.fn(),
  deliverMock: vi.fn(),
}));

vi.mock("../services/index.js", () => ({
  issueService: () => ({ getById: getIssueByIdMock }),
  assetService: () => ({ getById: getAssetByIdMock }),
  logActivity: logActivityMock,
}));

vi.mock("../services/opprrc-storage.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/opprrc-storage.js")>();
  return {
    ...actual,
    opprrcStorageService: vi.fn(() => ({
      deliver: deliverMock,
      listDeliveries: vi.fn(),
      getDelivery: vi.fn(),
      getRunControl: vi.fn(),
      resetRunControl: vi.fn(),
      getBackupStatus: vi.fn(),
    })),
  };
});

const ISSUE_ID = "11111111-1111-1111-1111-111111111111";
const ASSET_ID = "22222222-2222-2222-2222-222222222222";

function createIssue(overrides: Partial<{ companyId: string; lifecycleStage: string | null }> = {}) {
  return { id: ISSUE_ID, companyId: "company-1", lifecycleStage: "opprrc", ...overrides };
}

function createAsset(overrides: Partial<{ companyId: string }> = {}) {
  return {
    id: ASSET_ID,
    companyId: "company-1",
    objectKey: "assets/abc",
    originalFilename: "report.pdf",
    ...overrides,
  };
}

function createStorage(): StorageService {
  return {
    provider: "local_disk" as const,
    putFile: vi.fn(),
    getObject: vi.fn(async () => ({
      stream: Readable.from([Buffer.from("hello world")]),
      contentType: "application/pdf",
      contentLength: 11,
    })),
    headObject: vi.fn(),
    deleteObject: vi.fn(),
  };
}

function createApp(storage: StorageService) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = {
      type: "board",
      userId: "local-board",
      source: "local_implicit",
    };
    next();
  });
  app.use("/api", opprrcRoutes({} as any, storage));
  app.use(errorHandler);
  return app;
}

const validBody = {
  issueId: ISSUE_ID,
  assetId: ASSET_ID,
  category: "05_reports",
  audience: "CLIENTS-EXTERNAL",
};

describe("POST /api/companies/:companyId/opprrc/deliveries", () => {
  afterEach(() => {
    getIssueByIdMock.mockReset();
    getAssetByIdMock.mockReset();
    logActivityMock.mockReset();
    deliverMock.mockReset();
  });

  it("delivers a 201 on the happy path and logs activity", async () => {
    getIssueByIdMock.mockResolvedValue(createIssue());
    getAssetByIdMock.mockResolvedValue(createAsset());
    deliverMock.mockResolvedValue({
      deliveryId: "delivery-1",
      vpsFilePath: "/paperclip/opprrc/05_reports/CLIENTS-EXTERNAL/report.pdf",
      vpsFileUrl: "",
      runNumber: 1,
    });

    const res = await request(createApp(createStorage()))
      .post("/api/companies/company-1/opprrc/deliveries")
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.deliveryId).toBe("delivery-1");
    expect(deliverMock).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: "company-1",
        issueId: ISSUE_ID,
        assetId: ASSET_ID,
        category: "05_reports",
        audience: "CLIENTS-EXTERNAL",
        filename: "report.pdf",
        fileContent: expect.any(Buffer),
      }),
    );
    expect(logActivityMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "opprrc.delivered", entityId: "delivery-1" }),
    );
  });

  it("rejects with 409 when the issue is not in the opprrc lifecycle stage", async () => {
    getIssueByIdMock.mockResolvedValue(createIssue({ lifecycleStage: "live" }));
    getAssetByIdMock.mockResolvedValue(createAsset());

    const res = await request(createApp(createStorage()))
      .post("/api/companies/company-1/opprrc/deliveries")
      .send(validBody);

    expect(res.status).toBe(409);
    expect(deliverMock).not.toHaveBeenCalled();
  });

  it("rejects with 404 when the issue does not exist", async () => {
    getIssueByIdMock.mockResolvedValue(null);

    const res = await request(createApp(createStorage()))
      .post("/api/companies/company-1/opprrc/deliveries")
      .send(validBody);

    expect(res.status).toBe(404);
  });

  it("rejects with 422 when the issue belongs to a different company", async () => {
    getIssueByIdMock.mockResolvedValue(createIssue({ companyId: "other-company" }));

    const res = await request(createApp(createStorage()))
      .post("/api/companies/company-1/opprrc/deliveries")
      .send(validBody);

    expect(res.status).toBe(422);
    expect(deliverMock).not.toHaveBeenCalled();
  });

  it("rejects with 422 when the asset belongs to a different company", async () => {
    getIssueByIdMock.mockResolvedValue(createIssue());
    getAssetByIdMock.mockResolvedValue(createAsset({ companyId: "other-company" }));

    const res = await request(createApp(createStorage()))
      .post("/api/companies/company-1/opprrc/deliveries")
      .send(validBody);

    expect(res.status).toBe(422);
    expect(deliverMock).not.toHaveBeenCalled();
  });

  it("rejects with 400 for an invalid category", async () => {
    const res = await request(createApp(createStorage()))
      .post("/api/companies/company-1/opprrc/deliveries")
      .send({ ...validBody, category: "not-a-real-folder" });

    expect(res.status).toBe(400);
    expect(getIssueByIdMock).not.toHaveBeenCalled();
  });

  it("rejects with 400 for an invalid audience", async () => {
    const res = await request(createApp(createStorage()))
      .post("/api/companies/company-1/opprrc/deliveries")
      .send({ ...validBody, audience: "PUBLIC" });

    expect(res.status).toBe(400);
    expect(getIssueByIdMock).not.toHaveBeenCalled();
  });

  it("surfaces the deliver() hard-stop guardrail as a 409", async () => {
    const { conflict } = await import("../errors.js");
    getIssueByIdMock.mockResolvedValue(createIssue());
    getAssetByIdMock.mockResolvedValue(createAsset());
    deliverMock.mockRejectedValue(conflict("OPPRRC hard stop: 100/100 runs completed."));

    const res = await request(createApp(createStorage()))
      .post("/api/companies/company-1/opprrc/deliveries")
      .send(validBody);

    expect(res.status).toBe(409);
  });

  it("surfaces the deliver() dedup guardrail as a 422", async () => {
    const { unprocessable } = await import("../errors.js");
    getIssueByIdMock.mockResolvedValue(createIssue());
    getAssetByIdMock.mockResolvedValue(createAsset());
    deliverMock.mockRejectedValue(unprocessable("OPPRRC dedup: asset already delivered."));

    const res = await request(createApp(createStorage()))
      .post("/api/companies/company-1/opprrc/deliveries")
      .send(validBody);

    expect(res.status).toBe(422);
  });
});
