# Organization Console

The organization console at `/tenants` is the local-first control plane for partner identity and runtime scope.

## Functional controls

- Create organization records with a stable tenant ID and brand color.
- Enable the mission catalog and agent roster available to the organization.
- Set the proof scope, issuer signature, certificate identity, and sponsor snapshot used by newly issued proof.
- Set the report template stored with newly issued proof records.
- Enable organization-specific marketplace offers.
- Switch organizations and automatically reconcile the active mission and agent to the selected scope.

Tenant records are stored in `localStorage` under `amx_tenant_records`. The active tenant remains in `amx_active_tenant`. Existing proof records retain the issuer metadata captured when they were created, so later tenant edits do not rewrite historical proof.

The marketplace and proof wallet read the active organization configuration. Organization changes are therefore visible across `/marketplace`, `/wallet`, mission context, agent requests, analytics, and new proof issuance.
