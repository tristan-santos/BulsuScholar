-- Admin notifications and backend logs share this document table.
-- Notification records are tagged with data.notificationFallbackTable = 'adminNotifications'.
-- Run this file once in the Supabase SQL Editor.

create table if not exists public."systemLogs" (
	id text primary key,
	data jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists system_logs_created_at_idx
	on public."systemLogs" (created_at desc);

create index if not exists system_logs_data_gin
	on public."systemLogs" using gin (data);

alter table public."systemLogs" enable row level security;

drop policy if exists "Allow app client read" on public."systemLogs";
create policy "Allow app client read"
	on public."systemLogs"
	for select
	to anon, authenticated
	using (true);

drop policy if exists "Allow app client insert" on public."systemLogs";
create policy "Allow app client insert"
	on public."systemLogs"
	for insert
	to anon, authenticated
	with check (true);

drop policy if exists "Allow app client update" on public."systemLogs";
create policy "Allow app client update"
	on public."systemLogs"
	for update
	to anon, authenticated
	using (true)
	with check (true);

drop policy if exists "Allow app client delete" on public."systemLogs";
create policy "Allow app client delete"
	on public."systemLogs"
	for delete
	to anon, authenticated
	using (true);

do $$
begin
	begin
		alter publication supabase_realtime add table public."systemLogs";
	exception
		when duplicate_object then null;
	end;
end $$;

notify pgrst, 'reload schema';
