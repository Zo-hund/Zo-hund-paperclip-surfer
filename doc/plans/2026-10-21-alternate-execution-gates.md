# Alternate execution and host-file gates - 2026-10-21

A fresh review found alternate authorization and diagnostic credential paths beyond the existing execution-configuration guards. This candidate does not renew or change any reviewed-backport manifest, expiry, advisory exemption, workflow or production approval.

## Repairs

- Adapter environment diagnostics execute commands and resolve tenant secrets. Require the existing instance-admin policy before either operation, and retain company authorization. A configuration-read/agent-creator grant alone is insufficient.
- Instructions path/configuration and bundle file operations can choose or read legacy external host roots and write adapter execution state. Require instance-admin and company authorization for root changes and host-backed bundle reads/writes. Permit only the known `instructionsFilePath` and `agentsMdPath` keys; arbitrary keys such as command/environment are rejected even for operators. Self/ancestor agents and ordinary tenant board users no longer have delegated host-file access through these routes. Trusted local operators retain the existing policy.
- Run cancel/pause/archive/unarchive/rollback load the target run and check company access before any heartbeat mutation or activity write. Missing targets return404. Same-company board controls remain available; rollback additionally requires instance-admin because it can execute host/workspace operations.
- Codex diagnostic children now use an explicit tenant home or the existing company-managed isolated home, matching normal execution. Host OPENAI_API_KEY and CODEX_API_KEY are overridden with empty values unless explicitly configured for the tenant. Native-auth inspection uses only the selected tenant home and does not return account email/token data. Explicit operator-provisioned tenant credentials remain supported.

## Evidence

Harmless mocked actual-router tests failed17expectations on the pre-fix combined candidate and passed after repair. They assert denial before secret normalization/resolution, adapter invocation, file service access, persistence or heartbeat mutation; preserve operator/same-company behavior; and cover key allowlisting, missing targets and cross-company controls. Four dedicated diagnostic capture tests verify company-home separation, blank host keys, explicit tenant overrides and no private account output. Existing instructions/execution/diagnostic suites are included in scoped validation. All commands/providers/files in the proof are mocks or disposable fixtures; no real run, provider request or credential is used.

Full/scoped typecheck, test and build receipts are recorded separately. Earlier calendar/dependency candidates remain intact. Mocked route tests do not establish production auth behavior or whole-agent sandboxing. Further advisory dispositions, image hashes, OS/dependency audits and dated review renewal remain independent release gates. No deployment or live readback is asserted.
