-- Relational columns for BulsuScholar (run after schema.sql)
-- Keeps data jsonb for nested fields; adds queryable columns for core profile fields.

alter table if exists students drop column if exists email;
alter table if exists students drop column if exists role;

alter table if exists students add column if not exists email text;
alter table if exists students add column if not exists user_type text;
alter table if exists students add column if not exists auth_user_id text;
alter table if exists students add column if not exists first_name text;
alter table if exists students add column if not exists middle_name text;
alter table if exists students add column if not exists last_name text;
alter table if exists students add column if not exists course text;
alter table if exists students add column if not exists year_level text;
alter table if exists students add column if not exists section text;
alter table if exists students add column if not exists contact_number text;

alter table if exists pending_students drop column if exists email;
alter table if exists pending_students drop column if exists role;

alter table if exists pending_students add column if not exists email text;
alter table if exists pending_students add column if not exists user_type text;
alter table if exists pending_students add column if not exists auth_user_id text;
alter table if exists pending_students add column if not exists first_name text;
alter table if exists pending_students add column if not exists middle_name text;
alter table if exists pending_students add column if not exists last_name text;
alter table if exists pending_students add column if not exists course text;
alter table if exists pending_students add column if not exists year_level text;
alter table if exists pending_students add column if not exists section text;
alter table if exists pending_students add column if not exists contact_number text;

alter table if exists admins drop column if exists email;
alter table if exists admins drop column if exists role;

alter table if exists admins add column if not exists email text;
alter table if exists admins add column if not exists user_type text;
alter table if exists admins add column if not exists first_name text;
alter table if exists admins add column if not exists last_name text;

alter table if exists providers drop column if exists email;
alter table if exists providers drop column if exists role;

alter table if exists providers add column if not exists email text;
alter table if exists providers add column if not exists user_type text;
alter table if exists providers add column if not exists name text;

update students set
	email = coalesce(email, data->>'email'),
	user_type = coalesce(user_type, data->>'userType', 'student'),
	auth_user_id = coalesce(auth_user_id, data->>'authUserId'),
	first_name = coalesce(first_name, data->>'fname'),
	middle_name = coalesce(middle_name, data->>'mname'),
	last_name = coalesce(last_name, data->>'lname'),
	course = coalesce(course, data->>'course'),
	year_level = coalesce(year_level, data->>'year'),
	section = coalesce(section, data->>'section'),
	contact_number = coalesce(contact_number, data->>'cpNumber')
where data is not null;

update pending_students set
	email = coalesce(email, data->>'email'),
	user_type = coalesce(user_type, data->>'userType', 'student'),
	auth_user_id = coalesce(auth_user_id, data->>'authUserId'),
	first_name = coalesce(first_name, data->>'fname'),
	middle_name = coalesce(middle_name, data->>'mname'),
	last_name = coalesce(last_name, data->>'lname'),
	course = coalesce(course, data->>'course'),
	year_level = coalesce(year_level, data->>'year'),
	section = coalesce(section, data->>'section'),
	contact_number = coalesce(contact_number, data->>'cpNumber')
where data is not null;

update admins set
	email = coalesce(email, data->>'email'),
	user_type = coalesce(user_type, data->>'userType', 'admin'),
	first_name = coalesce(first_name, data->>'fname'),
	last_name = coalesce(last_name, data->>'lname')
where data is not null;

update providers set
	email = coalesce(email, data->>'email'),
	user_type = coalesce(user_type, data->>'userType', 'provider'),
	name = coalesce(name, data->>'name', data->>'providerName')
where data is not null;

create index if not exists students_email_idx on students (email);
create index if not exists pending_students_email_idx on pending_students (email);
create index if not exists admins_email_idx on admins (email);
create index if not exists providers_email_idx on providers (email);
