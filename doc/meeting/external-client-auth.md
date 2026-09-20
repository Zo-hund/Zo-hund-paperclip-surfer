# Step 6.8B — AMX External Client Credential Exchange (Authorization Code + PKCE)

**AMX is the issuer.** Base44 (and later WebXR / mobile / kiosk / partner portal) is an
untrusted external client. It never asserts identity ("I am user X, owner"); it presents a
short-lived credential **AMX itself issued** after authenticating the person first-party.
Subsystem name: `external-client-auth` (Base44 = client #1).

## Flow
```
Base44 UI --("Connect AMX")--> GET  /api/auth/external/authorize   (api.amx-air-hubs.cc)
  AMX authenticates the person first-party (BetterAuth cookie is first-party HERE)
  --> one-time code (amxc_…, 60–120s, single-use) --> redirect to Base44 callback
Base44 --> POST /api/auth/external/token   { code, code_verifier(PKCE), client_id, redirect_uri }
  AMX verifies code (unused/unexpired/client/redirect) + PKCE S256 --> short-lived AMX bearer (15 min)
Base44 holds token IN MEMORY --> POST /api/meeting/token (Authorization: Bearer …)
  actorMiddleware resolves external_client actor + RELOADS memberships from DB
  --> MeetingTokenService derives grants from DB role --> LiveKit JWT
```

## Endpoints
```
GET  /api/auth/external/authorize   client_id, redirect_uri, response_type=code,
                                     code_challenge, code_challenge_method=S256, state, scope
POST /api/auth/external/token        grant_type=authorization_code, client_id, code, code_verifier, redirect_uri
POST /api/auth/external/revoke       jti
```

## Token claims (short-lived, 15 min — NOT hours)
```json
{ "iss":"https://api.amx-air-hubs.cc", "aud":"amx-external-client", "sub":"user-123",
  "client_id":"amx-base44-meeting", "scope":["meeting:join","meeting:events"],
  "iat":..., "exp":..., "jti":"..." }
```
**No authoritative roles in the token.** Roles/memberships are reloaded from the DB on every
request, so a revoked member is denied on the next call. Browser stores the token **in memory
only** (no localStorage / IndexedDB / URL / Base44 cookie); on reload → re-authorize.

## actorMiddleware — new source `external_client`
Existing: session · board_key · agent_key · agent_jwt. New: `external_client`. After verifying
the token, `resolveExternalClientActor` reloads memberships and returns
`{ type:'board', userId:sub, companyIds, companyRoles, isInstanceAdmin, scope, source:'external_client' }`.

## Shared MeetingTokenService
Both `/api/livekit/token` (existing) and `/api/meeting/token` (bridge) call
`mintMeetingToken({ actor, companyId, roomId, requestedCapabilities, requiredScope })`. Grants
(`canPublish`, `canPublishData`, `canPublishScreen`, identity, TTL) are derived from the actor's
DB role; requested capabilities are a ceiling, not authority. Identity = `actor.userId`.

## Production hardening (vs. this reference)
- Signer: replace HS256 with the AMX asymmetric signing key + published JWKS at the issuer.
- Code store: replace the in-memory store with Redis/Postgres providing an **atomic** single-use consume.
- Bind redirect URIs to exact approved origins; keep the client registry server-side.

## Files
```
server/src/auth/external-client-auth.ts     ClientRegistry, PKCE S256, one-time code store, issue/exchange
server/src/auth/external-client-token.ts    mint/verify short-lived AMX token (HS256 ref; swap for JWKS)
server/src/auth/external-client-actor.ts    resolveExternalClientActor — DB reload, token roles ignored
server/src/services/meeting-token-service.ts deriveGrants + mintMeetingToken (shared by both routes)
server/src/routes/external-client-auth.example.ts  authorize/token/revoke route template
server/src/__tests__/external-client-auth.harness.cjs  runnable security proof (26/26)
```
Modify in the real repo: `server/src/middleware/auth.ts` (+external_client), `server/src/routes/livekit.ts`
(use the shared service), `server/src/app.ts` (mount routes; CORS before auth).

## Security suite — must pass before REQUIRED (26/26 proven in this bundle)
invalid client_id · unapproved redirect · missing/plain PKCE · wrong verifier · expired code ·
reused code · redirect mismatch · altered token · expired token · wrong audience · wrong issuer ·
body userId ignored (identity from sub) · DB role controls permissions · screen-share respects role ·
grant identity from actor · removed membership denied · unauthorized company denied · missing scope
denied · no signing secret in token · no secret in actor object. Integration/e2e still to run on the
real repo: full browser round trip, arbitrary-meeting denial, no external token in OPPRRC evidence,
LiveKit `required:false` throughout.

## Instruction for the repo build
Build Step 6.8B as an AMX-issued Authorization Code + PKCE exchange for untrusted external clients.
Base44 must not issue or assert authoritative AMX identity. Authenticate the person on the AMX domain
via BetterAuth, issue a one-time code, exchange it with PKCE for a short-lived AMX external bearer,
and teach actorMiddleware to verify that token and reload current AMX memberships/roles from the DB.
Refactor `/api/livekit/token` and `/api/meeting/token` onto one shared MeetingTokenService. Keep all
existing token/auth routes backward-compatible. Keep LiveKit `required:false` until the entire Phase-B
security + Pit Stop suite passes.
