-- BulsuScholar Supabase Storage policies.
-- Run this in Supabase Dashboard > SQL Editor after creating/recreating the
-- `bulsuscholar` bucket.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
	'bulsuscholar',
	'bulsuscholar',
	true,
	10485760,
	array[
		'application/pdf',
		'image/png',
		'image/jpeg',
		'image/webp',
		'text/csv',
		'application/vnd.ms-excel',
		'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		'application/vnd.ms-excel.sheet.binary.macroEnabled.12',
		'application/vnd.ms-excel.sheet.macroEnabled.12'
	]
)
on conflict (id) do update
set
	public = excluded.public,
	file_size_limit = excluded.file_size_limit,
	allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "BulsuScholar storage read" on storage.objects;
create policy "BulsuScholar storage read"
	on storage.objects
	for select
	to anon, authenticated
	using (bucket_id = 'bulsuscholar');

drop policy if exists "BulsuScholar storage upload" on storage.objects;
create policy "BulsuScholar storage upload"
	on storage.objects
	for insert
	to anon, authenticated
	with check (bucket_id = 'bulsuscholar');

drop policy if exists "BulsuScholar storage update" on storage.objects;
create policy "BulsuScholar storage update"
	on storage.objects
	for update
	to anon, authenticated
	using (bucket_id = 'bulsuscholar')
	with check (bucket_id = 'bulsuscholar');

drop policy if exists "BulsuScholar storage delete" on storage.objects;
create policy "BulsuScholar storage delete"
	on storage.objects
	for delete
	to anon, authenticated
	using (bucket_id = 'bulsuscholar');
