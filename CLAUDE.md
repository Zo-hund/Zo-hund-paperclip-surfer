# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Paperclip

Paperclip is an open-source control plane for AI-agent companies. It provides org charts, task management, budgets, governance, approval gates, and activity tracking for autonomous AI agents. The current implementation target is V1, defined in `doc/SPEC-implementation.md`.

Before making changes, read: `doc/GOAL.md` → `doc/PRODUCT.md` → `doc/SPEC-implementation.md` → `doc/DEVELOPING.md` → `doc/DATABASE.md`.

## Commands

```sh
# Install & run dev (embedded PGlite, no DATABASE_URL needed)
pnpm install
pnpm dev                    # API + UI at http://localhost:3100 (watch mode)
pnpm dev:once               # Same but no file watching
pnpm dev:server             # API only
pnpm dev:ui                 # UI only

# Build & verify
pnpm build                  # Build all workspaces
pnpm -r typecheck           # TypeScript check all workspaces
pnpm test:run               # Run all tests once (vitest)
pnpm test                   # Run tests in watch mode

# Database
pnpm db:generate            # Generate Drizzle migration after schema changes
pnpm db:migrate             # Apply pending migrations

# E2E
pnpm test:e2e               # Playwright end-to-end tests

# Single test file
pnpm vitest run path/to/test.ts
```

**Verification before hand-off** — all three must pass:
```sh
pnpm -r typecheck && pnpm test:run && pnpm build
```

## Monorepo Structure

pnpm workspaces. Build order matters — dependencies must build before dependents.

| Package | Purpose |
|---------|---------|
| `packages/db` | Drizzle ORM schema (61 tables), migrations, DB client. Uses compiled `dist/schema/*.js` for drizzle-kit. |
| `packages/shared` | Types, Zod validators, constants, API path constants. No runtime logic. Used by all workspaces. |
| `packages/adapter-utils` | Shared adapter utilities |
| `packages/adapters/*` | 7 agent adapters (claude, codex, cursor, gemini, openclaw, opencode, pi). Each exports `./server`, `./ui`, `./cli`. |
| `packages/plugins/sdk` | Stable plugin SDK (protocol, types, UI hooks, testing) |
| `server` | Express 5 REST API, orchestration services, WebSocket realtime, auth, file storage |
| `ui` | React 19 + Vite 6 + Tailwind 4 + React Router 7 + TanStack Query board UI |
| `cli` | `paperclipai` npm CLI, built with esbuild + Commander.js |

## Architecture

**Company scoping**: Every domain entity is scoped to a company. Routes and services enforce company boundaries. Agent API keys must not cross companies.

**Contract synchronization**: Schema changes must propagate across all layers: `packages/db` schema → `packages/shared` types/validators → `server` routes/services → `ui` API clients/pages.

**Server** (`server/src/`):
- `routes/` — 27 API route handlers under `/api`
- `services/` — 66+ business logic services. Key ones: `heartbeat.ts` (agent scheduling/orchestration), `issues.ts` (task management), `budgets.ts` (cost tracking with hard-stops), `approvals.ts` (governance gates), `company-skills.ts` (skill injection)
- `adapters/` — adapter registry, dynamic loading of all 7 adapters
- `auth/` — JWT, API keys (hashed at rest), board auth
- `realtime/` — WebSocket connection manager

**Control-plane invariants** (must be preserved):
- Single-assignee task model
- Atomic issue checkout semantics
- Approval gates for governed actions
- Budget hard-stop auto-pause behavior
- Activity logging for all mutations

## Database Workflow

1. Edit `packages/db/src/schema/*.ts`
2. Export new tables from `packages/db/src/schema/index.ts`
3. `pnpm db:generate` (compiles schema first, then runs drizzle-kit)
4. `pnpm -r typecheck` to validate

Dev uses embedded PGlite (leave `DATABASE_URL` unset). Data persists at `~/.paperclip/instances/default/db/`. Reset by deleting that directory.

## Lockfile Policy

Do not commit `pnpm-lock.yaml` in pull requests. CI on `master` regenerates it.

## API Conventions

- Base path: `/api`
- Board access = full-control operator context
- Agent access via bearer API keys (`agent_api_keys`)
- Mutations must write activity log entries
- Return consistent HTTP errors: `400/401/403/404/409/422/500`

## Test Configuration

Vitest projects: `packages/db`, `packages/adapters/opencode-local`, `server`, `ui`, `cli`. Tests are colocated in `__tests__/` directories. E2E uses Playwright (`tests/e2e/`).

## TypeScript

Target ES2023, strict mode, `NodeNext` module resolution. All packages extend `tsconfig.base.json` and output to `dist/`.

---

## Session Memory Backup

> Updated 2026-05-03 — Marketplace Upgrade: XP from Runs + Agent Visibility + Promoted Agents

### AMX Marketplace Upgrade (2026-05-03) — ALL COMPLETE ✅

**Three features shipped:**

**1. XP from Heartbeat Runs** (`server/src/services/heartbeat.ts`)
- XP awarded on `outcome === "succeeded"` inside `if (finalizedRun)` block after pitStop
- Atomic JSONB update: `jsonb_set(metadata, '{xp}', to_jsonb(existing_xp + runXp))`
- Logs `agent.xp_earned_from_run` to activity chain via `logActivity()`
- XP rate: sim=3, pre=5, live=15, prod=20, post=5, default=3
- `logActivity` import added at line ~36

**2. Agent Public/Private** (`agents.metadata.marketplaceVisible`)
- No migration — stored in existing `agents.metadata` JSONB
- To make agent public: `PATCH /api/agents/:id` with `{ metadata: { marketplaceVisible: true } }`
- New endpoint: `GET /api/marketplace/public-listings` returns `{ listings[], visibleAgents[] }`
- `visibleAgents` = agents where `metadata->>'marketplaceVisible' = 'true'` AND `status IN ('idle','running')`
- `AgentMarketplace.tsx` maps visible agents into the "AI Agents" pool alongside listings

**3. Promoted/Sponsored Agents**
- Schema: `packages/db/src/schema/marketplace.ts` — `isPromoted bool`, `promotedUntil timestamptz`, `sponsorTag text`
- Migration `0062` rewritten as fully idempotent (all `IF NOT EXISTS`, `DO $$ EXCEPTION WHEN duplicate_object $$` for constraints)
- Service: `marketplace.ts` exports `promoteListingAsBoard(listingId, input)` — bypasses partner/ownership checks
- Route: board actors on `PATCH /api/companies/:id/amx/partner-listings/:id` route directly to `promoteListingAsBoard`
- UI: promoted cards sort first; amber Sparkles strip shows `sponsorTag ?? "Promoted"` at top of card; amber border

**DB Migration note:**
- `pnpm db:generate` fails with TS6059 rootDir error (pre-existing)
- Use `cd packages/db && npx drizzle-kit generate` instead to bypass tsc step
- `pnpm db:migrate` works normally after that

**Server restart note:**
- Server runs `tsx src/index.ts` WITHOUT `--watch` — does NOT auto-reload
- After source changes: `netstat -ano | findstr ":3100"` → kill PID → `pnpm dev:server` from project root

**Files changed:**
- `packages/db/src/schema/marketplace.ts` — boolean import + 3 new columns
- `packages/db/src/migrations/0062_stale_victor_mancha.sql` — idempotent rewrite
- `server/src/services/heartbeat.ts` — logActivity import + XP award block
- `server/src/services/marketplace.ts` — promoteListingAsBoard() + export
- `server/src/routes/marketplace.ts` — board PATCH path, GET /marketplace/public-listings, or import
- `ui/src/api/marketplace.ts` — isPromoted/promotedUntil/sponsorTag on MarketplaceListing, getPublicListings()
- `ui/src/pages/AgentMarketplace.tsx` — public-listings query, visibleAgents pool, promoted sort + card strip

**Remaining work (next agent):**
- `ui/src/pages/AgentDetail.tsx` — add `marketplaceVisible` toggle Switch in agent settings section
- `ui/src/pages/TeamRoster.tsx` — add "Ship to Market" button on agent cards (sets `marketplaceVisible: true`)
- `pnpm build` to rebuild `ui/dist/` after UI changes

---

> Updated 2026-04-27 — AMX Air Hubs Folder Rails + Governing Reference handoff

### AMX Air Hubs Folder Rails (2026-04-27)

**Governing Reference**: `The_Agentic_ERP.pdf` — master framework for all AMX Air Hubs design decisions
- Local: `C:\Users\Techa\OneDrive\Apps\AMX-AIR-HUB-FOLDER-OPPRRC\The_Agentic_ERP.pdf` (174 pages, image-based PDF)
- Drive registration: MASTERS-BRIEFCASE/GOVERNING-REFERENCE.md (Drive ID: `121hfqvViHuo_f3a2J-rZrrY4gMGT2IoW`)
- Status: registered, full OCR read pending

**Folder Rails Root**: `G:\My Drive\AMX-AIR-HUBS-HQ-ROOT\AMX-AIR-HUB-FOLDER-OPPRRC\`
- Each category folder (01–06) has: `BOARD-INTERNAL` + `CLIENTS-EXTERNAL` audience subfolders
- Categories 07–13 (LOCATIONS, TEAMS, DEPLOYMENTS, PLATFORM, MEDIA_LIBRARY, BRANDS, EVENTS) — audience subfolders pending confirmation

**Drive Folder IDs** (audience subfolders):
| Category | BOARD-INTERNAL | CLIENTS-EXTERNAL |
|---|---|---|
| 01_ORGANIZATIONS | `1mt1gW80-ifMs1YOi2VLUIK1-GKbtyj7D` | `1g7RwTOjyAwIDAqcfC459cqXiYFjYAruC` |
| 02_PROGRAMS | `1Lq7sUNGdmZWu8XL0wB4h6yOQIgJbLhIP` | `1U88FXmIvCA6gaA_b_LtbBuNlaY5VYKRs` |
| 03_PROJECTS | `1WvapNf0sGQEm_fdeJBwE2hm63plxessX` | `1AWB4pMt5IU3APRq87ex3igKvgYgevJWG` |
| 04_RESOURCES | `1u0xWeSNcNbgEzkj7BSL_9NA7pcUespNl` | `1poJpArhsTjdd20v5sIW1C4UeJeMzqlX4` |
| 05_REPORTS | `1ZzE45t0ws8sKn1HimIR7Ty_c7hw4VHFQ` | `1I7LrWC-dLKoCIYK1HNt9_Ek1iRjOA2UD` |
| 06_CERTIFICATES | `1pveOQdJ-2WO3D7JPr6NOG_aVRnumaYOA` | `1-HhxtE39SD2q3rW79zA_mMM-Sew3kK8e` |

**Agent CWD Assignments** (phantom `AMX-LABS\` segment removed — patched 2026-04-27):
| Agent | Paperclip ID | CWD |
|---|---|---|
| CEO (Zomorphesus) | `482b3bd0` | `G:\My Drive\...\05_REPORTS\BOARD-INTERNAL` |
| CMO | `696f77ba` | `G:\My Drive\...\02_PROGRAMS\BOARD-INTERNAL` |
| CTO | `f11ec0c8` | `G:\My Drive\...\03_PROJECTS\BOARD-INTERNAL` |
| V3 Audit Lead | `e115eeab` | `G:\My Drive\...\06_CERTIFICATES\BOARD-INTERNAL` |
| V3 Audit Lead 2 | `7349f568` | `G:\My Drive\...\06_CERTIFICATES\BOARD-INTERNAL` |

**MASTERS-BRIEFCASE INDEX.md** (Drive ID: `17Q9oSWHOmsn-Ea5m0g22M2nBpRVNAEqX`)
- Phone-accessible navigation hub with direct links to all 12 audience subfolders
- Path: `MASTERS-BRIEFCASE/INDEX.md` in Drive

**Paperclip API** (PATCH endpoint corrected — no company prefix):
- Base: `http://127.0.0.1:3100`
- Token: `pcp_board_6a8061a8099b5044ec7c6b35f119699b38307a879fb8addc`
- Company ID: `dece557d-8849-4040-b8ad-e0e235a54b52`
- Agent patch: `PATCH /api/agents/{agentId}` — must fetch full adapterConfig first (partial patch → 500)

**Critical system note**: C: drive was 100% full (454GB/454GB) as of 2026-04-27 — all local writes fail; user must free disk space.

---

> Snapshot from `~/.claude/projects/C--Users-Techa/memory/MEMORY.md` — 2026-04-13

### AMX LABS Full Configuration
- See: `project_amx_labs.md` — Paperclip control plane, Brain Business ZKODE, Air Hubs, all agents, Hermes CLI, model switching
- **Company ID:** `dece557d-8849-4040-b8ad-e0e235a54b52` | Prefix: `AMXA` | Issue counter: 1016
- **Logo:** `logoAssetId: ec8faea8-fc9e-4628-a072-8baec5ed0d80` (electric-blue SVG, set 2026-04-13)

### Analytics ERP Suite
- See: `project_analytics_erp.md` — 5 phases in `ui/src/pages/Analytics.tsx`
- Phases: Resource Utilization, CRM, Budget Intelligence, Skills Matrix, Delivery Pipeline
- All data from `utilizationRunsQuery.data` (200 runs, 30s refresh) — no new API calls
- Also: `EvalComparePanel.tsx`, `EvalNewRunModal.tsx`, OrgChart Swarm Boost
- Git branch: `experimental`, pushed to GitHub 2026-04-13
- Pre-existing typecheck error (not this session): `MicroServiceBooking.tsx(223,9): TS2322`

### Cloudflare Tunnel
- Command: `cloudflared tunnel --url http://localhost:3100` (quick tunnel, temporary URL)
- Vite fix: `server/src/app.ts:284` → `allowedHosts: true` (was `undefined`) — allows tunnel hostnames through Vite 6

### OPPRRC Budget Dashboard — Production Launch
- See: `project_opprrc_dashboard.md` — 3-stage lifecycle (Pre-prod Sim → Live → Post Deliverables), goals, org integration, skills matrix, knowledge bank

### AMX Air Hubs Folder Convention (D:\ easystore)
- **Drive**: WD easystore 2648, 1.82TB NTFS, drive letter D:
- **Root**: `D:\AMX\` (primary), `D:\_ARCHIVE\` (legacy), `D:\_SYSTEM\` (metadata)
- **16 sections** (00-15) mapped to OPPRRC budget framework
- **12 locations**: KY Science Center, Simmons College, East Broadway Theater, Kacoon Academy, Tech At Nite, Graded Gaming, Blak Koffee, Screens and Dreams, DerbyX, RealDealr, 50-50 Mentoring, TBD
- **3 teams**: XRT Trainers, Social Support, Social Five Agency
- **Config docs**: `D:\AMX\00_HUB_CONFIG\` (README.md, CLOUD_MAPPING.md, SYNC_MANIFEST.json, NAMING_CONVENTIONS.md)
- **Naming**: No spaces, UPPER_SNAKE for structural, numbered prefixes (NN_), max 5 levels deep
- **Cloud twin (Google Drive):** `G:\My Drive\AMX-AIR-HUBS-HQ-ROOT\AMX-AIR-HUB-FOLDER-OPPRRC\`

### WD easystore USB Issues
- Cable connection issues cause Event ID 154 I/O errors at block 0x0
- Drive shows Size=0 in WMIC, disappears from Get-Disk/Get-PhysicalDisk
- Fix: reconnect cable or try different USB port/cable

### Drone Hub Project
- Field intelligence platform at `C:\Users\Techa\drone-hub` — Node.js + Socket.IO + Claude AI
- Ports: HTTP :3002, HTTPS :3443 (mobile), RTMP :3001 (Real Dealr), :1935 (drone stream)
- PTT, Property Intel Board, media archive, agent AI, dual SSE+Socket.IO transport

### PowerShell in Git Bash
- `$_` gets consumed by bash — use `-File -` with heredoc or `$PSItem` instead
- Always use `powershell -NoProfile -File - <<'PS1' ... PS1` pattern for complex scripts

### AMX Skills (imported 2026-04-10)
- 19 skills in AMX-LABS company library (all `local_path` type)
- Repo workspace added to `BOARD-TEMPLATES` project: `cwd: C:/Users/Techa/.paperclip/tmp_surfers`
- "Scan Projects" now discovers 13 skills automatically from repo root
- **Root cause of 0-skills scan**: workspace cwds were OneDrive dirs, not repo root
