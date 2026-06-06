import type { Request } from "express";
import type { CompanyMembershipRole } from "@paperclipai/shared";
import { hasCompanyRoleAtLeast } from "@paperclipai/shared";
import { forbidden, unauthorized } from "../errors.js";

export function assertBoard(req: Request) {
  if (req.actor.type !== "board") {
    throw forbidden("Board access required");
  }
}

export function assertInstanceAdmin(req: Request) {
  assertBoard(req);
  if (req.actor.source === "local_implicit" || req.actor.isInstanceAdmin) {
    return;
  }
  throw forbidden("Instance admin access required");
}

export function assertCompanyAccess(req: Request, companyId: string) {
  if (req.actor.type === "none") {
    throw unauthorized();
  }
  if (req.actor.type === "agent" && req.actor.companyId !== companyId) {
    throw forbidden("Agent key cannot access another company");
  }
  if (req.actor.type === "board" && req.actor.source !== "local_implicit" && !req.actor.isInstanceAdmin) {
    const allowedCompanies = req.actor.companyIds ?? [];
    if (!allowedCompanies.includes(companyId)) {
      throw forbidden("User does not have access to this company");
    }
  }
}

/**
 * Asserts that the current board actor has at least `minRole` in the given company.
 * Instance admins and local_trusted board always pass.
 * Call after `assertCompanyAccess` or `assertBoard`.
 */
export function assertCompanyRole(req: Request, companyId: string, minRole: CompanyMembershipRole) {
  if (req.actor.type !== "board") return; // agents bypass role check
  if (req.actor.source === "local_implicit" || req.actor.isInstanceAdmin) return;
  const role = req.actor.companyRoles?.[companyId];
  if (!hasCompanyRoleAtLeast(role, minRole)) {
    throw forbidden(`Requires at least '${minRole}' role for this company`);
  }
}


export function getActorInfo(req: Request) {
  if (req.actor.type === "none") {
    throw unauthorized();
  }
  if (req.actor.type === "agent") {
    return {
      actorType: "agent" as const,
      actorId: req.actor.agentId ?? "unknown-agent",
      agentId: req.actor.agentId ?? null,
      runId: req.actor.runId ?? null,
    };
  }

  return {
    actorType: "user" as const,
    actorId: req.actor.userId ?? "board",
    agentId: null,
    runId: req.actor.runId ?? null,
  };
}
