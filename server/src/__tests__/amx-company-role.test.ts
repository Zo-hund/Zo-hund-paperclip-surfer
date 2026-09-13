import type { Request } from "express";
import { describe, expect, it } from "vitest";
import { assertCompanyRole } from "../routes/authz.js";

function request(actor: Request["actor"]): Request {
  return { method: "POST", actor } as Request;
}

describe("AMX human role compatibility", () => {
  it("allows an active owner inside the authorized company", () => {
    expect(() => assertCompanyRole(request({ type: "board", source: "session", companyIds: ["a"],
      memberships: [{ companyId: "a", membershipRole: "owner", status: "active" }] }), "a", "admin")).not.toThrow();
  });
  it("does not let instance admin bypass upstream company membership", () => {
    expect(() => assertCompanyRole(request({ type: "board", source: "session", isInstanceAdmin: true,
      companyIds: ["a"] }), "b", "admin")).toThrow();
  });
  it.each(["viewer", "member", "operator"])("does not grant admin rights to %s", (membershipRole) => {
    expect(() => assertCompanyRole(request({ type: "board", source: "session", companyIds: ["a"],
      memberships: [{ companyId: "a", membershipRole, status: "active" }] }), "a", "admin")).toThrow();
  });
  it("rejects agent role bypass and suspended memberships", () => {
    expect(() => assertCompanyRole(request({ type: "agent", companyId: "a" }), "a", "admin")).toThrow();
    expect(() => assertCompanyRole(request({ type: "board", source: "session", companyIds: ["a"],
      memberships: [{ companyId: "a", membershipRole: "owner", status: "suspended" }] }), "a", "admin")).toThrow();
  });
});
