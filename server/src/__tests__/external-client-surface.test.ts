/**
 * Regression suite for the three integration defects found in review of the
 * 6.8B bridge. Each test here fails against the original implementation:
 *
 *  1. An external-client bearer was a full `board` actor, so it satisfied
 *     `assertBoard` on every control-plane route — scopes were only consulted
 *     inside the two meeting handlers.
 *  2. `boardMutationGuard` treated that same actor as a browser session and
 *     rejected every cross-origin Base44 POST as an untrusted origin.
 *  3. Compose injects unset `${VAR:-}` as an empty string, which defeated the
 *     documented external-client defaults via `??`.
 */
import type { Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { boardMutationGuard } from "../middleware/board-mutation-guard.js";
import {
  EXTERNAL_CLIENT_ALLOWED_ENDPOINTS,
  externalClientSurfaceGuard,
} from "../middleware/external-client-surface.js";
import {
  getExternalClientAuthConfig,
  resetExternalClientAuthConfig,
} from "../auth/external-client-config.js";

type Actor = Request["actor"];

function externalActor(scope: string[]): Actor {
  return {
    type: "board",
    userId: "user-123",
    companyIds: ["co-1"],
    companyRoles: { "co-1": "owner" },
    isInstanceAdmin: false,
    scope,
    source: "external_client",
  };
}

function run(
  middleware: ReturnType<typeof externalClientSurfaceGuard>,
  req: Partial<Request> & { actor: Actor },
) {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  const next = vi.fn();
  middleware(req as Request, res as unknown as Response, next);
  return { res, next };
}

describe("external-client surface guard", () => {
  it("allows the meeting token endpoint with meeting:join", () => {
    const { next, res } = run(externalClientSurfaceGuard(), {
      actor: externalActor(["meeting:join"]),
      method: "POST",
      path: "/meeting/token",
    });
    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBe(0);
  });

  it("allows the events endpoint with meeting:events", () => {
    const { next } = run(externalClientSurfaceGuard(), {
      actor: externalActor(["meeting:events"]),
      method: "POST",
      path: "/meeting/events",
    });
    expect(next).toHaveBeenCalled();
  });

  it("denies a control-plane route even though the actor is type board", () => {
    const { next, res } = run(externalClientSurfaceGuard(), {
      actor: externalActor(["meeting:join", "meeting:events"]),
      method: "GET",
      path: "/secrets",
    });
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it("denies company reads for a meeting-scoped token", () => {
    const { next, res } = run(externalClientSurfaceGuard(), {
      actor: externalActor(["meeting:events"]),
      method: "GET",
      path: "/companies",
    });
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it("denies the meeting token endpoint when the token lacks meeting:join", () => {
    const { next, res } = run(externalClientSurfaceGuard(), {
      actor: externalActor(["meeting:events"]),
      method: "POST",
      path: "/meeting/token",
    });
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it("does not match a path that merely starts with an allowed one", () => {
    const { next, res } = run(externalClientSurfaceGuard(), {
      actor: externalActor(["meeting:join"]),
      method: "POST",
      path: "/meeting/token/../secrets",
    });
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it("leaves first-party actors completely untouched", () => {
    const { next, res } = run(externalClientSurfaceGuard(), {
      actor: { type: "board", userId: "u", isInstanceAdmin: true, source: "session" },
      method: "GET",
      path: "/secrets",
    });
    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBe(0);
  });

  it("keeps the allowlist to exactly the meeting surface", () => {
    expect(EXTERNAL_CLIENT_ALLOWED_ENDPOINTS.map((e) => `${e.method} ${e.path}`)).toEqual([
      "POST /meeting/token",
      "POST /meeting/events",
    ]);
  });
});

describe("boardMutationGuard and cross-origin bearer clients", () => {
  it("does not CSRF-block an external-client POST from the Base44 origin", () => {
    const req = {
      actor: externalActor(["meeting:join"]),
      method: "POST",
      header: (name: string) =>
        name.toLowerCase() === "origin" ? "https://amx-midnight-link.base44.app" : undefined,
    };
    const { next, res } = run(boardMutationGuard() as never, req as never);
    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBe(0);
  });

  it("still blocks a browser-session board mutation from a foreign origin", () => {
    const req = {
      actor: { type: "board", userId: "u", source: "session" } as Actor,
      method: "POST",
      header: (name: string) =>
        name.toLowerCase() === "origin" ? "https://evil.example" : undefined,
    };
    const { next, res } = run(boardMutationGuard() as never, req as never);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });
});

describe("external-client config defaults", () => {
  const KEYS = [
    "AMX_EXTERNAL_CLIENT_SECRET",
    "AMX_EXTERNAL_CLIENT_ID",
    "AMX_EXTERNAL_CLIENT_ISS",
    "AMX_EXTERNAL_CLIENT_AUD",
    "AMX_EXTERNAL_CLIENT_REDIRECT_URIS",
    "BASE44_ALLOWED_ORIGINS",
  ] as const;
  let saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    resetExternalClientAuthConfig();
    saved = {};
    for (const k of KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    resetExternalClientAuthConfig();
  });

  it("keeps documented defaults when Compose injects empty strings", () => {
    // Exactly what `${AMX_EXTERNAL_CLIENT_ID:-}` produces when unset.
    process.env.AMX_EXTERNAL_CLIENT_SECRET = "s3cret";
    process.env.AMX_EXTERNAL_CLIENT_ID = "";
    process.env.AMX_EXTERNAL_CLIENT_ISS = "";
    process.env.AMX_EXTERNAL_CLIENT_AUD = "";
    process.env.AMX_EXTERNAL_CLIENT_REDIRECT_URIS = "";
    process.env.BASE44_ALLOWED_ORIGINS = "https://amx-midnight-link.base44.app";

    const cfg = getExternalClientAuthConfig();
    expect(cfg.enabled).toBe(true);
    expect(cfg.iss).toBe("https://api.amx-air-hubs.cc");
    expect(cfg.aud).toBe("amx-external-client");
    // The documented client id must still resolve, not become "".
    expect(cfg.registry.get("amx-base44-meeting")).toBeDefined();
    expect(cfg.registry.get("")).toBeUndefined();
  });

  it("derives the redirect URI from the allowed origin", () => {
    process.env.AMX_EXTERNAL_CLIENT_SECRET = "s3cret";
    process.env.BASE44_ALLOWED_ORIGINS = "https://amx-midnight-link.base44.app";
    const cfg = getExternalClientAuthConfig();
    expect(cfg.registry.get("amx-base44-meeting")?.redirectUris).toEqual([
      "https://amx-midnight-link.base44.app/amx-auth/callback",
    ]);
  });

  it("stays disabled when the secret is blank", () => {
    process.env.AMX_EXTERNAL_CLIENT_SECRET = "   ";
    process.env.BASE44_ALLOWED_ORIGINS = "https://amx-midnight-link.base44.app";
    expect(getExternalClientAuthConfig().enabled).toBe(false);
  });
});
