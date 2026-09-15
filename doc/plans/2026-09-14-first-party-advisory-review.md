# First-party advisory review

Reviewed candidate `4165d236dfa5b407e43f048ced8428b74482aed1` (CEO repair plus tenant credentials and authorization/image gates). Initial source/advisory review followed by authorized candidate-only remediation below. No exploit, package version change, scan exception, VEX assertion, deployment, or live-account test performed. The assessment sections describe the pre-repair candidate.

## Result

The three requested findings cannot be dismissed as package-version false positives. Relevant vulnerable behavior remains in the candidate. PR5 repaired adjacent tenant authorization but did not backport these complete boundaries. Existing package versions remain `0.3.1`; changing that string would not remediate the code.

## Import authorization: CVE-2026-41679

Primary source: [upstream advisory GHSA-68qg-g8mg-6pr7](https://github.com/paperclipai/paperclip/security/advisories/GHSA-68qg-g8mg-6pr7). GitHub lists `paperclipai` and `@paperclipai/server` before `2026.410.0` as affected.

- `server/src/routes/companies.ts:887` and `:896`: global import preview/apply require board identity, but check company access only for existing-company targets. New-company import has no instance-administrator check. Blame traces this block to `cc2c724ad2` with board assertion added by `51ca713181`; the integrated security merge did not change it.
- `server/src/config.ts:159`: signup still defaults to enabled when no override is present. Actual production signup configuration was not inspected in this review.
- Important product difference from the advisory: `companies.ts:986` deliberately allows any signed-in board user to create their own company. Therefore protecting import alone does not establish an operator-only host-execution boundary for this self-service product.
- `server/src/__tests__/company-portability-routes.test.ts:157` rejects an agent on the board-only global preview route; it does not establish rejection of a non-admin board user importing a new company.

Disposition: **not remediated**. Define and enforce the trusted-operator boundary for execution-sensitive agent configuration across import, creation and updates (or execute tenants in isolated workers). Add non-admin-board import/creation rejection or safe-runtime tests as appropriate. Retain intended company self-service separately from authority to execute commands on the server. Do not infer production exploitability solely from static review, but do not mark this advisory cleared.

## Agent-controlled provisioning: CVE-2026-41208

Primary source: [upstream advisory GHSA-265w-rf2w-cjh4](https://github.com/paperclipai/paperclip/security/advisories/GHSA-265w-rf2w-cjh4). GitHub lists `@paperclipai/server` before `2026.416.0` as affected.

- `server/src/routes/agents.ts:225-236`: same-company agents may update themselves; CEOs may update other agents. Self-update allowance traces to `c09037ffad`.
- `agents.ts:1721-1799`: adapter configuration is accepted and merged; there is no agent-principal restriction on `workspaceStrategy.provisionCommand`. The constraints helper at `:411` only checks OpenCode model availability.
- `packages/shared/src/validators/agent.ts:33` accepts arbitrary adapter keys while validating the environment subfield; it does not exclude execution-sensitive workspace strategy.
- `server/src/services/workspace-runtime.ts:592` reads config workspace strategy; `:509-525` forwards the provision command to the workspace operation runner; `:342-353` and `:231-240` invoke the platform shell. No injection payload is needed to identify this trust-boundary path.
- Existing `workspace-runtime.test.ts:228` and `:266` exercise provisioning behavior, not unauthorized agent configuration rejection.

Disposition: **not remediated**. Reject execution-sensitive configuration from agent principals before persistence, including equivalent mutation/create paths; preserve authorized operator provisioning. Add negative tests for agent self-update/CEO update and positive operator tests. Shell portability repairs do not solve configuration authority.

## Codex inherited account/connectors

Primary source: [upstream advisory GHSA-gqqj-85qm-8qhf](https://github.com/paperclipai/paperclip/security/advisories/GHSA-gqqj-85qm-8qhf). GitHub lists `paperclipai <= 2026.403.0`, with no first-patched version in its current record.

- `packages/adapters/codex-local/src/server/codex-home.ts:7-8` copies shared configuration/instructions and links shared `auth.json`; `:104-128` performs this setup. Shared-auth behavior traces to `528505a04a`.
- `packages/adapters/codex-local/src/server/execute.ts:276-281` calls managed-home preparation by default. A per-company directory does not isolate the identity when auth is shared from the operator account.
- `packages/adapters/codex-local/src/index.ts:4` still sets the default approval/sandbox bypass to true; `server/src/routes/agents.ts:390-396` applies it to saved configurations. The executor's fallback false at `execute.ts:234-238` does not negate an explicitly saved true from creation defaults.
- `server/src/__tests__/codex-local-execute.test.ts:124-135` positively checks shared-auth material and copied config in the managed home. That is evidence the inherited identity remains intentional current behavior, not evidence of connector isolation.

Disposition: **not remediated / live connector exposure untested**. Require explicit tenant/operator authorization for account binding, avoid automatic shared auth/config inheritance, and use safe defaults. Existing managed homes/saved bypass values also need a reviewed migration strategy; changing defaults only affects new configurations. Do not test by sending email or touching a real mailbox.

## Release implications

The prior PR5 Trivy scan reported 233 OS findings (232 HIGH, one CRITICAL) and nine application findings (four HIGH, five CRITICAL). These are old-image section totals, not a scan of this merged candidate. Clearing these three code issues would not resolve all remaining OS/application findings.

The upstream migration candidate has passing source/conversion validation but no verified combined-image scan, and its server/CLI manifests also retain `0.3.1`. Do not treat its green test workflow as advisory clearance or merge it solely to change scanner output.

Next: implement and test the three actual trust-boundary repairs, run the merged-image scan without suppressions, then complete signed-image staging, CEO deliverable verification, recovery evidence and exact-release human approval. This report provides source-level evidence only; it does not certify a release.


## Candidate remediation (source only; validation pending)

- Company creation and global import preview/apply now require instance-admin or local-trusted operator authority. Company-scoped import application is also operator-only because imported execution configuration reaches the same runtime. Read-only company export/preview permissions are retained.
- Agent adapter/runtime configuration, adapter-type changes, configuration replacement/rollback, direct creation/hiring, and active-run configuration changes require operator authority. Harmless self metadata updates retain their existing authorization. This intentionally makes executable configuration an operator responsibility, including CEO hires; a future isolated tenant runtime can re-enable broader self-service safely.
- Codex managed homes move to `codex-home-isolated` under each company, without copying or linking host login/configuration. Old directories are left untouched. Host OpenAI/Codex API credentials are not implicitly inherited. Explicit operator-configured CODEX_HOME or tenant API keys remain supported.
- New Codex approval/sandbox bypass default is false. Existing saved true values and explicit homes are not silently rewritten: operators must review those configurations before rollout. No assumption is made that provider connector permissions are enforced solely by a local shell sandbox.
- Added route regressions covering rejected agent self-configuration, non-admin board configuration, alternate mutation paths, imports and company creation; trusted operator preview and ordinary metadata paths remain covered. Updated fake-Codex execution checks to assert no host key or authentication/config seeding.

Validation so far: direct bundled Node runtime probe passed distinct company homes, no inherited auth/config files, and unchanged shared fixture; git diff whitespace check passed. After the canonical frozen suite passed 1,087 tests with one existing skip, candidate dependencies were installed independently from the lockfile. The candidate authorization, company portability route, and fake-Codex execution suites passed all 25 tests across three files. Candidate-wide build, typecheck, and full-suite validation remain pending; the canonical full-suite result and earlier CI do not validate these new edits.

Rollout impact: existing Codex agents relying on shared operator login will need explicit tenant login in the new home or approved configuration binding. CEO agents cannot directly create/configure other host-executing agents until an operator performs that action. These restrictions are deliberate compatibility changes. Current production credentials/configuration were not altered.

Read-only live compatibility check: the actual embedded application database contains two instance-admin roles and 17 non-terminated agents: 12 OpenRouter, two Hermes Advanced, two Gemini Local, and one Claude Local. None uses Codex Local, an explicit Codex home, or a saved Codex sandbox-bypass flag. Therefore no currently registered non-terminated Codex agent requires a credential-home migration. This checks saved configuration only; it is not an execution test of the other adapters or proof of operator session access. No identities, credentials, or paths were printed, and no records changed.
