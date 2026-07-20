# Partner Portal

The Partner Portal turns AMX organizations into governed, measurable mission channels. Open `/partners` after signing in with an active member account.

## Roles

| Role | Access |
| --- | --- |
| Owner | Full partner control, owner access, campaigns, brand, reports, and team |
| Admin | Organization settings, invitations, team roles below owner, campaigns, and reports |
| Producer | Campaign creation, status, QR distribution, and runtime operations |
| Analyst | Campaign funnel, activity, and report export |
| Viewer | Read-only organization and campaign visibility |

Database rules enforce these boundaries. An administrator cannot promote anyone to owner or modify an existing owner. Every organization must retain at least one active owner.

## Partner Workflow

1. Create or select an organization in `/partners`.
2. Configure brand identity, contacts, proof scope, certificate signature, missions, agents, and marketplace offers.
3. Invite teammates by email and role. The generated link is single-use, expires, is stored only as a SHA-256 digest, and must be claimed by a signed-in account with the same email address.
4. Create a campaign, choose its mission and location tag, then change its status to `Live`.
5. Share the campaign QR code or public route: `/partner/{organization-id}/{campaign-slug}`.
6. The resolver applies partner scope, records a scan, and sends the participant to the campaign mission.
7. Signed-in mission starts, completions, and marketplace actions are attributed to the active campaign.
8. Review the funnel and export the versioned JSON outcome report.

## Data Model

- `partner_organizations`: identity, brand, mission, agent, proof, and offer scope.
- `partner_memberships`: user role and active/suspended access.
- `partner_campaigns`: public slug, mission, location, status, targets, and counters.
- `partner_campaign_events`: append-only scan, start, completion, and marketplace evidence.
- `partner_invitations`: email-bound, expiring, one-time access grants.

All tables use Supabase row-level security. Public visitors cannot query the tables directly. Two narrowly scoped RPCs support public live-campaign resolution and anonymous scan attribution; every deeper outcome event requires member authentication.

## Operations

- Pause a campaign to stop its resolver and new attribution without deleting history.
- Suspend a member to remove organization visibility immediately.
- Regenerate an invitation to revoke the previous pending link for that email.
- Keep organization proof fields stable during a cohort. Issued proof already stores its identity snapshot.
- Export reports before archival. Archived organizations remain inaccessible to public campaign resolution.

Database changes live in `supabase/migrations`. Apply migrations in timestamp order and run `pnpm verify` before publishing.
