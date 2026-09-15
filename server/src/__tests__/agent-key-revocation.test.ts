import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { agentService } from "../services/agents.js";

describe("agent key revocation SQL scope", () => {
  it("requires both the authorized agent and key identifier in the database update", async () => {
    const where = vi.fn().mockReturnValue({ returning: async () => [] });
    const db = { update: vi.fn().mockReturnValue({ set: () => ({ where }) }) };
    expect(await agentService(db as any).revokeKey("authorized-agent", "other-agent-key")).toBeNull();
    const query = new PgDialect().sqlToQuery(where.mock.calls[0][0]);
    expect(query.sql).toContain('"agent_api_keys"."agent_id"');
    expect(query.sql).toContain('"agent_api_keys"."id"');
    expect(query.params).toEqual(["other-agent-key", "authorized-agent"]);
  });
});
