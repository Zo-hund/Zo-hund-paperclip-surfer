# VPS runtime repair

## Scope and observed failure

Production at `amx-air-hubs.cc` was healthy on September 15. Staging returned
HTTP 502 because only `amx-staging-db-1` existed; no staging application image
had been deployed. The database has its own `amx-staging_staging-db` volume
and internal network. Its private environment already contains separate secrets.

CI run [34927237144](https://github.com/Zo-hund/Zo-hund-paperclip-surfer/actions/runs/34927237144)
passed build/tests and image smoke, then failed Trivy with 224 OS findings
(223 HIGH, one CRITICAL) and nine application findings (four HIGH, five CRITICAL).
That run predates the latest CEO delivery source changes.

## Change

Based on candidate `d30804ec9bf74ec47a597808921078d3493d65e2`, the final image
uses Ubuntu 24.04 security packages while retaining Node from the official Node
image used by the build, all agent CLIs, Python, Hermes, Runway and FFmpeg.
The application user remains UID/GID 1000. No application manifests, advisory
versions, scanner severities, or release gates are changed.

Ubuntu lists the critical libxml2 issue as fixed in its Noble package; Debian
Trixie still lists its shipped package as vulnerable:

- https://ubuntu.com/security/CVE-2026-6653
- https://security-tracker.debian.org/tracker/CVE-2026-6653

Scanner counts use each distribution's advisory data and severity assessments.
A reduction in findings alone is not proof that every underlying upstream issue
has been patched. The previous Ubuntu OS-only probe had zero HIGH/CRITICAL
findings, but the full candidate must be independently scanned and tested.

Image smoke supports an explicit `SMOKE_PORT` so it can run on a shared host
without colliding with production port 3100. It now exercises Python imports
and H.264/AAC encoding in addition to every existing CLI and authentication check.

## Validation

- Release helper suite: 10 tests passed on the VPS in the isolated source folder.
- Shell syntax and rejection of privileged smoke ports passed.
- Full image build, runtime smoke, candidate scan, typecheck, tests and build:
  pending at preparation time; final evidence will be recorded below.

The test source is under `/opt/amx/runtime-repair-20260915`; this is a build/test
directory, not a deployed staging or production application. Production data,
containers and credentials are not supplied to candidate tests.

## Remaining release requirements

The nine first-party package findings need evidence against the exact candidate.
Existing source repairs and tests are useful, but no scanner exception or VEX
assertion is activated here. Staging requires the governed successful CI release,
immutable digest and signature; production additionally requires matching
recovery evidence and human deployment approval.

## Reference provenance

The local unreviewed reference “How to Create a DevSecOps CI/CD Pipeline”, in
[Shifting Left](https://notebook.google.com/notebook/bb2fafed-6661-46f3-bf02-d1c3acaa915e),
was used only as context for scanning environment images. Document key
`bb2fafed-6661-46f3-bf02-d1c3acaa915e:f5d10a64-61c7-45f7-ab8d-62f6efa549b0`,
SHA-256 `f387051a9787186d6fa73a7f3e246ecac51f2784a082b975e65c74eee18d8d7b`,
retrieved September 11. Docker's [multi-stage build documentation](https://docs.docker.com/build/building/multi-stage/)
supports copying the Node runtime independently from OS package libraries.
Actual compatibility and scan results must come from the built image.
