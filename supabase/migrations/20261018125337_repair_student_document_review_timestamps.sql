-- Document-style backend writes include updated_at. The missing column caused
-- every signup preview/review audit insert to fail before it could be persisted.
alter table public.student_document_reviews
  add column if not exists updated_at timestamptz not null default now();

update public.student_document_reviews
set updated_at = created_at
where updated_at is null;

revoke all on table public.student_document_reviews from public, anon, authenticated;
grant select, insert, update on table public.student_document_reviews to service_role;
