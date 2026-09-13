create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.member_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  member_code text not null unique,
  display_name text not null default 'AMX Member' check (char_length(display_name) between 1 and 80),
  handle text unique check (handle is null or handle ~ '^[a-z0-9][a-z0-9_-]{2,29}$'),
  avatar_url text check (avatar_url is null or char_length(avatar_url) <= 500),
  organization text not null default 'AMX AIR HUBS' check (char_length(organization) between 1 and 120),
  membership_role text not null default 'member' check (membership_role in ('member', 'trainer', 'operator')),
  membership_status text not null default 'active' check (membership_status in ('active', 'pending', 'suspended')),
  profile_visibility text not null default 'private' check (profile_visibility in ('public', 'private')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.member_invites (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (char_length(token_hash) = 64),
  membership_role text not null check (membership_role in ('member', 'trainer', 'operator')),
  label text not null default 'AMX membership invitation',
  expires_at timestamptz not null,
  max_uses integer not null default 1 check (max_uses between 1 and 100),
  use_count integer not null default 0 check (use_count between 0 and max_uses),
  created_at timestamptz not null default now()
);

alter table public.member_profiles enable row level security;
alter table public.member_invites enable row level security;

drop policy if exists "member profiles are selectively visible" on public.member_profiles;
create policy "member profiles are selectively visible"
on public.member_profiles for select
to anon, authenticated
using (
  membership_status = 'active'
  and (profile_visibility = 'public' or id = (select auth.uid()))
);

drop policy if exists "members update their own profile" on public.member_profiles;
create policy "members update their own profile"
on public.member_profiles for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

revoke all on public.member_profiles from anon, authenticated;
grant select on public.member_profiles to anon, authenticated;
grant update (display_name, handle, avatar_url, profile_visibility) on public.member_profiles to authenticated;
revoke all on public.member_invites from anon, authenticated;

create or replace function public.create_member_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.member_profiles (id, member_code, display_name)
  values (
    new.id,
    'AMX-' || upper(left(replace(new.id::text, '-', ''), 8)),
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1), 'AMX Member'), 80)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.create_member_profile();

insert into public.member_profiles (id, member_code, display_name)
select
  users.id,
  'AMX-' || upper(left(replace(users.id::text, '-', ''), 8)),
  left(coalesce(nullif(trim(users.raw_user_meta_data ->> 'display_name'), ''), split_part(users.email, '@', 1), 'AMX Member'), 80)
from auth.users as users
on conflict (id) do nothing;

create or replace function public.touch_member_profile()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists member_profiles_updated_at on public.member_profiles;
create trigger member_profiles_updated_at
before update on public.member_profiles
for each row execute procedure public.touch_member_profile();

create or replace function public.claim_member_invite(invite_token text)
returns public.member_profiles
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  selected_invite public.member_invites%rowtype;
  claimed_profile public.member_profiles%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into selected_invite
  from public.member_invites
  where token_hash = encode(digest(invite_token, 'sha256'), 'hex')
    and expires_at > now()
    and use_count < max_uses
  for update;

  if not found then
    raise exception 'Invitation is invalid, expired, or already used';
  end if;

  update public.member_profiles
  set membership_role = selected_invite.membership_role,
      membership_status = 'active'
  where id = auth.uid()
  returning * into claimed_profile;

  if not found then
    raise exception 'Member profile was not found';
  end if;

  update public.member_invites
  set use_count = use_count + 1
  where id = selected_invite.id;

  return claimed_profile;
end;
$$;

revoke all on function public.claim_member_invite(text) from public, anon;
grant execute on function public.claim_member_invite(text) to authenticated;

insert into public.member_invites (token_hash, membership_role, label, expires_at)
values (
  '123358850b23eb4482fc288fe789fcc3a0f6d159e79f9fde33a90d4fc378a5df',
  'operator',
  'Initial AMX AIR HUBS operator',
  now() + interval '14 days'
)
on conflict (token_hash) do nothing;
