# AMX Agent System

## Model

Agents are governed service identities. An agent has tenant membership, roles, allowed skills, tool permissions, wallet policy, approval thresholds, runtime status, and immutable run history. Agent text is never authorization.

## Agent domains

Strategy: CEO. Product operations: Product, Design, Printful, SKU, Order, Inventory, Customer, Marketing, QA. Identity and experience: Wearable, Identity, Partner, AIR-HUB, AR, XR, Asset, Blockchain. Economy and control: Payment, Economy, Wallet, Metering, Revenue, Compliance, Treasury, Analytics, Security.

## Skill contract

Every reusable skill defines:

```yaml
id: amx-skill-name
purpose: bounded outcome
inputs: typed and validated
outputs: typed result and evidence
permissions: required capabilities
tools: allowlisted adapters
validation: preconditions and postconditions
failure_states: explicit safe failures
audit_events: start, tool calls, decision, completion
human_approval: none or named threshold/policy
```

Initial catalog covers product discovery/create/review, brand/artwork/mockup, SKU/NFC/wearable lifecycle, identity/partner/AIR-HUB, AR/twins/assets, optional NFT mapping, orders/inventory/shipping, support, payments, wallets, metering, revenue, analytics, security, and release validation.

## Execution path

```text
request -> authenticate agent -> select tenant and skill
-> validate inputs -> authorize skill and tools
-> evaluate wallet/action policy -> request approval if required
-> invoke allowlisted adapter -> validate result
-> append audit and usage events -> return bounded result
```

Each run has an execution ID propagated to provider calls, payment attempts, approval records, metering, and logs.

## Wallet policy

Policies define currency, balance, per-transaction and daily limits, allowed vendors, categories, services, rails, and approval threshold. Denials are final for that execution unless an authorized human creates a separate approval decision.

## Safety boundaries

- No arbitrary MCP/plugin/tool invocation from model text.
- No production publishing, treasury action, ownership override, large refund, contract change, policy change, or deployment without human approval.
- No direct database or secret access from an agent prompt.
- No claim that a provider action occurred without a verified adapter result.
- Simulation and live execution are visibly distinct and fail fast when mismatched.

## Evaluation

Tests cover persona dispatch, skill selection, permissions, argument validation, approval routing, wallet limits, provider failure, audit completeness, simulation/live mode, and prevention of generic fallback personas.

