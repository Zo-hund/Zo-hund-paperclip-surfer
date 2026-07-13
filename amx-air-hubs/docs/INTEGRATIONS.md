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

The participant grant permits room join, publish, subscribe, and data publish for one room. Tokens expire after 15 minutes. Camera and microphone permission is requested only when the user selects Join Pod.

If LiveKit is absent or fails, the component opens a private local camera preview and labels it `LOCAL VIDEO`.

## Supabase Realtime

`SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are safe browser configuration values. They provide room broadcast and presence. Configure restrictive Realtime authorization policies in the Supabase project before multi-user release.

Without Supabase, room messages use BroadcastChannel and work only between tabs on one device.

## Blender and GLB

Source Blender files live in `assets/blender/`. Runtime GLB assets live in `public/models/`. Re-export optimized GLB files after Blender changes and run the full build to verify loader compatibility.
