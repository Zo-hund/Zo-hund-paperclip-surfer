create table if not exists public.trust_passports (
  id text primary key,
  tenant_id text not null,
  name text not null,
  system_type text not null,
  owner text not null,
  risk_level text not null check (risk_level in ('R0','R1','R2','R3','R4','R5')),
  lifecycle_status text not null check (lifecycle_status in ('draft','active','held','retired')),
  deployment_stage text not null check (deployment_stage in ('simulation','pit-stop','live','held')),
  model_provider text not null,
  data_classification text not null,
  disclosure_status text not null check (disclosure_status in ('incomplete','complete')),
  evidence_status text not null check (evidence_status in ('pending','verified')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trust_agents (
  id text not null,
  tenant_id text not null,
  name text not null,
  role text not null,
  runtime text not null,
  risk_level text not null check (risk_level in ('R0','R1','R2','R3','R4','R5')),
  tool_count integer not null default 0 check (tool_count >= 0),
  status text not null check (status in ('active','held','offline')),
  last_seen_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, id)
);

create table if not exists public.trust_reviews (
  id text primary key,
  tenant_id text not null,
  subject_type text not null,
  subject_id text not null,
  subject_name text not null,
  review_type text not null,
  risk_level text not null check (risk_level in ('R0','R1','R2','R3','R4','R5')),
  status text not null check (status in ('pending','approved','rejected')),
  requested_by text not null,
  rationale text,
  decided_by text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.trust_live_approvals (
  id text primary key,
  tenant_id text not null,
  passport_id text not null references public.trust_passports(id) on delete restrict,
  environment text not null check (environment = 'production'),
  status text not null check (status = 'approved'),
  approved_by text not null,
  reason text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create table if not exists public.trust_audit_events (
  id text primary key,
  tenant_id text not null,
  event_type text not null,
  actor_id text not null,
  subject_type text not null,
  subject_id text not null,
  subject_name text not null,
  risk_level text not null check (risk_level in ('R0','R1','R2','R3','R4','R5')),
  outcome text not null,
  detail text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists trust_passports_tenant_idx on public.trust_passports (tenant_id, lifecycle_status, updated_at desc);
create index if not exists trust_agents_tenant_idx on public.trust_agents (tenant_id, status, updated_at desc);
create index if not exists trust_reviews_queue_idx on public.trust_reviews (tenant_id, status, created_at desc);
create index if not exists trust_live_approvals_idx on public.trust_live_approvals (tenant_id, passport_id, created_at desc);
create index if not exists trust_audit_tenant_idx on public.trust_audit_events (tenant_id, created_at desc);

alter table public.trust_passports enable row level security;
alter table public.trust_agents enable row level security;
alter table public.trust_reviews enable row level security;
alter table public.trust_live_approvals enable row level security;
alter table public.trust_audit_events enable row level security;

create policy "tenant operators manage trust passports" on public.trust_passports for all to authenticated
using (private.can_manage_connection_tenant(tenant_id)) with check (private.can_manage_connection_tenant(tenant_id));
create policy "tenant operators manage trust agents" on public.trust_agents for all to authenticated
using (private.can_manage_connection_tenant(tenant_id)) with check (private.can_manage_connection_tenant(tenant_id));
create policy "tenant operators manage trust reviews" on public.trust_reviews for all to authenticated
using (private.can_manage_connection_tenant(tenant_id)) with check (private.can_manage_connection_tenant(tenant_id));
create policy "tenant operators manage trust live approvals" on public.trust_live_approvals for all to authenticated
using (private.can_manage_connection_tenant(tenant_id)) with check (private.can_manage_connection_tenant(tenant_id));
create policy "tenant operators read trust audit" on public.trust_audit_events for select to authenticated
using (private.can_manage_connection_tenant(tenant_id));
create policy "tenant operators append trust audit" on public.trust_audit_events for insert to authenticated
with check (private.can_manage_connection_tenant(tenant_id));

revoke all on public.trust_passports, public.trust_agents, public.trust_reviews, public.trust_live_approvals, public.trust_audit_events from anon;
grant select, insert, update, delete on public.trust_passports, public.trust_agents, public.trust_reviews, public.trust_live_approvals to authenticated;
grant select, insert on public.trust_audit_events to authenticated;
