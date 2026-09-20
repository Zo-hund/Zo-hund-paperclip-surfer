// =====================================================================
// Step 6.8B routes — AMX is the issuer for untrusted external clients.
//   GET  /api/auth/external/authorize   (first-party AMX login → one-time code)
//   POST /api/auth/external/token       (code + PKCE verifier → short-lived token)
//   POST /api/auth/external/revoke      (invalidate the presented token's jti)
//
// Subsystem name: external-client-auth (Base44 = client #1; WebXR/mobile/kiosk later).
//
// Mounted in app.ts at /api/auth/external — BEFORE the BetterAuth catch-all
// (`app.all("/api/auth/*authPath")`), which would otherwise swallow these paths,
// and AFTER actorMiddleware so /authorize can read the first-party session.
// =====================================================================
import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { logger } from "../middleware/logger.js";
import {
  AuthError,
  exchangeAuthorizationCode,
  issueAuthorizationCode,
  type Scope,
} from "../auth/external-client-auth.js";
import { mintExternalToken, verifyExternalToken, TokenError } from "../auth/external-client-token.js";
import { getExternalClientAuthConfig } from "../auth/external-client-config.js";

/** Sources that may bootstrap a NEW external credential. */
const FIRST_PARTY_SOURCES = new Set(["session", "board_key", "local_implicit"]);

export function externalClientAuthRoutes(_db: Db) {
  const router = Router();

  /**
   * 1) Authorization request — the browser lands here from the external client.
   * AMX authenticates the person FIRST-PARTY (BetterAuth cookie is first-party
   * on this domain), then hands back a one-time code bound to the PKCE
   * challenge, client, and redirect URI.
   */
  router.get("/authorize", async (req, res) => {
    const cfg = getExternalClientAuthConfig();
    if (!cfg.enabled) {
      res.status(503).json({ error: "external client auth is not configured" });
      return;
    }
    try {
      const q = req.query as Record<string, string | undefined>;
      const clientId = q.client_id ?? "";
      const redirectUri = q.redirect_uri ?? "";
      const scopes = (q.scope ?? "meeting:join").split(/\s+/).filter(Boolean) as Scope[];

      // client + redirect + scope allowlist, all validated together
      cfg.registry.validate(clientId, redirectUri, scopes);
      if (q.response_type !== "code") {
        throw new AuthError("unsupported_response_type", "response_type must be code");
      }
      if (q.code_challenge_method !== "S256") throw new AuthError("invalid_request", "S256 required");
      if (!q.code_challenge) throw new AuthError("invalid_request", "code_challenge required");

      // An external-client token must never be able to mint another credential —
      // only a genuine first-party AMX session can.
      const actor = req.actor;
      const isFirstParty =
        actor.type === "board" && Boolean(actor.userId) && FIRST_PARTY_SOURCES.has(actor.source ?? "");
      if (!isFirstParty) {
        const back = encodeURIComponent(req.originalUrl);
        res.redirect(`/auth?next=${back}`);
        return;
      }

      const code = await issueAuthorizationCode(cfg.store, cfg.registry, {
        clientId,
        redirectUri,
        scopes,
        codeChallenge: q.code_challenge,
        codeChallengeMethod: "S256",
        userId: actor.userId as string,
      });

      const u = new URL(redirectUri);
      u.searchParams.set("code", code);
      if (q.state) u.searchParams.set("state", q.state);
      logger.info({ clientId, userId: actor.userId, scopes }, "external-client authorization code issued");
      res.redirect(u.toString());
    } catch (e) {
      const err = e as AuthError;
      res.status(400).json({ error: err.code ?? "invalid_request", error_description: err.message });
    }
  });

  /**
   * 2) Token exchange — the client sends the code + PKCE verifier. No client
   * secret exists (public client); PKCE is the proof of possession.
   */
  router.post("/token", async (req, res) => {
    const cfg = getExternalClientAuthConfig();
    if (!cfg.enabled) {
      res.status(503).json({ error: "external client auth is not configured" });
      return;
    }
    try {
      const b = (req.body ?? {}) as Record<string, string | undefined>;
      if (b.grant_type !== "authorization_code") {
        throw new AuthError("unsupported_grant_type", "authorization_code only");
      }
      const rec = await exchangeAuthorizationCode(cfg.store, {
        clientId: b.client_id ?? "",
        code: b.code ?? "",
        codeVerifier: b.code_verifier ?? "",
        redirectUri: b.redirect_uri ?? "",
      });
      const token = mintExternalToken(cfg.sign, {
        userId: rec.userId,
        clientId: rec.clientId,
        scope: rec.scopes,
        iss: cfg.iss,
        aud: cfg.aud,
        ttlSeconds: cfg.ttlSeconds,
      });
      logger.info({ clientId: rec.clientId, userId: rec.userId }, "external-client token issued");
      res.json({
        access_token: token,
        token_type: "Bearer",
        expires_in: cfg.ttlSeconds,
        scope: rec.scopes.join(" "),
      });
    } catch (e) {
      const err = e as AuthError;
      res.status(400).json({ error: err.code ?? "invalid_grant", error_description: err.message });
    }
  });

  /**
   * 3) Revoke — the caller presents the token it wants invalidated (logout).
   * Always 204, per RFC 7009, so this cannot be used to probe which jtis exist.
   */
  router.post("/revoke", async (req, res) => {
    const cfg = getExternalClientAuthConfig();
    const authHeader = req.header("authorization");
    if (cfg.enabled && authHeader?.toLowerCase().startsWith("bearer ")) {
      const presented = authHeader.slice("bearer ".length).trim();
      try {
        const claims = verifyExternalToken(cfg.verify, presented, {
          expectedIss: cfg.iss,
          expectedAud: cfg.aud,
        });
        cfg.revoke(claims.jti, claims.exp);
        logger.info({ jti: claims.jti, userId: claims.sub }, "external-client token revoked");
      } catch (err) {
        if (!(err instanceof TokenError)) throw err;
        // Invalid/expired token — nothing to revoke, and we say nothing about it.
      }
    }
    res.status(204).end();
  });

  return router;
}
