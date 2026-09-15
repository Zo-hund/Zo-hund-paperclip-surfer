# Database test harness repair — September 14, 2026

**Final result:** frozen canonical-source full suite passed: **194 files passed, 1 skipped; 1087 tests passed, 1 skipped**, exit 0, 670.99 seconds. Evidence: `output/database-frozen-full-tests.log`. The single skip is the existing forbidden-token placeholder covered by a separate runtime script. This is local validation, not deployment or candidate-image validation.

## Finding

The reported migration failures were test timeouts, not reproduced SQL/schema assertion failures. The three tests created a complete embedded PostgreSQL cluster and applied every migration inside their explicit 20-second test limit. On this Windows host, TEMP is redirected to F:/AMX-Caches/Temp. The original focused reproduction failed two tests at the 20-second deadline; the uniqueness test passed. Using process-local C-drive temporary storage made all three original tests pass (55.26 seconds overall), without schema edits.

## Repair

- Move per-test isolated cluster initialization into a beforeEach hook with a bounded 60-second setup deadline. Retain the existing 20-second assertion deadlines.
- Restrict database and OpenCode Vitest discovery to source test files. Full builds had created compiled duplicate tests under dist, which were being collected and run again.
- Preserve existing migration 0057 and all application/OpenRouter changes. No application database, production service, environment secret, or image was changed.

## Verification

- Repaired database tests on the original F-drive TEMP: **3 passed**, 87.03 seconds overall. Individual setup-plus-test durations were 23.23, 21.88 and 24.69 seconds.
- Database typecheck: passed.
- Whitespace/diff check for the three edited files: passed.
- Full suite, full workspace typecheck and build: in progress; results will be appended.

Full-suite validation uses the existing Node 24 launcher with TEMP/TMP changed only in that command process to the existing C-drive temporary directory. This does not alter saved user or system environment values.

Full workspace typecheck: passed. Full suite is progressing past database into server tests; known unrelated failures currently include five Windows link-cleanup errors in codex-local-execute tests and one sibling-worktree port expectation mismatch. Build and final suite counts remain pending.

## Full-suite follow-up

The first complete run finished: 23 failed, 1045 passed, 6 skipped across 193 files (816.62 seconds). Full workspace typecheck and build passed before the later OpenRouter tool-execution edits.

The C-drive TEMP experiment was inappropriate for the complete suite on this host: links from temporary adapter homes to F-drive skills hit a Windows mount-point device mismatch. Restoring the existing F-drive TEMP makes all 31 focused tests across the 10 failing skill/worktree files pass (23.95 seconds). No production skill helper change is retained. Existing database setup timing is now handled by the repaired hook, so SSD redirection is unnecessary.

A separate worktree test inherited PAPERCLIP_HOME from the host and consequently missed its fixture sibling directory. The fixture now clears relevant instance/worktree/port/database overrides and restores the original environment afterward; all five worktree tests pass.

Google OAuth tests also have a 20-second embedded-database setup hook; its diagnosis and focused validation are in progress. The complete suite will be repeated with the original temporary directory environment.

Google OAuth focused validation: **5 passed** after raising only the cluster setup hook deadline to 60 seconds. All real OAuth requests were mocked in the existing tests; no live OAuth integration was changed.

Final full suite launched using unchanged F-drive TEMP and current source, including the later OpenRouter tool-completion tests. Progress is recorded in `output/database-repair-full-tests-final.log`.

The second full run was stopped as an incomplete diagnostic after embedded-DB server setup failures recurred on F-drive TEMP during concurrent compilation. Only its verified Vitest process and descendants were stopped. No pass total is claimed for that run. Added a dedicated PAPERCLIP_TEST_POSTGRES_TMPDIR override so disposable DB clusters use the system disk while all other test temp paths retain their original volume. The Windows launcher preserves/restores this override and leaves TEMP/TMP unchanged. Focused validation is in output/database-temp-isolation-focused.log.

## Final cleanup and frozen validation

The DB-only-temp full run completed with 1079 passing tests, two OpenRouter test failures from source/tests edited during the run, and one heartbeat suite cleanup error. Windows briefly retained a disposable DB directory after process shutdown. Replaced immediate synchronous removal in the embedded test helper with awaited recursive removal and bounded retries (10 retries, 100ms incremental delay); errors still propagate if cleanup cannot complete. The focused heartbeat suite then passed all four tests.

The parent independently reran the current OpenRouter completion/task-context tests successfully. Canonical source was then frozen for one fresh complete run. That run finished successfully with **1087 passing, one existing skipped test**, across **194 passing and one skipped file**, exit code zero. No production services, live database, secrets, saved agents, or image were changed by this test-harness work. Candidate dependency/security validation remains separate.
