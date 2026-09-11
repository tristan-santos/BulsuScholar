-- Help and support feedback storage. Run once in the Supabase SQL editor.
create table if not exists support_feedback (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_feedback_data_gin on support_feedback using gin (data);

alter table support_feedback enable row level security;

do $$ begin
  alter publication supabase_realtime add table support_feedback;
exception when duplicate_object then null; end $$;
