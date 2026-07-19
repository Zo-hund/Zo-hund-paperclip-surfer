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

Configure `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET`. Add every private app hostname to `LIVEKIT_OPERATOR_HOSTS` and every intentionally viewable Stage room to `PUBLIC_LIVEKIT_ROOMS`. Interactive Pods request publisher credentials from `/api/livekit/token`; Stage viewers and the hidden camera router use `/api/livekit/viewer-token`. The secret never enters the client configuration.

The participant grant permits room join, publish, subscribe, and data publish for one room. Tokens expire after 15 minutes. Camera and microphone permission is requested only when the user selects Join Pod. Set `LIVEKIT_AGENT_NAME` to dispatch a registered voice-agent worker when the first participant joins.

The room UI reports camera publication, microphone publication/mute state, browser audio playback permission, local connection quality, and active speakers. `voice published` means a microphone track exists in LiveKit; `audio ready` means the browser can play subscribed room audio. Both are required before the UI describes voice as ready.

The pod also publishes browser screen sharing through LiveKit. The share picker opens only after the user selects the monitor button. Camera and screen-share video tracks are routed into the Blender-authored `Screen_User` and agent display meshes. The pod requests optional tab/system audio, but the operator must still select a supported browser tab or screen and explicitly enable audio in the native share picker. When published, LiveKit labels it as the screen-share audio track and includes it in room composites.

LiveKit video surfaces retain their participant name, stable track ID, camera/screen source, local/remote ownership, and mute state. The AMX XR Stage uses this metadata for its ISO camera router instead of treating tracks as anonymous streams.

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

Stage show state is separate from room media. LiveKit owns participant camera, microphone, screen, and agent tracks for the active stage room. Supabase Realtime owns production cues, live status, camera, venue mode, sponsor creative, seating, event configuration, audio production, and linked-Pod state. Every update carries a monotonic revision so an older network packet cannot replace a newer operator cue.

The Event console promotes a linked Pod into one of three synchronized venue presets: Summit theater, XR Con arena, or Expo hall. A preset changes the Three.js seating transform, house inventory, title, source room, event lifecycle, and sponsor slate without replacing the live Stage room. Starting or ending the show advances the shared event status to `live` or `complete`.

The Event Seat Manager gives every physical house and VIP/sponsor chair a stable venue ID. Operators can name a guest, hold, reserve, check in, block, reopen, or automatically reserve the next available seat. Seat records travel with the shared Stage event state, checked-in totals drive the live audience tally, and open, held, reserved, checked-in, and blocked chairs use distinct materials on the matching Three.js meshes. Admission passes remain a separate credential layer so a pass can grant venue access without silently assigning a physical chair.

`/watch/:roomCode` is the branded audience face for an AMX XR Stage room. It opens outside the operator shell, requests no camera or microphone permission, subscribes to the LiveKit room with a viewer-only token, selects the routed program camera, and presents that video uncropped over the synchronized venue. Viewers can switch to the Three.js venue, enable program audio after a user gesture, enter fullscreen, or share the channel. Event identity, live state, sponsor creative, camera shot, audience check-ins, and room presence update from the same Stage state. A snapshot request lets a newly opened viewer receive the current show state without waiting for the operator's next cue.

Viewer tokens set `canSubscribe: true`, `canPublish: false`, and `canPublishData: false`; they use server-generated identities, require a `PUBLIC_LIVEKIT_ROOMS` match, and never dispatch a room agent. Publisher tokens require a `LIVEKIT_OPERATOR_HOSTS` match. Keep the operator app behind authenticated or owner-only access. A truly anonymous viewer URL must be deployed on an isolated public hostname that exposes only the watch surface and subscribe-only token route. Do not make the current all-routes Stage project public as a shortcut.

On phones, the Stage reserves the safe viewport above the fixed navigation, keeps the WebGPU venue visible, and gives the console its own scroll surface. Event inputs use a 16px mobile font to prevent Safari form zoom, ticket actions retain at least 44px touch targets, and 320px-wide status controls wrap instead of leaving critical lifecycle actions offscreen. Short landscape displays switch to a side-by-side scene and console layout.

General, VIP/partner, and speaker/exhibitor inventory can each issue a durable D1-backed admission pass through the existing Pod invite service. Every tier has a separate hidden token, role, capacity, expiry, acceptance count, QR code, share action, and device-held owner key for revocation. Pass tokens are never written into synchronized Stage state. These passes control admission only; a payment provider, refund policy, tax handling, and order ledger must be integrated before representing them as paid tickets.

The Audio console synchronizes show, podcast, and DJ formats; transport; deck presets; equal-power crossfader; BPM; master level; soundscape; and podcast record cue. Its shared `startedAt` values give connected Pods one production timeline. Each browser must explicitly enable its local monitor because Web Audio autoplay policy is device-local. The procedural deck and ambience engine uses HRTF panners at the in-world booth speaker positions and does not load copyrighted music. `START RECORD CUE` is synchronized rundown state, not a claim that a server-side podcast file is being archived. LiveKit remains the host and guest voice transport.

The `DJ LIVE / RTMP` console starts and stops a LiveKit RoomComposite egress for the active Stage room. Configure up to five comma- or newline-separated RTMP/RTMPS ingest URLs in the Worker-only `DJ_RTMP_URLS` secret and set a separate `DJ_STREAM_CONTROL_TOKEN`. The browser keeps the entered control token only in component memory and never receives destination URLs. The composite broadcasts LiveKit participants, microphone tracks, and shared tab/system audio; it does not directly capture the Three.js/WebGPU viewport or a local-only Web Audio monitor. To broadcast the DJ program, join the Stage Pod, publish camera and microphone, then share the DJ software or Stage browser tab with audio before selecting `START DJ LIVE`.

The Three.js venue includes a DJ booth Pod with two animated decks, mixer, crossfader, VU meters, microphone arms, and speaker stacks. Scene health exposes `data-dj-booth`, `data-audio-format`, `data-audio-transport`, `data-audio-bpm`, `data-audio-recording`, and `data-soundscape` for release verification.

The four Stage camera channels can route `AUTO INPUT`, `VIRTUAL SHOT`, or an explicit LiveKit participant camera/screen feed. Camera routes use stable `participant identity + source` IDs and AUTO sorts camera feeds before screen shares, then by participant identity. Pre-Release-55 ephemeral track routes migrate once to AUTO; new explicit assignments persist and synchronize with the show state. If a stable track leaves, the channel remains assigned and reports `FEED OFFLINE` until that participant republishes the same source or the operator reroutes it. The hidden Stage monitor subscribes to video only, retries failed token or room connections with bounded backoff, and is excluded from audience counts along with agent services. Taking a channel changes the 3D production viewpoint and maps its selected live feed onto the center program mesh. Side screens and the ribbon remain available for sponsor creative. A muted or missing track never reports itself as live.

Camera-team workflow: all operators join the same Stage LiveKit room, publish camera or screen tracks, then the director selects each participant from the CAM 1-3 or CRANE route menu. The browser requests camera/microphone permission only when each participant selects Join Pod. LiveKit transports the media; Supabase synchronizes which channel is on program.

When no feed is connected, the Stage Show console exposes `CONNECT CAMERA`, opens the Pods media panel, and scrolls its compact controls into view. Capture failures preserve a retry action and report the browser's device category instead of collapsing every failure into a generic permission message. CAM 1-3 and CRANE remain production take controls; they do not request device permission themselves.

Each Pod code linked in the Pods console receives the same production packet on its `amx-stage-{POD}` cue bus. A Stage page using that Pod code can therefore follow the show state. The promote action marks one linked Pod as the event source and opens its Event workspace. This is production-state distribution, not automatic LiveKit room federation; participants who need shared audio/video must join the same configured LiveKit room or use a separate media bridge.

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
