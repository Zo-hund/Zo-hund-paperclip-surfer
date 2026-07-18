# Integration Contracts

All secrets are Worker-only. Never use a `VITE_` prefix for Agent Runtime, MCP, Plugin, LiveKit secret, or proof-signing values.

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

## Spatial Cameras and Vision

The Nexus room provides overview, entry, rack, and briefing cameras. A world-camera frame is rendered from the active Three.js camera. A live-camera frame comes from the local LiveKit or private preview stream.

Visual analysis is off by default. The user must enable `Allow visual analysis` before a frame can leave the browser. Manual scans send one JPEG; live scan mode sends one JPEG every 12 seconds and stops immediately when consent is disabled. The Worker maps inline image data to an OpenAI Responses API `input_image` item or forwards the same attachment contract to `AGENT_RUNTIME_URL`.

## Ready Player Me Compatibility

The Nexus room loads the Blender-prepared ZOHUND character from `/models/zohund-avatar.glb` by default. Its editable source is `assets/blender/zohund-avatar.blend`; regenerate both assets and the deterministic first-party PBR texture set in `public/textures/zohund/` from an archived export with `scripts/prepare-zohund-avatar.py`.

The built-in roster also includes Mario MXBC, Actor One, and Mr Lamont. Their editable sources live in `assets/blender/avatars/`, while deployable glTF packages and first-party textures live in `public/models/avatars/`. Regenerate one with `scripts/prepare-built-in-avatar.py`; separate glTF textures avoid protected-origin embedded-image differences while preserving the source rig and materials.

The Nexus NPC Director treats the active avatar as an embodied room agent. Operators can send it to Entry, Stage, Media Wall, Rack Aisle, or Briefing; nudge it with the on-screen D-pad; adjust movement speed; stop or patrol; and trigger Wave, Talk, or Inspect poses. A focused world canvas also accepts WASD/arrow keys, and a double-click on the walk plane creates a bounded custom destination. Agent cues are converted into deterministic spatial commands in `src/npc-controller.ts`, then sent through the normal agent runtime for a role-aware acknowledgment and context response.

The room route uses a viewport-bound command layout rather than a document-length dashboard. The Three.js scene and right control rail share the available space below the application and workspace bars. NPC, Pod, Media, and Vision are task tabs whose components remain mounted so room media and NPC responses survive view changes. At phone widths, the viewport splits vertically; the scene remains visible while the console body scrolls independently, and NPC feedback is pinned inside that control surface.

Ready Player Me hosted services were discontinued on January 31, 2026. The room still supports archived Ready Player Me `.glb` files through local import and legacy HTTPS avatar URLs. Local object URLs are session-only and are never persisted or uploaded. Select `Use ZOHUND` to restore the built-in character after loading a custom avatar.

`VITE_READY_PLAYER_ME_CREATOR_URL` is optional for organizations that retain a private compatible creator endpoint. Leave it empty for normal deployments; the retired public creator remains disabled.

## Supabase Realtime

`SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are safe browser configuration values. They provide room broadcast and presence. Configure restrictive Realtime authorization policies in the Supabase project before multi-user release.

Without Supabase, room messages use BroadcastChannel and work only between tabs on one device.

## Live Media Panels

The Nexus Content Deck accepts HTTPS HLS (`.m3u8`), MP4, WebM, and local video files. HLS.js supplies adaptive playback on Media Source Extensions browsers; Safari can use native HLS. A loaded player is bound to a dedicated front-facing Blender display plane through a frame-synchronized, tone-map-neutral Three.js canvas texture; `Fit` preserves the full frame and `Fill` center-crops without stretching.

External manifests, segments, and media files must permit cross-origin browser requests from the deployment origin. Local files remain browser-local object URLs and are revoked when the player unmounts.

## Google Maps

Set `GOOGLE_MAPS_BROWSER_KEY` in the deployed Worker environment. `/api/maps/config` intentionally returns this browser-public key to the Google Maps JavaScript loader. In Google Cloud, restrict the key to the Maps JavaScript API and HTTPS referrers for the exact staging and production origins. Use a separate key for other platforms.

For local Vite development, `VITE_GOOGLE_MAPS_API_KEY` is supported as a build-time fallback. The map is honest about setup state when neither value exists.

Map search, map clicks, and device geolocation create a location selection. The selected address and coordinates feed the right Blender display, can be published as a shared Nexus geo anchor, and can be sent to the active agent for a grounded training and digital-twin context brief. Google map tiles are rendered only by the Maps API; the Three.js panel displays derived selection data rather than copying map imagery.

## Blender and GLB

Source Blender files live in `assets/blender/`. Runtime GLB assets live in `public/models/`. Re-export optimized GLB files after Blender changes and run the full build to verify loader compatibility.
