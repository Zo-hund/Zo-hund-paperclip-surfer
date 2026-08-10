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
- daily spending limits
- autopay thresholds
- human approval policy
- revenue split preview
- payment, wallet, metering, revenue, compliance, and treasury agents

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
