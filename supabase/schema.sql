create table if not exists students (
        id text primary key,
        data jsonb not null default '{}'::jsonb,
        -- Virtual columns for easier filtering/indexing
        email text generated always as (data->>'email') stored,
        role text generated always as (data->>'role') stored,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
);

create table if not exists admins (
        id text primary key,
        data jsonb not null default '{}'::jsonb,
        email text generated always as (data->>'email') stored,
        role text generated always as (data->>'role') stored,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
);

create table if not exists admin_settings (
	id text primary key,
	data jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create table if not exists providers (
        id text primary key,
        data jsonb not null default '{}'::jsonb,
        email text generated always as (data->>'email') stored,
        role text generated always as (data->>'role') stored,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
);

create table if not exists pending_students (like students including all);
create table if not exists soe_requests (like students including all);
create table if not exists soe_downloads (like students including all);
create table if not exists announcements (like students including all);
create table if not exists grantor_portals (like students including all);
create table if not exists scholarship_applications (like students including all);
create table if not exists student_warnings (like students including all);
create table if not exists grantor_portal_scholars (
	parent_id text not null,
	id text not null,
	data jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	primary key (parent_id, id)
);

create table if not exists grantor_portal_applications (like grantor_portal_scholars including all);
create table if not exists grantor_portal_announcements (like grantor_portal_scholars including all);

create index if not exists admins_data_gin on admins using gin (data);
create index if not exists admin_settings_data_gin on admin_settings using gin (data);
create index if not exists students_data_gin on students using gin (data);
create index if not exists pending_students_data_gin on pending_students using gin (data);
create index if not exists soe_requests_data_gin on soe_requests using gin (data);
create index if not exists soe_downloads_data_gin on soe_downloads using gin (data);
create index if not exists announcements_data_gin on announcements using gin (data);
create index if not exists providers_data_gin on providers using gin (data);
create index if not exists grantor_portals_data_gin on grantor_portals using gin (data);
create index if not exists scholarship_applications_data_gin on scholarship_applications using gin (data);
create index if not exists student_warnings_data_gin on student_warnings using gin (data);
create index if not exists grantor_portal_scholars_data_gin on grantor_portal_scholars using gin (data);
create index if not exists grantor_portal_applications_data_gin on grantor_portal_applications using gin (data);
create index if not exists grantor_portal_announcements_data_gin on grantor_portal_announcements using gin (data);

do $$
declare
	table_name text;
begin
	foreach table_name in array array[
		'admins',
		'admin_settings',
		'students',
		'pending_students',
		'soe_requests',
		'soe_downloads',
		'announcements',
		'providers',
		'grantor_portals',
		'scholarship_applications',
		'student_warnings',
		'grantor_portal_scholars',
		'grantor_portal_applications',
		'grantor_portal_announcements'
	]
	loop
		begin
			execute format('alter publication supabase_realtime add table %I', table_name);
		exception
			when duplicate_object then null;
		end;
	end loop;
end $$;

do $$
declare
	table_name text;
begin
	foreach table_name in array array[
		'admins',
		'admin_settings',
		'students',
		'pending_students',
		'soe_requests',
		'soe_downloads',
		'announcements',
		'providers',
		'grantor_portals',
		'scholarship_applications',
		'student_warnings',
		'grantor_portal_scholars',
		'grantor_portal_applications',
		'grantor_portal_announcements'
	]
	loop
		execute format('alter table %I enable row level security', table_name);

		if not exists (
			select 1 from pg_policies
			where schemaname = 'public' and tablename = table_name and policyname = 'Allow app client read'
		) then
			execute format('create policy "Allow app client read" on %I for select to anon, authenticated using (true)', table_name);
		end if;

		if not exists (
			select 1 from pg_policies
			where schemaname = 'public' and tablename = table_name and policyname = 'Allow app client insert'
		) then
			execute format('create policy "Allow app client insert" on %I for insert to anon, authenticated with check (true)', table_name);
		end if;

		if not exists (
			select 1 from pg_policies
			where schemaname = 'public' and tablename = table_name and policyname = 'Allow app client update'
		) then
			execute format('create policy "Allow app client update" on %I for update to anon, authenticated using (true) with check (true)', table_name);
		end if;

		if not exists (
			select 1 from pg_policies
			where schemaname = 'public' and tablename = table_name and policyname = 'Allow app client delete'
		) then
			execute format('create policy "Allow app client delete" on %I for delete to anon, authenticated using (true)', table_name);
		end if;
	end loop;
end $$;

do $$
begin
	if not exists (
		select 1 from pg_policies
		where schemaname = 'storage' and tablename = 'objects' and policyname = 'Allow app storage read'
	) then
		create policy "Allow app storage read"
		on storage.objects for select
		to anon, authenticated
		using (bucket_id = 'bulsuscholar');
	end if;

	if not exists (
		select 1 from pg_policies
		where schemaname = 'storage' and tablename = 'objects' and policyname = 'Allow app storage insert'
	) then
		create policy "Allow app storage insert"
		on storage.objects for insert
		to anon, authenticated
		with check (bucket_id = 'bulsuscholar');
	end if;

	if not exists (
		select 1 from pg_policies
		where schemaname = 'storage' and tablename = 'objects' and policyname = 'Allow app storage update'
	) then
		create policy "Allow app storage update"
		on storage.objects for update
		to anon, authenticated
		using (bucket_id = 'bulsuscholar')
		with check (bucket_id = 'bulsuscholar');
	end if;

	if not exists (
		select 1 from pg_policies
		where schemaname = 'storage' and tablename = 'objects' and policyname = 'Allow app storage delete'
	) then
		create policy "Allow app storage delete"
		on storage.objects for delete
		to anon, authenticated
		using (bucket_id = 'bulsuscholar');
	end if;
end $$;
