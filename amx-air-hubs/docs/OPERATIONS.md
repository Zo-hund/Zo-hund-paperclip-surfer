# Operations Runbook

## Release Checklist

1. Confirm `git status --short` is clean.
2. Run `pnpm --filter @amx/air-hubs verify`.
3. Inspect `drizzle/` whenever the D1 schema changes.
4. Push the exact tested commit.
5. Save and privately deploy that commit through Sites.
6. Confirm `GET /api/health` returns `200`.
7. Confirm `GET /api/ready` returns `200` for the configured readiness policy.
8. Check `/control/runtime` at desktop and phone widths.
9. Exercise one mission, one agent request, one built-in tool, and one media upload.
10. Open `/stage`, take all four cameras, start/end a show, change a sponsor, adjust VIP/general seating, and confirm the renderer health attributes remain nonzero.
11. For remote Pod tests, confirm the Stage transport reads `websocket`, open the linked Pod code on a second device, and verify camera, cue, sponsor, and seating changes arrive in order.
12. Join the LiveKit stage room only after camera/microphone permission is approved; verify participant media separately from the production cue bus.
13. Join two camera-team participants, route their named tracks to separate Stage camera channels, take each channel, and confirm `data-program-feed-id` and `data-program-feed-live` change on the 3D scene host.
14. With no Stage feed connected, select `CONNECT CAMERA` in the Show console. Confirm the Pods console scrolls to an above-fold `Join pod` action on desktop and phone. After a denied permission, confirm `RETRY CAMERA` remains available and the displayed error identifies blocked, missing, busy, or unsupported media hardware.
15. Open the Stage Audio console, mute master, start the program, select DJ and Podcast formats, move both deck controls, change BPM and soundscape, and run the podcast record cue for at least one second. Confirm all `data-audio-*` attributes follow the console, the DJ booth reports ready, and stopping transport clears both timers. Repeat on a connected Pod and confirm the production state synchronizes while its local monitor remains opt-in.
16. Before a DJ livestream, configure the platform RTMP/RTMPS ingest URL in `DJ_RTMP_URLS` and a distinct operator secret in `DJ_STREAM_CONTROL_TOKEN`. Join the Stage Pod, publish camera and microphone, share the DJ software or Stage tab with audio, then use Audio > DJ LIVE to check status and start. Confirm the platform preview has both picture and audio before making the platform event public. Stop the egress from DJ LIVE at show end and confirm it reports off air. Never paste a platform stream key into a browser field or shared room state.
17. Mute or disconnect the on-program participant and confirm the channel reports muted/offline and the program mesh returns to its governed sponsor fallback.
18. In Pods, promote a linked showcase room. In Event, switch through Summit, XR Con, and Expo and confirm `data-venue-layout` reports `theater`, `arena`, and `expo-hall` while the visible seating arrangement changes.
19. Set the event title, source, start time, and lifecycle. Issue General, VIP, and Speaker admission passes, confirm each QR resolves to a distinct invite lobby with the expected role/capacity, accept one pass, refresh the counter, and revoke it from the issuing device. Do not enable public ticket sales until a payment and order system is configured.

## Observability

Every API call emits structured JSON with:

```json
{
  "timestamp": "2026-07-13T00:00:00.000Z",
  "level": "info",
  "event": "api.request",
  "service": "amx-air-hubs",
  "version": "1.1.0",
  "requestId": "...",
  "method": "POST",
  "path": "/api/agents/respond",
  "status": 200,
  "durationMs": 42
}
```

Gateway failures log host, path, duration, and a sanitized error message. Tokens, prompts, attachment bodies, and proof payloads are not logged.

Use `X-Request-ID` to correlate the browser response, Worker request, and remote gateway logs.

## Incident Triage

### Application does not load

- Confirm owner sign-in completed.
- Check `/api/health`.
- Inspect deployment status and static asset responses.
- Confirm the nonce-based CSP appears on the HTML response.

### Readiness is `not-ready`

- Read `missingRequired` from `/api/ready`.
- Restore the named binding or secret.
- Do not remove the service from `REQUIRED_SERVICES` merely to turn the probe green.

### Agent says `local`

- Inspect `/api/agents/capabilities`.
- Confirm `AGENT_RUNTIME_URL` is HTTPS and credentials are valid.
- Correlate `gateway.failed` using the request ID.
- Local fallback is expected during an outage and must remain visibly labeled.

### MCP or Plugin tool is blocked

- Confirm the tool name begins with `mcp.` or `plugin.`.
- Confirm the corresponding URL and token.
- Verify the gateway implements `POST /invoke` and returns a JSON object within 20 seconds.

### Media upload fails

- Confirm the `MEDIA` R2 binding is connected.
- Check type and the 25 MB limit.
- Use the request ID to find `media.stored` or `api.error`.

### Camera or XR does not start

- Confirm HTTPS and browser permission state.
- Verify `Permissions-Policy` allows camera, microphone, geolocation, fullscreen, and XR spatial tracking for self.
- Test on a physical supported device; desktop emulation is not authoritative for WebXR.

### Room participants cannot see each other

- `LOCAL VIDEO` is single-device self-view, not a LiveKit room.
- Confirm LiveKit credentials and browser media permissions.
- For chat/presence, confirm Supabase Realtime configuration and policies.

## Data Retention

The Worker does not currently run an automatic retention job. Establish organization-specific retention for D1 proof/analytics/agent metadata and R2 media before adding external users. Delete R2 objects through `DELETE /api/media/:id` when a user removes uploaded content.
