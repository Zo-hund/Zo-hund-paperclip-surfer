# Member Accounts

## Access Levels

| Surface | Access |
| --- | --- |
| Home, public Stage viewer, sponsor pages, scans, Pod invitations | Guest/public |
| Missions, agents, proof wallet, Pods, Nexus, XR worlds | Active member |
| Analytics and QR Studio | Trainer or operator |
| Stage production, tenant console, admin, runtime control, DJ egress | Operator |

The React router improves the user experience, but it is not the security boundary. Private Worker APIs validate the Supabase session and the `member_profiles.membership_role` database value.

## Account Lifecycle

1. A user creates an account at `/account` with email and password or requests a sign-in link.
2. The `on_auth_user_created` trigger creates a private, active `member_profiles` row.
3. The user can publish only the membership credential by setting `profile_visibility` to `public`.
4. The public route `/members/:handle` can read only active, public profiles through RLS.
5. A signed-in user can claim a bounded invitation. The initial operator invitation is one-use and expires after 14 days.

New users are active members, not operators. Roles are never accepted from `user_metadata`, URL parameters, or browser storage.

## Database Controls

- RLS is enabled on `member_profiles` and `member_invites`.
- Anonymous users can select only active public profiles.
- Authenticated users can select their own profile.
- Column grants let users update only display name, handle, avatar URL, and visibility.
- Direct invite-table access is denied.
- `claim_member_invite` hashes the supplied token and updates the authenticated profile inside one transaction.

## Operator Recovery

If the initial invitation expires before it is claimed, create a new random token, store only its SHA-256 hash in `member_invites`, and send the plaintext token through a private channel. Do not place operator tokens in source control, analytics, screenshots, or public links.
