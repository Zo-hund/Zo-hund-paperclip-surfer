# Production readiness

AMX AIR Hubs has two operational tiers. `staging` permits explicitly selected required services. `production` requires database, media, realtime rooms, remote agents, MCP, plugins, LiveKit, Runway, proof signing, DCIM telemetry, and operations alerts. `/api/ready` returns `503` until all required services are configured.

## Release gate

1. Configure every key documented in `.env.example` in the hosted environment.
2. Set `DEPLOYMENT_TIER=production` only after the integrations are provisioned.
3. Run `pnpm gate:production -- --runtime-only https://amx-hubs.cc` to check runtime, routes, headers, and LiveKit token issuance.
4. Copy `docs/device-certification.example.json` outside source control, complete the physical-device matrix, and set `AMX_DEVICE_CERTIFICATION_PATH` to that file.
5. Run `pnpm gate:production https://amx-hubs.cc`. General availability requires a passing result.

## Physical-device matrix

Use two authenticated members in the same venue. Verify camera and microphone permission, remote video/audio, reconnect after network interruption, participant presence, and stage promotion. On Quest 3, also verify immersive entry, controller rays, locomotion, recentering, handoff between 2D and WebXR, and a stable 72 FPS target in the venue.

## Load and recovery

- Soak LiveKit and Supabase presence for at least two hours at the intended launch concurrency.
- Confirm alerts fire for a forced `500`, LiveKit disconnect, and failed readiness check.
- Export D1 and R2 backups, restore them into an isolated environment, and record recovery time.
- Rehearse rollback to the prior saved Sites version.

## Data operations

New private media records are stamped with the authenticated owner and cannot be read or deleted by another member. Operators retain support access. Keep retention periods, deletion requests, exports, moderation, and incident records in the organization operations register.

## Enterprise remote production backlog

### Contribution and collaboration

- [ ] Register every Pod, Room, phone, browser, WebXR camera, screen share, agent, and professional encoder as a stable named production source.
- [ ] Add remote contributor onboarding with camera, microphone, return-audio, network, battery, and orientation checks.
- [ ] Add WHIP ingest for browser and hardware contribution.
- [ ] Add SRT ingest for professional field cameras and unreliable mobile networks.
- [ ] Provision TURN redundancy and verify restrictive carrier and enterprise-network traversal.
- [ ] Enable LiveKit simulcast or SVC layers and adaptive subscriptions for preview monitors.
- [ ] Add local isolated recording on contributor devices for interrupted-network recovery.
- [ ] Add operator talkback, private producer channels, mix-minus, and remote guest return video.

### Production control

- [ ] Present all remote feeds in the Live Camera Team multiview with preview, program, tally, health, latency, and audio meters.
- [ ] Support preview, TAKE, AUTO, cut, dissolve, stinger, and emergency fallback transitions.
- [ ] Persist camera routes, show cues, media routes, sponsor timing, and operator ownership across reconnects.
- [ ] Add role-scoped director, technical director, camera, audio, graphics, and producer controls.
- [ ] Add synchronized remote PTZ, virtual camera, avatar, NPC, robotics, lighting, VFX, and screen-routing commands.
- [ ] Add ISO recording for every camera and a clean program recording.
- [ ] Keep Streamlabs and OBS as output adapters while AMX remains the authoritative show-state controller.

### Enterprise rendering

- [ ] Provision regional GPU workers for Three.js, WebGPU, WebXR, avatar, virtual-set, and graphics rendering.
- [ ] Produce configurable 1080p30, 1080p60, 1440p, and 4K program profiles.
- [ ] Add deterministic scene-state replay so a failed renderer can resume on a standby worker.
- [ ] Add lower thirds, captions, sponsor kits, timers, animations, score cues, and alpha-channel graphics.
- [ ] Separate low-latency operator preview from high-quality program encoding.
- [ ] Measure GPU frame time, encoder time, glass-to-glass latency, dropped frames, and A/V sync.

### Distribution and audience

- [ ] Route program output to AMX Stage, Streamlabs, OBS, RTMP/RTMPS, SRT, HLS, and supported social destinations.
- [ ] Add adaptive-bitrate HLS packaging and CDN distribution for large audiences.
- [ ] Add destination-specific keys from the Connections Vault without exposing credentials to browsers.
- [ ] Add simultaneous primary and backup destinations with independent health reporting.
- [ ] Add captions, transcripts, language channels, accessibility audio, and audience quality selection.
- [ ] Connect ticket and pass entitlements to private live streams, replays, and downloadable resources.

### Reliability, security, and operations

- [ ] Select regional media and rendering edges from contributor and audience location without storing unnecessary precise location data.
- [ ] Add automatic reconnect, source freeze detection, slate fallback, failover ingest, and standby renderer promotion.
- [ ] Add end-to-end encryption where compatible, short-lived room tokens, tenant RLS, consent, and recording indicators.
- [ ] Add provider health checks, credential-expiration alerts, rotation, revocation, and immutable operator audit history.
- [ ] Load test expected contributors, operators, rooms, and audience concurrency at target bitrates.
- [ ] Run a two-hour production soak with network loss, device rotation, backgrounding, and renderer failure drills.
- [ ] Document incident response, content moderation, retention, deletion, export, and broadcast-rights procedures.

### Distributed acceptance scenario

- [ ] A host at the Louisville, Kentucky waterfront joins over a mobile connection with camera and microphone.
- [ ] A producer in New York joins the same production from a separate network and receives multiview plus talkback.
- [ ] The New York producer previews and takes the Louisville camera without exposing production credentials.
- [ ] AMX composites the field camera, remote guest, Three.js/WebGPU environment, graphics, captions, and sponsor cue on a GPU worker.
- [ ] The program reaches AMX Stage and one external destination with synchronized audio and video.
- [ ] A simulated Louisville network interruption triggers fallback, reconnect, and isolated-recording recovery without ending the show.
- [ ] The run records source health, route changes, operator actions, output health, latency, dropped frames, and recovery time.
- [ ] Production approval requires acceptable results on phone, desktop, Quest 3, and a public audience connection outside both contributor networks.
