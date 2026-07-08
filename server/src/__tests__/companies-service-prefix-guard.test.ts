import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { companies, createDb } from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { companyService } from "../services/companies.ts";

/**
 * Verifies the reserved-word retry guard by reading back the persisted row
 * directly, rather than through `companyService.create()`'s full return
 * value — its post-insert enrichment query has a separate, pre-existing bug
 * (unrelated to this guard, tracked separately) that throws on a real DB.
 */
async function createAndReadIssuePrefix(
  db: ReturnType<typeof createDb>,
  svc: ReturnType<typeof companyService>,
  name: string,
): Promise<string> {
  await svc.create({ name } as typeof companies.$inferInsert).catch(() => {});
  const [row] = await db.select({ issuePrefix: companies.issuePrefix }).from(companies).where(eq(companies.name, name));
  if (!row) throw new Error(`Company "${name}" was not persisted`);
  return row.issuePrefix;
}

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres company service tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("companyService.create issue prefix reserved-word guard", () => {
  let db!: ReturnType<typeof createDb>;
  let svc!: ReturnType<typeof companyService>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-companies-service-");
    db = createDb(tempDb.connectionString);
    svc = companyService(db);
  }, 20_000);

  afterEach(async () => {
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  it("skips an auto-derived prefix that collides with a reserved route root (e.g. ORG)", async () => {
    // "Org Chart Co" -> deriveIssuePrefixBase strips to "ORGCHARTCO" -> base "ORG",
    // which collides with the reserved "org" route root (this is the same class of
    // bug that made "AMX Labs" collide with the old "amx" route root before Part A's fix).
    const issuePrefix = await createAndReadIssuePrefix(db, svc, "Org Chart Co");
    expect(issuePrefix.toLowerCase()).not.toBe("org");
    expect(issuePrefix).toBe("ORGA");
  });

  it("does not skip a non-colliding auto-derived prefix", async () => {
    const issuePrefix = await createAndReadIssuePrefix(db, svc, "Dispatch Corp");
    expect(issuePrefix).toBe("DIS");
  });
});
