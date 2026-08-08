# Mini Data Center Tenant Pod

The Nexus AI Twin includes a tenant-scoped mini data center operations pod for demonstrations, training, workshops, simulations, and agent-assisted exploration.

## Operating model

Each selected tenant has an SLA, reserved power envelope, workload profile, and rack topology. The panel maps the active digital-twin telemetry into:

- IT and facility power
- Power usage effectiveness (PUE)
- Cooling overhead
- Rack inlet temperature
- Rack capacity and workload placement
- East-west network throughput
- Storage capacity, availability, alarms, and grid carbon context

The data source is always visible. `training simulation` means the values are generated from the twin simulator. `mapped DCIM` means a fresh normalized adapter payload is driving the panel. Feed age, adapter protocol, and stale fallback are visible in the tenant context band.

## Training scenarios

- **Normal operations:** read the baseline and identify headroom.
- **Tenant burst:** protect the SLA while GPU demand exceeds the reservation.
- **Hot aisle:** diagnose airflow loss and thermal risk.
- **Network loss:** isolate degraded east-west traffic.
- **UPS transfer:** validate continuity and shed flexible load.

Scenario outputs are advisory. Physical actuation remains locked until an authorized operator approves a change through a connected control plane.

## Agent tools

| Tool | Purpose |
| --- | --- |
| `dcim.inspect` | Summarize the current tenant pod and alarms. |
| `rack.thermal-map` | Compare inlet temperature and capacity by rack. |
| `tenant.capacity-plan` | Calculate rack headroom before workload admission. |
| `incident.runbook` | Produce a governed incident-response sequence. |
| `workshop.brief` | Generate a facilitator objective and evidence checklist. |

Every tool receives a context packet containing the tenant, source, active scenario, pod KPIs, racks, alarms, timestamp, and a no-actuation guardrail. Hosted tool runs are written to digital-twin provenance as `skill` events.

The toolbelt also exposes `mission.context`, `mcp.tools`, and `plugin.catalog`. Runtime, MCP, plugin, and skill sources remain visible in the interface and in each tool trace. MCP and plugin calls report `blocked` until their server-side gateways are configured; they never simulate a successful remote call.

## Know Do Be mini course

The thermal response project is a persistent three-stage learning state machine:

1. **Know:** confirm telemetry provenance, tenant SLA, and the operating model. Confirmation activates the hot-aisle training condition.
2. **Do:** create real tool evidence by completing `dcim.inspect`, `rack.thermal-map`, and `incident.runbook` calls.
3. **Be:** record the human principle governing the recommendation and issue project proof.

State is written immediately to device storage and synchronized to `project_learning_state` in D1. The server revalidates the evidence before accepting `complete`; a client cannot complete the project without the required successful tool traces and a meaningful reflection. Completion also enters the existing proof pipeline using the `mini-dc-thermal-response` mission ID.

## Mapping real data

Set the server-only `DCIM_INGEST_TOKEN`, then have a trusted Redfish, SNMP, Modbus, or DCIM gateway send normalized snapshots to `POST /api/telemetry/data-center` with `Authorization: Bearer <token>`. Browser clients never receive this token.

```json
{
  "id": "northstar-20260714T120000Z",
  "tenantId": "northstar-ai",
  "adapter": "redfish",
  "sourceSystem": "pod-bmc-gateway-01",
  "timestamp": "2026-07-14T12:00:00.000Z",
  "pod": {
    "itLoadKw": 61.4,
    "facilityKw": 78.2,
    "pue": 1.27,
    "coolingKw": 16.8,
    "networkGbps": 24.2,
    "storageTb": 448,
    "availabilityPercent": 99.99,
    "carbonGramsPerKwh": 281
  },
  "racks": [{
    "id": "rack-01",
    "label": "R01",
    "workload": "GPU inference",
    "powerKw": 15.2,
    "inletC": 24.1,
    "capacityPercent": 74,
    "networkGbps": 6.1
  }],
  "alarms": []
}
```

The Worker validates ranges, derives rack health consistently, stores the tenant snapshot in D1, and exposes the latest item through `GET /api/telemetry/data-center?tenantId=<tenant>`. The UI polls every 15 seconds. A reading older than 120 seconds is marked stale and the panel falls back to explicit simulation values. Scenario selection always enters training simulation, even when a live feed is available.

The upstream adapter remains responsible for vendor credentials, device polling, unit conversion, quality flags, and preserving raw audit data. This API is read-only telemetry; it cannot actuate facility equipment.

## Workshop flow

1. Select a tenant and explain its workload and SLA.
2. Read the source label and establish whether the evidence is simulated or mapped.
3. Choose an incident scenario.
4. Identify the highest-risk rack from the rack map.
5. Run an agent tool and review its context-bound output.
6. Compare the recommendation with the visible telemetry.
7. Record the human decision and verify recovery before closing the exercise.
