create index if not exists partner_campaign_events_actor_idx
  on public.partner_campaign_events (actor_id)
  where actor_id is not null;
create index if not exists partner_campaign_events_campaign_idx
  on public.partner_campaign_events (campaign_id);
create index if not exists partner_campaigns_created_by_idx
  on public.partner_campaigns (created_by)
  where created_by is not null;
create index if not exists partner_invitations_accepted_by_idx
  on public.partner_invitations (accepted_by)
  where accepted_by is not null;
create index if not exists partner_invitations_created_by_idx
  on public.partner_invitations (created_by)
  where created_by is not null;
create index if not exists partner_organizations_created_by_idx
  on public.partner_organizations (created_by)
  where created_by is not null;

drop policy if exists "member profiles are selectively visible" on public.member_profiles;
drop policy if exists "partner leaders view organization member profiles" on public.member_profiles;

create policy "public member profiles are visible"
on public.member_profiles for select
to anon
using (
  membership_status = 'active'
  and profile_visibility = 'public'
);

create policy "member profiles are selectively visible"
on public.member_profiles for select
to authenticated
using (
  membership_status = 'active'
  and (
    profile_visibility = 'public'
    or id = (select auth.uid())
    or (select private.can_view_partner_member(id))
  )
);
