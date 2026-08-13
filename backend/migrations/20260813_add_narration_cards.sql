-- Narration cards and authenticated gameplay sessions.
-- Safe to run once against the existing Moments Supabase database.
alter table nodes
  add column if not exists node_type text not null default 'story';

alter table nodes
  add column if not exists narration_next_node_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'nodes_node_type_check'
  ) then
    alter table nodes add constraint nodes_node_type_check
      check (node_type in ('story', 'narration'));
  end if;
end $$;

alter table players
  add column if not exists session_token text not null default '';
