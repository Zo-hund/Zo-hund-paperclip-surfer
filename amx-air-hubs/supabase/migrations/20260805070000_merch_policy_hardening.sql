drop policy if exists "members read their merch orders" on public.merch_orders;
drop policy if exists "operators read tenant merch orders" on public.merch_orders;

create policy "members and operators read authorized merch orders"
on public.merch_orders
for select
to authenticated
using (
  member_id = (select auth.uid())
  or private.can_manage_connection_tenant(tenant_id)
);
