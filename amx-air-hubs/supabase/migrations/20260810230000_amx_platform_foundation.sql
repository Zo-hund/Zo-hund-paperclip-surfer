create table if not exists public.amx_payment_providers (
  id text primary key,
  tenant_id text not null,
  provider_type text not null,
  display_name text not null,
  status text not null default 'inactive' check (status in ('inactive', 'active', 'degraded', 'revoked')),
  mode text not null default 'simulation' check (mode in ('simulation', 'live')),
  capabilities jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider_type)
);

create table if not exists public.amx_transactions (
  id text primary key check (id ~ '^AMX-TX-[0-9]{4}-[0-9]{9}$'),
  tenant_id text not null,
  actor_type text not null check (actor_type in ('member', 'partner', 'agent', 'operator', 'system')),
  actor_id text not null,
  order_id text,
  service_id text,
  amount_minor bigint not null check (amount_minor >= 0),
  currency text not null check (currency ~ '^[A-Z]{3,8}$'),
  payment_rail text not null,
  provider_id text references public.amx_payment_providers(id),
  provider_transaction_id text,
  status text not null,
  settlement_status text not null default 'pending',
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);

create table if not exists public.amx_wearables (
  id text primary key check (id ~ '^AMX-W-[0-9]{9}$'),
  tenant_id text not null,
  product_id text,
  owner_id uuid references auth.users(id),
  replacement_for_id text references public.amx_wearables(id),
  lifecycle_status text not null default 'DESIGN' check (lifecycle_status in ('DESIGN','PRODUCT','MANUFACTURED','NFC_PROGRAMMED','QC','INVENTORY','ORDERED','SHIPPED','ACTIVATED','OWNED','TRANSFERRED','REVOKED','RETIRED')),
  public_visibility text not null default 'product_only' check (public_visibility in ('none','product_only','public_profile')),
  ar_experience_id text,
  digital_twin_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.amx_wearable_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  wearable_id text not null references public.amx_wearables(id),
  actor_type text not null,
  actor_id text not null,
  event_type text not null,
  from_status text,
  to_status text,
  execution_id uuid not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.amx_agent_wallets (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  agent_id text not null,
  currency text not null default 'USD',
  balance_minor bigint not null default 0,
  per_transaction_limit_minor bigint not null default 0 check (per_transaction_limit_minor >= 0),
  daily_limit_minor bigint not null default 0 check (daily_limit_minor >= 0),
  approval_threshold_minor bigint not null default 0 check (approval_threshold_minor >= 0),
  allowed_vendors jsonb not null default '[]'::jsonb,
  allowed_categories jsonb not null default '[]'::jsonb,
  allowed_services jsonb not null default '[]'::jsonb,
  status text not null default 'inactive' check (status in ('inactive','active','suspended','revoked')),
  policy_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, agent_id, currency)
);

create table if not exists public.amx_audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  execution_id uuid not null,
  actor_type text not null,
  actor_id text not null,
  action text not null,
  resource_type text not null,
  resource_id text,
  outcome text not null check (outcome in ('allowed','denied','pending','failed','succeeded')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists amx_transactions_tenant_idx on public.amx_transactions (tenant_id, created_at desc);
create index if not exists amx_wearables_tenant_idx on public.amx_wearables (tenant_id, lifecycle_status);
create index if not exists amx_wearable_events_idx on public.amx_wearable_events (tenant_id, wearable_id, created_at desc);
create index if not exists amx_audit_events_tenant_idx on public.amx_audit_events (tenant_id, created_at desc);
create index if not exists amx_audit_events_execution_idx on public.amx_audit_events (execution_id, created_at);

alter table public.amx_payment_providers enable row level security;
alter table public.amx_transactions enable row level security;
alter table public.amx_wearables enable row level security;
alter table public.amx_wearable_events enable row level security;
alter table public.amx_agent_wallets enable row level security;
alter table public.amx_audit_events enable row level security;

create policy "tenant operators manage AMX providers" on public.amx_payment_providers for all to authenticated using (private.can_manage_connection_tenant(tenant_id)) with check (private.can_manage_connection_tenant(tenant_id));
create policy "tenant operators manage AMX transactions" on public.amx_transactions for all to authenticated using (private.can_manage_connection_tenant(tenant_id)) with check (private.can_manage_connection_tenant(tenant_id));
create policy "owners and operators read AMX wearables" on public.amx_wearables for select to authenticated using (owner_id = auth.uid() or private.can_manage_connection_tenant(tenant_id));
create policy "tenant operators manage AMX wearables" on public.amx_wearables for all to authenticated using (private.can_manage_connection_tenant(tenant_id)) with check (private.can_manage_connection_tenant(tenant_id));
create policy "owners and operators read wearable events" on public.amx_wearable_events for select to authenticated using (exists (select 1 from public.amx_wearables w where w.id = wearable_id and (w.owner_id = auth.uid() or private.can_manage_connection_tenant(w.tenant_id))));
create policy "tenant operators manage wearable events" on public.amx_wearable_events for all to authenticated using (private.can_manage_connection_tenant(tenant_id)) with check (private.can_manage_connection_tenant(tenant_id));
create policy "tenant operators manage agent wallets" on public.amx_agent_wallets for all to authenticated using (private.can_manage_connection_tenant(tenant_id)) with check (private.can_manage_connection_tenant(tenant_id));
create policy "tenant operators read audit events" on public.amx_audit_events for select to authenticated using (private.can_manage_connection_tenant(tenant_id));

revoke all on public.amx_payment_providers, public.amx_transactions, public.amx_wearables, public.amx_wearable_events, public.amx_agent_wallets, public.amx_audit_events from anon;
