# AMX AIR Hubs

AMX AIR Hubs is an installable WebXR/WebAR operations portal for agent-assisted missions, LiveKit Skill Pods, Three.js/WebGPU scenes, geospatial anchors, portable proof, and multimodal Agent Toolbelts.

## Current Production Surface

- React 19 and Vite client with responsive desktop/mobile navigation.
- Three.js WebGPU renderer with WebGL fallback and WebXR session support.
- Meta IWSDK Quest runtime with ECS inspection, IWER controller emulation, locomotion, grabbing, and Havok physics.
- Camera-based AR, LiveKit room media with verified mic/playback diagnostics, and local self-view fallback.
- LiveKit screen sharing plus participant video routed into Blender-authored world displays.
- HLS/MP4/WebM media playback linked to an in-world Three.js video panel.
- Google Maps search, selection, shared geo anchors, and agent location context.
- Selectable Three.js world cameras, consent-gated live vision scans, and archived Ready Player Me GLB avatar loading.
- Governed AI digital twin with Blender node bindings, predictive risk, sandbox scenarios, approvals, and durable audit events.
- Reality reconstruction skills for spatial capture, semantic meshing, generated PBR textures, light matching, anchor alignment, and validation artifacts.
- Supabase Realtime room messaging with local BroadcastChannel fallback.
- Multimodal agents for text, audio, images, video, code, GLB, PDF, and documents.
- Server-side Agent Runtime, MCP, and Plugin gateway contracts.
- D1 persistence for proof, analytics, media metadata, and agent-run telemetry.
- R2 object storage for agent attachments up to 25 MB.
- Server-side HMAC proof attestation when `PROOF_SIGNING_SECRET` is configured.
- Liveness, readiness, request tracing, bounded inputs, security headers, and structured logs.
- Owner-only HTTPS deployment through Sites.

## Quick Start

Requirements: Node.js 20+ and pnpm 9.15.4.

```powershell
pnpm install --frozen-lockfile
pnpm --filter @amx/air-hubs dev
```

Run `pnpm --filter @amx/air-hubs dev:status` and open the reported runtime URL. IWSDK manages the development browser and port; Vite development uses browser-local fallbacks because the Cloudflare Worker bindings are available only in the Worker runtime.

Run the complete local verification:

```powershell
pnpm --filter @amx/air-hubs verify
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Integrations](docs/INTEGRATIONS.md)
- [API Reference](docs/API.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Operations Runbook](docs/OPERATIONS.md)
- [Security Model](docs/SECURITY.md)
- [Mini Data Center Tenant Pod](docs/MINI_DATA_CENTER_POD.md)
- [IWSDK Quest WebXR Runtime](docs/IWSDK_QUEST_WEBXR.md)
- [Unity Quest Integration](docs/UNITY_QUEST_INTEGRATION.md)

## Production Readiness

`GET /api/health` is the liveness probe. `GET /api/ready` evaluates the services listed in `REQUIRED_SERVICES`. The Control Center exposes the same state at `/control/runtime`.

The private stage can run in `degraded` mode while optional Agent, MCP, Plugin, Supabase, and LiveKit integrations are absent. Configure them and add their names to `REQUIRED_SERVICES` when the deployment must fail closed without them.

## Source Layout

| Path | Responsibility |
| --- | --- |
| `src/` | React application, XR runtime, agents, realtime, and operations |
| `worker.js` | Cloudflare Worker API, gateways, storage, readiness, and security |
| `db/schema.sql` | Canonical D1 schema |
| `drizzle/` | Deployment migration copied into the Sites archive |
| `tests/` | Worker API contract suite |
| `public/` | PWA manifest, service worker, brand, and GLB assets |
| `.openai/hosting.json` | Sites project plus logical D1/R2 bindings |
