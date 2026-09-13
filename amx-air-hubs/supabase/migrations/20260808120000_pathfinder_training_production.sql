create table if not exists public.pathfinder_training_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.partner_organizations(id) on delete cascade,
  session_code text not null check (session_code ~ '^[A-Z0-9]{6}$'),
  title text not null default 'XRT Pathfinder Staff & Educator Training' check (char_length(title) between 4 and 140),
  status text not null default 'draft' check (status in ('draft', 'live', 'paused', 'complete')),
  facilitator_id uuid not null references auth.users(id) on delete restrict default auth.uid(),
  active_segment integer not null default 0 check (active_segment between 0 and 11),
  running boolean not null default false,
  started_at timestamptz,
  remaining_seconds integer not null default 900 check (remaining_seconds between 0 and 14400),
  setup jsonb not null default '[]'::jsonb check (jsonb_typeof(setup) = 'array'),
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, session_code)
);

create table if not exists public.pathfinder_training_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.pathfinder_training_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  display_name text not null check (char_length(display_name) between 2 and 100),
  evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence) = 'array'),
  competencies jsonb not null default '[]'::jsonb check (jsonb_typeof(competencies) = 'array'),
  certified_at timestamptz,
  certified_by uuid references auth.users(id) on delete set null,
  proof_id text,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, user_id)
);

create index if not exists pathfinder_sessions_org_idx on public.pathfinder_training_sessions (organization_id, status, updated_at desc);
create index if not exists pathfinder_participants_session_idx on public.pathfinder_training_participants (session_id, updated_at desc);

alter table public.pathfinder_training_sessions enable row level security;
alter table public.pathfinder_training_participants enable row level security;

create or replace function private.can_facilitate_pathfinder(target_organization_id text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select private.is_amx_operator() or (
    exists (
      select 1 from public.member_profiles
      where id = (select auth.uid()) and membership_status = 'active' and membership_role = 'trainer'
    ) and private.has_partner_role(target_organization_id, array['owner','admin','producer','analyst','viewer'])
  ) or private.has_partner_role(target_organization_id, array['owner','admin','producer']);
$$;

revoke all on function private.can_facilitate_pathfinder(text) from public, anon;
grant execute on function private.can_facilitate_pathfinder(text) to authenticated;

create policy "organization members read Pathfinder sessions"
on public.pathfinder_training_sessions for select to authenticated
using (
  (select private.is_amx_operator())
  or (select private.has_partner_role(organization_id, array['owner','admin','producer','analyst','viewer']))
);

create policy "trainers create Pathfinder sessions"
on public.pathfinder_training_sessions for insert to authenticated
with check (
  facilitator_id = (select auth.uid()) and (
    (select private.can_facilitate_pathfinder(organization_id))
  )
);

create policy "trainers update Pathfinder sessions"
on public.pathfinder_training_sessions for update to authenticated
using (
  (select private.can_facilitate_pathfinder(organization_id))
)
with check (
  (select private.can_facilitate_pathfinder(organization_id))
);

create policy "participants read session roster"
on public.pathfinder_training_participants for select to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.pathfinder_training_sessions session
    where session.id = session_id and (
      (select private.can_facilitate_pathfinder(session.organization_id))
    )
  )
);

create policy "members join Pathfinder sessions"
on public.pathfinder_training_participants for insert to authenticated
with check (
  user_id = (select auth.uid()) and exists (
    select 1 from public.pathfinder_training_sessions session
    where session.id = session_id and session.status in ('live', 'paused') and (
      (select private.is_amx_operator())
      or (select private.has_partner_role(session.organization_id, array['owner','admin','producer','analyst','viewer']))
    )
  )
);

create policy "participants update their own evidence"
on public.pathfinder_training_participants for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()) and certified_at is null and certified_by is null and proof_id is null);

create or replace function public.certify_pathfinder_participant(target_participant_id uuid, target_proof_id text)
returns public.pathfinder_training_participants
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  selected public.pathfinder_training_participants%rowtype;
  target_organization text;
begin
  select participant.* into selected
  from public.pathfinder_training_participants participant
  where participant.id = target_participant_id;
  if selected.id is null then raise exception 'Participant not found'; end if;
  select organization_id into target_organization from public.pathfinder_training_sessions where id = selected.session_id;
  if not private.can_facilitate_pathfinder(target_organization) then
    raise exception 'Trainer access required';
  end if;
  update public.pathfinder_training_participants
  set certified_at = now(), certified_by = auth.uid(), proof_id = nullif(trim(target_proof_id), ''), updated_at = now()
  where id = target_participant_id returning * into selected;
  return selected;
end;
$$;

revoke all on function public.certify_pathfinder_participant(uuid, text) from public, anon;
grant execute on function public.certify_pathfinder_participant(uuid, text) to authenticated;
grant select, insert, update on public.pathfinder_training_sessions to authenticated;
grant select, insert, update on public.pathfinder_training_participants to authenticated;

alter publication supabase_realtime add table public.pathfinder_training_sessions;
alter publication supabase_realtime add table public.pathfinder_training_participants;
