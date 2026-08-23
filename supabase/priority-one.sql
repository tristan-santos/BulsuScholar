-- Priority 1 feature tables. Run once in the Supabase SQL editor.
create table if not exists leave_requests (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists support_feedback (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists unifast_records (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leave_requests_data_gin on leave_requests using gin (data);
create index if not exists support_feedback_data_gin on support_feedback using gin (data);
create index if not exists unifast_records_data_gin on unifast_records using gin (data);

alter table leave_requests enable row level security;
alter table support_feedback enable row level security;
alter table unifast_records enable row level security;

do $$ begin
  alter publication supabase_realtime add table leave_requests;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table support_feedback;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table unifast_records;
exception when duplicate_object then null; end $$;
