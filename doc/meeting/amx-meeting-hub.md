# AMX Meeting Hub — what is actually implemented in this repo

Design sources: [`AMX-6.7-INTEGRATION-SPEC.md`](./AMX-6.7-INTEGRATION-SPEC.md) (bridge),
[`external-client-auth.md`](./external-client-auth.md) (6.8B credential exchange),
[`AMX-6.7-DEPLOY-RUNBOOK.md`](./AMX-6.7-DEPLOY-RUNBOOK.md) (VPS deploy).

This file records the shipped shape. Where the design docs describe an earlier
Phase-A idea (Base44 forwarding `participantId` / `role` headers and AMX trusting
them while LiveKit is OBSERVED), **that path was not built.** 6.8B supersedes it:
identity always comes from a credential AMX itself issued, in every mode. There is
no spoofable-identity code path to remove later.

## Request flow

```
Base44 UI  --"Connect AMX"-->  GET /api/auth/external/authorize      (first-party AMX login)
                               -> one-time code (amxc_…, 90s, single-use)
           --code + PKCE   -->  POST /api/auth/external/token
                               -> short-lived AMX bearer (15 min, in-memory on the client)
           --Bearer        -->  POST /api/meeting/token
                               actorMiddleware verifies the token and RELOADS memberships
                               -> meeting-token-service derives grants from the DB role
                               -> LiveKit JWT  { url, token, room:{ id } }
           --events        -->  POST /api/meeting/events -> activity log -> OPPRRC evidence
```

## Files

| Path | Role |
|---|---|
| `server/src/services/meeting-token-service.ts` | The single token implementation. Authorization, grant derivation, AccessToken mint. |
| `server/src/services/livekit-agent-dispatch.ts` | Voice-agent dispatch, moved out of the route so the service can call it without a cycle. `routes/livekit.ts` re-exports it. |
| `server/src/routes/livekit.ts` | Existing board façade. Contract unchanged; now calls the service. |
| `server/src/routes/meeting-hub.bridge.ts` | Base44 façade: `POST /api/meeting/token`, `POST /api/meeting/events`. |
| `server/src/meeting/base44-cors.ts` | CORS + preflight, exact-origin echo, no `Allow-Credentials`. |
| `server/src/auth/external-client-auth.ts` | Client registry, PKCE S256, one-time code store. |
| `server/src/auth/external-client-token.ts` | Mint/verify the short-lived AMX bearer. |
| `server/src/auth/external-client-actor.ts` | Resolves the actor; reloads memberships from the DB. |
| `server/src/auth/external-client-config.ts` | Env wiring shared by the routes and actorMiddleware. |
| `server/src/routes/external-client-auth.ts` | `/api/auth/external/authorize\|token\|revoke`. |
| `server/src/health/readiness.ts` | `/healthz`, `/readyz`, `/version`, and the drain flag. |

## Invariants

- **One token implementation.** `/api/livekit/token` and `/api/meeting/token` are two
  façades over `mintMeetingToken`. The board façade keeps its historical
  `board_full` grant (full publish, 4h TTL); the bridge uses `capability_scoped`
  (role-derived `canPublishSources`, 15m TTL).
- **Identity is never from the body.** The bridge uses `req.actor.userId`.
  `participantId` / `role` / `displayName` are presentation hints and are ignored.
- **`companyId` is never from the body.** The bridge resolves the owning company
  from the room via `resolveRoomCompanyId`, and refuses rooms that do not resolve
  to a meeting — so the global cross-company orb room is not an external surface.
- **Roles are never from the token.** `resolveExternalClientActor` reloads
  memberships on every request; a removed member is denied on the next call.
- **Screen share is elevated.** Admin/owner tier only, regardless of what the
  client requests. Requested capabilities are a ceiling, not authority.
- **An external token cannot mint another credential.** `/authorize` only accepts
  a first-party source (`session`, `board_key`, `local_implicit`).
- **CORS runs before auth**, so a preflight never enters AMX authorization.

## Readiness

`/api/health` is unchanged for anonymous callers (`status`, `deploymentMode`,
`bootstrapStatus`, `bootstrapInviteActive` all preserved); a `readiness` block is
appended only for an authenticated board actor, because component detail names
filesystem paths and driver errors.

`/readyz` is the unauthenticated gate: `database` and `opprrc` are `required:true`;
`livekit` is `required:false`, so a LiveKit outage cannot take the control plane out
of rotation. LiveKit only becomes required when **both** `LIVEKIT_REQUIRED=true` and
`LIVEKIT_PITSTOP_APPROVED=true` — the Pit Stop gate is enforced in code, not just in
the runbook.

On `SIGINT`/`SIGTERM` the server marks itself draining (`/readyz` → 503), closes the
HTTP server, then stops embedded Postgres only if this process owns it. This now runs
for every deployment; it previously ran only when embedded Postgres was in use, so
external-Postgres production received no HTTP drain at all.

## Environment

```bash
# LiveKit (server-side only — never shipped to a browser)
LIVEKIT_URL=wss://<project>.livekit.cloud
LIVEKIT_API_KEY=<secret>
LIVEKIT_API_SECRET=<secret>
LIVEKIT_ENABLED=true
LIVEKIT_REQUIRED=false            # stays false until the Pit Stop suite passes
LIVEKIT_PITSTOP_APPROVED=false    # required:true needs BOTH flags

# Base44 origins (CORS allowlist; comma-separated, exact origins)
BASE44_ALLOWED_ORIGINS=https://preview-sandbox--6aaef26ff3069c391617918b.base44.app,https://amx-midnight-link.base44.app

# 6.8B external-client auth — the subsystem is OFF unless the secret is set
AMX_EXTERNAL_CLIENT_SECRET=<signing key>
AMX_EXTERNAL_CLIENT_ID=amx-base44-meeting            # optional (default shown)
AMX_EXTERNAL_CLIENT_ISS=https://api.amx-air-hubs.cc  # optional
AMX_EXTERNAL_CLIENT_AUD=amx-external-client          # optional
AMX_EXTERNAL_CLIENT_TTL_SECONDS=900                  # optional
# Optional. Defaults to each BASE44_ALLOWED_ORIGINS entry + /amx-auth/callback,
# which is exactly what the Base44 client requests.
AMX_EXTERNAL_CLIENT_REDIRECT_URIS=

# Optional: HTTP drain budget on shutdown (ms, default 15000)
PAPERCLIP_SHUTDOWN_DRAIN_TIMEOUT_MS=15000
```

## Production hardening still owed

These are reference-grade in this pass and are called out in the 6.8B doc:

1. **Signer** — HS256 today. Production should use the AMX asymmetric key with a
   published JWKS at the issuer. The `Signer`/`Verifier` seam is injectable.
2. **Code store** — `MemoryAuthCodeStore` is atomic within one process but is not
   shared across replicas and does not survive restart. Back it with Redis/Postgres
   providing an atomic single-use consume before running multi-instance.
3. **Revocation list** — same: in-memory, single-instance.

None of these block the OBSERVED pass; all three block `LIVEKIT_REQUIRED=true`.

## Tests

`server/src/__tests__/external-client-auth.test.ts` — the 6.8B security suite,
ported from the bundle harness and re-pointed at the real modules (33 checks).
