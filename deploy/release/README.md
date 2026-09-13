# Local, staging and production releases

This pipeline deploys AMX-AIR-HUBS.CC from `experimental` in
`Zo-hund/Zo-hund-paperclip-surfer`. Cloud configuration is specific to the verified
Hostinger host; it is not a generic multi-VPS installer.

## Release sequence

1. A PR passes `smoke`, `build and test`, `helm validate`, and `docker`.
2. After merge to `experimental`, CI builds one image, pushes it, blocks on HIGH/CRITICAL
   Trivy findings, signs its digest, tests that digest in an isolated container, and
   uploads `governed-release-<run_attempt>`. Unsigned or failed candidates may exist
   in GHCR, but do not have successful release evidence and cannot be promoted.
3. `Deploy AMX VPS` validates the originating repository, push event, branch, workflow,
   conclusion, attempt, commit and artifact digest before accessing the host runner.
4. Staging verifies the exact signing identity and commit, deploys the digest with
   separate database/storage/secrets, then requires local and public HTTPS health plus
   unauthenticated company-access rejection. Its scheduler is disabled.
5. To promote, dispatch `Deploy AMX VPS` on `experimental` with the successful
   `release_run_id` and `promote_production=true`. It retests staging, then waits at
   the existing `hostinger-prod` environment approval. The summary shows the exact
   digest and commit. AI must not approve this job.
6. After human approval, production re-verifies the signature, currently staged digest
   and public staging health. It requires restore evidence, snapshots the database
   and encrypted application storage, then replaces only the `amx` service.
   Failure attempts rollback to the previous local image ID and still fails the run.

No rebuild occurs between environments. The old `release-docker` and
`deploy-cluster` workflows return an error directing operators to this path.

## Local

Run PowerShell 7 from the checkout:

```powershell
./deploy/release/local.ps1 -Mode Validate
./deploy/release/local.ps1 -Mode Start
./deploy/release/local.ps1 -Mode Stop
```

The app binds `127.0.0.1:3100`; PostgreSQL has no published port. Docker project
`amx-release-local` owns separate data volumes. Stop preserves data. Generated
secrets live outside Git at
`F:/AMX-AIR-HUBS-LOCAL/OPPRRC/04_resources/BOARD-INTERNAL/development/config/.env.release-local`,
with an explicit Windows ACL. This does not reuse the existing OPPRRC development
database or its local-trusted server. No provider API keys are inherited.

## Verified host layout and prerequisites

| Item | Staging | Production |
| --- | --- | --- |
| Directory | /opt/amx/staging | /root/paperclip/deploy/vps |
| Compose project | amx-staging | paperclip |
| Private env | .env.staging, generated once | existing .env.vps, preserved |
| App port | 127.0.0.1:3102 | 127.0.0.1:3100 |
| Public URL | https://staging.amx-air-hubs.cc | https://amx-air-hubs.cc |
| Data | staging-db + staging-app volumes | existing /paperclip bind and DATABASE_URL |
| GitHub environment | staging | hostinger-prod |

The trusted `self-hosted, vps` runner needs Docker, Compose, Python 3, and permission
to these paths. Docker network `paperclip` and the existing Traefik
`letsencrypt` resolver must exist. No untrusted PR runs are sent to this runner.

The same physical host/runner is shared; separate Compose data and credentials do
not provide separate-host isolation. Move staging onto a separate VM and runner
before allowing untrusted workloads. The application must not hold host Docker
socket access, deployment-directory mounts, host groups, or deployment credentials.

Production uses the hardened generic VPS Compose file and recreates only `amx`.
Voice, database, n8n and Traefik containers are not recreated by this pipeline.
Other live services need separate maintenance: n8n currently publishes 5678 on all
interfaces and uses a mutable image. Its template binds loopback for a future
controlled restart. Removing app Docker access intentionally removes agent-driven
host deployment capability.

Environment files must be mode 600. Production app environment must not contain
`GHCR_*`, `VPS_SSH_*`, `REGISTRY_*` or `CLOUDFLARE_*` deployment credentials.
Registry login uses the ephemeral GitHub token in a job-specific Docker config;
GHCR must grant this repository package access. No production secret is needed to
build the image.

Production migrations are not automatically applied. For schema changes, prepare
and validate a backward-compatible migration and maintenance plan first; stale
schema startup fails rather than silently migrating.

## Recovery evidence and promotion

Before production, an operator must write a protected
`/root/paperclip/deploy/vps/release-recovery.json` from a real restore exercise:

```json
{
  "image": "ghcr.io/zo-hund/amx-air-hubs@sha256:<64-hex-digest>",
  "sha": "<40-hex-commit>",
  "restore_tested_at": "<UTC ISO timestamp>",
  "schema_backward_compatible": true,
  "restore_report": "<location of actual restore verification report>"
}
```

The pipeline does not generate this evidence. A missing record, mismatched release,
future timestamp or restore older than seven days blocks production before stopping
the app. This record is an operator assertion; the pipeline does not independently
execute the restore exercise. GitHub approval is a separate required control.

Production backup stops the app temporarily to quiesce application writes, dumps
PostgreSQL in custom format and copies /paperclip (including encryption keys).
This introduces downtime; schedule the promotion accordingly. Backups are private
under `release-state/<UTC timestamp>`. Keep off-host encrypted backups and test a
full restore to a disposable database and storage location. External database writers
must also be quiesced. Existing live data is never copied into staging.

On successful deployment only AMX_IMAGE is updated in the existing env file.
For manual recovery, consult `before.json`, use the saved image ID while it remains
available locally, and restore data only through the reviewed recovery procedure.
Retain the previous image; avoid pruning it. Automatic image rollback is permitted
only because the required recovery record attests backward-compatible schema.
If rollback itself fails, the run fails and needs operator recovery.

## Security controls and limits

- Live GitHub environments staging, production and hostinger-prod allow only the
  experimental branch and disable admin environment-approval bypass.
- Existing Zo-hund required reviewer is preserved. Self-review remains allowed for
  the single human operator; this is not independent two-person approval. The AI
  must not submit environment approval on the operator's behalf.
- Workflow metadata checks and signature verification fail closed.
- Runtime checks reject Docker/deploy mounts, host namespaces/groups, exposed app
  ports, privileged mode and missing capability restrictions.
- Smoke checks reject redirects, unhealthy JSON and unauthenticated company access.
  They do not prove every tenant authorization boundary or functional user journey.
- Full vulnerability scans may block the first release. Fix findings or document a
  narrowly scoped, reviewed exception; do not restore continue-on-error.
- This change does not claim WAF, external uptime monitoring, off-host backups,
  independent staging host isolation, or a successful recovery exercise.

## Verification

```sh
python3 -m unittest discover -s deploy/release -p 'test_*.py' -v
python3 deploy/release/smoke.py https://amx-air-hubs.cc
pnpm -r typecheck
pnpm test:run
pnpm build
```

See the dated development report for actual results. Workflow files on a local
branch or PR are not active cloud deployment configuration until merged.
