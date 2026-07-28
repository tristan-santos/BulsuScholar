-- Use this to inspect existing duplicate student emails and CP numbers before enforcing unique indexes.

select
	'students' as table_name,
	'cp_number' as duplicate_type,
	regexp_replace(coalesce(contact_number, ''), '\D', '', 'g') as duplicate_value,
	count(*) as duplicate_count,
	array_agg(id order by id) as record_ids
from students
where regexp_replace(coalesce(contact_number, ''), '\D', '', 'g') <> ''
group by regexp_replace(coalesce(contact_number, ''), '\D', '', 'g')
having count(*) > 1

union all

select
	'pending_students' as table_name,
	'cp_number' as duplicate_type,
	regexp_replace(coalesce(contact_number, ''), '\D', '', 'g') as duplicate_value,
	count(*) as duplicate_count,
	array_agg(id order by id) as record_ids
from pending_students
where regexp_replace(coalesce(contact_number, ''), '\D', '', 'g') <> ''
group by regexp_replace(coalesce(contact_number, ''), '\D', '', 'g')
having count(*) > 1

union all

select
	'students' as table_name,
	'email' as duplicate_type,
	lower(nullif(email, '')) as duplicate_value,
	count(*) as duplicate_count,
	array_agg(id order by id) as record_ids
from students
where nullif(email, '') is not null
group by lower(nullif(email, ''))
having count(*) > 1

union all

select
	'pending_students' as table_name,
	'email' as duplicate_type,
	lower(nullif(email, '')) as duplicate_value,
	count(*) as duplicate_count,
	array_agg(id order by id) as record_ids
from pending_students
where nullif(email, '') is not null
group by lower(nullif(email, ''))
having count(*) > 1

order by table_name, duplicate_type, duplicate_value;
