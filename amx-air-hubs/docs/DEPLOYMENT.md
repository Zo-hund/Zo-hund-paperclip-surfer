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

Because this application is nested inside the upstream Paperclip monorepo, save Sites versions with the validated `amx-air-hubs/dist` deployment archive. A source-only Sites build starts at the monorepo root and is not the release path for this application.

## Hosted Configuration

Set hosted values through Sites runtime environment management. Do not commit secrets or add them to `.openai/hosting.json`.

Minimum hardened stage:

```text
PROOF_SIGNING_SECRET=<32+ random bytes>
REQUIRED_SERVICES=database,media,proof-signing
```

Add optional service credentials from `.env.example`. When an integration becomes mandatory, add its readiness name to `REQUIRED_SERVICES`.

## Access Model

Sites is public so guests can reach the home page, public Stage viewer, published member credentials, scans, and invitation links without a ChatGPT sign-in screen. Supabase Auth is the application identity boundary for member routes, and the Worker verifies active member or operator roles for private APIs.

Set `MEMBER_AUTH_REQUIRED=true` in Sites. Production also requires `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`; the application fails closed for private APIs when the member gate is enabled but those values are absent.

In Supabase Authentication > URL Configuration, set the Site URL to `https://amx-hubs.cc/account` and add these redirect URLs:

```text
https://amx-hubs.cc/**
https://www.amx-hubs.cc/**
https://amx-air-hubs-stage.zohund-ai.chatgpt.site/**
http://localhost:*/**
```

The redirect allowlist is required for magic links, email confirmation, and password recovery to return to the same account origin.

## Phone and XR Validation

1. Open the HTTPS stage on the target phone and sign in with an active AMX member account.
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
