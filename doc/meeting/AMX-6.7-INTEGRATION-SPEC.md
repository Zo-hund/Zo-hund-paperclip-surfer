# AMX 6.7 — Base44 Meeting bridge: integration spec (real-repo, authoritative)

Supersedes the earlier drop-in plan. Written against the **inspected** `experimental`
branch: `server/src/index.ts`, `server/src/app.ts`, `server/src/routes/health.ts`,
`server/src/routes/livekit.ts`, `server/src/routes/meetings.ts`,
`server/src/middleware/auth.ts`, root `docker-compose.yml`.

**Prime directive:** do NOT create duplicate auth, LiveKit-token, health, or server-entry
systems. Extend what exists.

---

## 1. Token: reuse `/api/livekit/token`, add a thin `/api/meeting/token`
The repo already mints tokens server-side (AccessToken; AMX company access/roles; invited
participants; voice-agent dispatch). Refactor, don't duplicate:

1. Extract the existing handler body into a shared service
   `server/src/services/livekit-token-service.ts`:
   ```ts
   export interface MintInput { actor: AmxActor; roomId: string; displayNameHint?: string;
     requestedCapabilities?: { camera?: boolean; microphone?: boolean; screenShare?: boolean; chat?: boolean }; }
   export interface MintResult { url: string; token: string; roomId: string }
   export async function mintMeetingToken(input: MintInput): Promise<MintResult>
   ```
2. `/api/livekit/token` keeps its exact current request/response contract, now calling the service.
3. `/api/meeting/token` is a thin bridge over the SAME service (template:
   `server/src/routes/meeting-hub.bridge.example.ts`) that normalizes:
   ```json
   { "roomId":"meeting-123", "participantId":"user-456", "displayName":"Zohund", "role":"owner", "capabilities":{} }
   ```
   into `MintInput` and returns Base44's shape:
   ```json
   { "url":"wss://...", "token":"...", "room":{ "id":"meeting-123" } }
   ```
One security implementation, two façades — no drift.

## 2. Auth: reuse `actorMiddleware`, add the Base44 boundary
`actorMiddleware` already resolves four paths: BetterAuth board session · AMX board API-key
bearer · Agent API-key bearer · AMX local-agent JWT. Do NOT add a second AMX auth stack.

**Identity comes from `req.actor`, never from Base44 JSON.** `participantId` / `role` /
`displayName` in the body are presentation hints; AMX validates/overrides them from the
resolved actor + company role. If no actor resolves → `401`.

**Base44 cross-origin boundary (Phase B, the real production path):**
```
Base44 user → signed/verifiable identity credential → AMX verifies
            → resolves actual AMX user + company role → AMX chooses identity/capabilities → LiveKit JWT
```
The browser must never hold a permanent AMX board API key. Until this credential path is
implemented and proven, keep `LIVEKIT_REQUIRED=false` (LiveKit stays OBSERVED).

## 3. CORS before auth
Mount the Base44 CORS middleware (`server/src/meeting/base44-cors.ts`) **before**
`actorMiddleware`, so the browser OPTIONS preflight is answered without entering AMX authz.
Exact-origin echo only — no `*`, no `Access-Control-Allow-Credentials`. Real `app.ts` order:
```ts
app.use(express.json(...));
app.use(base44Cors({ allowedOrigins: parseAllowedOrigins(process.env.BASE44_ALLOWED_ORIGINS) }));
app.use(httpLogger);
app.use(privateHostnameGuard(...));
app.use(actorMiddleware(db, { deploymentMode: opts.deploymentMode, resolveSession: opts.resolveSession }));
// ... inside the existing api router, after actor is available:
api.use(livekitRoutes(db));           // existing, now service-backed
api.use(meetingHubBridge(api, mintMeetingToken));   // new thin bridge, before the api 404
```

## 4. Health: extend `/api/health` additively
`/api/health` already drives bootstrap/sign-in. Preserve its anonymous compatibility fields
exactly: `status`, `deploymentMode`, `bootstrapStatus`, `bootstrapInviteActive`. Add the AMX
readiness block (`database` required:true, `opprrc` required:true, `livekit` required:false)
either only for callers permitted to see it, or appended without removing current fields.
Step 3's `/healthz` `/readyz` `/version` are additional endpoints, not replacements.

## 5. Shutdown: centralize SIGINT/SIGTERM (real bug)
Today signal handling lives only inside `if (embeddedPostgres && embeddedPostgresStartedByThisProcess)`,
so external-Postgres production gets no graceful HTTP drain. Move it out to run for both:
```
signal → markDraining() → /readyz=503 → server.close()
       → stop schedulers/workers → flush buffers
       → stop embedded Postgres ONLY if owned → exit
```

## 6. Docker: canonical service `server`
```bash
docker compose build server
docker compose up -d server
docker compose logs -f server
```
`server` → `127.0.0.1:3100:3100`, `depends_on: db (service_healthy)`. Never `paperclip-amx`.

## 7. Env (VPS secret store, never git)
```
LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET   (server-side only)
LIVEKIT_ENABLED=true   LIVEKIT_REQUIRED=false   LIVEKIT_PITSTOP_APPROVED=false
BASE44_ALLOWED_ORIGINS=https://preview-sandbox--6aaef26ff3069c391617918b.base44.app,https://amx-midnight-link.base44.app
```

## Files this spec ships
- `server/src/meeting/base44-cors.ts` — the one genuine drop-in (CORS + preflight). tsc-clean, harness-checked.
- `server/src/routes/meeting-hub.bridge.example.ts` — thin-bridge TEMPLATE to reconcile with real `livekit.ts` types.
- `docs/meeting/base44-amx-bridge.md`, `AMX-6.7-DEPLOY-RUNBOOK.md`.
The earlier standalone identity adapter was removed — `actorMiddleware` owns identity.

## One-line instruction for the repo-connected build
> Refactor `/api/livekit/token` into a shared LiveKit token service and expose `/api/meeting/token`
> as a thin Base44-compatible bridge over it, preserving the `/api/livekit/token` contract. Use the
> existing `actorMiddleware`/AMX authorization; never trust Base44-supplied role/identity without
> cryptographic verification. Mount Base44 CORS before auth/API routing (no wildcard, no
> Allow-Credentials). Extend `/api/health` additively. Centralize SIGINT/SIGTERM draining for both
> external and embedded Postgres. Canonical Compose service is `server` on 127.0.0.1:3100. Keep
> LiveKit `required:false` until the identity bridge and Pit Stop suite pass.
