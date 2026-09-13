create table if not exists public.amx_role_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('MEMBER','LEARNER','BUILDER','DEVELOPER','FOUNDER','WORKFORCE','MENTOR','INSTRUCTOR','EMPLOYER','PARTNER','AIR_HUB','STAFF','ADMIN')),
  status text not null default 'active' check (status in ('active','suspended','revoked')),
  granted_by uuid not null references auth.users(id),
  grant_reason text not null,
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_by uuid references auth.users(id),
  revoked_at timestamptz,
  revoke_reason text,
  unique (tenant_id, user_id, role)
);

create index if not exists amx_role_assignments_user_idx on public.amx_role_assignments (user_id, tenant_id, status);
create index if not exists amx_role_assignments_tenant_idx on public.amx_role_assignments (tenant_id, role, status);
alter table public.amx_role_assignments enable row level security;

create policy "members read their AMX roles" on public.amx_role_assignments for select to authenticated using (user_id = auth.uid());
create policy "tenant operators read AMX roles" on public.amx_role_assignments for select to authenticated using (private.can_manage_connection_tenant(tenant_id));
revoke all on public.amx_role_assignments from anon;
grant select on public.amx_role_assignments to authenticated;

create or replace function public.assign_amx_role(target_tenant_id text, target_user_id uuid, target_role text, grant_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare assignment_id uuid; execution uuid := gen_random_uuid();
begin
  if not private.can_manage_connection_tenant(target_tenant_id) then raise exception 'operator access required'; end if;
  if target_role not in ('MEMBER','LEARNER','BUILDER','DEVELOPER','FOUNDER','WORKFORCE','MENTOR','INSTRUCTOR','EMPLOYER','PARTNER','AIR_HUB','STAFF','ADMIN') then raise exception 'invalid AMX role'; end if;
  if length(trim(grant_reason)) < 3 then raise exception 'grant reason required'; end if;
  insert into public.amx_role_assignments (tenant_id,user_id,role,status,granted_by,grant_reason)
  values (target_tenant_id,target_user_id,target_role,'active',auth.uid(),trim(grant_reason))
  on conflict (tenant_id,user_id,role) do update set status='active',granted_by=auth.uid(),grant_reason=excluded.grant_reason,granted_at=now(),revoked_by=null,revoked_at=null,revoke_reason=null
  returning id into assignment_id;
  insert into public.amx_audit_events (tenant_id,execution_id,actor_type,actor_id,action,resource_type,resource_id,outcome,metadata)
  values (target_tenant_id,execution,'operator',auth.uid()::text,'identity.role.grant','role_assignment',assignment_id::text,'succeeded',jsonb_build_object('role',target_role,'user_id',target_user_id,'reason',trim(grant_reason)));
end $$;

create or replace function public.revoke_amx_role(assignment_id uuid, revoke_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare current_row public.amx_role_assignments%rowtype; execution uuid := gen_random_uuid();
begin
  select * into current_row from public.amx_role_assignments where id=assignment_id for update;
  if current_row.id is null then raise exception 'role assignment not found'; end if;
  if not private.can_manage_connection_tenant(current_row.tenant_id) then raise exception 'operator access required'; end if;
  if length(trim(revoke_reason)) < 3 then raise exception 'revocation reason required'; end if;
  update public.amx_role_assignments set status='revoked',revoked_by=auth.uid(),revoked_at=now(),revoke_reason=trim(revoke_reason) where id=assignment_id;
  insert into public.amx_audit_events (tenant_id,execution_id,actor_type,actor_id,action,resource_type,resource_id,outcome,metadata)
  values (current_row.tenant_id,execution,'operator',auth.uid()::text,'identity.role.revoke','role_assignment',assignment_id::text,'succeeded',jsonb_build_object('role',current_row.role,'user_id',current_row.user_id,'reason',trim(revoke_reason)));
end $$;

revoke all on function public.assign_amx_role(text,uuid,text,text) from public;
revoke all on function public.revoke_amx_role(uuid,text) from public;
grant execute on function public.assign_amx_role(text,uuid,text,text) to authenticated;
grant execute on function public.revoke_amx_role(uuid,text) to authenticated;
