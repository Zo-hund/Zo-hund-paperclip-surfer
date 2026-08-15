create table if not exists public.gpu_tenant_policies (
  tenant_id text primary key,
  status text not null default 'active' check (status in ('active','paused')),
  monthly_budget_cents integer not null check (monthly_budget_cents >= 100),
  per_job_limit_cents integer not null check (per_job_limit_cents >= 25 and per_job_limit_cents <= monthly_budget_cents),
  allowed_workloads text[] not null,
  allowed_gpus text[] not null,
  max_concurrent_jobs integer not null default 3 check (max_concurrent_jobs between 1 and 20),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gpu_jobs (
  id text primary key,
  tenant_id text not null,
  member_id uuid references auth.users(id) on delete set null,
  workload text not null,
  provider_job_id text unique,
  status text not null,
  gpu_type text not null,
  estimated_cents integer not null default 0,
  actual_cents integer,
  duration_ms bigint,
  output_url text,
  output_content_type text,
  delivery_target text not null default 'archive' check (delivery_target in ('archive','stage','livekit')),
  stage_room text,
  approved_by uuid references auth.users(id) on delete set null,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists gpu_jobs_tenant_idx on public.gpu_jobs (tenant_id, status, created_at desc);

create table if not exists public.gpu_usage_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  job_id text not null references public.gpu_jobs(id) on delete cascade,
  workload text not null,
  gpu_type text not null,
  event_type text not null,
  active_ms bigint not null default 0,
  cost_cents integer not null default 0,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists gpu_usage_events_tenant_idx on public.gpu_usage_events (tenant_id, created_at desc);

create table if not exists public.gpu_delivery_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  job_id text not null references public.gpu_jobs(id) on delete cascade,
  target text not null check (target in ('archive','stage','livekit')),
  room_code text,
  source_url text,
  content_type text,
  status text not null,
  detail text not null,
  created_at timestamptz not null default now()
);
create index if not exists gpu_delivery_events_tenant_idx on public.gpu_delivery_events (tenant_id, created_at desc);

alter table public.gpu_tenant_policies enable row level security;
alter table public.gpu_jobs enable row level security;
alter table public.gpu_usage_events enable row level security;
alter table public.gpu_delivery_events enable row level security;

create policy "gpu managers read policy" on public.gpu_tenant_policies for select to authenticated using (private.can_manage_connection_tenant(tenant_id));
create policy "gpu managers manage policy" on public.gpu_tenant_policies for all to authenticated using (private.can_manage_connection_tenant(tenant_id)) with check (private.can_manage_connection_tenant(tenant_id));
create policy "gpu managers read jobs" on public.gpu_jobs for select to authenticated using (private.can_manage_connection_tenant(tenant_id));
create policy "gpu managers read usage" on public.gpu_usage_events for select to authenticated using (private.can_manage_connection_tenant(tenant_id));
create policy "gpu managers read deliveries" on public.gpu_delivery_events for select to authenticated using (private.can_manage_connection_tenant(tenant_id));

grant select, insert, update, delete on public.gpu_tenant_policies to authenticated;
grant select on public.gpu_jobs, public.gpu_usage_events, public.gpu_delivery_events to authenticated;
revoke insert, update, delete on public.gpu_jobs, public.gpu_usage_events, public.gpu_delivery_events from authenticated;
