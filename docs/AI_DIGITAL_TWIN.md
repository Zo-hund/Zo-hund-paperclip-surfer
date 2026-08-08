# AI Digital Twin

AMX AIR Hubs treats a digital twin as an operational model, not a decorative copy. The runtime follows this governed loop:

1. **Observe** telemetry with an explicit `sensor` or `simulation` provenance label.
2. **Predict** health, risk, and an estimated intervention window.
3. **Simulate** baseline, peak-load, cooling-loss, and maintenance scenarios without touching equipment.
4. **Approve** a scenario result for operator handoff.
5. **Act** only through a separately configured, authenticated physical-control gateway.

The current stage implements steps 1-4. It never sends a physical actuator command. The interface states this directly and records scenario and approval events in D1.

## Blender asset contract

Run Blender 4.2 or newer in background mode:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 4.2\blender.exe' --background --python scripts\generate-digital-twin.py -- --project-root .
```

The generator writes:

- `assets/blender/amx-digital-twin.blend`: editable source scene.
- `public/models/amx-digital-twin.glb`: browser runtime asset.

Named nodes form the binding contract:

| Node | Role | Runtime binding |
| --- | --- | --- |
| `Twin_Asset_Core` | Physical asset | Health and risk color |
| `Sensor_Temperature` | Sensor | Temperature emission |
| `Sensor_Vibration` | Sensor | Vibration motion |
| `Sensor_Energy` | Sensor | Energy telemetry marker |
| `Actuator_Cooling` | Actuator | Cooling control metadata |
| `Actuator_Cooling_Rotor` | Actuator visual | Cooling-speed animation |
| `Screen_Twin` | Operator display | Future video/data texture |

Custom glTF extras identify `amx_role`, `metric`, `control`, and `twin_id` values so other Blender-authored assets can use the same runtime.

## Realtime and persistence

- Supabase Broadcast channel: `amx-twin-{ROOM}`.
- Local development fallback: `BroadcastChannel` with the same room scope.
- Scenario, approval, and reconstruction-skill audit: `POST /api/twins/events`.
- Audit retrieval: `GET /api/twins/events?room={ROOM}`.
- Spatial anchor persistence: `/api/anchors`.

Synthetic telemetry is generated at two-second intervals until a real sensor adapter publishes a packet with `source: "sensor"`. The UI never labels simulated values as physical telemetry.

## Conversational interface

The twin console packages current telemetry, forecast, provenance, and scenario context into the existing Agent Runtime request. A configured remote runtime can perform model-backed analysis. When it is absent, the UI keeps the response labeled as local orchestration.

## Production sensor adapter

A physical adapter should validate and normalize source events before broadcasting them to the room. Recommended inputs include MQTT, OPC UA, Modbus gateways, or vendor IoT APIs. Do not expose device credentials to the browser. Route commands through a Worker-side allowlist with operator identity, audit metadata, replay protection, and an emergency stop.
