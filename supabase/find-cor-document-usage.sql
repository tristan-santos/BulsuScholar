-- Use this to inspect COR/Advising Slip document usage records.
-- Replace the values in the where clause when checking a specific student or hash.

select
	id,
	student_id,
	account_id,
	academic_year,
	semester,
	cor_hash,
	data,
	created_at,
	updated_at
from student_document_usage
where
	-- Put the student ID here, or leave blank to ignore this filter.
	('' = '' or student_id = '')
	and
	-- Put the COR hash here, or leave blank to ignore this filter.
	('' = '' or cor_hash = '')
order by created_at desc;

-- Duplicate COR hashes, if any.
select
	cor_hash,
	count(*) as usage_count,
	array_agg(student_id order by student_id) as student_ids,
	array_agg(id order by id) as usage_ids
from student_document_usage
where cor_hash is not null and cor_hash <> ''
group by cor_hash
having count(*) > 1
order by usage_count desc, cor_hash;
