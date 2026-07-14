-- Signup/security hardening for BulsuScholar.
-- Run this in Supabase SQL Editor after schema.sql and relational-migration.sql.

create table if not exists "studentNotifications" (
	id text primary key,
	data jsonb not null default '{}'::jsonb,
	student_id text generated always as (data->>'studentId') stored,
	read boolean generated always as (coalesce((data->>'read')::boolean, false)) stored,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create table if not exists "grantorNotifications" (
	id text primary key,
	data jsonb not null default '{}'::jsonb,
	grantor_id text generated always as (data->>'grantorId') stored,
	read boolean generated always as (coalesce((data->>'read')::boolean, false)) stored,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create table if not exists student_document_usage (
	id text primary key,
	data jsonb not null default '{}'::jsonb,
	student_id text,
	academic_year text,
	semester text,
	cor_hash text,
	account_id text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create table if not exists "systemLogs" (
	id text primary key,
	data jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create unique index if not exists students_email_normalized_unique
	on students (lower(nullif(email, '')))
	where nullif(email, '') is not null;

create unique index if not exists pending_students_email_normalized_unique
	on pending_students (lower(nullif(email, '')))
	where nullif(email, '') is not null;

create unique index if not exists students_cp_normalized_unique
	on students (regexp_replace(coalesce(contact_number, ''), '\D', '', 'g'))
	where regexp_replace(coalesce(contact_number, ''), '\D', '', 'g') <> '';

create unique index if not exists pending_students_cp_normalized_unique
	on pending_students (regexp_replace(coalesce(contact_number, ''), '\D', '', 'g'))
	where regexp_replace(coalesce(contact_number, ''), '\D', '', 'g') <> '';

create unique index if not exists student_document_usage_cor_hash_unique
	on student_document_usage (cor_hash)
	where cor_hash is not null and cor_hash <> '';

create unique index if not exists student_document_usage_identity_cycle_unique
	on student_document_usage (student_id, academic_year, semester)
	where student_id is not null
		and student_id <> ''
		and academic_year is not null
		and academic_year <> ''
		and semester is not null
		and semester <> '';

create index if not exists student_notifications_student_id_idx on "studentNotifications" (student_id);
create index if not exists grantor_notifications_grantor_id_idx on "grantorNotifications" (grantor_id);
create index if not exists student_document_usage_student_id_idx on student_document_usage (student_id);
create index if not exists student_notifications_data_gin on "studentNotifications" using gin (data);
create index if not exists grantor_notifications_data_gin on "grantorNotifications" using gin (data);
create index if not exists student_document_usage_data_gin on student_document_usage using gin (data);
create index if not exists system_logs_data_gin on "systemLogs" using gin (data);

do $$
declare
	table_name text;
begin
	foreach table_name in array array[
		'studentNotifications',
		'grantorNotifications',
		'student_document_usage',
		'systemLogs'
	]
	loop
		begin
			execute format('alter publication supabase_realtime add table %I', table_name);
		exception
			when duplicate_object then null;
		end;

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
