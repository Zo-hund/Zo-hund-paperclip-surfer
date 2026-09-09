# OpenRouter tenant credentials

AMX-AIR-HUBS only. Development source and verification artifacts remain in the F-drive OPPRRC workspace.

Company owners/admins manage their own OpenRouter key under Company settings → OpenRouter access. API routes enforce board identity, company membership, and admin role. Client/viewer roles retain existing permissions; a customer managing their own tenant must be an owner/admin of that company.

Keys use the existing encrypted company secret named `OPENROUTER_API_KEY`. Saving first validates against OpenRouter `GET /api/v1/key`, without model inference. Replacement rotates the secret, keeping existing latest-version references current. Responses and audit records contain no key material. The form clears submitted values and does not store them in query/mutation caches.

Runtime order:
1. Explicit agent environment key/secret reference.
2. Current company's `OPENROUTER_API_KEY` secret, resolved with company ownership checks.
3. Operator's server `OPENROUTER_API_KEY`, only for company UUIDs explicitly listed in server `PAPERCLIP_OPENROUTER_COMPANY_IDS`.

An empty, unresolved, rejected, disabled, or expired tenant key never falls through to operator billing. Changing the company default does not replace explicit agent overrides. Remove a stale override to use the new default.

Operator provisioning: set the server key privately and set `PAPERCLIP_OPENROUTER_COMPANY_IDS` to comma-separated approved company UUIDs, then recreate the app container. Wildcards are not supported. The VPS Compose file passes both variables to the app. No shared keys or grants are shipped in Git. All existing server-key consumers need an explicit grant before deploying this change; otherwise their runs will stop with a configuration error. This change does not alter budgets or create OpenRouter subkeys automatically.

API: `GET`, `PUT { value }`, `DELETE /api/companies/:companyId/openrouter-credentials`; `POST .../validate`. PUT validates before storage and returns 422 on rejection. GET returns configuration status, not proof of provider acceptance. Validation returns `{ valid, message }`. Removing a company default may switch to operator billing only if previously provisioned; the UI explains and confirms this effect.

Host tool boundary: this adapter's existing file and command tools run with server privileges, so they are disabled unless the company UUID is explicitly in server `PAPERCLIP_OPENROUTER_TRUSTED_TOOL_COMPANY_IDS`. This is separate from billing grants and must only include operator-controlled, trusted companies. Ungranted companies have model-only access; instruction/memory file reads and unexpected model tool calls are also blocked. Do not grant this to external tenants: use isolated workers for their coding tasks. Other adapter execution isolation is outside this credential change; do not treat company-scoped secret storage as proof that arbitrary host runtimes are safe for untrusted tenants.

Validation must cover tenant isolation, role restrictions, credential precedence, invalid-key rejection, sanitized errors, and successful company-key validation/storage. Production CBU credential remains unchanged until the code is deployed and a valid key is supplied privately. Do not claim the existing 401 is fixed by a local source change.

## Local verification (2026-09-09)

- 34 focused tests passed: credentials, tenant endpoint authorization and rate limits, company secret resolution, actual adapter rejection behavior, host-tool denial, and existing redaction tests.
- OpenRouter adapter typecheck passed. Focused TypeScript checks for the new UI and API/secret/redaction modules passed with the existing Express declarations included.
- Full recursive typecheck/build attempted; both stop in the separate `amx-air-hubs` Sites workspace due to missing dependencies in the verification image. Broader package checks also find missing dependencies for the plugin scaffolding package.
- The AMX UI bundle attempt stops on missing `html2canvas` in the verification image. The full test attempt reports three embedded database startup timeouts and stalls with `initdb` in disk I/O wait. Broader app typechecks also stall in disk I/O wait. These are incomplete checks, not a passing release gate.
- Verification used an isolated, network-disabled container from the existing local AMX image (Node 24.18.0, Vitest 4.1.8) with the F-drive source snapshot overlaid. It did not use production database volumes or invoke any paid model. The native F-drive dependency install was stopped after very slow progress and low available memory.
- Logs and focused-check configurations are under the F-drive OPPRRC reports and resources directories. Production deployment, live credential replacement, real-provider validation, and isolated tenant coding workers remain pending.
