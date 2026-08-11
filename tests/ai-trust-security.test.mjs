import assert from "node:assert/strict";
import { test } from "node:test";
import worker from "../worker.js";

function trustDatabase() {
  const queries = [];
  const statement = (sql, values = []) => ({
    async run() { queries.push({ sql, values }); return { success: true, meta: { changes: 1 } }; },
    async all() { queries.push({ sql, values }); return { results: [] }; },
    async first() { queries.push({ sql, values }); return null; },
  });
  return {
    queries,
    prepare(sql) {
      return {
        bind(...values) { return statement(sql, values); },
        ...statement(sql),
      };
    },
    async batch(statements) {
      for (const item of statements) await item.run();
      return statements.map(() => ({ success: true }));
    },
  };
}

function trustRequest(token, path = "/api/trust/state?tenantId=tech-at-nite", init = {}) {
  return new Request(`https://amx.example${path}`, {
    ...init,
    headers: {
      "CF-Connecting-IP": crypto.randomUUID(),
      Cookie: `amx_member_session=${encodeURIComponent(token)}`,
      ...(init.headers || {}),
    },
  });
}

test("trust APIs reject non-operators and bind every state query to the selected tenant", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const authorization = String(init.headers?.Authorization || "");
    const isOperator = authorization.includes("operator-token");
    if (url.includes("/auth/v1/user")) return Response.json({ id: isOperator ? "operator-1" : "member-1" });
    if (url.includes("/rest/v1/member_profiles")) return Response.json([{
      id: isOperator ? "operator-1" : "member-1",
      membership_role: isOperator ? "operator" : "member",
      membership_status: "active",
    }]);
    throw new Error(`Unexpected request: ${url}`);
  };

  const db = trustDatabase();
  const env = {
    DB: db,
    MEMBER_AUTH_REQUIRED: "true",
    TENANT_AUTHORIZATION_REQUIRED: "true",
    DEPLOYMENT_TIER: "production",
    SUPABASE_URL: "https://supabase.example",
    SUPABASE_PUBLISHABLE_KEY: "publishable-key",
    ASSETS: { fetch: async () => new Response("missing", { status: 404 }) },
  };

  try {
    const denied = await worker.fetch(trustRequest("member-token"), env);
    assert.equal(denied.status, 403);

    const allowed = await worker.fetch(trustRequest("operator-token"), env);
    assert.equal(allowed.status, 200);
    const body = await allowed.json();
    assert.equal(body.persisted, true);
    assert.equal(body.tenantId, "tech-at-nite");

    const stateReads = db.queries.filter(({ sql }) => /^SELECT .* FROM (trust_|network_nodes)/.test(sql));
    assert.equal(stateReads.length, 5);
    for (const query of stateReads) {
      assert.match(query.sql, /tenant_id = \?/);
      assert.equal(query.values[0], "tech-at-nite");
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Live promotion fails closed without an explicit operator approval", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.includes("/auth/v1/user")) return Response.json({ id: "operator-2" });
    if (url.includes("/rest/v1/member_profiles")) return Response.json([{ id: "operator-2", membership_role: "operator", membership_status: "active" }]);
    throw new Error(`Unexpected request: ${url}`);
  };

  const env = {
    DB: trustDatabase(),
    MEMBER_AUTH_REQUIRED: "true",
    DEPLOYMENT_TIER: "production",
    SUPABASE_URL: "https://supabase.example",
    SUPABASE_PUBLISHABLE_KEY: "publishable-key",
    ASSETS: { fetch: async () => new Response("missing", { status: 404 }) },
  };

  try {
    const response = await worker.fetch(trustRequest("operator-two-token", "/api/trust/passports/pass-1/live-approval", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId: "tech-at-nite", reason: "Missing explicit approval" }),
    }), env);
    assert.equal(response.status, 403);
    assert.match((await response.json()).error, /Explicit operator approval/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
