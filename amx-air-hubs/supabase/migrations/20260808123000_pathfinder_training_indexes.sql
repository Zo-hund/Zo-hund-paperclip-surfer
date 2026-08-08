create index if not exists pathfinder_sessions_facilitator_idx on public.pathfinder_training_sessions (facilitator_id, updated_at desc);
create index if not exists pathfinder_participants_user_idx on public.pathfinder_training_participants (user_id, updated_at desc);
create index if not exists pathfinder_participants_certifier_idx on public.pathfinder_training_participants (certified_by) where certified_by is not null;
