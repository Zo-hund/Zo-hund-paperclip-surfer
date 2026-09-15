# Runtime image hardening review

Status: the initial review inspected `4165d236dfa5b407e43f048ced8428b74482aed1`. Its completed scan and a subsequent Docker build-cache change are documented below. Production and scan policy remain unchanged.

## Recommended immediate scope

Keep the existing full runtime while obtaining the exact candidate image's scan. It already reinstalls the locked production dependency graph, hydrates embedded PostgreSQL libraries, upgrades selected npm runtime dependencies, and updates Python dependencies. Repeating these changes based on yesterday's scan would be redundant. Fix only remaining findings established against the newly built image and retain the HIGH/CRITICAL blocking gate.

The smallest functionality-preserving hardening follow-up is to pin the resolved, tested base digest and installed agent CLI versions instead of mutable `lts`/`latest` selections, then rebuild and rerun the unchanged runtime smoke and vulnerability scan. Pinning improves reproducibility; it does not itself repair a vulnerability. Do not invent version pins before resolving and testing actual packages.

## Verified source constraints

- `Dockerfile` production installs Python, pip, ffmpeg, four npm agent CLIs, Hermes and Runway. The production graph reinstall is already present in `runtime-deps`; the final copy still carries application source because workspace runtime exports use TypeScript and the server launches with tsx.
- `deploy/release/smoke-image.sh` requires Claude, Codex, OpenCode, Pi, Hermes, ffmpeg, Python, npm and pnpm, then exercises their launchers. Removing these packages will fail current smoke intentionally. API health alone is not feature parity.
- OpenRouter calls its provider using Node fetch and executes authorized commands through `/bin/sh` on Linux. Its task contract can use curl to access the platform API. This CEO path does not require a separate installed model CLI, Python or ffmpeg for ordinary textual task delivery. Arbitrary client tasks can still depend on these tools.
- `server/src/adapters/registry.ts` registers local adapters, including Hermes, which resolve a local executable and call it in the server execution context. A newly added worker container alone does not redirect these calls.
- `docker/docker-entrypoint.sh` attempts Codex login if an OpenAI key is provided. A minimal profile without Codex must explicitly handle that capability rather than emit a misleading login failure.
- `.github/workflows/ci.yml` builds the default Dockerfile target, runs image smoke, and blocks on HIGH/CRITICAL findings. Published images additionally receive signing and digest-based smoke. Profile selection and separate artifact identity would need deliberate workflow changes.

## Optional split: concrete patch boundary

An additive `control-plane` target and `agent-media` target can share application/runtime layers while keeping the current full target as the compatibility default. Docker supports named targets and selective stage copying: [multi-stage builds](https://docs.docker.com/build/building/multi-stage/). Keep Node, certificates, shell, curl, Git, tsx and the existing database/runtime assets in the control-plane target initially. Move optional CLI/Python/media installation to the full worker target only after a verified dependency inventory.

Required accompanying changes before selecting the smaller image for production:

1. Add explicit runtime capability discovery/validation so unsupported local adapters cannot be accepted and later fail on missing executables.
2. Implement and test an actual worker execution transport, or explicitly retain all existing local adapters on the full runtime. Preserve tenant identity, task ownership, cancellation, timeouts, credentials and work-product readback across the boundary. Do not mount the Docker socket into the API as a shortcut.
3. Keep the existing full-runtime smoke and add a separate control-plane profile smoke that proves API authentication rejection, embedded database start, and OpenRouter command/task delivery. Reducing the existing assertions without declaring a separate capability profile hides a regression.
4. Build, scan and sign every deployed image independently; separating media does not waive its vulnerabilities. Publish immutable profile identities and keep deployment/recovery evidence matched to them.
5. Verify selected company agents and media workloads against their actual profile before migration. The review did not inventory saved live agents or claim that optional tools are unused.

This is a larger feature change than a Docker package deletion. It is useful for the planned architecture, but should not be advertised as the smallest immediate CEO repair.

## Scan evidence and remaining blockers

The historical `source/output/release-image-failed.log` records September 13 findings: OS 233 (232 HIGH, 1 CRITICAL), application packages 9 (4 HIGH, 5 CRITICAL). Repeated ffmpeg-family rows and libxml2 appear in the OS table. Those are old scan results, not measured findings for the current candidate. Package removal may reduce exposure, but exact dependency closure and the next scan must establish the effect.

First-party Paperclip advisories remain independent of media packaging and are under a separate source/backport review. Neither application package relabeling nor moving an affected component to an unscanned image is a repair. No ignore rule is proposed.

No build, install, runtime test or production change was performed by this review because the serial release test run was using the machine. No scan clearance, image size saving, or full feature parity is claimed.

## Reference provenance

Applied `amx-devops-release` guidance and repository AGENTS.md. The local reference search returned the unreviewed notebook [AMX Blueprint: Tokenizing Docker Agents as Executable Assets](https://notebook.google.com/notebook/df42691b-5bc1-44ea-8dad-497c7acbdbae), document key `df42691b-5bc1-44ea-8dad-497c7acbdbae:ad747e82-e6e2-45bc-8226-3eb57b507a80`, SHA-256 `353e2adf13c9e5281566e59204f36d9b3d2c25481bfed334103ed838a5356305`, retrieved September 11. Its digest pinning, scan and isolation guidance was treated as context, not evidence of configured controls. Docker's [build practices](https://docs.docker.com/build/building/best-practices/) support minimizing unnecessary runtime packages and separating build artifacts; actual compatibility conclusions above come from this checkout.
# Exact candidate image result

The completed candidate CI run built the image and passed its isolated runtime smoke check, then failed the blocking Trivy scan: 224 operating-system findings (223 HIGH, one CRITICAL) and nine application findings (four HIGH, five CRITICAL). This image predates the additional execution-authorization and Codex isolation repairs. The operating-system findings remain relevant because those repairs do not change the runtime package graph. Evidence: local `candidate-image-failure.log`; [completed candidate CI](https://github.com/Zo-hund/Zo-hund-paperclip-surfer/actions/runs/34923126160).

The critical OS finding is libxml2 CVE-2026-6653. The [Debian security tracker](https://security-tracker.debian.org/tracker/CVE-2026-6653) confirms that the shipped Trixie package remains affected; a newer library is fixed in testing/unstable. Mixing that library into the stable image requires compatibility validation and is not a complete remedy for the remaining findings. The [FFmpeg tracker](https://security-tracker.debian.org/tracker/source-package/ffmpeg) also lists several findings as affected across stable and newer suites. Therefore changing the Debian suite or running apt upgrade alone is not evidence of a clean full-feature image.

No scanner exceptions, version relabeling, production promotion, or runtime removals were applied. Application repairs can be tested independently, but the current full-feature image cannot pass the existing release policy until its remaining package findings are resolved.

Build-cache repair: the application copy now follows the unchanged agent/media installation layers, and metadata-only build arguments are declared immediately before their OCI labels. This retains the installation commands, labels, and scan policy while allowing unchanged tool layers to be reused between source changes. Existing mutable tool selectors still require a separately tested pinning change. Actual image smoke validation remains required; this ordering change does not resolve vulnerability findings.
