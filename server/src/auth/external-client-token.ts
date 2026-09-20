// =====================================================================
// Step 6.8B — AMX external access token (short-lived, signed by AMX).
//
// Reference signer/verifier is HS256 via node:crypto so the suite runs
// self-contained. PRODUCTION: swap for the AMX signing key (RS256/EdDSA
// with a published JWKS at the issuer) — the sign/verify seam is injectable.
// The token carries sub + client_id + scope + iss/aud/iat/exp/jti. It does
// NOT carry authoritative AMX roles; those are reloaded from the DB per
// request (see external-client-actor.ts).
// =====================================================================
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";

export interface ExternalTokenClaims {
  iss: string;
  aud: string;
  sub: string; // AMX user id
  client_id: string;
  scope: string[];
  iat: number; // epoch seconds
  exp: number; // epoch seconds
  jti: string;
}

export const DEFAULT_EXTERNAL_ISS = "https://api.amx-air-hubs.cc";
export const DEFAULT_EXTERNAL_AUD = "amx-external-client";
export const DEFAULT_EXTERNAL_TTL_SECONDS = 15 * 60; // 15 min, NOT hours

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlJson(obj: unknown): string {
  return b64url(Buffer.from(JSON.stringify(obj)));
}

/** Signing seam. Reference = HS256. Production = AMX asymmetric key + JWKS. */
export type Signer = (signingInput: string) => string; // returns base64url signature
export type Verifier = (signingInput: string, signature: string) => boolean;

export function hs256Signer(secret: string): Signer {
  return (input) => b64url(createHmac("sha256", secret).update(input).digest());
}
export function hs256Verifier(secret: string): Verifier {
  return (input, sig) => {
    const expected = b64url(createHmac("sha256", secret).update(input).digest());
    const a = Buffer.from(expected);
    const b = Buffer.from(sig);
    return a.length === b.length && timingSafeEqual(a, b);
  };
}

export interface MintTokenInput {
  userId: string;
  clientId: string;
  scope: string[];
  iss?: string;
  aud?: string;
  ttlSeconds?: number;
  now?: number; // epoch seconds (tests)
}

export function mintExternalToken(sign: Signer, input: MintTokenInput): string {
  const now = input.now ?? Math.floor(Date.now() / 1000);
  const claims: ExternalTokenClaims = {
    iss: input.iss ?? DEFAULT_EXTERNAL_ISS,
    aud: input.aud ?? DEFAULT_EXTERNAL_AUD,
    sub: input.userId,
    client_id: input.clientId,
    scope: input.scope,
    iat: now,
    exp: now + (input.ttlSeconds ?? DEFAULT_EXTERNAL_TTL_SECONDS),
    jti: b64url(randomBytes(12)),
  };
  const header = b64urlJson({ alg: "HS256", typ: "JWT" });
  const payload = b64urlJson(claims);
  const signingInput = `${header}.${payload}`;
  return `${signingInput}.${sign(signingInput)}`;
}

export class TokenError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "TokenError";
  }
}

export interface VerifyOptions {
  expectedIss?: string;
  expectedAud?: string;
  now?: number;
  /** Deny tokens whose jti has been revoked. */
  isRevoked?: (jti: string) => boolean;
}

export function verifyExternalToken(
  verify: Verifier,
  token: string,
  opts: VerifyOptions = {},
): ExternalTokenClaims {
  const parts = token.split(".");
  if (parts.length !== 3) throw new TokenError("malformed", "token must have 3 segments");
  const [header, payload, sig] = parts;
  if (!header || !payload || !sig) throw new TokenError("malformed", "token segment empty");
  if (!verify(`${header}.${payload}`, sig)) throw new TokenError("bad_signature", "signature invalid");
  let claims: ExternalTokenClaims;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
  } catch {
    throw new TokenError("malformed", "payload not JSON");
  }
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== "number" || now >= claims.exp) throw new TokenError("expired", "token expired");
  if (opts.expectedIss && claims.iss !== opts.expectedIss) throw new TokenError("bad_issuer", "iss mismatch");
  if (opts.expectedAud && claims.aud !== opts.expectedAud) throw new TokenError("bad_audience", "aud mismatch");
  if (!claims.sub) throw new TokenError("malformed", "sub required");
  if (claims.jti && opts.isRevoked?.(claims.jti)) throw new TokenError("revoked", "token revoked");
  return claims;
}
