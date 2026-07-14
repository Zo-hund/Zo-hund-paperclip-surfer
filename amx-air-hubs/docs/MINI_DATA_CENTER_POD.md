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

The data source is always visible. `training simulation` means the values are generated from the twin simulator. `mapped DCIM` means the base telemetry was received as sensor data. A mapped feed must preserve its timestamp and provenance.

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

## Mapping real data

Connect a sensor or DCIM adapter upstream of the existing twin telemetry transport. Normalize vendor-specific Redfish, SNMP, Modbus, BACnet, or DCIM fields into the `TwinTelemetry` contract in `src/digital-twin.ts`:

```ts
{
  timestamp: "2026-07-14T12:00:00.000Z",
  source: "sensor",
  energyKw: 82.4,
  temperatureC: 24.8,
  vibrationMmS: 0.7,
  throughput: 91,
  coolingPercent: 73,
  utilizationPercent: 68
}
```

The tenant pod derives rack context from this normalized envelope. For production operations, replace derived rack values with rack-specific readings in the same tenant context packet and retain the original device IDs, units, quality flags, and timestamps in the upstream adapter.

## Workshop flow

1. Select a tenant and explain its workload and SLA.
2. Read the source label and establish whether the evidence is simulated or mapped.
3. Choose an incident scenario.
4. Identify the highest-risk rack from the rack map.
5. Run an agent tool and review its context-bound output.
6. Compare the recommendation with the visible telemetry.
7. Record the human decision and verify recovery before closing the exercise.
