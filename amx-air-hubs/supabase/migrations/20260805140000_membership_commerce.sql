create table if not exists public.membership_subscriptions (
  id text primary key,
  tenant_id text not null,
  member_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null check (plan_id in ('learner','builder','ambassador','earner','parent','community','volunteer','sponsor','donor')),
  status text not null check (status in ('trialing','active','past_due','unpaid','canceled','incomplete','incomplete_expired','paused')),
  stripe_customer_id text,
  stripe_subscription_id text unique,
  stripe_checkout_session_id text unique,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists membership_subscriptions_member_idx
on public.membership_subscriptions (tenant_id, member_id, updated_at desc);

create table if not exists public.membership_webhook_events (
  id text primary key,
  event_type text not null,
  stripe_object_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.membership_subscriptions enable row level security;
alter table public.membership_webhook_events enable row level security;

create policy "members read their subscriptions"
on public.membership_subscriptions for select to authenticated
using (member_id = (select auth.uid()) or (select private.is_amx_operator()));

create policy "operators read membership webhook audit"
on public.membership_webhook_events for select to authenticated
using ((select private.is_amx_operator()));

revoke all on public.membership_subscriptions from anon, authenticated;
grant select on public.membership_subscriptions to authenticated;
revoke all on public.membership_webhook_events from anon, authenticated;
grant select on public.membership_webhook_events to authenticated;
