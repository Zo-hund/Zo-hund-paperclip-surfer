create or replace function private.can_view_partner_member(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (select auth.uid()) is not null and (
    private.is_amx_operator()
    or exists (
      select 1
      from public.partner_memberships target_membership
      join public.partner_memberships viewer_membership
        on viewer_membership.organization_id = target_membership.organization_id
      where target_membership.user_id = target_user_id
        and target_membership.status = 'active'
        and viewer_membership.user_id = (select auth.uid())
        and viewer_membership.status = 'active'
        and viewer_membership.role in ('owner', 'admin')
    )
  );
$$;

revoke all on function private.can_view_partner_member(uuid) from public, anon;
grant execute on function private.can_view_partner_member(uuid) to authenticated;

drop policy if exists "partner leaders view organization member profiles" on public.member_profiles;
create policy "partner leaders view organization member profiles"
on public.member_profiles for select
to authenticated
using (
  membership_status = 'active'
  and (select private.can_view_partner_member(id))
);
