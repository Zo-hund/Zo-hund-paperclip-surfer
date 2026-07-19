# Deployment

## Build Gate

Run from the repository root:

```powershell
pnpm --filter @amx/air-hubs verify
```

This runs TypeScript, the Worker API contract suite, the Vite production build, and Worker packaging. Do not deploy a revision that fails this command.

## Sites Resources

`.openai/hosting.json` declares:

```json
{
  "project_id": "appgprj_6a54dc8f3c648191846a2f44cad05c0b",
  "d1": "DB",
  "r2": "MEDIA"
}
```

Sites owns the actual D1 and R2 resources. The `drizzle/` migration is packaged with every saved version.

## Hosted Configuration

Set hosted values through Sites runtime environment management. Do not commit secrets or add them to `.openai/hosting.json`.

Minimum hardened stage:

```text
PROOF_SIGNING_SECRET=<32+ random bytes>
REQUIRED_SERVICES=database,media,proof-signing
```

Add optional service credentials from `.env.example`. When an integration becomes mandatory, add its readiness name to `REQUIRED_SERVICES`.

## Access Model

The current production stage is deployed owner-only. Continue with ChatGPT sign-in is expected before the application loads. This is the production authentication boundary for the stage.

Do not change the site to shared or public until an application identity provider, tenant authorization, R2 ownership checks, Supabase policies, and abuse controls are configured.

The PWA manifest is on this same protected origin and is requested with owner credentials. A `401` for `/manifest.webmanifest` indicates an old shell or expired owner session; it is separate from LiveKit camera publication.

## Phone and XR Validation

1. Open the HTTPS stage on the target phone and complete owner sign-in.
2. Open `/control/runtime`; confirm `database`, `media`, and `proof-signing` are connected.
3. Open `/mission/webxr-creator/run`; grant camera or XR permissions only when prompted by the action.
4. Verify AR camera compositing, WebXR session entry, and placement on the physical device.
5. Open `/agents/naz/workspace`; send text and attach an image. Confirm the execution trace and R2 upload.
6. Join a Skill Pod and confirm either `LIVEKIT` or the explicitly labeled `LOCAL VIDEO` fallback.
7. For LiveKit, confirm `voice published` and `audio ready`; a token response alone is not a voice test.
8. Enable visual analysis, capture one world-camera frame, verify an agent response, then disable consent.

WebXR device support cannot be fully validated in desktop browser emulation. Keep at least one supported Android/Chrome device in the release matrix.

## Rollback

Deploy the last known-good saved Sites version. Verify `/api/health`, `/api/ready`, `/control/runtime`, an agent request, and a mission route after rollback.
