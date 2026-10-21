import { getTableName, type SQL, type Table } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { approvalService } from "../services/approvals.js";

const agents = vi.hoisted(() => ({ getById: vi.fn(), activatePendingApproval: vi.fn(), create: vi.fn(), terminate: vi.fn() }));
const deliver = vi.hoisted(() => vi.fn());
vi.mock("../services/agents.js", () => ({ agentService: () => agents }));
vi.mock("../services/webhook-delivery.js", () => ({ webhookDeliveryService: () => ({ deliver }) }));
vi.mock("../services/hire-hook.js", () => ({ notifyHireApproved: vi.fn().mockResolvedValue(undefined) }));

const ordinary = { id: "approval-fixture", companyId: "company-a", type: "approve_ceo_strategy", status: "pending", payload: {}, requestedByAgentId: null };
function fixture(record: Record<string, any> = ordinary, references: Record<string, unknown>[] = [], loseUpdate = false) {
  const state = { writes: [] as { table: string; values: Record<string, unknown>; predicate?: ReturnType<PgDialect["sqlToQuery"]> }[], reads: [] as ReturnType<PgDialect["sqlToQuery"]>[] };
  const dialect = new PgDialect();
  const db = {
    select: () => ({ from: (table: Table) => ({ where: (predicate: SQL) => {
      state.reads.push(dialect.sqlToQuery(predicate));
      return Promise.resolve(getTableName(table) === "approvals" ? [record] : references);
    } }) }),
    update: (table: Table) => ({ set: (values: Record<string, unknown>) => ({ where: (predicate: SQL) => {
      state.writes.push({ table: getTableName(table), values, predicate: dialect.sqlToQuery(predicate) });
      return { returning: async () => loseUpdate ? [] : [{ ...record, ...values }] };
    } }) }),
    insert: (table: Table) => ({ values: (values: Record<string, unknown>) => {
      state.writes.push({ table: getTableName(table), values });
      return { returning: async () => [{ id: "created", ...values }] };
    } }),
  };
  return { service: approvalService(db as any), state };
}

beforeEach(() => {
  vi.clearAllMocks();
  agents.getById.mockImplementation(async id => ({ id, companyId: "company-a", status: "pending_approval" }));
  agents.create.mockResolvedValue({ id: "new-agent" });
  agents.activatePendingApproval.mockResolvedValue({ id: "pending-agent" });
  deliver.mockResolvedValue(undefined);
});

describe("approval service reference ownership before persistence and execution", () => {
  it.each(["approve", "reject"] as const)("blocks a foreign hire target before %s or agent mutations", async method => {
    const { service, state } = fixture({ ...ordinary, type: "hire_agent", payload: { agentId: "foreign-agent" } });
    agents.getById.mockResolvedValue({ id: "foreign-agent", companyId: "company-b", status: "pending_approval" });
    await expect(service[method](ordinary.id, "operator")).rejects.toMatchObject({ status: 422 });
    expect(state.writes).toHaveLength(0);
    expect(agents.activatePendingApproval).not.toHaveBeenCalled();
    expect(agents.terminate).not.toHaveBeenCalled();
    expect(deliver).not.toHaveBeenCalled();
  });
  it.each(["approve", "reject"] as const)("blocks a non-pending hire target before %s", async method => {
    const { service, state } = fixture({ ...ordinary, type: "hire_agent", payload: { agentId: "active-agent" } });
    agents.getById.mockResolvedValue({ id: "active-agent", companyId: "company-a", status: "running" });
    await expect(service[method](ordinary.id, "operator")).rejects.toMatchObject({ status: 422 });
    expect(state.writes).toHaveLength(0);
  });
  it("blocks a foreign requested-by agent before a decision could trigger its wakeup", async () => {
    const { service, state } = fixture({ ...ordinary, requestedByAgentId: "foreign-agent" });
    agents.getById.mockResolvedValue({ id: "foreign-agent", companyId: "company-b" });
    await expect(service.approve(ordinary.id, "operator")).rejects.toMatchObject({ status: 422 });
    expect(state.writes).toHaveLength(0);
  });
  it("validates a new approval's requester before insertion", async () => {
    const { service, state } = fixture();
    agents.getById.mockResolvedValue({ id: "foreign-agent", companyId: "company-b" });
    await expect(service.create("company-a", { ...ordinary, requestedByAgentId: "foreign-agent" } as any)).rejects.toMatchObject({ status: 422 });
    expect(state.writes).toHaveLength(0);
  });
  it("validates a new hire's manager company before insertion", async () => {
    const { service, state } = fixture();
    agents.getById.mockResolvedValue({ id: "foreign-manager", companyId: "company-b" });
    await expect(service.create("company-a", { ...ordinary, type: "hire_agent", payload: { reportsTo: "foreign-manager" } } as any)).rejects.toMatchObject({ status: 422 });
    expect(state.writes).toHaveLength(0);
  });
  it.each([
    { type: "opprrc_delivery_review", payload: { deliveryId: "foreign-resource" } },
    { type: "promote_to_live", payload: { entityType: "rq_submission", entityId: "foreign-resource" } },
    { type: "promote_to_live", payload: { entityType: "marketplace_booking", entityId: "foreign-resource" } },
    { type: "pit_stop_review", payload: { simRunId: "foreign-resource" } },
  ])("rejects a foreign $type resource before decisions, with a company-scoped lookup", async patch => {
    const { service, state } = fixture({ ...ordinary, ...patch });
    await expect(service.approve(ordinary.id, "operator")).rejects.toMatchObject({ status: 422 });
    expect(state.writes).toHaveLength(0);
    expect(state.reads.at(-1)?.params).toEqual(["foreign-resource", "company-a"]);
  });
  it("revalidates changed resubmission references before persistence", async () => {
    const { service, state } = fixture({ ...ordinary, status: "revision_requested", type: "opprrc_delivery_review", payload: { deliveryId: "old-owned" } });
    await expect(service.resubmit(ordinary.id, { deliveryId: "foreign-resource" })).rejects.toMatchObject({ status: 422 });
    expect(state.writes).toHaveLength(0);
  });
  it("preserves the same-company pending hire and atomic decision payload predicate", async () => {
    const record = { ...ordinary, type: "hire_agent", payload: { agentId: "pending-agent" } };
    const { service, state } = fixture(record);
    const result = await service.approve(ordinary.id, "operator");
    expect(result.applied).toBe(true);
    expect(agents.activatePendingApproval).toHaveBeenCalledOnce();
    expect(state.writes[0].predicate?.params).toContain("company-a");
    expect(state.writes[0].predicate?.params).toContain(JSON.stringify(record.payload));
    expect(state.writes[0].values.decidedByUserId).toBe("operator");
  });
  it("preserves the same-company delivery decision", async () => {
    const { service, state } = fixture({ ...ordinary, type: "opprrc_delivery_review", payload: { deliveryId: "owned" } }, [{ id: "owned" }]);
    expect((await service.approve(ordinary.id, "operator")).applied).toBe(true);
    expect(state.writes).toHaveLength(1);
  });
  it.each([
    { entityType: "rq_submission", target: { id: "owned", isSimulation: true, simulationStatus: "running" } },
    { entityType: "marketplace_booking", target: { id: "owned", phase: "simulation", status: "running" } },
  ])("blocks a same-company but unfinished $entityType on decision and resubmission", async ({ entityType, target }) => {
    const payload = { entityType, entityId: "owned" };
    const current = fixture({ ...ordinary, type: "promote_to_live", payload }, [target]);
    await expect(current.service.approve(ordinary.id, "operator")).rejects.toMatchObject({ status: 422 });
    expect(current.state.writes).toHaveLength(0);
    const revision = fixture({ ...ordinary, status: "revision_requested", type: "promote_to_live", payload: { ...payload, entityId: "old-owned" } }, [target]);
    await expect(revision.service.resubmit(ordinary.id, payload)).rejects.toMatchObject({ status: 422 });
    expect(revision.state.writes).toHaveLength(0);
  });
  it.each([
    { entityType: "rq_submission", target: { id: "owned", isSimulation: true, simulationStatus: "completed" } },
    { entityType: "marketplace_booking", target: { id: "owned", phase: "simulation", status: "completed" } },
  ])("preserves eligible same-company $entityType decisions", async ({ entityType, target }) => {
    const { service } = fixture({ ...ordinary, type: "promote_to_live", payload: { entityType, entityId: "owned" } }, [target]);
    expect((await service.approve(ordinary.id, "operator")).applied).toBe(true);
  });
  it.each(["requestRevision", "escalate", "resubmit"] as const)("returns409 for a lost %s update without overwriting a concurrent decision", async method => {
    const record = { ...ordinary, status: method === "resubmit" ? "revision_requested" : "pending" };
    const { service, state } = fixture(record, [], true);
    const action = method === "resubmit" ? service.resubmit(ordinary.id, {}) : service[method](ordinary.id, "operator");
    await expect(action).rejects.toMatchObject({ status: 409 });
    const predicate = state.writes[0].predicate!;
    expect(predicate.params).toContain("company-a");
    expect(predicate.params).toContain(record.status);
    expect(predicate.params).toContain(JSON.stringify(record.payload));
    expect(predicate.sql).toContain('"approvals"."status"');
    expect(predicate.sql).toContain('"approvals"."payload"');
    expect(deliver).not.toHaveBeenCalled();
    expect(agents.activatePendingApproval).not.toHaveBeenCalled();
    expect(agents.terminate).not.toHaveBeenCalled();
  });
  it("keeps a repeated resolved decision idempotent without new execution", async () => {
    const { service, state } = fixture({ ...ordinary, type: "hire_agent", status: "approved", payload: { agentId: "already-active" } });
    expect((await service.approve(ordinary.id, "operator")).applied).toBe(false);
    expect(state.writes).toHaveLength(0);
    expect(agents.activatePendingApproval).not.toHaveBeenCalled();
  });
});
