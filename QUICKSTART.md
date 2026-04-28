# AMX-AIR-HUB Control Plane — Quickstart

**Stack:** Express 5 + PGlite + React 19 + Vite 6 | **pnpm monorepo**

---

## Prerequisites

- Node.js 20+, pnpm 9+
- Git Bash or WSL recommended on Windows

---

## 1. Start the Control Plane

```bash
cd C:/Users/Techa/.paperclip/tmp_surfers

pnpm dev           # API (3100) + UI (5173) together
pnpm dev:server    # API only
pnpm dev:ui        # UI only
```

| Service | URL |
|---------|-----|
| UI | http://localhost:5173 |
| API | http://localhost:3100 |

Board auth token in: `C:\Users\Techa\.paperclip\auth.json`

---

## 2. AMX-LABS Company

| Field | Value |
|-------|-------|
| Company ID | `dece557d-8849-4040-b8ad-e0e235a54b52` |
| Issue prefix | `AMXA` |
| Issue counter | 295 |
| Monthly budget | $0 set / $10.11 spent |
| Board approval required | yes |

---

## 3. Agent Roster

| Agent | Role | Agent ID | Status |
|-------|------|----------|--------|
| Zomorphesus (CEO) | ceo | `482b3bd0-f6c3-44b6-82b4-83c2c97187d7` | idle |
| CTO | cto | `f11ec0c8-577c-43ab-baf6-b7be5492168d` | idle |
| CMO | cmo | `696f77ba-3f81-438f-b77d-2c338fffd323` | idle |
| V3 Audit Lead 2 | auditor | `7349f568-fc69-4bfc-a3e9-16a1c239525a` | **PAUSED** (budget) |
| V3 Audit Lead | auditor | `e115eeab-2657-468e-8160-6a9f741f8136` | **ERROR** |

All agents: `opencode_local` adapter, model `opencode/qwen3.6-plus-free`, heartbeat every 3600s.

---

## 4. Get Agent Env Vars (for Claude Code / local CLI)

```bash
npx paperclipai agent local-cli <agent-id> \
  --company-id dece557d-8849-4040-b8ad-e0e235a54b52
```

CEO example:
```bash
npx paperclipai agent local-cli 482b3bd0-f6c3-44b6-82b4-83c2c97187d7 \
  --company-id dece557d-8849-4040-b8ad-e0e235a54b52
```

Then run `/paperclip` in Claude Code to execute a heartbeat as that agent.

---

## 5. Trigger a Heartbeat

```bash
npx paperclipai heartbeat run --agent-id <agent-id>
```

---

## 6. Board API (direct curl)

```bash
# Board token for localhost:3100
BOARD_TOKEN="pcp_board_bd57446f75fd909e08828e14a510b9d93d9bd5e1ce15a81a"

# List agents
curl -s http://localhost:3100/api/companies/dece557d-8849-4040-b8ad-e0e235a54b52/agents \
  -H "Authorization: Bearer $BOARD_TOKEN" | jq .

# List inbox
curl -s http://localhost:3100/api/agents/me/inbox-lite \
  -H "Authorization: Bearer $BOARD_TOKEN" | jq .
```

---

## 7. Common CLI Commands

```bash
# List issues
npx paperclipai issue list \
  --company-id dece557d-8849-4040-b8ad-e0e235a54b52

# List agents
npx paperclipai agent list \
  --company-id dece557d-8849-4040-b8ad-e0e235a54b52

# Create issue
npx paperclipai issue create \
  --company-id dece557d-8849-4040-b8ad-e0e235a54b52 \
  --title "Task title" \
  --assignee-agent-id 482b3bd0-f6c3-44b6-82b4-83c2c97187d7 \
  --status todo

# List all companies
npx paperclipai company list
```

---

## 8. Known Issues

| Agent | Problem | Fix |
|-------|---------|-----|
| V3 Audit Lead 2 | Budget exhausted ($5.37 of $5.00) | Increase budget in UI or via API |
| V3 Audit Lead | Error state | Check `tmp_surfers/ceo_heartbeat.log` |

---

## 9. Key File Locations

| Purpose | Path |
|---------|------|
| Codebase root | `C:\Users\Techa\.paperclip\tmp_surfers\` |
| Deployment .env | `tmp_surfers\.env` |
| Instance .env (JWT + Anthropic key) | `C:\Users\Techa\.paperclip\instances\default\.env` |
| PGlite database | `instances\default\db\` |
| Board auth tokens | `C:\Users\Techa\.paperclip\auth.json` |
| CEO instructions | `instances\default\companies\dece557d-...\agents\482b3bd0-...\instructions\` |
| CEO memory (daily) | `instances\default\companies\dece557d-...\agents\482b3bd0-...\memory\` |
| Central memory | `C:\Users\Techa\.paperclip\memory\` |
| CEO heartbeat log | `tmp_surfers\ceo_heartbeat.log` |
| Full server log | `tmp_surfers\direct_server_log.txt` |

---

## 10. Dev Scripts

```bash
pnpm test:run      # Run all tests once
pnpm typecheck     # Full TypeScript check
pnpm build         # Build all packages
```

---

*Last updated: 2026-04-09*
