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
