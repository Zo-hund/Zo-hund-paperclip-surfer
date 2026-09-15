# Project and execution-workspace authorization — September 14, 2026

## Scope and behavior

Candidate worktree only. Project execution policies and workspace configuration previously required company access alone. Those fields can choose local directories, configure runtime services, or supply provision/setup/teardown/cleanup commands. Execution-workspace metadata includes the trusted `createdByRuntime` flag, and archiving stops runtime services, executes stored cleanup commands, and may remove filesystem artifacts.

- Project creation with an embedded workspace or execution policy, and policy updates/clearing, now require instance-admin or local-implicit operator access before any writes.
- Project workspace creation/deletion require operator access. Updates to execution-related configuration require operator access; name/visibility remain editable by company collaborators.
- Execution-workspace PATCH requires operator access before mutation or cleanup. All currently accepted fields concern execution lifecycle, cleanup, or trusted metadata.
- Ordinary project creation, names/descriptions/status/goals and other existing project metadata permissions remain unchanged. Company boundaries still apply.
- The existing strict execution-workspace update schema already rejects arbitrary cwd/provider fields; no schema expansion was made.
- Existing archive checks for open linked issues remain intact. This change does not claim to validate or sanitize historical stored execution configuration.

## Validation

Focused route suite passed **38 tests** with real validation and authorization middleware, mocked persistence/runtime side effects, and no live commands or database access. It covers company members and agents, policy commands/runtime/clearing, embedded workspace creation before parent writes, workspace path/repository/command/primary/provenance changes, archive protection, normal metadata edits, operator success, cross-company rejection and open-issue archive conflicts.

Command: `pwsh -NoProfile -File scripts/test-local.ps1 server/src/__tests__/project-execution-authorization.test.ts --reporter=verbose`

Evidence: `candidate-project-execution-tests.log`. Parent coordinates final candidate typecheck/build/full suite; no production deployment or canonical-source edits were performed in this subtask.
