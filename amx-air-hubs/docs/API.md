# Worker API

All API responses except media bytes use JSON, `Cache-Control: no-store`, and `X-Request-ID`. Client errors include the request ID. Unknown routes return `404`.

## Health

### `GET /api/health`

Liveness probe. Returns `200` while the Worker can serve requests.

### `GET /api/ready`

Readiness probe. Returns `200` when all names in `REQUIRED_SERVICES` are configured, otherwise `503`.

Supported names: `database`, `media`, `realtime`, `rooms`, `agent`, `mcp`, `plugins`, `livekit`, `runway`, `proof-signing`, and `telemetry`.

## Agents

### `GET /api/agents/capabilities`

Returns transport, integration state, room transport, deployment mode, and invocable tools. Tokens and secrets are never included.

### `POST /api/agents/respond`

Accepts text and up to 12 sanitized attachments. Maximum encoded JSON request size is 7 MB. Returns a remote answer or a truthful local fallback.

### `POST /api/agents/tools/invoke`

Invokes built-in runtime tools or routes `mcp.*` and `plugin.*` names to configured gateways. A tool-level failure returns a `blocked` trace in a `200` response so the execution history remains renderable.

## Media

### `POST /api/media`

Stores up to 25 MB in R2. Required header: `Content-Type`. Optional headers: `X-AMX-Filename`, `X-AMX-Tenant`.

Accepted types include image, audio, video, PDF, JSON, text/code, GLTF, GLB, and generic binary.

Returns `201` with `id`, `url`, `fileName`, `contentType`, `size`, and `metadataPersisted`.

### `GET /api/media/:id`

Returns private, non-cached media bytes.

### `DELETE /api/media/:id`

Deletes the R2 object and D1 metadata. Returns `204`.

## LiveKit

### `POST /api/livekit/token`

Request:

```json
{ "room": "POD-7", "identity": "user-123", "name": "AMX Explorer" }
```

Returns `serverUrl`, `participantToken`, `room`, and `expiresIn`. Returns `503` when LiveKit is not configured.

This operator-only endpoint always issues publish, subscribe, and data permissions and may dispatch the configured room agent. The request host must appear in `LIVEKIT_OPERATOR_HOSTS`; caller-supplied viewer roles are ignored.

### `POST /api/livekit/viewer-token`

Request:

```json
{ "room": "AMXSTAGE", "name": "AMX Stage Viewer" }
```

Issues a server-generated identity with subscribe-only room permissions. The room must appear in `PUBLIC_LIVEKIT_ROOMS`. Caller-supplied identities and roles are ignored, agent dispatch is disabled, and the route has a separate 30 requests/minute/IP limit. The private Stage router may request `clientType: "stage-monitor"` only from an allowed operator host.

### `POST /api/livekit/egress/dj/status`

### `POST /api/livekit/egress/dj/start`

### `POST /api/livekit/egress/dj/stop`

Protected DJ livestream controls. All three require `Authorization: Bearer <DJ_STREAM_CONTROL_TOKEN>` and a JSON `room`. A bounded `videoProfile` may be `720p30`, `1080p30`, or `1080p60`; it defaults to `1080p30`. Stop also requires `egressId`. Start creates one LiveKit RoomComposite egress using the speaker layout and the matching H.264 preset. Status and start return only a sanitized egress ID, room, lifecycle status, destination count, and selected width, height, and frame rate. Full RTMP URLs and stream keys are never returned.

Returns `503` until LiveKit credentials, `DJ_RTMP_URLS`, and `DJ_STREAM_CONTROL_TOKEN` are configured. Start is idempotent for an active room egress.

## Runway Characters

### `GET /api/runway/avatars`

Returns the supported Runway preset catalog and, when `RUNWAYML_API_SECRET` is configured, a sanitized list of the organization's custom avatars. Personality prompts, documents, and credentials are not returned.

### `POST /api/runway/sessions`

Creates a `gwm1_avatars` realtime session, attaches the AMX client-action toolbelt, waits for `READY`, consumes the one-time session key, and returns browser-safe WebRTC credentials. Sessions are capped at five minutes.

### `DELETE /api/runway/sessions/:id`

Cancels an active Runway session. The Nexus client calls this when the operator ends the avatar call.

## Proof and Analytics

### `POST /api/analytics/events`

Validates and persists an analytics event. Returns `202` and reports whether D1 persistence was active.

### `POST /api/sync`

Supported types: `proof:create`, `proof:update`, `proof:complete`, and `analytics:event`. Proof payloads receive a server HMAC attestation when configured.

### `GET /api/proofs?tenantId=tech-at-nite`

Returns up to 100 recent proof payloads for the sanitized tenant ID.

## Rooms

### `GET /api/rooms/:roomCode`

Requires a WebSocket upgrade. A Durable Object binding is preferred. The in-isolate ephemeral fallback is suitable only for local/degraded operation and does not provide cross-isolate durability.

## Pod showcase invitations

### `POST /api/pod-invites`

Creates a pass and returns its QR invite plus a one-time issuer-visible `zkode`. Only the ZKODE hash is stored server-side.

Creates a durable invitation for a Skill Pod. The request includes tenant and pod identity, room code, mission, guest role (`viewer`, `participant`, or `presenter`), capacity from 1 to 100, and expiry from 1 to 168 hours.

Returns the public invite plus a one-time `ownerToken`. The browser stores that owner capability only on the creator device; it is never included when an invite is resolved.

### `GET /api/pod-invites/:token`

Resolves sanitized public showcase details and the current `active`, `expired`, `full`, or `revoked` state.

### `POST /api/pod-invites/:token/accept`

Requires an authenticated member bearer token and `{ "zkode": "..." }`. Incorrect codes return `403` without consuming pass capacity. Legacy passes without a ZKODE must be reissued.

Atomically consumes one capacity slot while the invite is active and unexpired. The client creates the invited immersive room locally and opens its pre-flight lobby.

### `DELETE /api/pod-invites/:token`

Revokes the invite. Requires `Authorization: Bearer {ownerToken}`. Only a SHA-256 hash of the owner capability is persisted in D1.

## Stage production workflows

### `GET /api/stage/workflows/:roomCode?tenantId={tenantId}`

Returns the latest durable pre-production, live rundown, and post-production record for one tenant and Stage room. The route is available only from a hostname listed in `STAGE_OPERATOR_HOSTS`; when that variable is omitted it uses `LIVEKIT_OPERATOR_HOSTS`. A missing record returns `404` so the console can initialize a new production without claiming that it was previously persisted.

### `PUT /api/stage/workflows/:roomCode`

Persists a bounded workflow envelope containing `tenantId`, a positive monotonic `revision`, `updatedBy`, and the workflow object. The JSON body is capped at 128 KB and the persisted workflow at 120 KB. D1 only replaces a record when the incoming revision is at least as new as the stored revision, preventing a delayed operator packet from overwriting a later rundown.

The API does not replace user authentication. Keep the Stage operator site private and configure the hostname allowlist before deployment.

## Spatial anchors and digital twins

### GET /api/anchors?room={ROOM}

Returns the durable anchor set for a room.

### POST /api/anchors

Validates and upserts one WebXR, camera, or map anchor.

### DELETE /api/anchors/{id}

Removes a durable anchor for the active tenant.

### GET /api/twins/events?room={ROOM}

Returns recent scenario, approval, telemetry, and reconstruction-skill audit events.

### POST /api/twins/events

Records a validated scenario, approval, telemetry, or `skill` event. The browser persists scenario, approval, and reconstruction-skill provenance; high-frequency telemetry remains on the realtime channel.
