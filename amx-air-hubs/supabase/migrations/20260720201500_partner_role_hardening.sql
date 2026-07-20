create or replace function public.update_partner_membership(
  target_membership_id uuid,
  target_role text,
  target_status text
)
returns public.partner_memberships
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  selected_membership public.partner_memberships%rowtype;
  updated_membership public.partner_memberships%rowtype;
  actor_is_operator boolean;
  actor_is_owner boolean;
  actor_is_admin boolean;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in before managing a partner team';
  end if;
  if target_role not in ('owner','admin','producer','analyst','viewer') then
    raise exception 'Unsupported partner role';
  end if;
  if target_status not in ('active','suspended') then
    raise exception 'Unsupported partner membership status';
  end if;

  select * into selected_membership
  from public.partner_memberships
  where id = target_membership_id
  for update;
  if not found then raise exception 'Partner membership was not found'; end if;

  actor_is_operator := private.is_amx_operator();
  actor_is_owner := private.has_partner_role(selected_membership.organization_id, array['owner']);
  actor_is_admin := private.has_partner_role(selected_membership.organization_id, array['admin']);
  if not (actor_is_operator or actor_is_owner or actor_is_admin) then
    raise exception 'Partner administrator access is required';
  end if;
  if not (actor_is_operator or actor_is_owner)
    and (selected_membership.role = 'owner' or target_role = 'owner') then
    raise exception 'Only an owner can change owner access';
  end if;
  if selected_membership.user_id = (select auth.uid()) and target_status = 'suspended' then
    raise exception 'You cannot suspend your own partner access';
  end if;
  if selected_membership.role = 'owner'
    and (target_role <> 'owner' or target_status <> 'active')
    and not exists (
      select 1 from public.partner_memberships other
      where other.organization_id = selected_membership.organization_id
        and other.id <> selected_membership.id
        and other.role = 'owner'
        and other.status = 'active'
    ) then
    raise exception 'Every partner organization must retain an active owner';
  end if;

  update public.partner_memberships
  set role = target_role, status = target_status, updated_at = now()
  where id = selected_membership.id
  returning * into updated_membership;
  return updated_membership;
end;
$$;

revoke all on function public.update_partner_membership(uuid, text, text) from public, anon;
grant execute on function public.update_partner_membership(uuid, text, text) to authenticated;

revoke update, delete on public.partner_memberships from authenticated;

revoke insert, update on public.partner_campaigns from authenticated;
grant insert (
  organization_id, slug, name, summary, mission_id, location_tag, status,
  target_completions, starts_at, ends_at
) on public.partner_campaigns to authenticated;
grant update (
  slug, name, summary, mission_id, location_tag, status,
  target_completions, starts_at, ends_at
) on public.partner_campaigns to authenticated;

revoke update on public.partner_organizations from authenticated;
grant update (
  name, organization_type, status, brand_color, logo_url, website_url,
  contact_name, contact_email, mission_ids, agent_ids, proof_scope,
  report_template, certificate_name, certificate_sponsor, proof_signature,
  marketplace_offer_ids
) on public.partner_organizations to authenticated;
