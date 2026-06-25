import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  companies,
  companyMemberships,
  principalPermissionGrants,
  createDb,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { accessService } from "../services/access.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres access-owner-permission tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("accessService.hasPermission — owner bypass", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let access!: ReturnType<typeof accessService>;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-access-owner-");
    db = createDb(tempDb.connectionString);
    access = accessService(db);
  }, 20_000);

  afterEach(async () => {
    await db.delete(principalPermissionGrants);
    await db.delete(companyMemberships);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function makeCompany(): Promise<string> {
    const companyId = randomUUID();
    await db.insert(companies).values({ id: companyId, name: "Test Co", issuePrefix: "TST" });
    return companyId;
  }

  it("grants a self-created owner full permission with NO explicit grants", async () => {
    const companyId = await makeCompany();
    await db.insert(companyMemberships).values({
      companyId,
      principalType: "user",
      principalId: "owner-user",
      membershipRole: "owner",
      status: "active",
    });

    // No principal_permission_grants rows exist for this owner.
    expect(await access.hasPermission(companyId, "user", "owner-user", "agents:create")).toBe(true);
    expect(await access.hasPermission(companyId, "user", "owner-user", "users:invite")).toBe(true);
  });

  it("denies a plain member without an explicit grant", async () => {
    const companyId = await makeCompany();
    await db.insert(companyMemberships).values({
      companyId,
      principalType: "user",
      principalId: "member-user",
      membershipRole: "member",
      status: "active",
    });

    expect(await access.hasPermission(companyId, "user", "member-user", "agents:create")).toBe(false);
  });

  it("allows a member who has the explicit grant", async () => {
    const companyId = await makeCompany();
    await db.insert(companyMemberships).values({
      companyId,
      principalType: "user",
      principalId: "member-user",
      membershipRole: "member",
      status: "active",
    });
    await db.insert(principalPermissionGrants).values({
      companyId,
      principalType: "user",
      principalId: "member-user",
      permissionKey: "agents:create",
    });

    expect(await access.hasPermission(companyId, "user", "member-user", "agents:create")).toBe(true);
  });

  it("denies an owner whose membership is not active", async () => {
    const companyId = await makeCompany();
    await db.insert(companyMemberships).values({
      companyId,
      principalType: "user",
      principalId: "suspended-owner",
      membershipRole: "owner",
      status: "suspended",
    });

    expect(await access.hasPermission(companyId, "user", "suspended-owner", "agents:create")).toBe(false);
  });
});
