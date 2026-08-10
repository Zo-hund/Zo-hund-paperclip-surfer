# AMX x402 Agent Economy

AMX uses x402 as the agent-to-agent payment layer for paid skills, partner services, metered APIs, and marketplace workflows.

## Runtime Path

```text
AMX identity
  -> service discovery
  -> quote
  -> budget and approval policy
  -> x402 payment requirement
  -> retry paid service
  -> result
  -> metering and revenue ledger
```

The wearable, QR, or membership card identifies the member or partner. It does not hold payment credentials. Wallet and payment permissions stay behind the operator-governed connection layer.

## Operator Surface

The operator console is available at:

```text
/control/economy
```

It provides:

- AMX service pricing
- member asset discounts
- simulated `402 Payment Required` flow
- server quote and authorization calls
- operator approval queue
- payment, approval, and meter ledger rows
- daily spending limits
- autopay thresholds
- human approval policy
- revenue split preview
- payment, wallet, metering, revenue, compliance, and treasury agents

## Backend Contract

Release 149 adds server-side endpoints for the agent payment loop:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/x402/health` | Reports x402 runtime readiness, missing env vars, settlement mode, and service catalog. |
| `POST /api/x402/quote` | Creates an auditable quote and returns `402 Payment Required` when payment is needed. |
| `POST /api/x402/authorize` | Blocks over-budget work, queues operator approvals, or records simulated/live authorization. |
| `GET /api/x402/ledger?tenantId=...` | Returns recent quote events, approval requests, and metered service usage. |
| `POST /api/x402/admin/approvals/:id` | Operator-only approval decision endpoint. |

Configure these secrets before live settlement:

```text
X402_FACILITATOR_URL=https://...
X402_WALLET_ADDRESS=0x...
X402_SIGNING_KEY=...
X402_SETTLEMENT_ENABLED=false
```

Keep `X402_SETTLEMENT_ENABLED=false` until the facilitator, wallet, signing policy, RLS, and operator approval runbook have all passed staging.

## Connections

The x402 provider is managed in:

```text
/connections
```

Use the x402 connection for:

- `discover`
- `quote`
- `authorize`
- `pay`
- `verify`
- `settle`
- `reconcile`

Live settlement should stay inactive until a real wallet, facilitator, signing policy, and operator approval flow are configured.

## Revenue Model

The default simulation split is:

- 60% service provider
- 20% AMX platform
- 10% AIR-HUB
- 10% partner or creator

Final percentages should come from partner contracts, event policies, and tenant configuration.
