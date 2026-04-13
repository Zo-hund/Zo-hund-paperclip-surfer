# Incident Report: Codex Adapter Unhandled Exception

**Date:** 2026-04-05
**To:** CTO

## Summary
The Paperclip control plane suffered a fatal dev server crash immediately after a full database restoration. The root cause was traced to an unhandled `ENOENT` exception within the `codex-local` adapter when attempting to spawn the `codex` CLI for background quota verification.

## Root Cause
When the UI connects, the dashboard routes invoke agent quota queries across installed adapters. In `packages/adapters/codex-local/src/server/quota.ts`, the `CodexRpcClient` constructor directly spawned the `codex` binary:

```typescript
private proc = spawn(
  "codex",
  ["-s", "read-only", "-a", "untrusted", "app-server"],
  { stdio: ["pipe", "pipe", "pipe"], env: process.env }
);
```

Because the `codex` binary was missing from the Windows PATH in this environment, Node.js natively emitted an asynchronous `error` event on the `ChildProcess` object. Since no `.on("error", ...)` handler was attached, the unhandled exception bubbled up and instantly terminated the Node process.

## Resolution
The `CodexRpcClient` constructor in `packages/adapters/codex-local/src/server/quota.ts` has been patched. A dedicated `.on("error")` handler now catches the spawn failure, appends the error to stderr, securely clears timers, and safely rejects any pending RPC promises to prevent server termination. 

## Action Items 
- [x] Patch the `CodexRpcClient` blind child_process spawn bug to prevent future crash loops.
- [ ] Audit remaining adapters (`claude-local`, etc.) to ensure that background CLI spawns are wrapped in safe promise boundaries and error handlers.
