# AMX AIR Hubs

AMX AIR Hubs is an installable WebXR/WebAR operations portal for agent-assisted missions, LiveKit Skill Pods, Three.js/WebGPU scenes, geospatial anchors, portable proof, and multimodal Agent Toolbelts.

## Current Production Surface

- React 19 and Vite client with responsive desktop/mobile navigation.
- Three.js WebGPU renderer with WebGL fallback and WebXR session support.
- Meta IWSDK Quest runtime with ECS inspection, IWER controller emulation, locomotion, grabbing, and Havok physics.
- Camera-based AR, LiveKit room media with verified mic/playback diagnostics, and local self-view fallback.
- Decart Lucy 2.5 realtime AI camera transformations with Worker-minted, origin-scoped client tokens and direct Stage screen/camera routing.
- LiveKit screen sharing plus participant video routed into Blender-authored world displays.
- LiveKit multiplayer creation sessions for solo, co-op, and team play with synchronized safe Three.js world blueprints, agent code review, organization tags, and governed XR Stage showcase promotion.
- Native AMX Mission World with 30 persistent learning checkpoints and five real-client simulators where learners assign roles, configure costed toolbelts, plan solutions, run dynamic events, inspect weighted outcomes and consequences, improve, pass human approval, and capture OPPRRC evidence.
- Three-bus Nexus production switcher with independent preview/program routing, whole-room layouts, persistent cues, and AMX Labs / AMX AIR HUBS.CC stingers.
- AMX XR Stage with WebGPU venue cameras, routable LiveKit multicamera feeds, animated camera-operator NPCs, synchronized Summit/XR Con/Expo venues, Pod-to-stage promotion, tiered admission passes, audience/VIP seating, and governed sponsor slates.
- Synchronized 720p30, 1080p30, and 1080p60 Stage profiles with actual camera-resolution diagnostics, LiveKit simulcast high-layer routing, and protected selectable RoomComposite egress.
- Enterprise pre-production, show-runtime, and post-production workflow with crew call sheets, preflight gates, approvals, timed Pod/Main Stage rundowns, director holds, durable activity evidence, delivery tracking, and production-report export.
- Private Stage audio uploads with rights confirmation, real Deck A/B playback, synchronized stingers, Web Audio mixing, local preview, and LiveKit program-bus publication.
- Studio audio mixing with processed 48 kHz voice, independent program and atmosphere buses, live meters, channel switches, master mute, and direct Nexus room or podcast handoff.
- Cue-follow show scoring with a shared beat clock, programmable Three.js lighting looks, safe music-synchronized VFX, and procedural transitions on the LiveKit program mix.
- HLS/MP4/WebM media playback composited onto dedicated in-world Three.js display meshes with Fit and Fill modes.
- Google Maps search, selection, shared geo anchors, and agent location context.
- Selectable Three.js world, LiveKit Pod, and browser-visible external cameras with consent-gated agent vision, operator assignment, bounded realtime feedback, and human-approved MCP/skill tool calls.
- NPC avatar direction with named room waypoints, D-pad and focused keyboard movement, double-click navigation, speed control, procedural actions, patrol behavior, and assigned-agent cues.
- Runway Characters realtime avatars with microphone, camera, screen context, transcripts, in-world screen routing, and an AMX client-action toolbelt.
- Tenant-branded 3D digital membership cards with profile QR verification and native sharing.
- Supabase member accounts with email/password and passwordless entry, private-by-default profiles, public credential links, database roles, and one-time operator invitations.
- TECH AT NITE membership commerce with ten business-model tiers, Stripe-hosted subscriptions, signed lifecycle webhooks, member billing management, and role-safe entitlements.
- Supabase Partner Portal with role-governed organizations, email-bound team invitations, branded mission campaigns, QR distribution, attribution funnels, and outcome-report export.
- Durable Skill Pod showcase invitations with guest roles, expiry, capacity, QR links, acceptance lobbies, and owner-key revocation.
- Above-the-fold Nexus workspace with a persistent 3D world, task-scoped NPC/Avatar/Pod/Media/Vision rail, pinned action feedback, and independent mobile control scrolling.
- Governed AI digital twin with Blender node bindings, predictive risk, sandbox scenarios, approvals, and durable audit events.
- Reality reconstruction skills for spatial capture, semantic meshing, generated PBR textures, light matching, anchor alignment, and validation artifacts.
- Supabase Realtime room messaging with local BroadcastChannel fallback.
- Multimodal agents for text, audio, images, video, code, GLB, PDF, and documents.
- Server-side Agent Runtime, MCP, and Plugin gateway contracts.
- D1 persistence for proof, analytics, media metadata, Stage production workflows, and agent-run telemetry.
- R2 object storage for agent attachments up to 25 MB.
- Server-side HMAC proof attestation when `PROOF_SIGNING_SECRET` is configured.
- Liveness, readiness, request tracing, bounded inputs, security headers, and structured logs.
- Public HTTPS discovery through Sites with application-level member and operator access controls.

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

- [Stage WebXR venues](docs/STAGE_WEBXR_VENUES.md)

- [Architecture](docs/ARCHITECTURE.md)
- [Integrations](docs/INTEGRATIONS.md)
- [API Reference](docs/API.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Operations Runbook](docs/OPERATIONS.md)
- [Security Model](docs/SECURITY.md)
- [Member Accounts](docs/MEMBER_ACCOUNTS.md)
- [Partner Portal](docs/PARTNER_PORTAL.md)
- [Organization Console](docs/ORGANIZATION_CONSOLE.md)
- [Mini Data Center Tenant Pod](docs/MINI_DATA_CENTER_POD.md)
- [IWSDK Quest WebXR Runtime](docs/IWSDK_QUEST_WEBXR.md)
- [Unity Quest Integration](docs/UNITY_QUEST_INTEGRATION.md)
- [Multiplayer Metaverse Studio](docs/MULTIPLAYER_METAVERSE.md)
- [Agent Vision Operations](docs/AGENT_VISION.md)
- [AMX Mission World](docs/MISSION_WORLD.md)

## Production Readiness

`GET /api/health` is the liveness probe. `GET /api/ready` evaluates the services listed in `REQUIRED_SERVICES`. The Control Center exposes the same state at `/control/runtime`.

The private stage can run in `degraded` mode while optional Agent, MCP, Plugin, Supabase, LiveKit, and Runway integrations are absent. Configure them and add their names to `REQUIRED_SERVICES` when the deployment must fail closed without them.

### Decart realtime AI camera

Set the Worker-only `DECART_API_KEY` environment variable. Operators can then open Stage > Show, start the Decart Lucy 2.5 camera, update the visual prompt without reconnecting, and select `AI CAMERA / LUCY 2.5` from Live Camera Team or the three-screen routing matrix. The Worker mints a five-minute token restricted to Lucy 2.5 and the current site origin; the permanent key is never included in browser code.

## Source Layout

| Path | Responsibility |
| --- | --- |
| `src/` | React application, XR runtime, agents, realtime, and operations |
| `worker.js` | Cloudflare Worker API, gateways, storage, readiness, and security |
| `db/schema.sql` | Canonical D1 schema, including pod showcase invitations |
| `drizzle/` | Deployment migration copied into the Sites archive |
| `tests/` | Worker API contract suite |
| `public/` | PWA manifest, service worker, brand, and GLB assets |
| `.openai/hosting.json` | Sites project plus logical D1/R2 bindings |
