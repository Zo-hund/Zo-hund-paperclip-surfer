create index if not exists platform_connections_created_by_idx on public.platform_connections (created_by);
create index if not exists platform_connections_updated_by_idx on public.platform_connections (updated_by);
create index if not exists platform_connection_history_connection_idx on public.platform_connection_history (connection_id, created_at desc);
create index if not exists platform_connection_history_actor_idx on public.platform_connection_history (actor_id);
