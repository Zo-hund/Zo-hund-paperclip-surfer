/**
 * Step 6.8B security suite — ported from external-client-auth.harness.cjs and
 * re-pointed at the REAL repo modules (shared authz helpers, shared meeting
 * token service, repo company roles).
 *
 * The properties under test are the ones that gate LIVEKIT_REQUIRED:
 * PKCE is mandatory and S256-only, codes are single-use and bound to
 * client+redirect, tokens are tamper/expiry/aud/iss checked, and authority
 * always comes from the DB reload — never from the token or the request body.
 */
import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { TrackSource } from "livekit-server-sdk";
import type { Db } from "@paperclipai/db";
import {
  AuthError,
  ClientRegistry,
  MemoryAuthCodeStore,
  exchangeAuthorizationCode,
  issueAuthorizationCode,
  sha256,
  verifyPkceS256,
} from "../auth/external-client-auth.js";
import {
  TokenError,
  hs256Signer,
  hs256Verifier,
  mintExternalToken,
  verifyExternalToken,
} from "../auth/external-client-token.js";
import { resolveExternalClientActor, type MembershipSnapshot } from "../auth/external-client-actor.js";
import { deriveGrants, mintMeetingToken } from "../services/meeting-token-service.js";
import { HttpError } from "../errors.js";

const CLIENT_ID = "amx-base44-meeting";
const REDIRECT = "https://amx-midnight-link.base44.app/amx-auth/callback";
const ISS = "https://api.amx-air-hubs.cc";
const AUD = "amx-external-client";
const SECRET = "test-signing-key";

const registry = new ClientRegistry([
  { clientId: CLIENT_ID, redirectUris: [REDIRECT], allowedScopes: ["meeting:join", "meeting:events"] },
]);

const b64url = (b: Buffer) =>
  b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const codeVerifier = b64url(randomBytes(32));
const codeChallenge = b64url(sha256(codeVerifier));
const sign = hs256Signer(SECRET);
const verify = hs256Verifier(SECRET);

/** The bridge never touches the DB for a non-"meeting-" room, so this is never called. */
const fakeDb = {} as Db;

function freshCode(store: MemoryAuthCodeStore, ttlMs?: number) {
  return issueAuthorizationCode(store, registry, {
    clientId: CLIENT_ID,
    redirectUri: REDIRECT,
    scopes: ["meeting:join", "meeting:events"],
    codeChallenge,
    codeChallengeMethod: "S256",
    userId: "user-123",
    ttlMs,
  });
}

function snapshot(
  companyIds: string[],
  companyRoles: Record<string, string>,
  isInstanceAdmin = false,
): MembershipSnapshot {
  return { companyIds, companyRoles: companyRoles as MembershipSnapshot["companyRoles"], isInstanceAdmin };
}

function externalToken(overrides: Partial<Parameters<typeof mintExternalToken>[1]> = {}) {
  return mintExternalToken(sign, {
    userId: "user-123",
    clientId: CLIENT_ID,
    scope: ["meeting:join", "meeting:events"],
    iss: ISS,
    aud: AUD,
    ...overrides,
  });
}

function resolveActor(token: string, snap: MembershipSnapshot) {
  return resolveExternalClientActor(token, {
    verify,
    reloadMemberships: async () => snap,
    verifyOptions: { expectedIss: ISS, expectedAud: AUD },
  });
}

describe("6.8B — PKCE + authorization code exchange", () => {
  it("denies an unknown client_id", async () => {
    await expect(
      issueAuthorizationCode(new MemoryAuthCodeStore(0), registry, {
        clientId: "nope",
        redirectUri: REDIRECT,
        scopes: ["meeting:join"],
        codeChallenge,
        codeChallengeMethod: "S256",
        userId: "u",
      }),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it("denies an unapproved redirect_uri", async () => {
    await expect(
      issueAuthorizationCode(new MemoryAuthCodeStore(0), registry, {
        clientId: CLIENT_ID,
        redirectUri: "https://evil.example/cb",
        scopes: ["meeting:join"],
        codeChallenge,
        codeChallengeMethod: "S256",
        userId: "u",
      }),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it("denies a scope the client is not allowed", async () => {
    await expect(
      issueAuthorizationCode(new MemoryAuthCodeStore(0), registry, {
        clientId: CLIENT_ID,
        redirectUri: REDIRECT,
        scopes: ["meeting:admin" as never],
        codeChallenge,
        codeChallengeMethod: "S256",
        userId: "u",
      }),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it("denies a missing PKCE challenge", async () => {
    await expect(
      issueAuthorizationCode(new MemoryAuthCodeStore(0), registry, {
        clientId: CLIENT_ID,
        redirectUri: REDIRECT,
        scopes: ["meeting:join"],
        codeChallenge: "",
        codeChallengeMethod: "S256",
        userId: "u",
      }),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it("denies a non-S256 challenge method", async () => {
    await expect(
      issueAuthorizationCode(new MemoryAuthCodeStore(0), registry, {
        clientId: CLIENT_ID,
        redirectUri: REDIRECT,
        scopes: ["meeting:join"],
        codeChallenge,
        codeChallengeMethod: "plain",
        userId: "u",
      }),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it("denies a wrong PKCE verifier", async () => {
    const store = new MemoryAuthCodeStore(0);
    const code = await freshCode(store);
    await expect(
      exchangeAuthorizationCode(store, {
        clientId: CLIENT_ID,
        code,
        codeVerifier: "wrong",
        redirectUri: REDIRECT,
      }),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it("denies an expired code", async () => {
    const store = new MemoryAuthCodeStore(0);
    const code = await freshCode(store, 1);
    await new Promise((r) => setTimeout(r, 5));
    await expect(
      exchangeAuthorizationCode(store, { clientId: CLIENT_ID, code, codeVerifier, redirectUri: REDIRECT }),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it("accepts the first exchange and denies a replay of the same code", async () => {
    const store = new MemoryAuthCodeStore(0);
    const code = await freshCode(store);
    const rec = await exchangeAuthorizationCode(store, {
      clientId: CLIENT_ID,
      code,
      codeVerifier,
      redirectUri: REDIRECT,
    });
    expect(rec.userId).toBe("user-123");

    await expect(
      exchangeAuthorizationCode(store, { clientId: CLIENT_ID, code, codeVerifier, redirectUri: REDIRECT }),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it("denies a redirect_uri that changed between authorize and exchange", async () => {
    const store = new MemoryAuthCodeStore(0);
    const code = await freshCode(store);
    await expect(
      exchangeAuthorizationCode(store, {
        clientId: CLIENT_ID,
        code,
        codeVerifier,
        redirectUri: "https://evil.example/cb",
      }),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it("denies a code presented by a different client", async () => {
    const store = new MemoryAuthCodeStore(0);
    const code = await freshCode(store);
    await expect(
      exchangeAuthorizationCode(store, {
        clientId: "other-client",
        code,
        codeVerifier,
        redirectUri: REDIRECT,
      }),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it("verifies a correct S256 challenge", () => {
    expect(verifyPkceS256(codeVerifier, codeChallenge)).toBe(true);
  });
});

describe("6.8B — external token verification", () => {
  it("verifies a well-formed token", () => {
    const claims = verifyExternalToken(verify, externalToken(), { expectedIss: ISS, expectedAud: AUD });
    expect(claims.sub).toBe("user-123");
  });

  it("denies an altered token", () => {
    const token = externalToken();
    expect(() =>
      verifyExternalToken(verify, `${token.slice(0, -3)}xyz`, { expectedIss: ISS, expectedAud: AUD }),
    ).toThrow(TokenError);
  });

  it("denies an expired token", () => {
    const token = externalToken({ ttlSeconds: -10, now: Math.floor(Date.now() / 1000) });
    expect(() => verifyExternalToken(verify, token, { expectedIss: ISS, expectedAud: AUD })).toThrow(
      TokenError,
    );
  });

  it("denies a wrong audience", () => {
    const token = externalToken({ aud: "someone-else" });
    expect(() => verifyExternalToken(verify, token, { expectedIss: ISS, expectedAud: AUD })).toThrow(
      TokenError,
    );
  });

  it("denies a wrong issuer", () => {
    const token = externalToken({ iss: "https://evil.example" });
    expect(() => verifyExternalToken(verify, token, { expectedIss: ISS, expectedAud: AUD })).toThrow(
      TokenError,
    );
  });

  it("denies a token signed with a different key", () => {
    const token = mintExternalToken(hs256Signer("other-key"), {
      userId: "user-123",
      clientId: CLIENT_ID,
      scope: [],
      iss: ISS,
      aud: AUD,
    });
    expect(() => verifyExternalToken(verify, token, { expectedIss: ISS, expectedAud: AUD })).toThrow(
      TokenError,
    );
  });

  it("denies a revoked jti", () => {
    const token = externalToken();
    const { jti } = verifyExternalToken(verify, token, { expectedIss: ISS, expectedAud: AUD });
    expect(() =>
      verifyExternalToken(verify, token, {
        expectedIss: ISS,
        expectedAud: AUD,
        isRevoked: (candidate) => candidate === jti,
      }),
    ).toThrow(TokenError);
  });

  it("never embeds the signing secret in the issued token", () => {
    expect(externalToken().includes(SECRET)).toBe(false);
  });
});

describe("6.8B — actor authority comes from the DB, not the token or body", () => {
  it("takes identity from the verified sub", async () => {
    const actor = await resolveActor(externalToken(), snapshot(["co-1"], { "co-1": "owner" }));
    expect(actor.userId).toBe("user-123");
    expect(actor.source).toBe("external_client");
  });

  it("takes roles from the live DB reload", async () => {
    const actor = await resolveActor(externalToken(), snapshot(["co-1"], { "co-1": "owner" }));
    expect(actor.companyRoles?.["co-1"]).toBe("owner");
  });

  it("carries no signing material on the actor", async () => {
    const actor = await resolveActor(externalToken(), snapshot(["co-1"], { "co-1": "owner" }));
    expect(JSON.stringify(actor).includes(SECRET)).toBe(false);
  });
});

describe("6.8B — grant derivation is role-gated", () => {
  it("uses the actor identity, never a client-supplied one", async () => {
    const actor = await resolveActor(externalToken(), snapshot(["co-1"], { "co-1": "owner" }));
    const grants = deriveGrants({
      actor,
      identity: actor.userId as string,
      roomName: "room-x",
      companyId: "co-1",
      requestedCapabilities: { camera: true },
      policy: "capability_scoped",
    });
    expect(grants.identity).toBe("user-123");
  });

  it("denies screen share to a below-admin member that asks for it", async () => {
    const actor = await resolveActor(externalToken(), snapshot(["co-1"], { "co-1": "member" }));
    const grants = deriveGrants({
      actor,
      identity: actor.userId as string,
      roomName: "room-x",
      companyId: "co-1",
      requestedCapabilities: { camera: true, screenShare: true, chat: true },
      policy: "capability_scoped",
    });
    expect(grants.canPublishSources).not.toContain(TrackSource.SCREEN_SHARE);
    expect(grants.canPublishSources).toContain(TrackSource.CAMERA);
  });

  it("allows screen share for an owner", async () => {
    const actor = await resolveActor(externalToken(), snapshot(["co-1"], { "co-1": "owner" }));
    const grants = deriveGrants({
      actor,
      identity: actor.userId as string,
      roomName: "room-x",
      companyId: "co-1",
      requestedCapabilities: { screenShare: true },
      policy: "capability_scoped",
    });
    expect(grants.canPublishSources).toContain(TrackSource.SCREEN_SHARE);
  });

  it("keeps the board façade on its historical full-publish 4h grant", async () => {
    const actor = await resolveActor(externalToken(), snapshot(["co-1"], { "co-1": "member" }));
    const grants = deriveGrants({
      actor,
      identity: "board-user",
      roomName: "amx-command-room",
      policy: "board_full",
    });
    expect(grants).toMatchObject({
      identity: "board-user",
      canPublish: true,
      canPublishData: true,
      canSubscribe: true,
      ttl: "4h",
    });
    expect(grants.canPublishSources).toBeUndefined();
  });

  it("issues short-lived tokens to external clients", async () => {
    const actor = await resolveActor(externalToken(), snapshot(["co-1"], { "co-1": "owner" }));
    const grants = deriveGrants({
      actor,
      identity: actor.userId as string,
      roomName: "room-x",
      companyId: "co-1",
      policy: "capability_scoped",
    });
    expect(grants.ttl).toBe("15m");
  });
});

describe("6.8B — shared meeting token service authorization", () => {
  beforeAll(() => {
    process.env.LIVEKIT_URL = "wss://livekit.test";
    process.env.LIVEKIT_API_KEY = "test-key";
    process.env.LIVEKIT_API_SECRET = "test-secret-value-long-enough";
  });

  const mint = (actor: Awaited<ReturnType<typeof resolveActor>>, over: Record<string, unknown> = {}) =>
    mintMeetingToken(fakeDb, {
      actor,
      roomName: "room-x",
      companyId: "co-1",
      identity: actor.userId as string,
      requestedCapabilities: {},
      policy: "capability_scoped",
      requiredScope: "meeting:join",
      dispatchAgent: false,
      ...over,
    });

  it("mints for an authorized owner", async () => {
    const actor = await resolveActor(externalToken(), snapshot(["co-1"], { "co-1": "owner" }));
    const result = await mint(actor);
    expect(result.roomName).toBe("room-x");
    expect(result.token.split(".")).toHaveLength(3);
    expect(result.token.includes(process.env.LIVEKIT_API_SECRET as string)).toBe(false);
  });

  it("denies a member whose membership was removed since the token was issued", async () => {
    const actor = await resolveActor(externalToken(), snapshot([], {}));
    await expect(mint(actor)).rejects.toBeInstanceOf(HttpError);
  });

  it("denies a company the actor does not belong to", async () => {
    const actor = await resolveActor(externalToken(), snapshot(["co-1"], { "co-1": "owner" }));
    await expect(mint(actor, { companyId: "co-999" })).rejects.toBeInstanceOf(HttpError);
  });

  it("denies a scope the token does not carry", async () => {
    const actor = await resolveActor(
      externalToken({ scope: ["meeting:events"] }),
      snapshot(["co-1"], { "co-1": "owner" }),
    );
    await expect(mint(actor)).rejects.toBeInstanceOf(HttpError);
  });

  it("denies a viewer below the member tier", async () => {
    const actor = await resolveActor(externalToken(), snapshot(["co-1"], { "co-1": "viewer" }));
    await expect(mint(actor)).rejects.toBeInstanceOf(HttpError);
  });

  it("refuses to mint when LiveKit is unconfigured", async () => {
    const actor = await resolveActor(externalToken(), snapshot(["co-1"], { "co-1": "owner" }));
    const saved = process.env.LIVEKIT_API_KEY;
    delete process.env.LIVEKIT_API_KEY;
    try {
      await expect(mint(actor)).rejects.toMatchObject({ status: 503 });
    } finally {
      process.env.LIVEKIT_API_KEY = saved;
    }
  });
});
