create table if not exists public.merch_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  member_id uuid not null references auth.users(id) on delete cascade,
  event_id text,
  status text not null default 'pending_payment' check (status in ('pending_payment','paid','submitted','in_fulfillment','on_hold','shipped','delivered','returned','cancelled','failed')),
  currency text not null default 'USD',
  total_cents integer not null check (total_cents >= 0),
  printful_order_id text,
  tracking_url text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.merch_revenue_allocations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.merch_orders(id) on delete cascade,
  tenant_id text not null,
  beneficiary_type text not null check (beneficiary_type in ('creator','partner','organization','community_fund')),
  beneficiary_id text not null,
  share_basis_points integer not null check (share_basis_points between 0 and 10000),
  amount_cents integer check (amount_cents is null or amount_cents >= 0),
  status text not null default 'pending_payment' check (status in ('pending_payment','accrued','payable','paid','reversed')),
  created_at timestamptz not null default now()
);

create table if not exists public.merch_webhook_events (
  id text primary key,
  order_id uuid not null references public.merch_orders(id) on delete cascade,
  event_type text not null,
  store_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.merch_payout_profiles (
  tenant_id text not null,
  beneficiary_type text not null check (beneficiary_type in ('creator','partner','organization','community_fund')),
  beneficiary_id text not null,
  display_name text not null,
  contact_email text,
  stripe_account_id text not null unique,
  onboarding_status text not null default 'pending' check (onboarding_status in ('pending','restricted','active','disabled')),
  details_submitted boolean not null default false,
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  requirements_due jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, beneficiary_type, beneficiary_id)
);

create table if not exists public.merch_payout_transfers (
  id uuid primary key default gen_random_uuid(),
  allocation_id uuid not null unique references public.merch_revenue_allocations(id) on delete restrict,
  order_id uuid not null references public.merch_orders(id) on delete restrict,
  tenant_id text not null,
  beneficiary_type text not null,
  beneficiary_id text not null,
  stripe_account_id text not null,
  stripe_transfer_id text unique,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null,
  status text not null default 'pending' check (status in ('pending','submitted','failed','reversed')),
  approved_by uuid not null references auth.users(id) on delete restrict,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.merch_connect_events (
  id text primary key,
  event_type text not null,
  stripe_object_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists merch_orders_member_idx on public.merch_orders (tenant_id, member_id, created_at desc);
create index if not exists merch_allocations_order_idx on public.merch_revenue_allocations (tenant_id, order_id);
create index if not exists merch_webhook_order_idx on public.merch_webhook_events (order_id, created_at desc);
create index if not exists merch_payout_profiles_tenant_idx on public.merch_payout_profiles (tenant_id, updated_at desc);
create index if not exists merch_payout_transfers_tenant_idx on public.merch_payout_transfers (tenant_id, created_at desc);

alter table public.merch_orders enable row level security;
alter table public.merch_revenue_allocations enable row level security;
alter table public.merch_webhook_events enable row level security;
alter table public.merch_payout_profiles enable row level security;
alter table public.merch_payout_transfers enable row level security;
alter table public.merch_connect_events enable row level security;

create policy "members read their merch orders" on public.merch_orders for select to authenticated
using (member_id = (select auth.uid()));

create policy "operators read tenant merch orders" on public.merch_orders for select to authenticated
using (private.can_manage_connection_tenant(tenant_id));

create policy "operators read tenant merch allocations" on public.merch_revenue_allocations for select to authenticated
using (private.can_manage_connection_tenant(tenant_id));

create policy "operators read merch webhook audit" on public.merch_webhook_events for select to authenticated
using (exists (
  select 1 from public.merch_orders selected_order
  where selected_order.id = merch_webhook_events.order_id
    and private.can_manage_connection_tenant(selected_order.tenant_id)
));

create policy "operators read tenant payout profiles" on public.merch_payout_profiles for select to authenticated
using (private.can_manage_connection_tenant(tenant_id));

create policy "operators read tenant payout transfers" on public.merch_payout_transfers for select to authenticated
using (private.can_manage_connection_tenant(tenant_id));

create policy "operators read connect audit" on public.merch_connect_events for select to authenticated
using (
  exists (
    select 1 from public.merch_payout_profiles profile
    where profile.stripe_account_id = merch_connect_events.stripe_object_id
      and private.can_manage_connection_tenant(profile.tenant_id)
  ) or exists (
    select 1 from public.merch_payout_transfers transfer_row
    where transfer_row.stripe_transfer_id = merch_connect_events.stripe_object_id
      and private.can_manage_connection_tenant(transfer_row.tenant_id)
  )
);

revoke insert, update, delete on public.merch_orders from authenticated;
revoke insert, update, delete on public.merch_revenue_allocations from authenticated;
revoke insert, update, delete on public.merch_webhook_events from authenticated;
revoke insert, update, delete on public.merch_payout_profiles from authenticated;
revoke insert, update, delete on public.merch_payout_transfers from authenticated;
revoke insert, update, delete on public.merch_connect_events from authenticated;
