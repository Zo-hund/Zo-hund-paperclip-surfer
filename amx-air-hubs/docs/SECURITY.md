# Security Model

## Implemented Controls

- Owner-only Sites authentication for the deployed stage.
- Server-only Agent, MCP, Plugin, LiveKit, and proof-signing secrets.
- HTTPS/WSS enforcement for remote integrations, with localhost-only insecure development exceptions.
- Gateway timeouts, JSON-only responses, and response-size limits.
- Request body limits and allowlisted media types.
- Sanitized IDs, labels, attachment URLs, room codes, and WebSocket messages.
- Nonce-based Content Security Policy for SPA responses.
- HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, restrictive referrer policy, and same-origin resource policy.
- Request IDs and structured logs without payloads or secrets.
- Server-side HMAC proof attestation.
- Private, non-cached media responses.

## Trust Boundaries

The browser is untrusted. Browser proof signatures are convenience checks only; use `serverAttestation` for server trust. The Worker validates all data again before persistence or gateway forwarding.

Remote Agent, MCP, and Plugin systems are separate trust domains. Give each a scoped token, rotate independently, and expose only allowlisted operations in those gateways.

## Known Release Boundary

Owner-only Sites access is appropriate for private staging and a single owner. It is not a substitute for application-level multi-user authorization.

Before a shared/public launch, implement:

1. User identity and session verification inside the Worker.
2. Tenant- and owner-scoped authorization for D1 and R2 operations.
3. Supabase Realtime row/channel policies tied to identity.
4. Per-user and per-route durable rate limits.
5. Media malware/content scanning where the organization requires it.
6. Retention, deletion, export, and audit policies.
7. Secret rotation and incident response ownership.

## Secret Handling

Keep local values in ignored `.env` files and hosted values in Sites environment management. Never place secrets in `VITE_*`, runtime config injection, Git URLs, logs, screenshots, or client-side storage.

Rotate immediately if a secret appears in a commit or client bundle. Removing it from the latest file is not sufficient because Git history and deployed artifacts may retain it.
