# New Features: Swarm Launcher Pipeline

## Overview

This release adds a full Sim→Live agent swarm pipeline to Paperclip. Operators can now scale any set of agents out to up to 100 parallel workers, run the task in Simulation mode first for review, then promote passing sim runs to Live execution — all from a single pre-launch wizard in the OrgChart view.

---

## Swarm Launcher Dialog

A new 4-step wizard accessible from the OrgChart via the **Launch Swarm** button.

### Step 1 — Select Agents
- Multi-select list of all active agents in the company
- **All** / **None** quick-select buttons
- Live counter showing selected count and total

### Step 2 — Work Order
- Textarea for the task request sent to every agent (`payload.taskRequest`)
- Summary card showing selected agent count + task preview

### Step 3 — Mode & Protections
- **Run Mode** toggle: **Simulation** (test run, tagged `SIM`, reviewable) vs **Live** (real execution)
- **Failure threshold** — abort swarm if this % of agents fail (default 50%)
- **Max concurrent agents** — throttle startup rate; blank = fire all at once
- Launch summary card before confirming

### Step 4 — Real-Time Monitor
- Live progress bar driven by a 3-second polling interval
- Stats grid: Queued / Running / Done / Failed
- Per-agent status rows with icons
- **Promote to Live** button appears when all sim runs finish (sim mode only)

---

## DB Schema Changes

Table: `heartbeat_runs`

| Column | Type | Default | Purpose |
|---|---|---|---|
| `run_mode` | `text NOT NULL` | `"live"` | `"sim"` or `"live"` — distinguishes test from real execution |
| `swarm_batch_id` | `text` | `NULL` | Groups all runs that were launched together as a swarm |
| `promoted_from_run_id` | `uuid` | `NULL` | FK back to the sim run this live run was promoted from |

Migration: `0055_*` (generated and applied).

---

## New API Endpoints

### `POST /api/companies/:companyId/swarm/launch`

Launches N agents in parallel as a named swarm batch.

**Request body:**
```json
{
  "agentIds": ["uuid", "..."],
  "payload": { "taskRequest": "string" },
  "runMode": "sim" | "live",
  "swarmBatchId": "uuid (optional — auto-generated if omitted)",
  "protections": {
    "failureThreshold": 0.5,
    "maxConcurrentAgents": 10
  }
}
```

**Response:**
```json
{
  "batchId": "uuid",
  "runMode": "sim",
  "runs": [ HeartbeatRun, ... ]
}
```

Constraints: `agentIds` max 100, all must belong to `companyId`.

---

### `POST /api/companies/:companyId/swarm/promote`

Promotes completed sim runs in a batch to live execution.

**Request body:**
```json
{
  "swarmBatchId": "uuid",
  "agentIds": ["uuid", "..."]
}
```

**Response:**
```json
{
  "batchId": "uuid (new live batch)",
  "sourceBatchId": "uuid (original sim batch)",
  "runs": [ HeartbeatRun, ... ]
}
```

Each returned run has `runMode: "live"` and `promotedFromRunId` pointing to its source sim run.

---

## Concurrent Run Ceiling

`HEARTBEAT_MAX_CONCURRENT_RUNS_MAX` raised from **10 → 100** in `server/src/services/heartbeat.ts`.

The existing `normalizeMaxConcurrentRuns()` clamp logic handles the new ceiling automatically — no other service changes were needed.

---

## Sim → Live Promotion Flow

```
swarm/launch  (runMode=sim)
     │
     ├── run A  (runMode=sim, swarmBatchId=X, promotedFromRunId=null)
     ├── run B  (runMode=sim, swarmBatchId=X, promotedFromRunId=null)
     └── run C  (runMode=sim, swarmBatchId=X, promotedFromRunId=null)
           │
           │  [operator reviews sim results, clicks Promote to Live]
           │
     swarm/promote  (sourceBatchId=X)
           │
           ├── run D  (runMode=live, swarmBatchId=Y, promotedFromRunId=A)
           ├── run E  (runMode=live, swarmBatchId=Y, promotedFromRunId=B)
           └── run F  (runMode=live, swarmBatchId=Y, promotedFromRunId=C)
```

---

## OrgChart Changes

- **Removed:** Inline "Mission Control: Swarm Overdrive" panel (~90 lines), the Zap-icon swarm boost button, and related local state (`isSwarmActive`, `swarmBatchId`, `swarmAgentIds`, etc.)
- **Added:** A single **Launch Swarm** button (top-right of the OrgChart canvas) that opens the SwarmLauncherDialog
- The dialog handles all swarm state, monitoring, and promotion

---

## Files Changed

| File | Change |
|---|---|
| `packages/db/src/schema/heartbeat_runs.ts` | Added `runMode`, `swarmBatchId`, `promotedFromRunId` columns |
| `packages/shared/src/types/heartbeat.ts` | Added new fields to `HeartbeatRun` interface |
| `packages/shared/src/validators/agent.ts` | Added `runMode` to `wakeAgentSchema` |
| `server/src/services/heartbeat.ts` | Raised MAX to 100; added runMode/swarmBatchId to WakeupOptions + insert |
| `server/src/routes/agents.ts` | Added `/swarm/launch` and `/swarm/promote` endpoints |
| `ui/src/api/agents.ts` | Added `swarmLaunch()` and `swarmPromote()` API client methods |
| `ui/src/context/DialogContext.tsx` | Added `swarmLauncherOpen` state + open/close handlers |
| `ui/src/components/SwarmLauncherDialog.tsx` | **New file** — 4-step wizard component |
| `ui/src/pages/OrgChart.tsx` | Replaced inline swarm UI with Launch Swarm button |
| `ui/src/lib/inbox.test.ts` | Updated `makeRun()` fixture with new HeartbeatRun fields |

---

## How to Test

### E2E Tests (Playwright)

```sh
# Run only the swarm launcher tests
pnpm test:e2e -- swarm-launcher

# Full E2E suite
pnpm test:e2e
```

Three test scenarios are in `tests/e2e/swarm-launcher.spec.ts`:

| Scenario | What it tests |
|---|---|
| **1-agent swarm** | Full UI walkthrough: all 4 dialog steps, monitor panel, SIM badge |
| **10-agent swarm** | Bulk select via "All" button, 10 parallel agents, monitor stats |
| **100-agent swarm** | API-level: POST /swarm/launch (100 agents), POST /swarm/promote, lineage check |

### Manual Verification

1. Open `/org` in the UI
2. Click **Launch Swarm** (top-right of org chart)
3. Step 1: select 2–5 agents
4. Step 2: enter a task description
5. Step 3: leave mode as **Simulation**, click **Launch Sim**
6. Step 4: watch the monitor — progress bar fills, per-agent rows update
7. When all sim runs finish, click **Promote to Live**
8. Verify new live runs appear in the monitor with `LIVE` badge

### Unit Tests

```sh
pnpm test:run
```

The `inbox.test.ts` `makeRun()` fixture includes the new `runMode`, `swarmBatchId`, and `promotedFromRunId` fields and all existing tests continue to pass.
