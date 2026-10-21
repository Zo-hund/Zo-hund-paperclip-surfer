# Runtime security package repair — October 21, 2026

The PR12 raw image scan records 27 HIGH/CRITICAL identities: nine first-party findings and 18 bundled runtime-tool findings. This change targets the 17 runtime identities with published upgrades; it does not establish that a rebuilt image is clean.

Upgrade actual dependencies within bundled npm to brace-expansion 5.0.11 and compatible Undici 6.28.1, retaining npm and every adapter CLI. Preserve existing ip-address/tar updates and assert installed versions.

Pinned Hermes source 939e45c91d751fadd94dcd1b873ac3cb44846213 exact-pins the old certifi, PyJWT and Pillow versions. A narrow, asserted three-value pyproject metadata patch selects certifi 2026.10.19, PyJWT 2.15.1 and Pillow 13.0.0; code and assets remain pinned. The pip path requests those exact releases, retains pip check and verifies installed versions. The upstream uv.lock is not used by this editable pip path; future uv use needs separate lock reconciliation. Pillow 13 requires Python 3.11+, satisfied by the image's Python 3.12, but full optional-plugin compatibility remains unverified.

Primary release metadata: https://registry.npmjs.org/brace-expansion/5.0.11 , https://registry.npmjs.org/undici/6.28.1 , https://pypi.org/pypi/PyJWT/2.15.1/json , https://pypi.org/pypi/certifi/2026.10.19/json , https://pypi.org/pypi/Pillow/13.0.0/json . Hermes pins were checked against the exact upstream commit.

Validation: isolated npm 11.19.0 prefix installation, nested version assertions, npm/minimatch/brace expansion and Undici exports pass. Target-only Python installation, CA bundle loading, the actual pinned Hermes PNG conversion for RGB/RGBA/I fixtures, and its RS256 verifier's valid/wrong-audience cases pass. The Docker inline metadata command was executed against an upstream pyproject copy and all expected pins verified. These are Windows local compatibility probes, without providers or live agents; full Linux image installation/pip resolution and scanning remain required.

Unresolved: http-cache-semantics 4.2.0 remains HIGH (CVE-2026-93748 / GHSA-ch52-4w7c-c8xp), with no patched version listed. Its upstream dispute is not clearance. The isolated npm audit still reports one high and three moderate findings. No waiver, suppression, version rename, gate change or expiry renewal is included.

The prior backport review remains expired and source hashes must cover the actual integrated candidate. Retain exact-image raw scan, authentication smoke, governed source/image review, rollback/recovery evidence and human production approval. No production deployment is part of this change.
