# AMX Payment Architecture

## Principle

One AMX transaction record may map to multiple provider attempts. Provider objects are evidence and mappings; they are not the AMX system of record.

```text
Order or service
  -> AMX payment quote
  -> policy and actor evaluation
  -> PaymentRouter
  -> Stripe | x402 | crypto adapter
  -> provider verification
  -> AMX transaction
  -> allocations, settlement, reconciliation, audit
```

## Core contracts

`PaymentQuote` contains AMX order/service ID, actor, amount, currency, allowed rails, expiry, and policy result.

`PaymentAttempt` contains AMX attempt ID, selected adapter, provider reference, idempotency key, status, and sanitized failure data.

`Transaction` uses `AMX-TX-YYYY-NNNNNNNNN`, records the economic event, and is immutable except through append-only status events.

`RevenuePolicy` produces allocations for provider, AMX, AIR-HUB, partner, creator, tax, and fees. Percentages are data, never constants in routing code.

## Adapter interface

Each adapter implements quote capability, authorize, capture/settle when applicable, verify, refund when applicable, reconcile, and normalizeWebhook. Business services consume only normalized AMX results.

## Rail selection

- Human physical, membership, and conventional digital checkout: Stripe by default.
- Agent/API usage: x402 when service and policy allow it.
- Stablecoin/crypto: optional configured adapter under custody policy.
- No available compliant rail: fail closed and return actionable configuration status.

## Idempotency and replay

- Client mutation supplies or receives one AMX idempotency key.
- The key is unique per tenant, operation, and economic intent.
- Webhook event IDs are stored before processing.
- Replays return the existing normalized result and do not duplicate fulfillment or allocation.

## Existing implementation

Stripe Checkout, membership billing, Connect onboarding/transfers, signed webhooks, Printful submission, and x402 quote/approval/meter events exist in the Worker. Release 151 introduces provider-neutral ledger foundations; later phases migrate existing flows behind shared typed adapters without breaking their routes.

## Human approval

Agents cannot approve their own policy changes or threshold exceptions. Approval records identify request, approver, decision, reason, policy version, expiry, and execution ID.

