# AMX LABS Architecture

## System intent

AMX LABS is a tenant-scoped wearable identity, learning, XR, commerce, and agent-economy platform. AMX identity and AMX transaction records are authoritative. Stripe, Printful, x402 facilitators, wallet providers, storage providers, and XR runtimes are replaceable adapters.

## Current architecture inventory

| Capability | Current implementation | Status |
| --- | --- | --- |
| Web application | React 19, TypeScript, Vite, responsive PWA | Implemented |
| API runtime | Cloudflare-compatible Worker in `worker.js` | Implemented |
| Durable hosted state | D1 migrations in `drizzle/` | Implemented |
| Identity database | Supabase/Postgres migrations with RLS | Implemented |
| Authentication | Supabase Auth, server token verification, tenant authorization | Implemented |
| Object storage | Sites `MEDIA` R2 binding and media API | Implemented |
| XR | Three.js, WebGL/WebGPU, WebXR, IWS SDK, LiveKit presence | Implemented |
| Commerce | Stripe Checkout/Connect and Printful adapter boundaries | Partial; credentials and live products are environment-dependent |
| Agent payments | x402 quote, approval, metering, and ledger APIs | Partial; live settlement is environment-dependent |
| Wearable registry | QR/NFC scanning primitives and membership identity | Partial; serialized wearable lifecycle is Phase 3 |
| Blockchain | No authoritative chain dependency | Pending adapter |
| Queue/cache | No Redis runtime | Pending; do not claim durable jobs until introduced |

## Deployment shape

The production system remains a modular monolith while contracts stabilize:

```text
Browser / Quest / mobile scanner
              |
              v
React PWA + WebXR clients
              |
              v
AMX Worker API and policy boundary
   |          |          |          |
   v          v          v          v
 D1       Supabase      R2      External adapters
runtime   identity/RLS media   Stripe/Printful/x402/LiveKit
```

This is intentionally not converted into a monorepo yet. The existing application has one deployable runtime and extensive cross-feature tests. Packages will be extracted when an independently deployed service, worker, or ownership boundary exists.

## Domain boundaries

- **Identity:** users, memberships, roles, organizations, partners, and AIR-HUB affiliations.
- **Wearables:** serialized physical identity, lifecycle, NFC/QR references, ownership, and resolver policy.
- **Assets:** digital twins, credentials, collectibles, access assets, ownership, and provenance.
- **Commerce:** AMX products, variants, orders, fulfillment, inventory, and provider mappings.
- **Payments:** quotes, attempts, transactions, settlement, refunds, and allocations.
- **Agents:** agent identities, skills, policies, wallets, runs, approvals, and tool audit events.
- **Experiences:** WebAR/WebXR scenes, events, stages, pods, media, and access decisions.
- **Operations:** health, telemetry, security events, release gates, and incident evidence.

## Source-of-truth rules

1. AMX IDs are provider-independent and immutable.
2. Provider IDs are mappings, never primary business identifiers.
3. Payment success is accepted only from a verified provider response or signed webhook.
4. A scan authenticates a wearable reference, not the scanner or owner.
5. Public resolvers return allowlisted public fields only.
6. All sensitive mutations produce an audit event and execution ID.
7. Agents use the same authorization paths as humans and cannot bypass approvals.
8. Every environment reports whether an integration is live, simulated, or unavailable.

## Target extraction path

When justified, extract packages in this order: `payments`, `wearables`, `identity`, `agents`, `printful`, then background jobs. Keep typed contracts in a shared package and preserve REST compatibility throughout extraction.

