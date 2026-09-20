// =====================================================================
// Step 6.8B — confine an external-client bearer to the meeting surface.
//
// `resolveExternalClientActor` returns a `type: "board"` actor so the existing
// authorization helpers (assertBoard / assertCompanyAccess / assertCompanyRole)
// work unchanged. That is deliberate — but on its own it would mean a Base44
// meeting token also satisfies `assertBoard` on every other control-plane
// route (companies, secrets, agents…), because those routes have no reason to
// know about scopes.
//
// So the restriction is enforced centrally, here, rather than being left to
// each handler to remember: an `external_client` actor may reach ONLY the
// endpoints listed below, and only with the scope that endpoint requires.
// Everything else is 403, whatever the token's scopes say.
//
// Mounted first in the `api` router. The credential-exchange routes
// (/api/auth/external/*) are mounted outside that router and are unaffected.
// =====================================================================
import type { RequestHandler } from "express";
import { logger } from "./logger.js";

interface AllowedEndpoint {
  method: string;
  /** Path within the `api` router, i.e. without the /api prefix. */
  path: string;
  requiredScope: string;
}

const ALLOWED_ENDPOINTS: AllowedEndpoint[] = [
  { method: "POST", path: "/meeting/token", requiredScope: "meeting:join" },
  { method: "POST", path: "/meeting/events", requiredScope: "meeting:events" },
];

/** Strip any query string and trailing slash so matching is exact. */
function normalizePath(pathname: string): string {
  const withoutQuery = pathname.split("?")[0] ?? "";
  if (withoutQuery.length > 1 && withoutQuery.endsWith("/")) {
    return withoutQuery.slice(0, -1);
  }
  return withoutQuery;
}

export function externalClientSurfaceGuard(): RequestHandler {
  return (req, res, next) => {
    if (req.actor.source !== "external_client") {
      next();
      return;
    }

    // Preflight never carries the bearer and is answered earlier by base44Cors;
    // if one reaches here, it is not a credentialed action.
    if (req.method.toUpperCase() === "OPTIONS") {
      next();
      return;
    }

    const path = normalizePath(req.path ?? "");
    const match = ALLOWED_ENDPOINTS.find(
      (endpoint) => endpoint.method === req.method.toUpperCase() && endpoint.path === path,
    );

    if (!match) {
      logger.warn(
        { path, method: req.method, userId: req.actor.userId },
        "external-client token denied outside the meeting surface",
      );
      res.status(403).json({ error: "External client tokens are limited to the meeting surface" });
      return;
    }

    if (!(req.actor.scope ?? []).includes(match.requiredScope)) {
      res.status(403).json({ error: `Missing scope '${match.requiredScope}'` });
      return;
    }

    next();
  };
}

/** Exported for the security suite so the allowlist itself is asserted on. */
export const EXTERNAL_CLIENT_ALLOWED_ENDPOINTS: ReadonlyArray<AllowedEndpoint> = ALLOWED_ENDPOINTS;
