# Integration Contracts

All secrets are Worker-only. Never use a `VITE_` prefix for Agent Runtime, MCP, Plugin, LiveKit secret, Runway, or proof-signing values.

## Agent Runtime

Configure:

```text
AGENT_RUNTIME_URL=https://agents.example.com/
AGENT_RUNTIME_TOKEN=<server-only bearer token>
```

The Worker sends `POST {AGENT_RUNTIME_URL}/respond` with:

```json
{
  "agentId": "naz",
  "agentName": "NAZ",
  "text": "Review the scene",
  "contentKind": "code",
  "attachments": [
    {
      "id": "...",
      "kind": "image",
      "name": "scene.png",
      "mimeType": "image/png",
      "size": 120000,
      "transfer": "inline",
      "dataUrl": "data:image/png;base64,...",
      "storageUrl": "https://host/api/media/..."
    }
  ]
}
```

Small media can be inline. Deployed clients also write attachments to R2 on Send. For a remote agent call, the Worker hydrates stored R2 media into the server-to-server payload, so the external runtime never needs bucket or owner-session access. Files larger than 25 MB remain metadata-only.

Expected response:

```json
{
  "text": "Agent response",
  "tools": [
    {
      "id": "trace-id",
      "name": "scene.review",
      "source": "skill",
      "status": "complete",
      "detail": "Scene review completed",
      "timestamp": "2026-07-13T00:00:00.000Z"
    }
  ]
}
```

The Worker normalizes tool traces, caps the response at 2 MB, enforces a 20-second timeout, and falls back locally if the runtime is unavailable.

## MCP Gateway

Configure `MCP_GATEWAY_URL` and `MCP_GATEWAY_TOKEN`. The Worker sends `POST {URL}/invoke`:

```json
{
  "toolName": "mcp.tools",
  "agentId": "naz",
  "context": {
    "missionId": "webxr-creator",
    "browser": {
      "webgpu": true,
      "webxr": true,
      "camera": true,
      "online": true
    }
  }
}
```

Only tool names beginning with `mcp.` are routed to this gateway. An unconfigured gateway returns a blocked trace and never simulates a successful MCP call.

## Plugin Gateway

Configure `PLUGIN_GATEWAY_URL` and `PLUGIN_GATEWAY_TOKEN`. Its request and response envelope matches MCP. Only tool names beginning with `plugin.` are routed to it.

Built-in tools such as `system.health`, `proof.latest`, and `spatial.capabilities` execute in the AMX Worker and are labeled `runtime`, not Plugin or MCP.

## LiveKit

Configure `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET`. The browser requests a participant token from `/api/livekit/token`; the secret never enters the client configuration.

The participant grant permits room join, publish, subscribe, and data publish for one room. Tokens expire after 15 minutes. Camera and microphone permission is requested only when the user selects Join Pod. Set `LIVEKIT_AGENT_NAME` to dispatch a registered voice-agent worker when the first participant joins.

The room UI reports camera publication, microphone publication/mute state, browser audio playback permission, local connection quality, and active speakers. `voice published` means a microphone track exists in LiveKit; `audio ready` means the browser can play subscribed room audio. Both are required before the UI describes voice as ready.

The pod also publishes browser screen sharing through LiveKit. The share picker opens only after the user selects the monitor button. Camera and screen-share video tracks are routed into the Blender-authored `Screen_User` and agent display meshes. Browser tab audio is not requested by the current share control.

If LiveKit is absent or fails, the component opens a private local camera preview and labels it `LOCAL VIDEO`.

## Runway Characters

Configure `RUNWAYML_API_SECRET` as a Worker-only secret. The Nexus Avatar tab reads the sanitized catalog from `GET /api/runway/avatars`; the key never enters HTML, runtime configuration, logs, or browser JavaScript.

Starting a call sends `POST /api/runway/sessions`. The Worker creates a `gwm1_avatars` session, attaches five client-event tools, polls with bounded timeouts, consumes the one-time session key, and returns only the WebRTC URL, participant token, room name, and session ID. Calls are capped at five minutes and explicitly cancelled when the operator ends them. Runway bills active realtime sessions, so do not leave unattended calls running.

The Runway video participant is routed to the Blender room screens and remains mounted when the operator changes Nexus panels. Its toolbelt can switch world cameras, move or pose the GLB NPC, open Nexus panels, and invoke the allowlisted `mission.context`, `dcim.inspect`, `rack.thermal-map`, and `incident.runbook` skills. These are browser client events: Nexus executes them and displays a governed trace, but their result is not silently represented as a physical-world action.

Runway Characters are realtime video personas, not rigged GLB assets. Blender/GLB avatars continue to own 3D locomotion and mesh animation; Runway owns conversational video, voice, and lip sync.

## Spatial Cameras and Vision

The Nexus room provides overview, entry, rack, and briefing cameras. A world-camera frame is rendered from the active Three.js camera. A live-camera frame comes from the local LiveKit or private preview stream.

Visual analysis is off by default. The user must enable `Allow visual analysis` before a frame can leave the browser. Manual scans send one JPEG; live scan mode sends one JPEG every 12 seconds and stops immediately when consent is disabled. The Worker maps inline image data to an OpenAI Responses API `input_image` item or forwards the same attachment contract to `AGENT_RUNTIME_URL`.

## Ready Player Me Compatibility

The Nexus room loads the Blender-prepared ZOHUND character from `/models/zohund-avatar.glb` by default. Its editable source is `assets/blender/zohund-avatar.blend`; regenerate both assets and the deterministic first-party PBR texture set in `public/textures/zohund/` from an archived export with `scripts/prepare-zohund-avatar.py`.

The built-in roster also includes Mario MXBC, Actor One, and Mr Lamont. Their editable sources live in `assets/blender/avatars/`, while deployable glTF packages and first-party textures live in `public/models/avatars/`. Regenerate one with `scripts/prepare-built-in-avatar.py`; separate glTF textures avoid protected-origin embedded-image differences while preserving the source rig and materials.

The Nexus NPC Director treats the active avatar as an embodied room agent. Operators can send it to Entry, Stage, Media Wall, Rack Aisle, or Briefing; nudge it with the on-screen D-pad; adjust movement speed; stop or patrol; and trigger Wave, Talk, or Inspect poses. A focused world canvas also accepts WASD/arrow keys, and a double-click on the walk plane creates a bounded custom destination. Agent cues are converted into deterministic spatial commands in `src/npc-controller.ts`, then sent through the normal agent runtime for a role-aware acknowledgment and context response.

The room route uses a viewport-bound command layout rather than a document-length dashboard. The Three.js scene and right control rail share the available space below the application and workspace bars. NPC, Avatar, Pod, Media, and Vision are task tabs whose components remain mounted so room media, avatar calls, and NPC responses survive view changes. At phone widths, the viewport splits vertically; the scene remains visible while the console body scrolls independently, and active feedback stays inside that control surface.

Ready Player Me hosted services were discontinued on January 31, 2026. The room still supports archived Ready Player Me `.glb` files through local import and legacy HTTPS avatar URLs. Local object URLs are session-only and are never persisted or uploaded. Select `Use ZOHUND` to restore the built-in character after loading a custom avatar.

`VITE_READY_PLAYER_ME_CREATOR_URL` is optional for organizations that retain a private compatible creator endpoint. Leave it empty for normal deployments; the retired public creator remains disabled.

## Supabase Realtime

`SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are safe browser configuration values. They provide room broadcast and presence. Configure restrictive Realtime authorization policies in the Supabase project before multi-user release.

Without Supabase, room messages use BroadcastChannel and work only between tabs on one device.

## AMX XR Stage

`/stage` is the live production workspace. Its WebGPU venue exposes four program shots, three animated camera-operator NPCs, a camera crane, one stage host, 36 general seats, and 8 VIP/sponsor seats. GO LIVE starts the opening cue on CAM 1 wide; later camera takes remain operator controlled.

The Stage host is exported from `assets/blender/zohund-avatar.blend` as a separate glTF package at `public/models/zohund-stage/`. Its first-party texture files avoid protected-origin `blob:` image loading. Regenerate it with `scripts/export-zohund-stage-avatar.py` after changing the Blender source.

Stage show state is separate from room media. LiveKit owns participant camera, microphone, screen, and agent tracks for the active stage room. Supabase Realtime owns production cues, live status, camera, venue mode, sponsor creative, seating, and linked-Pod state. Every update carries a monotonic revision so an older network packet cannot replace a newer operator cue.

Each Pod code linked in the Pods console receives the same production packet on its `amx-stage-{POD}` cue bus. A Stage page using that Pod code can therefore follow the show state. This is production-state distribution, not automatic LiveKit room federation; participants who need shared audio/video must join the same configured LiveKit room or use a separate media bridge.

Without Supabase, the cue bus uses BroadcastChannel and reaches only tabs on the same device. The console labels this transport `local mesh`; it does not claim remote Pod synchronization.

Sponsor slates are first-party CanvasTextures rendered onto the center screen, side screens, and venue ribbon. Custom creative remains in browser-local storage. Sponsor selections emit campaign and stage-room metadata through the existing analytics endpoint; the Stage does not load a third-party ad tracker.

## Live Media Panels

The Nexus Content Deck accepts HTTPS HLS (`.m3u8`), MP4, WebM, and local video files. HLS.js supplies adaptive playback on Media Source Extensions browsers; Safari can use native HLS. A loaded player is bound to a dedicated front-facing Blender display plane through a frame-synchronized, tone-map-neutral Three.js canvas texture; `Fit` preserves the full frame and `Fill` center-crops without stretching.

External manifests, segments, and media files must permit cross-origin browser requests from the deployment origin. Local files remain browser-local object URLs and are revoked when the player unmounts.

## Nexus Production Switcher

The Media console exposes three independent program buses mapped to the Blender meshes `Screen_User`, `Screen_Agent_Left`, and `Screen_Agent_Right`. Each bus can take LiveKit camera 1-3, the media deck, Google location context, the Runway participant, AMX AIR HUBS.CC, AMX Labs, or black. Unavailable live inputs remain disabled in preview and resolve to an honest branded fallback if a stream disappears after it is on program.

`Cut` commits immediately. `Dip`, `AIR`, and `LABS` first render a synchronized canvas stinger on the selected targets, then commit the new source. Showcase, Collab, Context, and Brand layouts take all three buses together. The last committed program is stored as a browser-local operator preference; credentials, media URLs, and room tokens are never stored with it.

The screen switcher depends on those exact GLB mesh names. After a Blender export, verify all three names, front-facing UV orientation, and visible 16:9-ish display bounds in `/nexus` before release. The renderer writes `data-screen-programs` and `data-screen-stinger` on the scene host for automated release checks.

## Google Maps

Set `GOOGLE_MAPS_BROWSER_KEY` in the deployed Worker environment. `/api/maps/config` intentionally returns this browser-public key to the Google Maps JavaScript loader. In Google Cloud, restrict the key to the Maps JavaScript API and HTTPS referrers for the exact staging and production origins. Use a separate key for other platforms.

For local Vite development, `VITE_GOOGLE_MAPS_API_KEY` is supported as a build-time fallback. The map is honest about setup state when neither value exists.

Map search, map clicks, and device geolocation create a location selection. The selected address and coordinates feed the right Blender display, can be published as a shared Nexus geo anchor, and can be sent to the active agent for a grounded training and digital-twin context brief. Google map tiles are rendered only by the Maps API; the Three.js panel displays derived selection data rather than copying map imagery.

## Blender and GLB

Source Blender files live in `assets/blender/`. Runtime GLB assets live in `public/models/`. Re-export optimized GLB files after Blender changes and run the full build to verify loader compatibility.
