// =====================================================================
// 6.7 bridge — cross-origin access for the Base44 presentation layer.
//
// Base44 (*.base44.app) and AMX AIR HUBS (api.amx-air-hubs.cc) are
// different registrable domains, so the Base44 browser calling
// /api/meeting/token is a cross-origin request. This middleware answers
// the CORS preflight and echoes an ALLOWLISTED origin only.
//
// Auth is carried in the Authorization bearer (the 6.8B AMX-issued
// external-client token), NOT in cookies, so we deliberately do NOT send
// Access-Control-Allow-Credentials. That keeps this from ever becoming a
// cookie-bearing cross-site surface, and the browser must use
// `credentials: 'omit'` on these calls.
//
// Origins come from BASE44_ALLOWED_ORIGINS (comma-separated). Nothing is
// allowed by default — an empty/unset list rejects every cross-origin
// caller, which is the safe failure.
// =====================================================================
import type { Request, Response, NextFunction } from "express";

const ALLOWED_METHODS = "GET,POST,OPTIONS";
const ALLOWED_HEADERS = "Content-Type,Authorization";
const MAX_AGE = "600"; // 10 min preflight cache

/** Parse BASE44_ALLOWED_ORIGINS once. Exact-origin match only (scheme+host+port). */
export function parseAllowedOrigins(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((o) => o.trim().replace(/\/+$/, "")) // tolerate trailing slash
      .filter(Boolean),
  );
}

export interface Base44CorsOptions {
  /** Explicit allowlist; defaults to parsing BASE44_ALLOWED_ORIGINS at call time. */
  allowedOrigins?: Set<string>;
}

/**
 * CORS middleware scoped to the meeting bridge. Mount it BEFORE the
 * meeting router so preflights are answered and cross-origin responses
 * carry the right headers. Same-origin (no Origin header) requests pass
 * straight through untouched.
 */
export function base44Cors(opts: Base44CorsOptions = {}) {
  return function base44CorsMiddleware(req: Request, res: Response, next: NextFunction): void {
    const allow = opts.allowedOrigins ?? parseAllowedOrigins(process.env.BASE44_ALLOWED_ORIGINS);
    const origin = req.headers.origin;

    // Same-origin / server-to-server: no Origin header, nothing to do.
    if (!origin) {
      if (req.method === "OPTIONS") { res.status(204).end(); return; }
      next();
      return;
    }

    const normalized = origin.replace(/\/+$/, "");
    if (allow.has(normalized)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", ALLOWED_METHODS);
      res.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS);
      res.setHeader("Access-Control-Max-Age", MAX_AGE);
      // NOTE: intentionally NO Access-Control-Allow-Credentials — header auth only.
    }

    // Answer the preflight regardless; a disallowed origin simply gets no
    // allow-origin header and the browser blocks it.
    if (req.method === "OPTIONS") { res.status(204).end(); return; }
    next();
  };
}
