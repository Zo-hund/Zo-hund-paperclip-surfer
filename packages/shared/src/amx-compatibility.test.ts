import { describe, expect, it } from "vitest";
import { AMX_REQUIRE_NEW_AGENT_APPROVAL } from "./amx-governance.js";
import { hasCompanyRoleAtLeast } from "./constants.js";
import { amxNodeJsonObjectSchema } from "./validators/amx-node.js";

describe("AMX compatibility boundaries", () => {
  it("requires approval for a newly created company by default", () => {
    expect(AMX_REQUIRE_NEW_AGENT_APPROVAL).toBe(true);
  });
  it.each(["operator", "unknown", null, undefined])("does not infer legacy AMX member privileges for %s", (role) => {
    expect(hasCompanyRoleAtLeast(role, "member")).toBe(false);
  });
  it("preserves existing owner/admin/member/viewer ordering", () => {
    expect(hasCompanyRoleAtLeast("owner", "admin")).toBe(true);
    expect(hasCompanyRoleAtLeast("admin", "member")).toBe(true);
    expect(hasCompanyRoleAtLeast("viewer", "member")).toBe(false);
    expect(hasCompanyRoleAtLeast("owner", "operator")).toBe(false);
  });
  it("preserves arbitrary JSON node posture under the current Zod API", () => {
    const posture = { os: "synthetic", nested: { healthy: true }, count: 2 };
    expect(amxNodeJsonObjectSchema.parse(posture)).toEqual(posture);
    expect(amxNodeJsonObjectSchema.parse(undefined)).toEqual({});
    expect(amxNodeJsonObjectSchema.safeParse(["not-an-object"]).success).toBe(false);
  });
});
