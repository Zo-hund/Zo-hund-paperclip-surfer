# Organization Console

AMX has two organization controls with different responsibilities.

## Partner Portal

`/partners` is the production, Supabase-backed workspace for partner owners, administrators, producers, analysts, and viewers. It provides durable organization identity, team access, campaigns, attribution analytics, brand settings, mission and agent scope, proof identity, marketplace offers, QR links, and outcome-report export.

Data is protected with row-level security. Members only see organizations where they have an active membership. Owners and administrators can manage organization configuration and invitations; producers can manage campaigns; analysts and viewers have read access. Only owners can grant or change owner access, and the database prevents suspension or demotion of the last active owner.

## Runtime Tenant Console

`/tenants` remains the device-local runtime control plane. It is useful for quickly switching the active mission catalog, agent roster, proof scope, certificate identity, report template, and marketplace offers on one browser or headset.

Partner Portal activation writes the selected partner identity into this runtime scope. Tenant records are stored in `localStorage` under `amx_tenant_records`, with the active tenant in `amx_active_tenant`. Existing proof records retain the issuer metadata captured when they were created.

For production partner administration, use `/partners`. Use `/tenants` for local simulation and operator switching.
