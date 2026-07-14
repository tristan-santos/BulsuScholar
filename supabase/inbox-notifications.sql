-- Inbox tables required by the Python notification service.
-- Run this entire file in Supabase Dashboard > SQL Editor.

create table if not exists public."studentNotifications" (
	id text primary key,
	data jsonb not null default '{}'::jsonb,
	student_id text generated always as (data->>'studentId') stored,
	read boolean generated always as (
		coalesce((data->>'read')::boolean, false)
	) stored,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create table if not exists public."grantorNotifications" (
	id text primary key,
	data jsonb not null default '{}'::jsonb,
	grantor_id text generated always as (data->>'grantorId') stored,
	read boolean generated always as (
		coalesce((data->>'read')::boolean, false)
	) stored,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists student_notifications_student_id_idx
	on public."studentNotifications" (student_id);

create index if not exists grantor_notifications_grantor_id_idx
	on public."grantorNotifications" (grantor_id);

create index if not exists student_notifications_data_gin
	on public."studentNotifications" using gin (data);

create index if not exists grantor_notifications_data_gin
	on public."grantorNotifications" using gin (data);

alter table public."studentNotifications" enable row level security;
alter table public."grantorNotifications" enable row level security;

drop policy if exists "Allow app client read" on public."studentNotifications";
create policy "Allow app client read"
	on public."studentNotifications"
	for select
	to anon, authenticated
	using (true);

drop policy if exists "Allow app client read" on public."grantorNotifications";
create policy "Allow app client read"
	on public."grantorNotifications"
	for select
	to anon, authenticated
	using (true);

do $$
begin
	begin
		alter publication supabase_realtime add table public."studentNotifications";
	exception
		when duplicate_object then null;
	end;

	begin
		alter publication supabase_realtime add table public."grantorNotifications";
	exception
		when duplicate_object then null;
	end;
end
$$;

notify pgrst, 'reload schema';
