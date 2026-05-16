# Internal/External Communications Go-Live Checklist

Use this checklist for strict controlled-mode validation of communications orchestration across Dashboard Chat and Meeting Hub.

## Gate Policy
- Any critical failure in chat, tool-calling, MCP, work-order lineage, or heartbeat action path = `BLOCKED`
- No customer-facing external sends in this test mode

## Core Cohort E2E
- [ ] Dashboard chat intake creates messages per core agent
- [ ] Chat-created work orders persist with assignee + context
- [ ] Meeting Hub session starts and invites cohort agents
- [ ] Meeting transcript commands persist structured outcomes
- [ ] @mentions trigger heartbeat wake calls for mentioned agents
- [ ] MCP create/list/patch/delete succeeds in company scope
- [ ] MCP exclusions add/remove succeeds for scoped agents
- [ ] Microservice booking creates issue + work-order artifact
- [ ] Stage mapping validates pre_production -> production -> post_generation
- [ ] Time cards and communication logs persist with issue linkage

## Remaining Agents Smoke
- [ ] Required communication + microservice skill bundle present
- [ ] Heartbeat runtime is enabled with wake-on-demand
- [ ] Chat endpoint access is healthy
- [ ] No wrong-tenant access leak in scoped operations

## Run Commands
```bash
pnpm --filter @paperclipai/server exec vitest run src/__tests__/communications-go-live-gate.test.ts
pnpm exec playwright test --config tests/e2e/playwright.config.ts tests/e2e/communications-cockpit.spec.ts
```

## Output Artifact
- Test run emits: `server/test-results/communications-go-live-checklist.md`
- Gate decision must be explicitly `GO` or `BLOCKED`
