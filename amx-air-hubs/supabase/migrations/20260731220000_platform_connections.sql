create extension if not exists supabase_vault with schema vault;

create table if not exists public.platform_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null check (tenant_id ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  name text not null check (char_length(name) between 2 and 100),
  provider text not null check (provider ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  kind text not null check (kind in ('api','oauth','mcp','plugin','skill','webhook')),
  status text not null default 'inactive' check (status in ('active','inactive','error')),
  endpoint_url text check (endpoint_url is null or endpoint_url ~ '^https://'),
  scopes text[] not null default '{}',
  secret_id uuid,
  secret_configured boolean generated always as (secret_id is not null) stored,
  last_tested_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 500),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider)
);

create table if not exists public.platform_connection_history (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.platform_connections(id) on delete cascade,
  tenant_id text not null,
  action text not null check (action in ('created','configured','activated','deactivated','test_passed','test_failed','secret_rotated')),
  from_status text check (from_status is null or from_status in ('active','inactive','error')),
  to_status text not null check (to_status in ('active','inactive','error')),
  detail text not null default '' check (char_length(detail) <= 500),
  actor_id uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists platform_connections_tenant_idx on public.platform_connections (tenant_id, status, updated_at desc);
create index if not exists platform_connection_history_tenant_idx on public.platform_connection_history (tenant_id, created_at desc);
alter table public.platform_connections enable row level security;
alter table public.platform_connection_history enable row level security;

create or replace function private.can_manage_connection_tenant(target_tenant_id text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select private.is_amx_operator() or exists (
    select 1 from public.partner_memberships
    where organization_id = target_tenant_id and user_id = auth.uid()
      and status = 'active' and role in ('owner','admin')
  );
$$;
revoke all on function private.can_manage_connection_tenant(text) from public, anon;
grant execute on function private.can_manage_connection_tenant(text) to authenticated;

create policy "managers read tenant connections" on public.platform_connections for select to authenticated using (private.can_manage_connection_tenant(tenant_id));
create policy "managers update tenant connections" on public.platform_connections for update to authenticated using (private.can_manage_connection_tenant(tenant_id)) with check (private.can_manage_connection_tenant(tenant_id));
create policy "managers read connection history" on public.platform_connection_history for select to authenticated using (private.can_manage_connection_tenant(tenant_id));

create or replace function private.record_platform_connection_change()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare history_action text;
begin
  if tg_op = 'INSERT' then history_action := 'created';
  elsif old.status is distinct from new.status then history_action := case when new.status = 'active' then 'activated' when new.status = 'inactive' then 'deactivated' else 'test_failed' end;
  else history_action := 'configured';
  end if;
  insert into public.platform_connection_history(connection_id, tenant_id, action, from_status, to_status, detail, actor_id)
  values(new.id, new.tenant_id, history_action, case when tg_op = 'INSERT' then null else old.status end, new.status, '', auth.uid());
  return new;
end $$;

drop trigger if exists platform_connection_audit on public.platform_connections;
create trigger platform_connection_audit after insert or update on public.platform_connections for each row execute function private.record_platform_connection_change();

create or replace function private.upsert_platform_connection_secure(
  connection_id uuid, target_tenant_id text, connection_name text, connection_provider text,
  connection_kind text, connection_endpoint_url text, connection_scopes text[],
  connection_secret text, connection_status text
) returns uuid language plpgsql security definer set search_path = public, vault, pg_temp as $$
declare result_id uuid; existing_secret uuid; next_secret uuid;
begin
  if not private.can_manage_connection_tenant(target_tenant_id) then raise exception 'Tenant connection manager access required'; end if;
  if connection_endpoint_url is not null and connection_endpoint_url !~ '^https://' then raise exception 'HTTPS endpoint required'; end if;
  select secret_id into existing_secret from public.platform_connections where id = connection_id and tenant_id = target_tenant_id;
  next_secret := existing_secret;
  if nullif(trim(connection_secret), '') is not null then
    if existing_secret is null then
      next_secret := vault.create_secret(connection_secret, 'amx-' || target_tenant_id || '-' || connection_provider, 'AMX tenant connection credential');
    else
      perform vault.update_secret(existing_secret, connection_secret, 'amx-' || target_tenant_id || '-' || connection_provider, 'AMX tenant connection credential');
    end if;
  end if;
  insert into public.platform_connections(id, tenant_id, name, provider, kind, status, endpoint_url, scopes, secret_id, created_by, updated_by)
  values(coalesce(connection_id, gen_random_uuid()), target_tenant_id, left(trim(connection_name),100), left(lower(connection_provider),64), connection_kind, connection_status, nullif(trim(connection_endpoint_url),''), coalesce(connection_scopes,'{}'), next_secret, auth.uid(), auth.uid())
  on conflict (tenant_id, provider) do update set name=excluded.name, kind=excluded.kind, status=excluded.status, endpoint_url=excluded.endpoint_url, scopes=excluded.scopes, secret_id=excluded.secret_id, updated_by=auth.uid(), updated_at=now()
  returning id into result_id;
  return result_id;
end $$;

create or replace function public.upsert_platform_connection(
  connection_id uuid, target_tenant_id text, connection_name text, connection_provider text,
  connection_kind text, connection_endpoint_url text, connection_scopes text[],
  connection_secret text, connection_status text
) returns uuid language sql security invoker set search_path = public, private, pg_temp as $$
  select private.upsert_platform_connection_secure(connection_id, target_tenant_id, connection_name, connection_provider, connection_kind, connection_endpoint_url, connection_scopes, connection_secret, connection_status);
$$;

revoke all on function private.record_platform_connection_change() from public, anon, authenticated;
revoke all on function private.upsert_platform_connection_secure(uuid,text,text,text,text,text,text[],text,text) from public, anon;
grant execute on function private.upsert_platform_connection_secure(uuid,text,text,text,text,text,text[],text,text) to authenticated;
revoke all on function public.upsert_platform_connection(uuid,text,text,text,text,text,text[],text,text) from public, anon;
grant execute on function public.upsert_platform_connection(uuid,text,text,text,text,text,text[],text,text) to authenticated;
grant select, update on public.platform_connections to authenticated;
grant select on public.platform_connection_history to authenticated;
revoke insert, delete on public.platform_connections from authenticated;
revoke insert, update, delete on public.platform_connection_history from authenticated;
