// =====================================================================
// Step 6.8B — AMX External Client Auth: Authorization Code + PKCE.
//
// AMX is the ISSUER. An untrusted external client (Base44 = client #1;
// later WebXR / mobile / kiosk / partner portal) sends the person to AMX,
// AMX authenticates them first-party (BetterAuth), issues a one-time code,
// and exchanges it — with PKCE — for a short-lived AMX bearer token.
//
// This module is framework- and storage-agnostic: the code store is an
// injected interface so production can back it with Redis/Postgres. No
// secret and no LiveKit/BetterAuth material lives here.
// =====================================================================
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export type Scope = "meeting:join" | "meeting:events";

export const SUPPORTED_SCOPES: Scope[] = ["meeting:join", "meeting:events"];

export interface ClientConfig {
  clientId: string;
  redirectUris: string[]; // exact-match allowlist
  allowedScopes: Scope[];
}

/** Registry of approved external clients (Base44 today, others later). */
export class ClientRegistry {
  private byId = new Map<string, ClientConfig>();
  constructor(clients: ClientConfig[]) {
    for (const c of clients) this.byId.set(c.clientId, c);
  }
  get(clientId: string): ClientConfig | undefined {
    return this.byId.get(clientId);
  }
  /** Validate a client + redirect + requested scopes together. Throws AuthError on any mismatch. */
  validate(clientId: string, redirectUri: string, scopes: Scope[]): ClientConfig {
    const c = this.byId.get(clientId);
    if (!c) throw new AuthError("invalid_client", "unknown client_id");
    if (!c.redirectUris.includes(redirectUri)) throw new AuthError("invalid_request", "redirect_uri not allowed");
    for (const s of scopes) {
      if (!c.allowedScopes.includes(s)) throw new AuthError("invalid_scope", `scope not allowed: ${s}`);
    }
    return c;
  }
}

export class AuthError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "AuthError";
  }
}

// ---- PKCE (S256 only; plain is rejected) ----
function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function sha256(input: string): Buffer {
  return createHash("sha256").update(input).digest();
}
/** challenge = base64url(sha256(verifier)); constant-time compare. */
export function verifyPkceS256(codeVerifier: string, storedChallenge: string): boolean {
  if (!codeVerifier || !storedChallenge) return false;
  const computed = b64url(sha256(codeVerifier));
  const a = Buffer.from(computed);
  const b = Buffer.from(storedChallenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---- One-time authorization code store ----
export interface AuthCodeRecord {
  userId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string; // S256 challenge captured at /authorize
  scopes: Scope[];
  expiresAt: number; // epoch ms
  usedAt: number | null;
}
/** Storage seam. Production: Redis/Postgres with atomic single-use consume. */
export interface AuthCodeStore {
  put(codeHash: string, rec: AuthCodeRecord): Promise<void>;
  /** Atomically fetch + mark used. Returns the record ONLY on first use. */
  consume(codeHash: string): Promise<AuthCodeRecord | null>;
}

/**
 * In-memory store — reference/tests and single-instance deployments only.
 *
 * PRODUCTION (multi-instance): swap for a Redis/Postgres store whose
 * `consume` is a single atomic compare-and-set, so two concurrent exchanges
 * of the same code cannot both succeed. Node is single-threaded per process,
 * so this implementation IS atomic within one process, but it is not shared
 * across replicas and it does not survive a restart.
 */
export class MemoryAuthCodeStore implements AuthCodeStore {
  private m = new Map<string, AuthCodeRecord>();
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(sweepIntervalMs = 60_000) {
    if (sweepIntervalMs > 0) {
      this.sweepTimer = setInterval(() => this.sweep(), sweepIntervalMs);
      // Never hold the event loop open for a cache sweep.
      this.sweepTimer.unref?.();
    }
  }

  async put(codeHash: string, rec: AuthCodeRecord): Promise<void> {
    this.m.set(codeHash, rec);
  }

  async consume(codeHash: string): Promise<AuthCodeRecord | null> {
    const rec = this.m.get(codeHash);
    if (!rec) return null;
    if (rec.usedAt !== null) return null; // reuse -> deny
    if (Date.now() > rec.expiresAt) return null; // expired -> deny
    rec.usedAt = Date.now(); // single-use latch
    this.m.set(codeHash, rec);
    return rec;
  }

  /** Drop expired records so a long-lived process cannot grow unbounded. */
  sweep(now = Date.now()): void {
    for (const [hash, rec] of this.m) {
      // Keep used codes around until expiry so replay is denied as "used",
      // not silently re-issued after eviction.
      if (now > rec.expiresAt) this.m.delete(hash);
    }
  }

  stop(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.sweepTimer = null;
  }
}

export interface AuthorizeInput {
  clientId: string;
  redirectUri: string;
  scopes: Scope[];
  codeChallenge: string;
  codeChallengeMethod: string; // must be 'S256'
  userId: string; // resolved by AMX first-party auth (BetterAuth) BEFORE this call
  ttlMs?: number; // default 90s
}

const CODE_TTL_MS = 90_000;

/** Issue a one-time code after AMX has authenticated the user. Stores only the hash. */
export async function issueAuthorizationCode(
  store: AuthCodeStore,
  registry: ClientRegistry,
  input: AuthorizeInput,
): Promise<string> {
  registry.validate(input.clientId, input.redirectUri, input.scopes);
  if (input.codeChallengeMethod !== "S256") {
    throw new AuthError("invalid_request", "code_challenge_method must be S256");
  }
  if (!input.codeChallenge) throw new AuthError("invalid_request", "code_challenge required (PKCE mandatory)");
  const code = "amxc_" + b64url(randomBytes(32));
  const codeHash = b64url(sha256(code));
  await store.put(codeHash, {
    userId: input.userId,
    clientId: input.clientId,
    redirectUri: input.redirectUri,
    codeChallenge: input.codeChallenge,
    scopes: input.scopes,
    expiresAt: Date.now() + (input.ttlMs ?? CODE_TTL_MS),
    usedAt: null,
  });
  return code;
}

export interface ExchangeInput {
  clientId: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
}

/** Exchange a code+verifier for the record to mint a token from. Enforces all bindings. */
export async function exchangeAuthorizationCode(
  store: AuthCodeStore,
  input: ExchangeInput,
): Promise<AuthCodeRecord> {
  if (!input.code) throw new AuthError("invalid_grant", "code required");
  const codeHash = b64url(sha256(input.code));
  const rec = await store.consume(codeHash); // atomic: exists + unused + unexpired
  if (!rec) throw new AuthError("invalid_grant", "code invalid, used, or expired");
  if (rec.clientId !== input.clientId) throw new AuthError("invalid_grant", "client mismatch");
  if (rec.redirectUri !== input.redirectUri) throw new AuthError("invalid_grant", "redirect_uri mismatch");
  if (!verifyPkceS256(input.codeVerifier, rec.codeChallenge)) {
    throw new AuthError("invalid_grant", "PKCE verification failed");
  }
  return rec; // caller mints the token; NEVER encode authoritative roles into it
}
