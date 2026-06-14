import { describe, expect, it } from "vitest";
import path from "node:path";
import { buildAmxSignaturePayload, hashAmxBody, isWithinRoot } from "../commands/amx-node.js";

describe("AMX node signing helpers", () => {
  it("hashes the exact request body bytes used for signed node requests", () => {
    expect(hashAmxBody("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(hashAmxBody(JSON.stringify({ status: "online" }))).toBe(
      "89aab18cf5bc3c9d18086d537efe50cb29fb193c99aac895502cd0d95f630faa",
    );
  });

  it("builds the same newline-delimited payload expected by the server verifier", () => {
    const payload = buildAmxSignaturePayload({
      method: "post",
      pathWithQuery: "/api/companies/company-1/amx-nodes/node-1/heartbeat",
      timestamp: "2026-06-13T20:30:00.000Z",
      body: JSON.stringify({ status: "online" }),
    });

    expect(payload.toString("utf8")).toBe(
      [
        "POST",
        "/api/companies/company-1/amx-nodes/node-1/heartbeat",
        "2026-06-13T20:30:00.000Z",
        "89aab18cf5bc3c9d18086d537efe50cb29fb193c99aac895502cd0d95f630faa",
      ].join("\n"),
    );
  });
});

describe("AMX node local policy helpers", () => {
  it("allows filesystem reads inside an enrolled root", () => {
    const root = path.resolve("workspace");
    expect(isWithinRoot(path.resolve(root, "docs", "plan.md"), root)).toBe(true);
    expect(isWithinRoot(root, root)).toBe(true);
  });

  it("rejects filesystem reads outside an enrolled root", () => {
    const root = path.resolve("workspace");
    expect(isWithinRoot(path.resolve("workspace-other", "secret.txt"), root)).toBe(false);
    expect(isWithinRoot(path.resolve(root, "..", "secret.txt"), root)).toBe(false);
  });
});
