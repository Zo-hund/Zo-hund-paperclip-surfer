# AMX AIR Connect v0.2

AMX AIR Connect treats compliant upstream internet capacity as tenant-scoped inventory: buy, pool, allocate, push, consume, meter, reclaim, reallocate, and report.

## Acceptance Run

The operator module at `/control/air-connect` drives this deterministic mission:

1. Register a provider contract with multi-user, commercial-use, guest, multi-tenant, and pooling rights.
2. Register a vendor-neutral edge node.
3. Create a 5,000,000 MB pool backed by 2,000/1,000 Mbps service and $1,500 upstream cost.
4. Allocate Room A 250,000 MB, 500/250 Mbps, a 100 Mbps guarantee, 700 Mbps burst, 33 users, 40 devices, 30 learners, 3 trainers, and 3 agents.
5. Start the LiveKit runtime and queue a signed P0-P5 network policy.
6. Wait for the edge acknowledgement before representing the network policy as applied.
7. Record 91,000 MB of aggregate usage and health telemetry.
8. Close the room, stop admissions, queue policy removal, return 159,000 MB, issue completion rewards, and generate a cost/utilization report.

The example room consumes 1.82% of the monthly pool, so its allocated upstream cost is $27.30. The report stores aggregate utilization only; browsing history is never collected.

## APIs

Operator and Agent Zero use the existing tenant-scoped state and action endpoints. Every mutation requires explicit operator approval; Agent Zero also requires current ZKODE verification.

- `GET /api/air-connect/state?tenantId={tenant}`
- `POST /api/air-connect/actions`
- `GET /api/board/agent/air-connect/state?tenantId={tenant}`
- `POST /api/board/agent/air-connect/actions`

Actions: `register_provider`, `register_edge_node`, `create_pool`, `allocate_room`, `start_room`, `resize_room`, `record_usage`, and `close_room`.

The edge agent uses a separate bearer boundary:

- `POST /api/air-connect/edge/heartbeat`
- `GET /api/air-connect/edge/commands?tenantId={tenant}&nodeId={node}`
- `POST /api/air-connect/edge/commands/{command}/ack`
- `POST /api/air-connect/edge/usage`

## Edge Agent

`edge/amx-edge-agent.mjs` verifies every command signature and expiry before touching an adapter. It polls every five seconds, heartbeats every 30 seconds, and submits aggregate usage every 60 seconds. `AIR_EDGE_ADAPTER_URL` must expose `POST /commands` and `GET /usage?runtimeId=...`.

For a local acceptance run, set `AIR_EDGE_SIMULATION=true` and run `pnpm edge:once`. Simulation acknowledgements are labeled as simulation and are not evidence that a physical router changed.

## Security

- Worker and edge share separate `AIR_EDGE_NODE_TOKEN` and `AIR_EDGE_COMMAND_SIGNING_KEY` secrets.
- Network commands are HMAC-SHA256 signed, nonce-bearing, and expire after five minutes.
- No unsigned or expired command is applied.
- Provider contract rights are checked before a pool is created.
- Member routes require the operator role when authentication is enabled.
- The resource ledger is append-only and tenant scoped.
- Applied state requires edge acknowledgement; queued state is not presented as online.
- The adapter is vendor-neutral. A hardware-specific implementation remains isolated behind its local HTTP boundary.
- Ed25519 asymmetric signing is the recommended next hardening step when edge fleet key rotation is introduced.
