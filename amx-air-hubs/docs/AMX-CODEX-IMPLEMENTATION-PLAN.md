# AMX LABS Implementation Plan

## Delivery policy

Each phase is a reviewable release with migrations, typed contracts, tests, documentation, and an explicit production approval. External services remain `pending` until exercised with verified credentials and a real provider response.

## Baseline already present

- Member accounts, Supabase authentication, tenant authorization, and RLS migrations.
- Partner, organization, AIR Connect, LMS, missions, stages, admissions, and XR experiences.
- Printful catalog/order boundaries, Stripe Checkout/Connect/webhooks, and x402 approval ledger.
- D1 runtime migrations, R2 media, PWA, production gates, and 200+ tests.

## Phases

| Phase | Deliverable | Exit gate |
| --- | --- | --- |
| 1 | Architecture, environment contract, core IDs, providers, audit schema, CI | Docs synchronized; migrations and checks pass |
| 2 | Unified multi-role identity and RBAC policy API | Role assignment and tenant isolation security tests pass |
| 3 | Product, SKU, serialized wearable registry and lifecycle | Activate, transfer, revoke, replace, and audit tests pass |
| 4 | Printful adapter hardening | Catalog, variants, mockups, webhooks, and fixtures pass; live smoke test gated |
| 5 | Provider-neutral orders and inventory | Idempotent order state machine passes |
| 6 | Stripe adapter behind PaymentRouter | Signed webhook, replay, refund, and reconciliation tests pass |
| 7 | AMX transaction and allocation ledger | Stripe events map to immutable AMX transactions |
| 8 | x402 adapter | 402, approval, settlement, and metering tests pass |
| 9 | Agent wallets and policies | Limits, vendors, categories, and human thresholds enforced |
| 10 | Digital twins and asset registry | Provenance and ownership APIs pass |
| 11 | NFC/QR resolver | Public/private/owner policy matrix passes |
| 12 | Mobile WebAR wearable experience | HTTPS phone device certification passes |
| 13 | Partners and AIR-HUB economics | Tenant revenue policies and access tests pass |
| 14 | Agent service marketplace | Discovery, invocation, metering, and SLA audit pass |
| 15 | Optional crypto/NFT adapters | Custody boundary and chain-neutral mapping pass |
| 16 | Unified control center | Operator workflows expose real status and approvals |
| 17 | Security, QA, queues, observability | Threat model and operational acceptance pass |
| 18 | Production rollout | Reproducible build, rollback, monitoring, and approval complete |

## Immediate Release 151 scope

1. Commit the architecture source of truth.
2. Add foundational provider, transaction, wearable, agent wallet, and audit entities.
3. Expand `.env.example` without credentials.
4. Add CI for typecheck, tests, build, secret patterns, and migration presence.
5. Add contract tests that prevent vendor IDs becoming AMX system IDs.

## Deferred deliberately

- Next.js migration: the production Vite/Worker stack is functioning; migration needs a measured requirement.
- Redis: introduce with the first durable background workflow, not as an unused dependency.
- Blockchain minting: no chain is selected and AMX registry remains authoritative.
- Physical NFC programming: requires selected hardware and device certification.
- Live payment or fulfillment calls in CI: use fixtures; run live smoke tests only in protected environments.

