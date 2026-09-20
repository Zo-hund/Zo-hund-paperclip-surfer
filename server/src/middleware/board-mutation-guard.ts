import type { Request, RequestHandler } from "express";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const DEFAULT_DEV_ORIGINS = [
  "http://localhost:3100",
  "http://127.0.0.1:3100",
];

function parseOrigin(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`.toLowerCase();
  } catch {
    return null;
  }
}

function trustedOriginsForRequest(req: Request) {
  const origins = new Set(DEFAULT_DEV_ORIGINS.map((value) => value.toLowerCase()));
  const host = req.header("host")?.trim();
  if (host) {
    origins.add(`http://${host}`.toLowerCase());
    origins.add(`https://${host}`.toLowerCase());
  }
  return origins;
}

function isTrustedBoardMutationRequest(req: Request) {
  const allowedOrigins = trustedOriginsForRequest(req);
  const origin = parseOrigin(req.header("origin"));
  if (origin && allowedOrigins.has(origin)) return true;

  const refererOrigin = parseOrigin(req.header("referer"));
  if (refererOrigin && allowedOrigins.has(refererOrigin)) return true;

  return false;
}

export function boardMutationGuard(): RequestHandler {
  return (req, res, next) => {
    if (SAFE_METHODS.has(req.method.toUpperCase())) {
      next();
      return;
    }

    if (req.actor.type !== "board") {
      next();
      return;
    }

    // Local-trusted mode, board bearer keys, and external-client bearers are not
    // browser-session requests. In these modes origin/referer headers can be
    // absent or legitimately cross-origin; do not block those mutations.
    //
    // external_client is safe to exempt for the same reason board_key is: the
    // credential is an Authorization bearer held in memory, never a cookie, so
    // a hostile page cannot cause it to be attached to a forged request — the
    // browser would have to read it first, and CORS already governs who may
    // send the header at all. This exemption is what lets the cross-origin
    // Base44 bridge POST at all; those requests are separately confined to the
    // meeting surface by externalClientSurfaceGuard.
    if (
      req.actor.source === "local_implicit" ||
      req.actor.source === "board_key" ||
      req.actor.source === "external_client"
    ) {
      next();
      return;
    }

    if (!isTrustedBoardMutationRequest(req)) {
      res.status(403).json({ error: "Board mutation requires trusted browser origin" });
      return;
    }

    next();
  };
}
