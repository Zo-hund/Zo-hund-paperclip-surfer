# Integrated source review candidate — October 21, 2026

The nine existing first-party findings have been re-reviewed against the calendar release stack. The independent automated source review passed 294 regressions in 26 files and 8 release-gate tests. Existing finding IDs, package paths, installed versions, severities, PURLs and UIDs are retained. No third-party exclusion is proposed.

The candidate pins 70 normalized source hashes present in the image. The separately reviewed CI workflow is excluded from the Docker context and recorded as checkout-only evidence. Review date is October 21 and expiry is October 28 exclusive. The original70-path snapshot digest is b9d37df0ab544e973e1fce47e4d0a4aea8b7b398e728a6fb155230332219c198. The candidate is a proposed automated review, not human production approval.

CI separately verifies candidate checkout and in-image source hashes, matches the raw scan to the actual image ID, scans with the candidate VEX against the same database and rejects any removal outside the exact reviewed finding identities. These checks run only for PRs containing backports.candidate.json. The existing adopted manifest and all mandatory release gates remain unchanged. A candidate pass cannot release or sign an image. Artifacts retain raw, candidate-filtered and adopted review evidence.

The earlier exact 490bd source image built and passed isolated health, anonymous-access rejection, pending-token denial, self-approval, host-skills and public-health checks. Its raw scan in run 39623710254 has 10 HIGH/CRITICAL findings: the 9 first-party entries and http-cache-semantics 4.2.0. That runtime package is upgraded to actual 4.3.0 code in the next candidate, with 9 real-consumer checks. Current image evidence is required before adopting this source review.

Scope: operator and target-company gates cover reviewed direct execution, diagnostics, instruction paths, approvals and run actions; Codex managed home avoids host auth/config copying and named inherited credentials. HOME/the shared OS account, arbitrary process sandboxing and all execution caches are not certified. The preserved single-user shared-cache credential probe without Vary remains an execution-cache review item. Delivery/promotion side effects remain best-effort. Legacy invalid approvals intentionally fail closed and require operator reconciliation.

Production still requires a matching real recovery exercise, governed staging and human hostinger-prod approval. Calendar save/reload, mobile checks, project-linked delivery and user acceptance require separate live evidence.
