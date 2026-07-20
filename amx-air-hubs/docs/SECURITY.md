# Security Model

## Implemented Controls

- Public Sites delivery with Supabase application identity for private member routes.
- RLS-protected `member_profiles`, private-by-default visibility, and database-backed member, trainer, and operator roles.
- Worker verification of active Supabase sessions and member roles for private APIs.
- One-use, SHA-256-hashed operator invitations with bounded expiry.
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
- Opaque pod invite tokens with bounded expiry and capacity.
- Separate creator-only invite owner capabilities, stored as SHA-256 hashes and required for revocation.

## Trust Boundaries

The browser is untrusted. Browser proof signatures are convenience checks only; use `serverAttestation` for server trust. The Worker validates all data again before persistence or gateway forwarding.

Remote Agent, MCP, and Plugin systems are separate trust domains. Give each a scoped token, rotate independently, and expose only allowlisted operations in those gateways.

## Access Boundary

Sites serves the public home, live viewer, public profiles, sponsor routes, scans, and invitation entry. Supabase Auth protects private routes. `member_profiles.membership_role` is the authority for member, trainer, and operator access; browser metadata and local storage never grant a role.

The browser mirrors the current access token into a same-origin `Secure; SameSite=Strict` cookie because the existing Worker clients use same-origin fetch and WebSocket requests. The token already exists in the Supabase browser session. The Worker verifies it with Supabase Auth, then reads the RLS-protected profile before handling a private API request. Operator APIs also require the `operator` database role.

Pod invitation capabilities grant access to a specific showcase and remain separate from human identity. Accepting a public Pod invitation does not grant member or operator access.

Remaining enterprise hardening:

1. Add per-user ownership columns and checks to D1/R2 records; current private APIs require a member but several legacy records remain tenant-scoped.
2. Add durable per-user rate limits for horizontally scaled high-volume deployments.
3. Add media malware/content scanning where the organization requires it.
4. Finalize retention, deletion, export, audit, and incident-response policies.

## Secret Handling

Keep local values in ignored `.env` files and hosted values in Sites environment management. Never place secrets in `VITE_*`, runtime config injection, Git URLs, logs, screenshots, or client-side storage.

Rotate immediately if a secret appears in a commit or client bundle. Removing it from the latest file is not sufficient because Git history and deployed artifacts may retain it.
