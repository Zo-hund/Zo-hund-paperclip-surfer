# Integrated AMX source and image review — October 21, 2026

The calendar release restores the New Event dialog and loading of saved company events. The first-party source review was repeated after repairing alternate execution and approval boundaries, and runtime dependency code was updated. The previous adopted review had expired October 15.

The refreshed automated review retains all nine exact original finding IDs, package paths, installed versions, severities, PURLs and UIDs. It pins 70 normalized source hashes; review date October 21, expiry October 28 exclusive. Independent source regressions passed 294 tests in 26 files; eight gate tests passed. This remains an automated source/backport review, separate from human production approval.

## Exact-image evidence before adoption

[CI run 39628291343](https://github.com/Zo-hund/Zo-hund-paperclip-surfer/actions/runs/39628291343) checked out merge 2be5a6294099caa5daaafdfe012fd7a1d90f92ba, tree 84297ff843c21fba806c8a71aa2ab7de012a3ba8, identical to PR head 570f5c0d2cf3854e3af961226a4e415ee05d8eaf. All 70 source hashes matched both checkout and image sha256:3993e0562a727413aa9d76f3061efab50202c695a868dea47c1f7d93b24a87fd.

The raw scan contains exactly the nine reviewed first-party identities. Candidate VEX was generated only after image/source checks. The enforcing scan used the same image and vulnerability database and reported zero unresolved HIGH/CRITICAL findings. The raw-to-filtered guard confirmed exactly nine reviewed removals with no additional exclusion. Artifact 12359441054 retains both reports, candidate VEX and manifest; archive SHA256 5606cf5653f9082e38f6da90d53b7c69dd71cca57ab4ab7c3b1429ef59c0ba66. The still-expired authoritative gate then failed, as intended. Adoption occurs only after this candidate proof. Temporary candidate-only workflow steps and the duplicate candidate manifest are removed; the original mandatory CI gates are restored unchanged.

The actual runtime cache package is 4.3.0. Its nine real-consumer tests passed inside the image, pip check passed, and isolated startup/auth smoke passed health/anonymous denial plus pending-token, self-approval, host-skills and public-health regressions. Current Linux application CI passed 1386 tests/3 skipped plus 250 worker checks, typecheck, smoke and Helm. The final adopted tree still requires the normal complete CI run.

## Limits and release requirements

Operator and target-company gates cover reviewed direct execution, diagnostics, instruction paths, approval decisions and run actions. Managed Codex home avoids host auth/config copying and named inherited credentials. HOME/the shared OS account, arbitrary process sandboxing and all execution caches are outside this certification. The retained single-user shared-cache credential probe without Vary remains an execution-cache review item. Delivery/promotion effects remain best-effort. Invalid legacy approvals intentionally fail closed and need operator reconciliation.

Production still requires governed staging, a matching actual database/storage/application recovery exercise and human hostinger-prod approval. Calendar save/reload, mobile behavior, project linkage, recurrence, cross-platform sync, project-linked delivery and human acceptance require separate live evidence.
