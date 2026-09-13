# Release readiness remediation

This change starts from experimental commit `90472a4bed6e874ce03eba64d3469392b96b30bd` and preserves human review and production approval. It does not authorize a production deployment.

## Fixed behavior

- Agent API-key listing, creation, and revocation load the target agent and verify company access before accessing keys. Revocation also binds the database update to both agent ID and key ID.
- Heartbeat-run issue lookup rejects anonymous callers and verifies access to the run's company. Activity creation verifies the target company as well.
- Pull-request images are loaded locally on the hosted CI runner and scanned with the same blocking HIGH/CRITICAL threshold. Experimental releases retain immutable digest scanning, provenance, SBOM generation, signing, and release metadata gates.
- The runtime image reinstalls only locked production dependencies after compilation. `tsx` is an explicit runtime dependency because workspace exports reference TypeScript source. OS updates and patched Python dependency minimums are installed without disabling the scanner.
- Worktree configuration tests clear ambient instance overrides so sibling-port fixtures use their own temporary homes.

## Evidence and limits

Focused authorization tests cover cross-company rejection, non-board rejection, missing agents/runs, valid company access, and binding revocation to the target agent. Release-control tests exercise accepted metadata and rejection of changed/failed releases and invalid HTTP smoke responses.

The last experimental release was blocked by its image scan. Its findings cover OS packages, Python dependencies, build binaries, and application advisories; an npm audit alone does not establish image safety. Some OS findings have no listed fix. These changes must pass the full image scan before they can produce a promotable release.

Relevant upstream advisories:

- https://github.com/advisories/GHSA-3xx2-mqjm-hg9x
- https://github.com/advisories/GHSA-xfqj-r5qw-8g4j

Other application advisories, agent execution isolation, complete end-to-end staging verification, and release-specific backup/restore evidence still require review. Do not change package versions merely to hide an advisory or infer that a backport cleared the scanner. Any applicability exception needs separate evidence and explicit review.

## Promotion boundary

The staging database may be prepared independently with fresh secrets, separate storage, and an internal network. The application must still be deployed through the governed workflow with a scan-passing signed digest. Staging readiness requires both authenticated-runtime smoke checks and the public HTTPS route. Production additionally requires release-specific restore evidence and human approval; neither is supplied by this document.
