# AMX AIR HUBS — Step 6.7 Meeting Hub deploy runbook (Hostinger web console)

**Target:** Compose service **`server`** (builds from repo root, binds `127.0.0.1:3100:3100`, waits for Postgres health). Root `docker-compose.yml` services: `db`, `server`, `n8n`.
**Repo:** `/root/paperclip`, branch `experimental`, monorepo, server package `@paperclipai/server`, single entry `server/src/index.ts` → `createApp()` in `server/src/app.ts`.
**Rule of this pass:** LiveKit ships **OBSERVED** (`required:false`). Do not flip required until the Pit Stop at the end. Paste one block at a time; stop on the first failure and use the rollback at the bottom.

---

## Phase 0 — Locate & mark rollback
```bash
cd /root/paperclip
git remote -v
git status
git branch --show-current

git fetch origin
git checkout experimental
git pull --ff-only origin experimental

git rev-parse HEAD | tee /tmp/amx-pre-meeting-deploy.sha
git tag -f amx-pre-meeting-hub-$(date +%Y%m%d-%H%M%S)
```

---

## Phase 1 — Reuse, don't duplicate (see AMX-6.7-INTEGRATION-SPEC.md)
The repo already has `/api/livekit/token`, `actorMiddleware`, and a working `/api/health`.
Do NOT add a second token/auth/health/entry system. Add only:

```text
server/src/services/livekit-token-service.ts   # NEW: existing /api/livekit/token grant logic, extracted
server/src/routes/meeting-hub.bridge(.ts)      # NEW: thin /api/meeting/token bridge over the shared service
server/src/meeting/base44-cors.ts              # NEW: CORS + preflight (drop-in from bundle)
scripts/smoke/amx-meeting-hub.sh | amx-livekit-pitstop-gate.sh   # if used
```
Refactor `server/src/routes/livekit.ts` so its handler calls `mintMeetingToken()` from the new
service (contract unchanged). Bring in Step 3 health checks additively (do not replace `/api/health`).

Quick check:
```bash
ls server/src/routes/livekit.ts server/src/middleware/auth.ts
git grep -n "api/livekit/token" server/src
```

---

## Phase 2 — Patch the existing entry points (do NOT add a new one)

**`server/src/app.ts`** — CORS goes BEFORE `actorMiddleware`; the bridge goes INSIDE the existing
`api` router (after actor is available), before the api 404:
```ts
import { base44Cors, parseAllowedOrigins } from './meeting/base44-cors';
import { meetingHubBridge } from './routes/meeting-hub.bridge';
import { mintMeetingToken } from './services/livekit-token-service';

app.use(express.json(/* existing opts */));
app.use(base44Cors({ allowedOrigins: parseAllowedOrigins(process.env.BASE44_ALLOWED_ORIGINS) })); // BEFORE auth
app.use(httpLogger);
app.use(privateHostnameGuard(/* existing */));
app.use(actorMiddleware(db, { deploymentMode: opts.deploymentMode, resolveSession: opts.resolveSession }));
// ... inside the existing `api` router:
api.use(livekitRoutes(db));                       // existing, now service-backed
meetingHubBridge(api, mintMeetingToken);          // new thin bridge; identity from req.actor
```
Identity is `req.actor`; Base44 JSON (`participantId`/`role`/`displayName`) is a hint only.
Keep `/api/health` and add the readiness block additively (preserve `status`, `deploymentMode`,
`bootstrapStatus`, `bootstrapInviteActive`).

**`server/src/index.ts` — centralize graceful shutdown (real bug).** Move SIGINT/SIGTERM handling
OUT of the `if (embeddedPostgres && embeddedPostgresStartedByThisProcess)` block so external-Postgres
production also drains:
```text
signal → markDraining() → /readyz=503 → server.close()
       → stop schedulers/workers → flush buffers → stop embedded Postgres ONLY if owned → exit
```

---

## Phase 3 — Environment (VPS env file / secret store, never git)
```bash
LIVEKIT_URL=wss://<your-livekit-project>.livekit.cloud
LIVEKIT_API_KEY=<secret>
LIVEKIT_API_SECRET=<secret>

LIVEKIT_ENABLED=true
LIVEKIT_REQUIRED=false
LIVEKIT_PITSTOP_APPROVED=false

# preview + published Base44 origins (bridge splits on comma)
BASE44_ALLOWED_ORIGINS=https://preview-sandbox--6aaef26ff3069c391617918b.base44.app,https://amx-midnight-link.base44.app
```

---

## Phase 4 — Validate the repo before Docker
```bash
corepack enable
pnpm install --frozen-lockfile
pnpm --filter @paperclipai/server typecheck
pnpm test:run
```
Targeted tests (adjust paths to what shipped — the health suite is `server/src/health/*.test.ts`):
```bash
pnpm exec vitest run server/src/health
pnpm exec vitest run tests/e2e/amx-meeting-hub.spec.ts   # if present
```

---

## Phase 5 — Build & start (server + deps only)
```bash
docker compose build server
docker compose up -d db n8n
docker compose up -d server

docker compose ps
docker compose logs --tail=150 server
```

---

## Phase 6 — Health gate (prove AMX before touching Base44)
```bash
curl -fsS http://127.0.0.1:3100/healthz  | jq .
curl -fsS http://127.0.0.1:3100/readyz   | jq .
curl -fsS http://127.0.0.1:3100/version  | jq .
curl -fsS http://127.0.0.1:3100/api/health | jq .
```
Expected:
```text
healthz   200
readyz    200
database  healthy   / required:true
opprrc    healthy   / required:true
livekit   healthy|degraded / required:false   <- optional; readyz MUST stay 200 even if LiveKit is down
```

---

## Phase 7 — Public tunnel + CORS
```bash
curl -i https://api.amx-air-hubs.cc/healthz
curl -i https://api.amx-air-hubs.cc/readyz
curl -i https://api.amx-air-hubs.cc/version

curl -i -X OPTIONS https://api.amx-air-hubs.cc/api/meeting/token \
  -H 'Origin: https://preview-sandbox--6aaef26ff3069c391617918b.base44.app' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: authorization,content-type'
```
Want: `204` with `Access-Control-Allow-Origin` echoing **that exact origin** — never `*`, and **no** `Access-Control-Allow-Credentials` (header auth only).

---

## Phase 8 — Token round trip (OBSERVED)
Sign into the Base44 app (`https://amx-midnight-link.base44.app`) and join one room while watching logs:
```bash
docker compose logs -f server
```
Path: Base44 → `POST /api/meeting/token` → AMX validates identity+role+room → mints short-lived LiveKit JWT → Base44 joins LiveKit. The response must be `{ url, token, room }` with **no secret**. Then:
```bash
bash scripts/smoke/amx-meeting-hub.sh     # if installed
```
Confirm meeting events are landing in OPPRRC.

---

## Phase 9 — Pit Stop (only gate to REQUIRED)
Keep `LIVEKIT_REQUIRED=false` / `LIVEKIT_PITSTOP_APPROVED=false` until ALL pass:
desktop P1 · desktop/mobile P2 · mic · camera · screen share · chat ·
disconnect/reconnect · room cleanup · provider-outage behavior · OPPRRC evidence · installed PWA.

Record sign-off, then promote:
```bash
# after Phase-B token verifier is in place and the gate script passes:
PITSTOP_APPROVER="Zohund" bash scripts/smoke/amx-livekit-pitstop-gate.sh

# set in env, then:
LIVEKIT_PITSTOP_APPROVED=true
LIVEKIT_REQUIRED=true
docker compose up -d server

curl -fsS http://127.0.0.1:3100/readyz | jq .   # livekit now required:true and gating readiness
```

---

## Rollback (any failure)
```bash
git reset --hard "$(cat /tmp/amx-pre-meeting-deploy.sha)"
docker compose build server
docker compose up -d server
curl -fsS http://127.0.0.1:3100/readyz | jq .
```
