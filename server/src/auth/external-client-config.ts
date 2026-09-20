// =====================================================================
// Step 6.8B — env wiring for external-client-auth.
//
// One config object shared by the /api/auth/external/* routes (which issue
// tokens) and actorMiddleware (which verifies them), so the two can never
// drift on issuer, audience, key, or TTL.
//
// The subsystem is OFF unless AMX_EXTERNAL_CLIENT_SECRET is set — an
// unconfigured deployment simply has no external-client surface.
// =====================================================================
import {
  ClientRegistry,
  MemoryAuthCodeStore,
  SUPPORTED_SCOPES,
  type AuthCodeStore,
  type ClientConfig,
  type Scope,
} from "./external-client-auth.js";
import {
  DEFAULT_EXTERNAL_AUD,
  DEFAULT_EXTERNAL_ISS,
  DEFAULT_EXTERNAL_TTL_SECONDS,
  hs256Signer,
  hs256Verifier,
  type Signer,
  type Verifier,
} from "./external-client-token.js";
import { parseAllowedOrigins } from "../meeting/base44-cors.js";

const DEFAULT_CLIENT_ID = "amx-base44-meeting";
/** Path the Base44 client redirects back to — see src/lib/amxAuth.ts in the client bundle. */
const DEFAULT_CALLBACK_PATH = "/amx-auth/callback";

export interface ExternalClientAuthConfig {
  enabled: boolean;
  registry: ClientRegistry;
  store: AuthCodeStore;
  sign: Signer;
  verify: Verifier;
  iss: string;
  aud: string;
  ttlSeconds: number;
  revoke(jti: string, expiresAtSeconds?: number): void;
  isRevoked(jti: string): boolean;
}

/**
 * Compose injects `${VAR:-}` as an EMPTY STRING rather than leaving the variable
 * unset, and `??` only falls back on null/undefined — so a blank value would
 * silently defeat these defaults (an empty client_id rejects every authorize
 * request). Treat blank as absent.
 */
function envOr(name: string, fallback: string): string {
  const raw = process.env[name];
  return raw && raw.trim().length > 0 ? raw.trim() : fallback;
}

function splitList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

/**
 * Approved redirect URIs. Explicit config wins; otherwise they are derived
 * from the Base44 origins already allowlisted for CORS, so there is a single
 * place to add an origin.
 */
function resolveRedirectUris(): string[] {
  const explicit = splitList(process.env.AMX_EXTERNAL_CLIENT_REDIRECT_URIS);
  if (explicit.length > 0) return explicit;
  const callbackPath = envOr("AMX_EXTERNAL_CLIENT_CALLBACK_PATH", DEFAULT_CALLBACK_PATH);
  return Array.from(parseAllowedOrigins(process.env.BASE44_ALLOWED_ORIGINS)).map(
    (origin) => `${origin}${callbackPath}`,
  );
}

/**
 * In-memory revocation list. Single-instance only — production should back
 * this with the same shared store as the auth codes. Entries are dropped once
 * the token would have expired anyway.
 */
class RevocationList {
  private byJti = new Map<string, number>();
  revoke(jti: string, expiresAtSeconds?: number): void {
    const ttl = expiresAtSeconds ?? Math.floor(Date.now() / 1000) + DEFAULT_EXTERNAL_TTL_SECONDS;
    this.byJti.set(jti, ttl);
  }
  isRevoked(jti: string): boolean {
    const exp = this.byJti.get(jti);
    if (exp === undefined) return false;
    if (Math.floor(Date.now() / 1000) >= exp) {
      this.byJti.delete(jti);
      return false;
    }
    return true;
  }
}

let cached: ExternalClientAuthConfig | null = null;

export function getExternalClientAuthConfig(): ExternalClientAuthConfig {
  if (cached) return cached;

  const secret = (process.env.AMX_EXTERNAL_CLIENT_SECRET ?? "").trim();
  const clientId = envOr("AMX_EXTERNAL_CLIENT_ID", DEFAULT_CLIENT_ID);
  const redirectUris = resolveRedirectUris();
  const allowedScopes = (splitList(process.env.AMX_EXTERNAL_CLIENT_SCOPES) as Scope[]).filter((s) =>
    SUPPORTED_SCOPES.includes(s),
  );

  const client: ClientConfig = {
    clientId,
    redirectUris,
    allowedScopes: allowedScopes.length > 0 ? allowedScopes : SUPPORTED_SCOPES,
  };

  const revocations = new RevocationList();
  const ttlSeconds = Number(envOr("AMX_EXTERNAL_CLIENT_TTL_SECONDS", String(DEFAULT_EXTERNAL_TTL_SECONDS)));

  cached = {
    // A secret is required to sign anything; without one there is no external
    // surface at all, and redirect URIs must be resolvable for /authorize.
    enabled: secret.length > 0 && redirectUris.length > 0,
    registry: new ClientRegistry([client]),
    store: new MemoryAuthCodeStore(),
    sign: hs256Signer(secret),
    verify: secret.length > 0 ? hs256Verifier(secret) : () => false,
    iss: envOr("AMX_EXTERNAL_CLIENT_ISS", DEFAULT_EXTERNAL_ISS),
    aud: envOr("AMX_EXTERNAL_CLIENT_AUD", DEFAULT_EXTERNAL_AUD),
    ttlSeconds: Number.isFinite(ttlSeconds) && ttlSeconds > 0 ? ttlSeconds : DEFAULT_EXTERNAL_TTL_SECONDS,
    revoke: (jti, exp) => revocations.revoke(jti, exp),
    isRevoked: (jti) => revocations.isRevoked(jti),
  };
  return cached;
}

/** Tests only — forces the next call to re-read process.env. */
export function resetExternalClientAuthConfig(): void {
  cached = null;
}
