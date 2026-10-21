# Mode-aware production backup repair — 2026-10-21

The production helper previously stopped the app and unconditionally dumped the
candidate's `DATABASE_URL` through a PostgreSQL 17 client. That does not identify
the live database when the app uses embedded PostgreSQL or a config-file URL.
The separately reported live configuration uses embedded PostgreSQL 18.1 with
HOME `/paperclip`, no effective external URL, and a cluster below
`/paperclip/.paperclip/instances/default/db`.

## Changed behavior

`database-backup-probe.mjs` resolves the actual container's environment, dotenv,
validated config and HOME-aware paths without importing the write-capable config
loader or starting a database. It preserves the application's distinction between
an unset and explicitly empty `DATABASE_URL`. Unknown configuration, worktree
mode, changed config/dotenv since process startup, external storage paths,
symlink-backed clusters and special filesystem objects fail closed.

Before stopping production, `host-deploy.py` requires the existing and candidate
storage mounts and effective database identities to match. Its candidate probe
runs in the signed image with storage read-only, no network, no capabilities and
no application entrypoint. Custom startup overrides and unresolved database
environment values are rejected. The old container's start time and database
identity are checked again immediately before the stop.

For the supported embedded major 18, the backup is an ownership-preserving
`docker cp -a` cold copy of all `/paperclip`. The copied cluster must match the
identified major, lack `postmaster.pid`, and pass read-only `pg_controldata` with
exact state `shut down` and no stderr warnings. The matching official client is
pinned to `postgres@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873`.
Application exit status alone is not accepted as clean-database evidence.
Any stop/copy/control rejection attempts to restart the old existing container
and fails the promotion; it does not continue to replace the app.

External mode retains a custom-format logical dump plus the full storage copy,
using the actual old URL and single existing Docker network. The pinned client
is limited to supported server majors 10–18. Local/loopback, UNIX, multihost,
host-override and ambiguous network targets are rejected. Connection values stay
in private captured data or environment, not command literals or `before.json`.

## Verification

Local validation used mocked Docker/subprocess calls and owned temporary
filesystem fixtures. No live container, database, secret, deployment or approval
was accessed by these tests.

- `python -m unittest discover -s deploy/release -p test_host_deploy.py -v`:
  **20 passed**, including the normal-CI wrapper that executes all Node regressions.
- `node --test deploy/release/test_database_backup_probe.mjs`:
  **13 passed independently**, with no skips.

Coverage includes empty/unset/config-only database URLs; HOME-aware cluster paths;
outside-root and symlink rejection; old/candidate mode/target/mount mismatch;
unsupported targets rejected before stop; safe candidate probe flags; ownership
copy flags; external dump and storage; dirty/PID-present/standby cluster rejection;
control warnings; and restart of the old container after a post-stop rejection.
The existing CI Python discovery runs the Node suite through its Python wrapper;
no workflow or permission change is required and missing Node fails explicitly.

## Remaining production gates and limits

This repair does not create `release-recovery.json`, a readiness record, a logical
dump for embedded mode, or a restore attestation. The signed immutable image,
matching recent recovery record, staging checks, old image rollback and separate
human production approval remain required. Existing first-party security finding
identities, review dates and manifest dispositions are outside this patch.

`PG_VERSION` identifies the source cluster; it does not establish compatibility
with the candidate's bundled PostgreSQL binary. A full exact-image recovery must
exercise the complete storage copy, expected UID/GID and file modes, database
roles/grants, application readback and rollback. External writers require separate
quiescence. No automatic database rollback or off-host backup is added.

The separate actual-live PostgreSQL 18 logical restore and read-only
control-client fixture are useful independent evidence. They do not establish a
full cold-storage restore, candidate application compatibility or exercised
production rollback, and this source test report does not claim those outcomes.
