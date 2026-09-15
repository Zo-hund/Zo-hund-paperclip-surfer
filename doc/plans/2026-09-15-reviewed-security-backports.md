# Reviewed security backports for the AMX fork

## Problem and change

The fork still identifies its first-party packages as `@paperclipai/server@0.3.1`
and `paperclipai@0.3.1`. Trivy reports nine HIGH/CRITICAL findings against those
versions even where this fork has backported authorization and credential-isolation
changes. Package versions are unchanged. Third-party and OS findings are not exempted.

This change also closes remaining disclosure paths: host skill enumeration requires
instance administration; anonymous health retains only login/bootstrap state; CLI
challenge polling hides unrelated tenant names and approving-user details. Workspace
provisioning now uses the same control-plane environment sanitizer as runtime cleanup.

## Dispositions and evidence

The exact nine package/path/version/advisory identities, source hashes, evidence,
review author, and expiry are in `deploy/release/backports.json`.

| Advisory | Fork repair | Regression evidence |
| --- | --- | --- |
| CVE-2026-41679 (server and CLI) | Company creation/import preview/apply require instance administrator | company-portability-routes |
| GHSA-3xx2-mqjm-hg9x; GHSA-47wq-cj9q-wpmp | Agent key routes check company scope and board identity | agent-key-authorization |
| GHSA-vr7g-88fq-vhq3 | Workspace setup/cleanup configuration and cleanup-triggering lifecycle mutations require instance administrator | project-execution-authorization |
| CVE-2026-41208 | Executable agent configuration, create/hire, rollback, and live-run overrides require instance administrator; provisioning strips control-plane environment | agent-execution-authorization, project-execution-authorization, issue-execution-authorization, workspace-runtime |
| GHSA-w8hx-hqjv-vjcq | Untrusted agent/skill input cannot install runtime shell configuration | agent/project/issue execution authorization |
| GHSA-xfqj-r5qw-8g4j | Authenticated company-scoped run issues, admin-only host skills, minimal anonymous health, scoped challenge metadata | activity-routes, health-disclosure, cli-auth-routes, isolated smoke-cli-auth.py |
| GHSA-gqqj-85qm-8qhf | Managed Codex home no longer inherits host auth/config; host API keys overridden; sandbox bypass defaults false | codex-local-execute |

CLI device-login challenge creation remains public by design. It creates a pending
challenge, not an active board key. The isolated image smoke attempts company access
and self-approval using the pending token and must receive 401/403. Bundled skill
documentation remains public through a fixed name whitelist; it cannot enumerate or
read host skill files. Explicit operator-provided tenant Codex credentials are still
supported. These are scoped advisory repairs, not a claim that an agent process is a
complete sandbox against every possible host attack.

## Enforcing scan sequence

1. Collect the raw HIGH/CRITICAL JSON report with ignores disabled. Collection exit
   code zero is not approval; subsequent enforcing steps must pass.
2. Verify the report's image ID against Docker and compare reviewed source hashes
   both in the checkout and inside that image. Reject expired or changed reviews.
3. Generate ephemeral OpenVEX `fixed` statements for only matching first-party
   package versions. [Trivy's OpenVEX support](https://trivy.dev/docs/dev/supply-chain/vex/file/)
   provides the standard filtering mechanism.
4. Run Trivy again using the same database, severity HIGH/CRITICAL, and exit code 1.
5. Compare both reports. Any removed identity outside the exact reviewed package
   path/version/advisory/severity/PURL fails. Unknown findings and findings at another
   location remain blockers. Changing the image between scans also fails.
6. Preserve raw/filtered scans and both review/VEX documents as CI artifacts before
   signing or writing governed release metadata.

Do not reuse the generated VEX independently of this verification sequence. The
review expires on 2026-10-15 and must be re-evaluated after any hashed-source change.
The author is explicitly an automated Codex source review, not a human reviewer or
production approval. Protected branch checks and human production approval remain.

## Verification

`test_backport_vex.py` exercises exact allowance, unknown advisory rejection, wrong
package/path/version/severity, changed source, expiry, missing scan, image mismatch,
and unresolved findings. Full typecheck/tests/build and isolated image smoke must
pass in CI. Actual run IDs, results, and deployment observations are recorded in the
F-drive development report; this design document does not assert deployment success.
