create schema if not exists private;
revoke all on schema private from public;

create table if not exists public.partner_organizations (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  name text not null check (char_length(name) between 2 and 80),
  organization_type text not null default 'Partner' check (char_length(organization_type) between 2 and 80),
  status text not null default 'active' check (status in ('draft', 'active', 'archived')),
  brand_color text not null default '#55e6ff' check (brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  logo_url text check (logo_url is null or char_length(logo_url) <= 500),
  website_url text check (website_url is null or char_length(website_url) <= 500),
  contact_name text check (contact_name is null or char_length(contact_name) <= 100),
  contact_email text check (contact_email is null or char_length(contact_email) <= 254),
  mission_ids text[] not null default '{}',
  agent_ids text[] not null default '{}',
  proof_scope text not null check (proof_scope ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  report_template text not null default 'Completion and cohort outcome report.' check (char_length(report_template) between 10 and 1000),
  certificate_name text not null check (char_length(certificate_name) between 2 and 100),
  certificate_sponsor text not null default '' check (char_length(certificate_sponsor) <= 100),
  proof_signature text not null check (proof_signature ~ '^[a-z0-9][a-z0-9-]{1,95}$'),
  marketplace_offer_ids text[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.partner_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.partner_organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('owner', 'admin', 'producer', 'analyst', 'viewer')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists public.partner_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.partner_organizations(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  name text not null check (char_length(name) between 2 and 100),
  summary text not null default '' check (char_length(summary) <= 500),
  mission_id text not null check (mission_id ~ '^[a-z0-9][a-z0-9-]{1,95}$'),
  location_tag text not null default 'partner-runway' check (location_tag ~ '^[a-z0-9][a-z0-9-]{1,95}$'),
  status text not null default 'draft' check (status in ('draft', 'live', 'paused', 'complete')),
  target_completions integer not null default 100 check (target_completions between 1 and 1000000),
  scan_count integer not null default 0 check (scan_count >= 0),
  start_count integer not null default 0 check (start_count >= 0),
  completion_count integer not null default 0 check (completion_count >= 0),
  marketplace_count integer not null default 0 check (marketplace_count >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  last_event_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table if not exists public.partner_campaign_events (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.partner_organizations(id) on delete cascade,
  campaign_id uuid not null references public.partner_campaigns(id) on delete cascade,
  event_type text not null check (event_type in ('scan', 'start', 'completion', 'marketplace')),
  mission_id text not null,
  location_tag text not null,
  actor_id uuid references auth.users(id) on delete set null default auth.uid(),
  occurred_at timestamptz not null default now()
);

create table if not exists public.partner_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.partner_organizations(id) on delete cascade,
  email text not null check (char_length(email) between 3 and 254),
  role text not null default 'viewer' check (role in ('owner', 'admin', 'producer', 'analyst', 'viewer')),
  token_hash text not null unique check (char_length(token_hash) = 64),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz not null,
  created_by uuid not null references auth.users(id) on delete cascade default auth.uid(),
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists partner_memberships_user_idx on public.partner_memberships (user_id, status, organization_id);
create index if not exists partner_campaigns_org_idx on public.partner_campaigns (organization_id, status, updated_at desc);
create index if not exists partner_campaigns_public_idx on public.partner_campaigns (organization_id, slug, status);
create index if not exists partner_campaign_events_rollup_idx on public.partner_campaign_events (organization_id, campaign_id, occurred_at desc);
create index if not exists partner_invitations_org_idx on public.partner_invitations (organization_id, status, expires_at desc);
create unique index if not exists partner_invitations_pending_email_idx
  on public.partner_invitations (organization_id, lower(email)) where status = 'pending';

alter table public.partner_organizations enable row level security;
alter table public.partner_memberships enable row level security;
alter table public.partner_campaigns enable row level security;
alter table public.partner_campaign_events enable row level security;
alter table public.partner_invitations enable row level security;

create or replace function private.is_amx_operator()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.member_profiles
    where id = (select auth.uid())
      and membership_status = 'active'
      and membership_role = 'operator'
  );
$$;

create or replace function private.is_active_amx_member()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.member_profiles
    where id = (select auth.uid()) and membership_status = 'active'
  );
$$;

create or replace function private.has_partner_role(target_organization_id text, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.partner_memberships
    where organization_id = target_organization_id
      and user_id = (select auth.uid())
      and status = 'active'
      and role = any(allowed_roles)
  );
$$;

revoke all on function private.is_amx_operator() from public, anon;
revoke all on function private.is_active_amx_member() from public, anon;
revoke all on function private.has_partner_role(text, text[]) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_amx_operator() to authenticated;
grant execute on function private.is_active_amx_member() to authenticated;
grant execute on function private.has_partner_role(text, text[]) to authenticated;

drop policy if exists "partner organizations visible to members" on public.partner_organizations;
create policy "partner organizations visible to members"
on public.partner_organizations for select to authenticated
using (
  (select private.is_amx_operator())
  or (select private.has_partner_role(id, array['owner','admin','producer','analyst','viewer']))
);

drop policy if exists "partner organizations managed by leaders" on public.partner_organizations;
create policy "partner organizations managed by leaders"
on public.partner_organizations for update to authenticated
using (
  (select private.is_amx_operator())
  or (select private.has_partner_role(id, array['owner','admin']))
)
with check (
  (select private.is_amx_operator())
  or (select private.has_partner_role(id, array['owner','admin']))
);

drop policy if exists "partner organizations deleted by owners" on public.partner_organizations;
create policy "partner organizations deleted by owners"
on public.partner_organizations for delete to authenticated
using (
  (select private.is_amx_operator())
  or (select private.has_partner_role(id, array['owner']))
);

drop policy if exists "partner memberships visible within organization" on public.partner_memberships;
create policy "partner memberships visible within organization"
on public.partner_memberships for select to authenticated
using (
  user_id = (select auth.uid())
  or (select private.is_amx_operator())
  or (select private.has_partner_role(organization_id, array['owner','admin']))
);

drop policy if exists "partner memberships managed by leaders" on public.partner_memberships;
create policy "partner memberships managed by leaders"
on public.partner_memberships for update to authenticated
using (
  (select private.is_amx_operator())
  or (select private.has_partner_role(organization_id, array['owner','admin']))
)
with check (
  (select private.is_amx_operator())
  or (select private.has_partner_role(organization_id, array['owner','admin']))
);

drop policy if exists "partner memberships removed by leaders" on public.partner_memberships;
create policy "partner memberships removed by leaders"
on public.partner_memberships for delete to authenticated
using (
  user_id <> (select auth.uid())
  and (
    (select private.is_amx_operator())
    or (select private.has_partner_role(organization_id, array['owner','admin']))
  )
);

drop policy if exists "partner campaigns visible to organization" on public.partner_campaigns;
create policy "partner campaigns visible to organization"
on public.partner_campaigns for select to authenticated
using (
  (select private.is_amx_operator())
  or (select private.has_partner_role(organization_id, array['owner','admin','producer','analyst','viewer']))
);

drop policy if exists "partner campaigns created by production team" on public.partner_campaigns;
create policy "partner campaigns created by production team"
on public.partner_campaigns for insert to authenticated
with check (
  created_by = (select auth.uid())
  and (
    (select private.is_amx_operator())
    or (select private.has_partner_role(organization_id, array['owner','admin','producer']))
  )
);

drop policy if exists "partner campaigns updated by production team" on public.partner_campaigns;
create policy "partner campaigns updated by production team"
on public.partner_campaigns for update to authenticated
using (
  (select private.is_amx_operator())
  or (select private.has_partner_role(organization_id, array['owner','admin','producer']))
)
with check (
  (select private.is_amx_operator())
  or (select private.has_partner_role(organization_id, array['owner','admin','producer']))
);

drop policy if exists "partner campaigns deleted by leaders" on public.partner_campaigns;
create policy "partner campaigns deleted by leaders"
on public.partner_campaigns for delete to authenticated
using (
  (select private.is_amx_operator())
  or (select private.has_partner_role(organization_id, array['owner','admin']))
);

drop policy if exists "partner events visible to organization" on public.partner_campaign_events;
create policy "partner events visible to organization"
on public.partner_campaign_events for select to authenticated
using (
  (select private.is_amx_operator())
  or (select private.has_partner_role(organization_id, array['owner','admin','producer','analyst','viewer']))
);

drop policy if exists "partner invitations visible to leaders" on public.partner_invitations;
create policy "partner invitations visible to leaders"
on public.partner_invitations for select to authenticated
using (
  (select private.is_amx_operator())
  or (select private.has_partner_role(organization_id, array['owner','admin']))
);

create or replace function public.touch_partner_record()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists partner_organizations_updated_at on public.partner_organizations;
create trigger partner_organizations_updated_at before update on public.partner_organizations
for each row execute procedure public.touch_partner_record();
drop trigger if exists partner_memberships_updated_at on public.partner_memberships;
create trigger partner_memberships_updated_at before update on public.partner_memberships
for each row execute procedure public.touch_partner_record();
drop trigger if exists partner_campaigns_updated_at on public.partner_campaigns;
create trigger partner_campaigns_updated_at before update on public.partner_campaigns
for each row execute procedure public.touch_partner_record();

create or replace function public.create_partner_organization(
  organization_name text,
  organization_id text,
  organization_type text default 'Partner',
  brand_color text default '#55e6ff'
)
returns public.partner_organizations
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  normalized_id text;
  created_organization public.partner_organizations%rowtype;
begin
  if not private.is_active_amx_member() then
    raise exception 'An active AMX member account is required';
  end if;
  normalized_id := lower(regexp_replace(trim(organization_id), '[^a-z0-9]+', '-', 'g'));
  normalized_id := trim(both '-' from normalized_id);
  if normalized_id !~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$' then
    raise exception 'Organization ID must contain 3-64 lowercase letters, numbers, or hyphens';
  end if;
  insert into public.partner_organizations (
    id, name, organization_type, brand_color, mission_ids, agent_ids, proof_scope,
    report_template, certificate_name, certificate_sponsor, proof_signature,
    marketplace_offer_ids, created_by
  ) values (
    normalized_id, left(trim(organization_name), 80), left(trim(organization_type), 80), brand_color,
    array['xrt-green-mode'], array['jaz'], normalized_id,
    left(trim(organization_name), 80) || ' completion and cohort outcome report.',
    left(trim(organization_name), 100), left(trim(organization_name), 100), normalized_id || '-proof',
    array['next','cohort'], (select auth.uid())
  ) returning * into created_organization;

  insert into public.partner_memberships (organization_id, user_id, role, status)
  values (created_organization.id, (select auth.uid()), 'owner', 'active');
  return created_organization;
end;
$$;

create or replace function public.create_partner_invitation(
  target_organization_id text,
  target_email text,
  target_role text default 'viewer',
  expires_in_hours integer default 168
)
returns table (invitation_id uuid, invite_token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  normalized_email text := lower(trim(target_email));
  generated_token text;
  selected_expiry timestamptz;
  inserted_id uuid;
begin
  if not (private.is_amx_operator() or private.has_partner_role(target_organization_id, array['owner','admin'])) then
    raise exception 'Partner administrator access is required';
  end if;
  if normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Enter a valid email address';
  end if;
  if target_role not in ('owner','admin','producer','analyst','viewer') then
    raise exception 'Unsupported partner role';
  end if;
  selected_expiry := now() + make_interval(hours => greatest(1, least(expires_in_hours, 720)));
  generated_token := encode(gen_random_bytes(24), 'hex');

  update public.partner_invitations
  set status = 'revoked'
  where organization_id = target_organization_id
    and lower(email) = normalized_email
    and status = 'pending';

  insert into public.partner_invitations (
    organization_id, email, role, token_hash, expires_at, created_by
  ) values (
    target_organization_id, normalized_email, target_role,
    encode(digest(generated_token, 'sha256'), 'hex'), selected_expiry, (select auth.uid())
  ) returning id into inserted_id;

  return query select inserted_id, generated_token, selected_expiry;
end;
$$;

create or replace function public.claim_partner_invitation(invite_token text)
returns public.partner_memberships
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  selected_invitation public.partner_invitations%rowtype;
  signed_in_email text;
  claimed_membership public.partner_memberships%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in before accepting a partner invitation';
  end if;
  select lower(email) into signed_in_email from auth.users where id = (select auth.uid());
  select * into selected_invitation
  from public.partner_invitations
  where token_hash = encode(digest(invite_token, 'sha256'), 'hex')
    and status = 'pending'
    and expires_at > now()
  for update;
  if not found then
    raise exception 'Invitation is invalid, expired, or already used';
  end if;
  if signed_in_email is distinct from lower(selected_invitation.email) then
    raise exception 'Sign in with the email address that received this invitation';
  end if;

  insert into public.partner_memberships (organization_id, user_id, role, status)
  values (selected_invitation.organization_id, (select auth.uid()), selected_invitation.role, 'active')
  on conflict (organization_id, user_id) do update
    set role = excluded.role, status = 'active', updated_at = now()
  returning * into claimed_membership;

  update public.partner_invitations
  set status = 'accepted', accepted_by = (select auth.uid()), accepted_at = now()
  where id = selected_invitation.id;
  return claimed_membership;
end;
$$;

create or replace function public.resolve_partner_campaign(partner_slug text, campaign_slug text)
returns table (
  campaign_id uuid,
  organization_id text,
  organization_name text,
  brand_color text,
  logo_url text,
  mission_id text,
  campaign_name text,
  campaign_summary text,
  location_tag text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.id, o.id, o.name, o.brand_color, o.logo_url, c.mission_id, c.name, c.summary, c.location_tag
  from public.partner_campaigns c
  join public.partner_organizations o on o.id = c.organization_id
  where o.id = lower(trim(partner_slug))
    and c.slug = lower(trim(campaign_slug))
    and o.status = 'active'
    and c.status = 'live'
  limit 1;
$$;

create or replace function public.record_partner_campaign_event(
  target_organization_id text,
  target_campaign_id uuid,
  target_event_type text,
  target_mission_id text,
  target_location_tag text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  selected_campaign public.partner_campaigns%rowtype;
begin
  if target_event_type not in ('scan','start','completion','marketplace') then
    raise exception 'Unsupported campaign event';
  end if;
  if target_event_type <> 'scan' and (select auth.uid()) is null then
    raise exception 'Member sign-in is required for this campaign event';
  end if;
  select * into selected_campaign
  from public.partner_campaigns
  where id = target_campaign_id
    and organization_id = target_organization_id
    and mission_id = target_mission_id
    and status = 'live';
  if not found then raise exception 'Live partner campaign was not found'; end if;

  insert into public.partner_campaign_events (
    organization_id, campaign_id, event_type, mission_id, location_tag, actor_id
  ) values (
    selected_campaign.organization_id, selected_campaign.id, target_event_type,
    selected_campaign.mission_id, left(coalesce(nullif(trim(target_location_tag), ''), selected_campaign.location_tag), 96),
    (select auth.uid())
  );

  update public.partner_campaigns
  set scan_count = scan_count + case when target_event_type = 'scan' then 1 else 0 end,
      start_count = start_count + case when target_event_type = 'start' then 1 else 0 end,
      completion_count = completion_count + case when target_event_type = 'completion' then 1 else 0 end,
      marketplace_count = marketplace_count + case when target_event_type = 'marketplace' then 1 else 0 end,
      last_event_at = now()
  where id = selected_campaign.id;
end;
$$;

revoke all on function public.touch_partner_record() from public, anon, authenticated;
revoke all on function public.create_partner_organization(text, text, text, text) from public, anon;
revoke all on function public.create_partner_invitation(text, text, text, integer) from public, anon;
revoke all on function public.claim_partner_invitation(text) from public, anon;
revoke all on function public.resolve_partner_campaign(text, text) from public;
revoke all on function public.record_partner_campaign_event(text, uuid, text, text, text) from public;
grant execute on function public.create_partner_organization(text, text, text, text) to authenticated;
grant execute on function public.create_partner_invitation(text, text, text, integer) to authenticated;
grant execute on function public.claim_partner_invitation(text) to authenticated;
grant execute on function public.resolve_partner_campaign(text, text) to anon, authenticated;
grant execute on function public.record_partner_campaign_event(text, uuid, text, text, text) to anon, authenticated;

revoke all on public.partner_organizations from anon, authenticated;
revoke all on public.partner_memberships from anon, authenticated;
revoke all on public.partner_campaigns from anon, authenticated;
revoke all on public.partner_campaign_events from anon, authenticated;
revoke all on public.partner_invitations from anon, authenticated;
grant select, update, delete on public.partner_organizations to authenticated;
grant select, update, delete on public.partner_memberships to authenticated;
grant select, insert, update, delete on public.partner_campaigns to authenticated;
grant select on public.partner_campaign_events to authenticated;
grant select on public.partner_invitations to authenticated;

insert into public.partner_organizations (
  id, name, organization_type, brand_color, mission_ids, agent_ids, proof_scope,
  report_template, certificate_name, certificate_sponsor, proof_signature, marketplace_offer_ids
) values
  ('tech-at-nite', 'Tech At Nite', 'Operator', '#55e6ff', array['xrt-green-mode','project-checklist','sponsor-demo','webxr-creator'], array['jaz','taz','raz','naz','zohund'], 'tech-at-nite', 'Tech At Nite completion and cohort outcome report.', 'Tech At Nite', 'AMX Labs', 'tech-at-nite-proof', array['next','cohort','workshop','trainer','sponsor','agent']),
  ('amx-labs', 'AMX Labs', 'Innovation Lab', '#f4c96b', array['xrt-green-mode','webxr-creator'], array['jaz','naz','zohund'], 'amx-labs', 'AMX Labs sponsored learning outcome report.', 'AMX Labs', 'AMX AIR HUBS.CC', 'amx-labs-proof', array['next','cohort','workshop','sponsor']),
  ('northside-school', 'Northside School', 'Education Partner', '#79eea8', array['xrt-green-mode','project-checklist'], array['jaz','taz'], 'northside-school', 'Northside School learner and cohort completion report.', 'Northside School', 'AMX AIR HUBS.CC', 'northside-school-proof', array['next','cohort','trainer']),
  ('community-runway', 'Community Runway', 'Community Partner', '#ff7a66', array['xrt-green-mode','sponsor-demo'], array['jaz','raz'], 'community-runway', 'Community Runway participation and verified outcome report.', 'Community Runway', 'AMX AIR HUBS.CC', 'community-runway-proof', array['next','cohort','sponsor'])
on conflict (id) do nothing;

insert into public.partner_memberships (organization_id, user_id, role, status)
select 'tech-at-nite', profiles.id, 'owner', 'active'
from public.member_profiles profiles
where profiles.membership_role = 'operator' and profiles.membership_status = 'active'
on conflict (organization_id, user_id) do nothing;

insert into public.partner_campaigns (
  organization_id, slug, name, summary, mission_id, location_tag, status, target_completions
) values (
  'amx-labs', 'xrt-green-mode', 'XRT Community Runway',
  'Sponsored WebXR foundations for schools, community spaces, and partner events.',
  'xrt-green-mode', 'community-runway', 'live', 1000
)
on conflict (organization_id, slug) do nothing;
