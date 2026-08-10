# AMX LABS Security Model

## Trust boundaries

- Public browser, QR scanner, and NFC reader are untrusted clients.
- Authenticated members are not automatically operators or owners of scanned objects.
- Worker APIs enforce authentication, tenant scope, role, object ownership, and action policy.
- Provider webhooks are untrusted until signature, timestamp, payload size, and replay checks pass.
- Agents are service identities with narrower permissions than operators.

## Authorization decision

Every sensitive operation evaluates:

```text
authenticated actor
+ active tenant membership
+ required role/capability
+ object scope or ownership
+ action policy
+ approval state when required
= allow or deny with audit event
```

Multiple roles are additive only where policy explicitly permits. `ADMIN` is not a cross-tenant bypass.

## Wearable security

- Tags contain an opaque AMX wearable ID or signed resolver URL only.
- Payment credentials, wallet keys, private profile data, and authorization claims never live on a tag.
- Wearable authenticity and scanner authorization are separate decisions.
- Public scans return minimal allowlisted information.
- Owner data requires an authenticated owner relationship.
- Lost, revoked, replaced, transferred, or retired wearables cannot authenticate as active.
- Resolver requests are rate-limited and monitored for enumeration and replay.

## Payments and wallets

- Secrets and signing keys are server-only.
- All mutations require idempotency keys.
- Amount and currency are verified against the AMX quote/order before settlement.
- Signed webhooks are the source of asynchronous provider state.
- Agent policies enforce daily, transaction, vendor, service, and category limits.
- Large, novel, treasury, ownership, contract, refund, policy, and production actions require human approval.
- Crypto private keys are held by a dedicated custody/signing provider, never the application database.

## Data protection

- Supabase tables use RLS and least-privilege grants.
- D1 APIs are never exposed as direct database access.
- Sensitive values are encrypted by managed platform services and redacted from logs.
- R2 assets are private unless an explicit public delivery policy exists.
- Audit payloads use IDs and bounded metadata, not raw secrets or payment details.

## Required security tests

- Cross-tenant read and write denial.
- Role escalation and ownership override denial.
- Public scan privacy matrix.
- Webhook signature, timestamp, replay, and body-size rejection.
- Payment idempotency and amount mismatch rejection.
- Agent tool permission and wallet limit enforcement.
- Revoked wearable denial.
- Secret-pattern and unsafe public-environment checks.

## Incident controls

Security events carry an execution ID, actor, tenant, resource, action, outcome, timestamp, and bounded metadata. Operators can revoke tokens, wearables, provider connections, agent policies, and sessions without deleting the audit trail.

