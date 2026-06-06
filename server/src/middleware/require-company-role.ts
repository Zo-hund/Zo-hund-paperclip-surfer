import type { Request, Response, NextFunction } from "express";
import type { CompanyMembershipRole } from "@paperclipai/shared";
import { hasCompanyRoleAtLeast } from "@paperclipai/shared";
import { forbidden, unauthorized } from "../errors.js";

/**
 * Returns an Express middleware that enforces a minimum company membership role
 * for board users accessing a company-scoped route.
 *
 * - Unauthenticated requests (actor.type === "none") get 401.
 * - Agent requests are passed through (agent auth is separately scoped).
 * - Instance admins bypass role checks — they have full access.
 * - local_trusted mode (implicit board) bypasses role checks.
 * - For all other board users, the per-company role in `actor.companyRoles`
 *   must be at least `minRole`.
 *
 * @param minRole  The minimum role required to proceed.
 * @param getCompanyId  Optional function to extract companyId from req.
 *                      Defaults to `req.params.companyId`.
 */
export function requireCompanyRole(
  minRole: CompanyMembershipRole,
  getCompanyId?: (req: Request) => string | undefined,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { actor } = req;

    // Unauthenticated
    if (actor.type === "none") {
      next(unauthorized());
      return;
    }

    // Agents have their own company-scoped auth — don't block them here
    if (actor.type === "agent") {
      next();
      return;
    }

    // local_trusted mode: implicit board has full access
    if (actor.source === "local_implicit") {
      next();
      return;
    }

    // Instance admins bypass all company role checks
    if (actor.isInstanceAdmin) {
      next();
      return;
    }

    const companyId = getCompanyId ? getCompanyId(req) : (req.params.companyId as string | undefined);
    if (!companyId) {
      // No companyId in context — cannot check role, pass through
      next();
      return;
    }

    const role = actor.companyRoles?.[companyId];
    if (!hasCompanyRoleAtLeast(role, minRole)) {
      next(forbidden(`Requires at least '${minRole}' role for this company`));
      return;
    }

    next();
  };
}
