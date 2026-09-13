# AMX migration tools

`inventory.py` is an offline Git inventory. It does not open an application database,
apply SQL, start agents, copy credentials, or authorize a release.

Requires Python 3.10+ and Git. No Python or JavaScript packages are installed.
Run from the migration worktree. Keep local reports and temporary test files on
F under OPPRRC. The output report is created exclusively; existing evidence is
never overwritten. Use a new filename for each run.

## Synthetic conversion and recovery

The other scripts use only a dedicated Docker PostgreSQL container with the
rehearsal label, `--network none`, no published ports and a dedicated data volume.
They accept no live database URL. Local Docker storage is on F. They are not
production cutover tools, and they never start the application or agent runs.

1. `rehearsal.py` executes the AMX and candidate histories in different **new**
   databases. Each journal records only SQL actually executed on that database.
2. `seed_synthetic.py` creates two test tenants with explicit plugin ownership,
   private/public visibility, approval policies, secret references, ledger values,
   run history, microsecond timestamps and integers beyond JavaScript precision.
   Secret material is a synthetic structural fixture, not a decryptable live key.
3. `convert_synthetic.py` checks the committed column map and schema fingerprints.
   It preserves every source value in an isolated archive and validates equality
   before quarantining runnable state. Foreign keys stay enabled and are checked
   before commit; their original deferral settings are restored. Plugin ownership
   must be explicit. Unknown required fields, schema drift and existing target
   application data stop conversion. Populated legacy instance settings require
   a separate explicit merge; the current fixture has an empty settings table.
4. `verify_bindings.py` checks the tenant-bound key reference, cross-company and
   conflicting-binding rejection, rollback, idempotence and no privilege inference.
5. `restore_synthetic.py` creates a PostgreSQL custom-format backup, restores it
   into a third new database, and checks all source values and the original journal.
   It compares surviving column order; physical holes from historical dropped
   columns do not survive `pg_dump` and are not logical schema differences.

The validation workflow contains the exact commands. Evidence identifies this
as synthetic-only. Real storage/key recovery, populated-settings conversion,
runtime migration, complete feature parity and release gates remain required.
Never use a successful synthetic rehearsal as production approval.

```powershell
$migrationPython = 'F:/AMX-AIR-HUBS-LOCAL/OPPRRC/04_resources/BOARD-INTERNAL/development/tools/notebooklm/venv/Scripts/python.exe'
$migrationReports = 'F:/AMX-AIR-HUBS-LOCAL/OPPRRC/05_reports/BOARD-INTERNAL/development/migration-20260913'
$env:TEMP = Join-Path $migrationReports 'scratch'
$env:TMP = $env:TEMP
New-Item -ItemType Directory -Force -Path $env:TEMP | Out-Null
& $migrationPython -B -m unittest discover -s scripts/amx-migration -p 'test_*.py' -v
& $migrationPython -B scripts/amx-migration/inventory.py `
  --repo . `
  --baseline daaae8eb4a885b80e3ac0dcaf611b3ed09361d9d `
  --candidate 65ec059bde30d98c92165b24a30a540800dd1f6f `
  --output (Join-Path $migrationReports 'inventory-next.json') `
  --require-compatible-journal
$LASTEXITCODE
```

Exit codes:

- `0`: inventory succeeded; when requested, the journal prefix matches.
- `2`: inventory succeeded but the journal is not a compatible prefix.
- `1`: inventory failed. Do not use old evidence as a replacement result.

Always check the native process exit code before invoking another command.
Report mode without `--require-compatible-journal` exits zero for a completed
inventory even when it finds an incompatible history.

The current AMX/upstream pair must return `2`. This is a deliberate rejection,
not a failing regression test. The flag checks only journal identity; it is not
wired into deployment and a pass does not make an app safe to migrate.

## What the report establishes

- Exact committed source identities. Uncommitted changes are not analyzed.
- Files unique to each tree and changed shared files.
- Literal `pgTable` declarations and their defining source files.
- Literal route declarations compared by source file, method and route string.
- Exact journal metadata and SQL prefix; missing SQL and changed metadata fail.
- Differences in columns recorded in the latest filename-sorted snapshots.

Historical index gaps, duplicate indexes and out-of-order timestamps are
reported separately. They are not automatically rewritten. The application
has its own migration-history reconciliation logic; this tool does not assume
that an index is a database migration identifier. Duplicate tags are invalid.

## Limits

Route declarations exclude mount prefixes, generated routes, renames and
authorization semantics. Matching paths do not establish behavior parity.
Snapshot comparison does not establish current schema fidelity, constraints,
triggers, data preservation, foreign-key validity or snapshot drift. The
presence of a newer package version does not establish security. File lists
are not a copy allowlist; tracked logs, account data and credential artifacts
must stay out of the migration payload.

See `doc/plans/2026-09-13-amx-upstream-migration.md` for the conversion and release
acceptance requirements. Full application typecheck, tests, build, image scan,
runtime checks, restore rehearsal and human approval remain separate gates.
