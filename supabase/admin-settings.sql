-- Shared administrator profile and portal settings.
-- Run this file once in the Supabase SQL Editor for existing deployments.

create table if not exists public.admin_settings (
	id text primary key,
	data jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists admin_settings_data_gin
	on public.admin_settings using gin (data);

insert into public.admin_settings (id, data)
values (
	'profile',
	jsonb_build_object(
		'displayName', 'Administrator',
		'email', 'admin@bulsuscholar.local',
		'officeName', 'Office of the Scholarship',
		'contactNumber', '',
		'supportEmail', 'scholarships@bulsu.edu.ph',
		'systemMode', 'Operational',
		'accountVerification', 'Manual and list-based',
		'maintenanceMode', false,
		'allowStudentSignup', true,
		'allowGrantorAnnouncements', true,
		'reportExportEnabled', true
	)
)
on conflict (id) do nothing;

alter table public.admin_settings enable row level security;

drop policy if exists "Allow app client read" on public.admin_settings;
create policy "Allow app client read"
	on public.admin_settings
	for select
	to anon, authenticated
	using (true);

drop policy if exists "Allow app client insert" on public.admin_settings;
create policy "Allow app client insert"
	on public.admin_settings
	for insert
	to anon, authenticated
	with check (true);

drop policy if exists "Allow app client update" on public.admin_settings;
create policy "Allow app client update"
	on public.admin_settings
	for update
	to anon, authenticated
	using (true)
	with check (true);

drop policy if exists "Allow app client delete" on public.admin_settings;
create policy "Allow app client delete"
	on public.admin_settings
	for delete
	to anon, authenticated
	using (true);

do $$
begin
	alter publication supabase_realtime add table public.admin_settings;
exception
	when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
