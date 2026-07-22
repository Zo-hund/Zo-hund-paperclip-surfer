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
