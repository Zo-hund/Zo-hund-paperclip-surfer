revoke all on function public.create_member_profile() from public, anon, authenticated;

drop policy if exists "member invites have no direct access" on public.member_invites;
create policy "member invites have no direct access"
on public.member_invites for select
to anon, authenticated
using (false);
